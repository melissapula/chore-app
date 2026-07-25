import {
    BadRequestException,
    ForbiddenException,
    Injectable,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { AuthUser } from '../auth/auth-user.interface';
import { DecideGateDto } from './dto/decide-gate.dto';

/** One kid's pay-gate snapshot for a week (SPEC §3a). */
export interface KidGate {
    kid_id: string;
    display_name: string;
    week_start: string;
    required_total: number;
    required_done: number;
    earned_cents: number;
    /** Purely from the chores: 'met' (all done / none gating) or 'unmet'. */
    computed_status: 'met' | 'unmet';
    /** The parent's recorded decision, if any. */
    decision: 'released' | 'held' | null;
}

interface WeekBounds {
    weekStart: string; // YYYY-MM-DD (Monday)
    startIso: string;
    endIso: string;
}

/**
 * The weekly pay gate (SPEC §3a). Required chores marked `gates_pay` must be
 * done for the week or the parent decides whether to release that week's paid
 * earnings. We compute the gate LIVE from instances + ledger (no end-of-week
 * cron yet), and persist only the parent's release/hold decision.
 *
 * Reads use the caller's JWT (RLS scopes to their household). The decision WRITE
 * uses the service role, because weekly_gates has no insert policy by design
 * (it was meant to be filled by trusted server jobs); we authorize the parent
 * and stamp household_id ourselves.
 */
@Injectable()
export class WeeklyGatesService {
    constructor(private readonly supabase: SupabaseService) {}

    private pad(n: number): string {
        return String(n).padStart(2, '0');
    }

    /** Monday-anchored week bounds for a date (default: now). Server clock. */
    private weekBounds(dateStr?: string): WeekBounds {
        const base = dateStr ? new Date(`${dateStr}T12:00:00`) : new Date();
        const daysSinceMonday = (base.getDay() + 6) % 7; // 0=Sun..6=Sat → Mon=0
        const start = new Date(base);
        start.setDate(base.getDate() - daysSinceMonday);
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        end.setHours(23, 59, 59, 999);
        const weekStart = `${start.getFullYear()}-${this.pad(
            start.getMonth() + 1,
        )}-${this.pad(start.getDate())}`;
        return {
            weekStart,
            startIso: start.toISOString(),
            endIso: end.toISOString(),
        };
    }

    /** Assemble every kid's gate for a week (the parent-facing view). */
    async forWeek(user: AuthUser, dateStr?: string): Promise<KidGate[]> {
        const bounds = this.weekBounds(dateStr);
        const db = this.supabase.userClient(user.accessToken);

        const [kidsRes, instRes, ledRes, gatesRes] = await Promise.all([
            db.from('users').select('id, display_name').eq('role', 'kid'),
            // Pay-gating required chores due this week. gates_pay is required-only.
            db
                .from('chore_instances')
                .select('assigned_to, state')
                .eq('gates_pay', true)
                .gte('due_date', bounds.startIso)
                .lte('due_date', bounds.endIso),
            // Paid earnings credited this week.
            db
                .from('ledger_entries')
                .select('kid_id, delta_cents')
                .eq('reason', 'chore_approved')
                .gte('created_at', bounds.startIso)
                .lte('created_at', bounds.endIso),
            db
                .from('weekly_gates')
                .select('kid_id, status')
                .eq('week_start', bounds.weekStart),
        ]);

        for (const r of [kidsRes, instRes, ledRes, gatesRes]) {
            if (r.error) throw new BadRequestException(r.error.message);
        }

        const kids = (kidsRes.data ?? []) as {
            id: string;
            display_name: string;
        }[];
        const instances = (instRes.data ?? []) as {
            assigned_to: string | null;
            state: string;
        }[];
        const ledger = (ledRes.data ?? []) as {
            kid_id: string;
            delta_cents: number;
        }[];
        const gates = (gatesRes.data ?? []) as {
            kid_id: string;
            status: string;
        }[];

        return kids.map((k) => {
            const mine = instances.filter((i) => i.assigned_to === k.id);
            const required_total = mine.length;
            const required_done = mine.filter(
                (i) => i.state === 'CONFIRMED',
            ).length;
            const earned_cents = ledger
                .filter((l) => l.kid_id === k.id)
                .reduce((s, l) => s + l.delta_cents, 0);
            const gate = gates.find((g) => g.kid_id === k.id);
            const decision =
                gate?.status === 'parent_released'
                    ? 'released'
                    : gate?.status === 'parent_held'
                      ? 'held'
                      : null;
            const computed_status: 'met' | 'unmet' =
                required_total === 0 || required_done === required_total
                    ? 'met'
                    : 'unmet';
            return {
                kid_id: k.id,
                display_name: k.display_name,
                week_start: bounds.weekStart,
                required_total,
                required_done,
                earned_cents,
                computed_status,
                decision,
            };
        });
    }

    /** Record a parent's release/hold decision, snapshotting the week's totals. */
    async decide(user: AuthUser, dto: DecideGateDto): Promise<KidGate> {
        if (user.role !== 'parent') {
            throw new ForbiddenException('Only a parent can decide the gate');
        }

        // Recompute from the source so the stored snapshot is trustworthy, and
        // implicitly authorize (the kid must be in the caller's household — RLS
        // on forWeek() only ever returns this household's kids).
        const gates = await this.forWeek(user, dto.week_start);
        const gate = gates.find((g) => g.kid_id === dto.kid_id);
        if (!gate) {
            throw new BadRequestException('That kid is not in your household');
        }

        const status =
            dto.decision === 'release' ? 'parent_released' : 'parent_held';

        // weekly_gates has no insert RLS policy (service-filled by design).
        const { error } = await this.supabase
            .serviceClient()
            .from('weekly_gates')
            .upsert(
                {
                    household_id: user.householdId,
                    kid_id: dto.kid_id,
                    week_start: dto.week_start,
                    required_total: gate.required_total,
                    required_done: gate.required_done,
                    earned_cents: gate.earned_cents,
                    status,
                    decided_by: user.id,
                    decided_at: new Date().toISOString(),
                },
                { onConflict: 'kid_id,week_start' },
            );
        if (error) throw new BadRequestException(error.message);

        return {
            ...gate,
            decision: dto.decision === 'release' ? 'released' : 'held',
        };
    }
}
