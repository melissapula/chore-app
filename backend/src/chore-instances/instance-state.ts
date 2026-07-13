/**
 * Instance states (SPEC §2, §4). One enum spans both flows; this file covers
 * the PAID race. Required-flow states (ASSIGNED/CONFIRMED/MISSED) arrive in
 * build step 5.
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
