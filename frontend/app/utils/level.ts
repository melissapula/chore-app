// Lifetime level (SPEC §4d): derived from lifetime XP ever earned (sum of
// positive ledger deltas), never drops when a kid spends. Rising thresholds —
// each level costs 50 XP more than the last (L1→L2 = 100, L2→L3 = 150, …).

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
    let inc = 100; // XP from this level to the next
    let hi = lo + inc; // cumulative XP to reach the next level
    while (xp >= hi) {
        level++;
        lo = hi;
        inc += 50;
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
