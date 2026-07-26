// Personal-quest pace calculator (SPEC §5). Given a quest's target, the kid's
// current spendable XP, a deadline, and their recent weekly earning rate, work
// out how much they need to earn per week and whether they're on track.

export interface Pace {
    perWeek: number;
    weeksLeft: number;
    signal: 'ready' | 'green' | 'yellow' | 'red';
    message: string;
}

export function pace(
    target: number,
    spendable: number,
    deadlineIso: string,
    weeklyRate: number,
): Pace {
    const needed = Math.max(0, target - Math.min(spendable, target));
    if (needed === 0) {
        return { perWeek: 0, weeksLeft: 0, signal: 'ready', message: 'Ready!' };
    }

    const ms = new Date(`${deadlineIso}T23:59:59`).getTime() - Date.now();
    if (ms < 0) {
        return {
            perWeek: needed,
            weeksLeft: 0,
            signal: 'red',
            message: `Deadline passed — ${needed} XP short`,
        };
    }

    const weeksLeft = Math.max(1, Math.ceil(ms / (7 * 24 * 60 * 60 * 1000)));
    const perWeek = Math.ceil(needed / weeksLeft);

    let signal: Pace['signal'];
    if (weeklyRate >= perWeek) signal = 'green';
    else if (weeklyRate >= perWeek * 0.6) signal = 'yellow';
    else signal = 'red';

    const weekWord = weeksLeft === 1 ? 'week' : 'weeks';
    return {
        perWeek,
        weeksLeft,
        signal,
        message: `~${perWeek} XP/week · ${weeksLeft} ${weekWord} left`,
    };
}
