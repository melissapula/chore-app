// Daily streak, derived from the days a kid earned XP (positive ledger events).
// No storage needed — it's computed from the ledger timestamps each load.

function dayKey(d: Date): string {
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/**
 * Consecutive-day streak ending today (if they earned today) or yesterday (the
 * streak is still "alive" — do a chore to keep it). `active` = earned today.
 */
export function streakInfo(timestamps: string[]): {
    count: number;
    active: boolean;
} {
    const days = new Set(timestamps.map((t) => dayKey(new Date(t))));
    if (!days.size) return { count: 0, active: false };

    const keyAt = (offset: number) => {
        const d = new Date();
        d.setDate(d.getDate() - offset);
        return dayKey(d);
    };

    let start: number;
    if (days.has(keyAt(0))) start = 0;
    else if (days.has(keyAt(1))) start = 1;
    else return { count: 0, active: false };

    let count = 0;
    for (let off = start; days.has(keyAt(off)); off++) count++;
    return { count, active: start === 0 };
}
