/**
 * Lightweight row types for the `chore` schema.
 *
 * The Supabase clients are created untyped (we don't yet generate `Database`
 * types), so `.from()/.rpc()` return `any`. We assert these shapes at the query
 * boundary — `(await db…) as DbResult<Row>` — to keep the services type-safe.
 * Replace with `supabase gen types typescript` output when we wire that up.
 */

export type UserRole = 'parent' | 'kid';

/** A Supabase `{ data, error }` response, narrowed to a known row shape. */
export interface DbResult<T> {
    data: T | null;
    error: { message: string } | null;
}

export interface ChoreRow {
    id: string;
    household_id: string;
    title: string;
    icon_emoji: string | null;
    chore_type: 'paid' | 'required';
    value_cents: number;
    est_minutes: number | null;
    category: string | null;
    recurrence: string;
    start_timer_mins: number | null;
    finish_timer_mins: number | null;
    gates_pay: boolean;
    is_risky: boolean;
    assigned_kid_id: string | null;
    eligible_kid_ids: string[] | null;
    due_type: string | null;
    active: boolean;
    created_at: string;
}

export interface ChoreInstanceRow {
    id: string;
    household_id: string;
    chore_id: string;
    state: string;
    claimed_by: string | null;
    claimed_at: string | null;
    start_deadline: string | null;
    started_at: string | null;
    finish_deadline: string | null;
    assigned_to: string | null;
    due_date: string | null;
    gates_pay: boolean;
    submitted_at: string | null;
    approved_at: string | null;
    approved_by: string | null;
    value_cents_snapshot: number;
    created_at: string;
}

/** Instance list row with the joined chore fields (SPEC §4). */
export interface InstanceListRow extends ChoreInstanceRow {
    chores: {
        title: string;
        icon_emoji: string | null;
        chore_type: string;
    } | null;
}

/** The join shape read when claiming (timer defaults + eligibility). */
export interface ClaimSelect {
    id: string;
    state: string;
    chores: {
        chore_type: string;
        start_timer_mins: number | null;
        eligible_kid_ids: string[] | null;
    };
    households: { default_start_timer_mins: number };
}

/** The join shape read when starting (finish-timer defaults). */
export interface StartSelect {
    id: string;
    state: string;
    claimed_by: string | null;
    chores: { finish_timer_mins: number | null };
    households: { default_finish_timer_mins: number };
}
