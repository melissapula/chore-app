// Achievement badges, all derived from data the kid dashboard already has (ledger
// history + finished chores + streak + guild contribution) — no new schema.

export interface Achievement {
    id: string;
    emoji: string;
    title: string;
    desc: string;
    earned: boolean;
}

export interface AchvContext {
    approvedCount: number; // # of chore_approved ledger entries
    lifetimeXp: number;
    beatTimer: boolean; // finished a paid chore before its finish deadline
    streak: number; // current daily streak
    redeemedQuest: boolean; // has redeemed at least one quest
    guildContribXp: number; // XP this kid put toward the active guild quest
}

export function computeAchievements(c: AchvContext): Achievement[] {
    return [
        {
            id: 'first',
            emoji: '🌱',
            title: 'First Chore',
            desc: 'Finish your first paid chore',
            earned: c.approvedCount >= 1,
        },
        {
            id: 'ten',
            emoji: '🔟',
            title: 'Ten Done',
            desc: 'Finish 10 paid chores',
            earned: c.approvedCount >= 10,
        },
        {
            id: 'century',
            emoji: '💯',
            title: 'Century Club',
            desc: 'Earn 100 lifetime XP',
            earned: c.lifetimeXp >= 100,
        },
        {
            id: 'bigearner',
            emoji: '💰',
            title: 'Big Earner',
            desc: 'Earn 500 lifetime XP',
            earned: c.lifetimeXp >= 500,
        },
        {
            id: 'speed',
            emoji: '⚡',
            title: 'Speed Demon',
            desc: 'Finish a chore before the timer runs out',
            earned: c.beatTimer,
        },
        {
            id: 'onfire',
            emoji: '🔥',
            title: 'On Fire',
            desc: 'Earn XP 3 days in a row',
            earned: c.streak >= 3,
        },
        {
            id: 'dream',
            emoji: '🎁',
            title: 'Dream Achiever',
            desc: 'Redeem a quest reward',
            earned: c.redeemedQuest,
        },
        {
            id: 'team',
            emoji: '🛡️',
            title: 'Team Player',
            desc: 'Help toward a guild quest',
            earned: c.guildContribXp > 0,
        },
    ];
}
