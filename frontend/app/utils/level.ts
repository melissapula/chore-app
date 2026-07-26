// Lifetime level (SPEC §4d): derived from lifetime XP ever earned (sum of
// positive ledger deltas), never drops when a kid spends. Rising thresholds —
// L1→L2 costs 100 XP, and each level after costs 10% more than the last
// (100, 110, 121, 133, …), so leveling gets gradually harder.

export interface LevelInfo {
    level: number;
    /** XP earned into the current level. */
    into: number;
    /** Total XP span of the current level. */
    span: number;
    /** XP still needed to reach the next level. */
    toNext: number;
    /** 0–100 progress through the current level. */
    pct: number;
}

export function levelInfo(lifetimeXp: number): LevelInfo {
    const xp = Math.max(0, lifetimeXp);
    let level = 1;
    let lo = 0; // cumulative XP to reach this level
    let inc = 100; // XP from this level to the next (L1→L2 = 100)
    let hi = lo + inc; // cumulative XP to reach the next level
    while (xp >= hi) {
        level++;
        lo = hi;
        inc = Math.round(inc * 1.1); // each level costs 10% more than the last
        hi = lo + inc;
    }
    const span = hi - lo;
    const into = xp - lo;
    return {
        level,
        into,
        span,
        toNext: hi - xp,
        pct: Math.round((into / span) * 100),
    };
}
