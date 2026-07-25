/**
 * Instance states (SPEC §2, §4). One enum spans both flows.
 */
export const PaidState = {
    OPEN: 'OPEN',
    CLAIMED: 'CLAIMED',
    IN_PROGRESS: 'IN_PROGRESS',
    SUBMITTED: 'SUBMITTED',
    APPROVED: 'APPROVED',
} as const;

export type PaidStateValue = (typeof PaidState)[keyof typeof PaidState];

/** States a parent may release back to OPEN from. */
export const RELEASABLE_STATES: PaidStateValue[] = [
    PaidState.CLAIMED,
    PaidState.IN_PROGRESS,
    PaidState.SUBMITTED,
];

/**
 * Required-chore flow (SPEC §3a): ASSIGNED → SUBMITTED → CONFIRMED, or → MISSED
 * at the due date (the cron sweep flips ASSIGNED past due_date to MISSED).
 * SUBMITTED is shared with the paid flow but reached differently (no timers,
 * keyed on assigned_to instead of claimed_by).
 */
export const RequiredState = {
    ASSIGNED: 'ASSIGNED',
    SUBMITTED: 'SUBMITTED',
    CONFIRMED: 'CONFIRMED',
    MISSED: 'MISSED',
} as const;

export type RequiredStateValue =
    (typeof RequiredState)[keyof typeof RequiredState];
