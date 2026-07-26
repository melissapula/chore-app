import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { PushService } from '../push/push.service';
import { AuthUser } from '../auth/auth-user.interface';
import { PaidState, RELEASABLE_STATES, RequiredState } from './instance-state';
import { ChoreInstanceRow, DbResult, InstanceListRow } from '../db-types';

/**
 * The paid-chore state machine (SPEC §2): OPEN → CLAIMED → IN_PROGRESS →
 * SUBMITTED → APPROVED, plus a parent release back to OPEN.
 *
 * Design rules:
 *  - KID transitions (claim/start/submit/mark-done) run through SECURITY DEFINER
 *    RPCs (migration 0011). RLS on chore_instances is parent-only for UPDATE, so
 *    those RPCs — which lock the row, re-authorize the caller, validate the
 *    current state, and compute timers server-side — are the ONLY kid write
 *    path. A kid can't skip them by hitting PostgREST directly (audit C2). Timers
 *    are STORED DEADLINES (SPEC §4), now written inside the RPC.
 *  - PARENT transitions (approve/confirm/release) run on the parent's JWT.
 *    Approve is atomic across two tables via approve_paid_instance() (0003);
 *    confirm/release are compare-and-set updates the parent RLS policy permits.
 */
@Injectable()
export class ChoreInstancesService {
    constructor(
        private readonly supabase: SupabaseService,
        private readonly push: PushService,
    ) {}

    /** Map a transition RPC's raised message to the right HTTP error. */
    private throwTransitionError(message: string): never {
        if (/not found/i.test(message)) {
            throw new NotFoundException(message);
        }
        if (
            /another household|not a household member|not available to you|assigned to someone else|only the kid/i.test(
                message,
            )
        ) {
            throw new ForbiddenException(message);
        }
        if (/not a required chore|only paid chores/i.test(message)) {
            throw new BadRequestException(message);
        }
        // Wrong-state or a lost race.
        throw new ConflictException(message);
    }

    /** Chore title for a push message (best-effort; RLS lets the kid read it). */
    private async choreTitle(
        db: ReturnType<SupabaseService['userClient']>,
        choreId: string,
    ): Promise<string> {
        const { data } = (await db
            .from('chores')
            .select('title')
            .eq('id', choreId)
            .maybeSingle()) as DbResult<{ title: string }>;
        return data?.title ?? 'A chore';
    }

    /** The household's live instance pool. RLS scopes it to the caller's household. */
    async list(user: AuthUser) {
        const db = this.supabase.userClient(user.accessToken);
        const { data, error } = (await db
            .from('chore_instances')
            .select(
                '*, chores(title, quest_title, icon_emoji, chore_type, est_minutes, category, eligible_kid_ids)',
            )
            .order('created_at', { ascending: false })) as DbResult<
            InstanceListRow[]
        >;
        if (error) throw new BadRequestException(error.message);
        return data;
    }

    /** OPEN → CLAIMED via claim_instance() (0011). Atomic sibling race in-DB. */
    async claim(user: AuthUser, id: string) {
        const db = this.supabase.userClient(user.accessToken);
        const { data, error } = (await db.rpc('claim_instance', {
            p_instance_id: id,
        })) as DbResult<ChoreInstanceRow>;
        if (error) this.throwTransitionError(error.message);
        return data;
    }

    /** CLAIMED → IN_PROGRESS via start_instance() (0011). Starts the finish-timer. */
    async start(user: AuthUser, id: string) {
        const db = this.supabase.userClient(user.accessToken);
        const { data, error } = (await db.rpc('start_instance', {
            p_instance_id: id,
        })) as DbResult<ChoreInstanceRow>;
        if (error) this.throwTransitionError(error.message);
        return data;
    }

    /** IN_PROGRESS → SUBMITTED via submit_instance() (0011). */
    async submit(user: AuthUser, id: string) {
        const db = this.supabase.userClient(user.accessToken);
        const { data, error } = (await db.rpc('submit_instance', {
            p_instance_id: id,
        })) as DbResult<ChoreInstanceRow>;
        if (error) this.throwTransitionError(error.message);
        if (!data) throw new ConflictException('Could not submit this chore');

        const title = await this.choreTitle(db, data.chore_id);
        void this.push.notifyHouseholdParents(user.householdId, {
            title: 'Chore submitted 📬',
            body: `${title} is ready for your review.`,
            url: '/chores',
        });
        return data;
    }

    /**
     * SUBMITTED → APPROVED (parent). Atomic with the ledger credit via the
     * approve_paid_instance() SQL function; runs as the caller so it authorizes
     * parent + household inside.
     */
    async approve(user: AuthUser, id: string) {
        if (user.role !== 'parent') {
            throw new ForbiddenException('Only a parent can approve a chore');
        }
        const db = this.supabase.userClient(user.accessToken);
        const { data, error } = (await db.rpc('approve_paid_instance', {
            p_instance_id: id,
        })) as DbResult<ChoreInstanceRow>;
        if (error) {
            // The function raises for wrong-state / not-a-parent / cross-household.
            throw new ConflictException(error.message);
        }
        if (data?.claimed_by) {
            void this.push.notifyUsers([data.claimed_by], {
                title: 'Chore approved! 🎉',
                body: `You earned ${data.value_cents_snapshot} XP.`,
                url: '/dashboard',
            });
        }
        return data;
    }

    /** Parent releases a held PAID chore back to OPEN (SPEC §2), clearing progress. */
    async release(user: AuthUser, id: string) {
        if (user.role !== 'parent') {
            throw new ForbiddenException('Only a parent can release a chore');
        }
        const db = this.supabase.userClient(user.accessToken);

        // Release is paid-only — a required chore has no OPEN pool to return to
        // (releasing one would strand it OPEN-but-unclaimable and hold the gate).
        const { data: inst, error: readErr } = (await db
            .from('chore_instances')
            .select('id, chores(chore_type)')
            .eq('id', id)
            .maybeSingle()) as DbResult<{
            id: string;
            chores: { chore_type: string } | null;
        }>;
        if (readErr) throw new BadRequestException(readErr.message);
        if (!inst) throw new NotFoundException('Instance not found');
        if (inst.chores?.chore_type !== 'paid') {
            throw new BadRequestException('Only paid chores can be released');
        }

        const { data: updated, error } = (await db
            .from('chore_instances')
            .update({
                state: PaidState.OPEN,
                claimed_by: null,
                claimed_at: null,
                start_deadline: null,
                started_at: null,
                finish_deadline: null,
                finish_notified_at: null,
                submitted_at: null,
            })
            .eq('id', id)
            .in('state', RELEASABLE_STATES)
            .select()
            .maybeSingle()) as DbResult<ChoreInstanceRow>;
        if (error) throw new BadRequestException(error.message);
        if (!updated) {
            throw new ConflictException(
                'Instance is not in a releasable state (CLAIMED / IN_PROGRESS / SUBMITTED)',
            );
        }
        return updated;
    }

    // --- required-chore flow (SPEC §3a): ASSIGNED → SUBMITTED → CONFIRMED ---

    /** ASSIGNED → SUBMITTED via mark_done_instance() (0011). Assigned kid; no timers. */
    async markDone(user: AuthUser, id: string) {
        const db = this.supabase.userClient(user.accessToken);
        const { data, error } = (await db.rpc('mark_done_instance', {
            p_instance_id: id,
        })) as DbResult<ChoreInstanceRow>;
        if (error) this.throwTransitionError(error.message);
        if (!data)
            throw new ConflictException('Could not mark this chore done');

        const title = await this.choreTitle(db, data.chore_id);
        void this.push.notifyHouseholdParents(user.householdId, {
            title: 'Required chore done ✅',
            body: `${title} was marked done — confirm it.`,
            url: '/chores',
        });
        return data;
    }

    /** SUBMITTED → CONFIRMED (parent). No ledger credit — required chores are $0. */
    async confirm(user: AuthUser, id: string) {
        if (user.role !== 'parent') {
            throw new ForbiddenException('Only a parent can confirm a chore');
        }
        const db = this.supabase.userClient(user.accessToken);

        const { data: inst, error } = (await db
            .from('chore_instances')
            .select('id, state, chores(chore_type, title)')
            .eq('id', id)
            .maybeSingle()) as DbResult<{
            id: string;
            state: string;
            chores: { chore_type: string; title: string };
        }>;
        if (error) throw new BadRequestException(error.message);
        if (!inst) throw new NotFoundException('Instance not found');
        if (inst.chores.chore_type !== 'required') {
            throw new BadRequestException(
                'Use approve for paid chores; confirm is for required chores',
            );
        }
        if (inst.state !== RequiredState.SUBMITTED) {
            throw new ConflictException(
                `Instance is ${inst.state}, not SUBMITTED`,
            );
        }

        const { data: updated, error: updErr } = (await db
            .from('chore_instances')
            .update({
                state: RequiredState.CONFIRMED,
                approved_at: new Date().toISOString(),
                approved_by: user.id,
            })
            .eq('id', id)
            .eq('state', RequiredState.SUBMITTED)
            .select()
            .maybeSingle()) as DbResult<ChoreInstanceRow>;
        if (updErr) throw new BadRequestException(updErr.message);
        if (!updated)
            throw new ConflictException('Could not confirm this chore');

        if (updated.assigned_to) {
            void this.push.notifyUsers([updated.assigned_to], {
                title: 'Chore confirmed ✅',
                body: `${inst.chores.title} is all done. Nice work!`,
                url: '/dashboard',
            });
        }
        return updated;
    }

    /**
     * Remove an instance from the pool (parent). Any earned ledger entry is kept
     * — its chore_instance_id FK is `on delete set null`, so the kid's XP stands.
     * RLS (`instances_delete_parent`) enforces household + parent.
     */
    async remove(user: AuthUser, id: string) {
        if (user.role !== 'parent') {
            throw new ForbiddenException('Only a parent can remove a chore');
        }
        const db = this.supabase.userClient(user.accessToken);
        const { error } = await db
            .from('chore_instances')
            .delete()
            .eq('id', id);
        if (error) throw new BadRequestException(error.message);
        return { ok: true };
    }
}
