import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SupabaseService } from '../supabase/supabase.service';

/**
 * Server-authoritative timer sweep (SPEC §4).
 *
 * Timers are STORED DEADLINES, not client counters. Once per minute this job
 * compares those deadlines to now() and advances state. A closed app or a
 * swapped phone cannot cheat expiry, because the backend — not the client —
 * decides when a deadline has passed.
 *
 * Runs with the service role (bypasses RLS) because it acts across all
 * households as a trusted system actor.
 */
@Injectable()
export class TimersService {
  private readonly logger = new Logger(TimersService.name);

  constructor(private readonly supabase: SupabaseService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async sweep(): Promise<void> {
    const nowIso = new Date().toISOString();
    const db = this.supabase.serviceClient();

    // 1. Expired start-timers: a CLAIMED paid chore nobody started → back to OPEN.
    const { data: released, error: releaseErr } = await db
      .from('chore_instances')
      .update({
        state: 'OPEN',
        claimed_by: null,
        claimed_at: null,
        start_deadline: null,
      })
      .eq('state', 'CLAIMED')
      .lt('start_deadline', nowIso)
      .select('id');
    if (releaseErr) this.logger.error(`release sweep: ${releaseErr.message}`);
    else if (released?.length)
      this.logger.log(`Released ${released.length} expired claim(s) → OPEN`);

    // 2. Expired finish-timers: IN_PROGRESS past its deadline. Per SPEC we do NOT
    //    auto-resolve — the parent decides (extend / release / approve). For now
    //    surface them; web-push notification lands in build step 7.
    const { data: overdue, error: overdueErr } = await db
      .from('chore_instances')
      .select('id, household_id')
      .eq('state', 'IN_PROGRESS')
      .lt('finish_deadline', nowIso);
    if (overdueErr) this.logger.error(`overdue sweep: ${overdueErr.message}`);
    else if (overdue?.length)
      this.logger.warn(
        `${overdue.length} finish-timer(s) expired — parent decision needed`,
      );

    // 3. Required chores past their due date with no completion → MISSED
    //    (counts against the weekly pay gate, SPEC §3a).
    const { data: missed, error: missedErr } = await db
      .from('chore_instances')
      .update({ state: 'MISSED' })
      .eq('state', 'ASSIGNED')
      .lt('due_date', nowIso)
      .select('id');
    if (missedErr) this.logger.error(`missed sweep: ${missedErr.message}`);
    else if (missed?.length)
      this.logger.log(`Marked ${missed.length} required chore(s) MISSED`);
  }
}
