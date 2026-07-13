import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { AuthUser } from '../auth/auth-user.interface';
import { PaidState, RELEASABLE_STATES } from './instance-state';
import {
    ChoreInstanceRow,
    ClaimSelect,
    DbResult,
    InstanceListRow,
    StartSelect,
} from '../db-types';

/**
 * The paid-chore state machine (SPEC §2): OPEN → CLAIMED → IN_PROGRESS →
 * SUBMITTED → APPROVED, plus a parent release back to OPEN.
 *
 * Design rules:
 *  - Every write is a COMPARE-AND-SET: the update carries the expected current
 *    state in its WHERE clause, so an illegal jump or a lost race affects 0 rows
 *    and we translate that into a 409. This is how the sibling claim race is
 *    resolved — atomically, in Postgres, no app-level lock.
 *  - Timers are STORED DEADLINES written at transition time (SPEC §4). The timer
 *    length is the chore override or the household default.
 *  - Approve is atomic across two tables, so it runs through the
 *    approve_paid_instance() SQL function (migration 0003).
 */
@Injectable()
export class ChoreInstancesService {
    constructor(private readonly supabase: SupabaseService) {}

    private minutesFromNow(mins: number): { now: string; deadline: string } {
        const now = new Date();
        const deadline = new Date(now.getTime() + mins * 60_000);
        return { now: now.toISOString(), deadline: deadline.toISOString() };
    }

    /** The household's live instance pool. RLS scopes it to the caller's household. */
    async list(user: AuthUser) {
        const db = this.supabase.userClient(user.accessToken);
        const { data, error } = (await db
            .from('chore_instances')
            .select('*, chores(title, icon_emoji, chore_type)')
            .order('created_at', { ascending: false })) as DbResult<
            InstanceListRow[]
        >;
        if (error) throw new BadRequestException(error.message);
        return data;
    }

    /** OPEN → CLAIMED. Starts the start-timer. Resolves the sibling race atomically. */
    async claim(user: AuthUser, id: string) {
        const db = this.supabase.userClient(user.accessToken);

        const { data: inst, error } = (await db
            .from('chore_instances')
            .select(
                'id, state, chores(chore_type, start_timer_mins, eligible_kid_ids), households(default_start_timer_mins)',
            )
            .eq('id', id)
            .maybeSingle()) as DbResult<ClaimSelect>;
        if (error) throw new BadRequestException(error.message);
        if (!inst) throw new NotFoundException('Instance not found');

        const chore = inst.chores;
        const household = inst.households;
        if (chore.chore_type !== 'paid') {
            throw new BadRequestException('Only paid chores are claimable');
        }
        if (inst.state !== PaidState.OPEN) {
            throw new ConflictException(`Instance is ${inst.state}, not OPEN`);
        }
        // Eligibility (SPEC §3b): null list = open to all; otherwise must be listed.
        const eligible: string[] | null = chore.eligible_kid_ids;
        if (eligible && !eligible.includes(user.id)) {
            throw new ForbiddenException('This chore is not available to you');
        }

        const startTimer =
            chore.start_timer_mins ?? household.default_start_timer_mins;
        const { now, deadline } = this.minutesFromNow(startTimer);

        // Compare-and-set: only succeeds if it's still OPEN.
        const { data: updated, error: updErr } = (await db
            .from('chore_instances')
            .update({
                state: PaidState.CLAIMED,
                claimed_by: user.id,
                claimed_at: now,
                start_deadline: deadline,
            })
            .eq('id', id)
            .eq('state', PaidState.OPEN)
            .select()
            .maybeSingle()) as DbResult<ChoreInstanceRow>;
        if (updErr) throw new BadRequestException(updErr.message);
        if (!updated) {
            throw new ConflictException('Someone else just claimed this chore');
        }
        return updated;
    }

    /** CLAIMED → IN_PROGRESS. Only the claimer; starts the finish-timer. */
    async start(user: AuthUser, id: string) {
        const db = this.supabase.userClient(user.accessToken);

        const { data: inst, error } = (await db
            .from('chore_instances')
            .select(
                'id, state, claimed_by, chores(finish_timer_mins), households(default_finish_timer_mins)',
            )
            .eq('id', id)
            .maybeSingle()) as DbResult<StartSelect>;
        if (error) throw new BadRequestException(error.message);
        if (!inst) throw new NotFoundException('Instance not found');
        if (inst.state !== PaidState.CLAIMED) {
            throw new ConflictException(
                `Instance is ${inst.state}, not CLAIMED`,
            );
        }
        if (inst.claimed_by !== user.id) {
            throw new ForbiddenException(
                'Only the kid who claimed it can start it',
            );
        }

        const chore = inst.chores;
        const household = inst.households;
        const finishTimer =
            chore.finish_timer_mins ?? household.default_finish_timer_mins;
        const { now, deadline } = this.minutesFromNow(finishTimer);

        const { data: updated, error: updErr } = (await db
            .from('chore_instances')
            .update({
                state: PaidState.IN_PROGRESS,
                started_at: now,
                finish_deadline: deadline,
            })
            .eq('id', id)
            .eq('state', PaidState.CLAIMED)
            .eq('claimed_by', user.id)
            .select()
            .maybeSingle()) as DbResult<ChoreInstanceRow>;
        if (updErr) throw new BadRequestException(updErr.message);
        if (!updated) throw new ConflictException('Could not start this chore');
        return updated;
    }

    /** IN_PROGRESS → SUBMITTED. Only the claimer. */
    async submit(user: AuthUser, id: string) {
        const db = this.supabase.userClient(user.accessToken);

        const { data: inst, error } = (await db
            .from('chore_instances')
            .select('id, state, claimed_by')
            .eq('id', id)
            .maybeSingle()) as DbResult<{
            id: string;
            state: string;
            claimed_by: string | null;
        }>;
        if (error) throw new BadRequestException(error.message);
        if (!inst) throw new NotFoundException('Instance not found');
        if (inst.state !== PaidState.IN_PROGRESS) {
            throw new ConflictException(
                `Instance is ${inst.state}, not IN_PROGRESS`,
            );
        }
        if (inst.claimed_by !== user.id) {
            throw new ForbiddenException(
                'Only the kid working on it can submit it',
            );
        }

        const { data: updated, error: updErr } = (await db
            .from('chore_instances')
            .update({
                state: PaidState.SUBMITTED,
                submitted_at: new Date().toISOString(),
            })
            .eq('id', id)
            .eq('state', PaidState.IN_PROGRESS)
            .eq('claimed_by', user.id)
            .select()
            .maybeSingle()) as DbResult<ChoreInstanceRow>;
        if (updErr) throw new BadRequestException(updErr.message);
        if (!updated)
            throw new ConflictException('Could not submit this chore');
        return updated;
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
        return data;
    }

    /** Parent releases a held chore back to OPEN (SPEC §2), clearing progress. */
    async release(user: AuthUser, id: string) {
        if (user.role !== 'parent') {
            throw new ForbiddenException('Only a parent can release a chore');
        }
        const db = this.supabase.userClient(user.accessToken);

        const { data: updated, error } = (await db
            .from('chore_instances')
            .update({
                state: PaidState.OPEN,
                claimed_by: null,
                claimed_at: null,
                start_deadline: null,
                started_at: null,
                finish_deadline: null,
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
}
