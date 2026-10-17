import { HttpException } from '@nestjs/common';
import { GuildService } from './guild.service';
import { AuthUser } from '../auth/auth-user.interface';
import { fakeSupabase, FakeReply } from '../testing/fake-supabase';

const parent: AuthUser = {
    id: 'parent-1',
    householdId: 'house-1',
    role: 'parent',
    accessToken: 'jwt',
};

const quest = {
    id: 'quest-1',
    title: 'Pizza night',
    reward: null,
    target_xp: 100,
    status: 'active',
    started_at: '2026-10-01T00:00:00Z',
};
const kids = [
    { id: 'kid-a', display_name: 'Ava' },
    { id: 'kid-b', display_name: 'Ben' },
];
const dbDown = { error: { message: 'connection terminated' } };

/**
 * A DB failure must surface as a server fault (the global filter turns a
 * non-HttpException into a logged, generic 500), not a 4xx or a quiet result.
 */
async function expectServerFault(promise: Promise<unknown>) {
    const err: unknown = await promise.then(
        () => undefined,
        (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(HttpException);
}

function guildWith(replies: Record<string, FakeReply[]>) {
    const fake = fakeSupabase(replies);
    return { guild: new GuildService(fake.service), writes: fake.writes };
}

describe('GuildService.current', () => {
    it('returns progress capped at target_xp and 0 XP for kids with no ledger', async () => {
        const { guild } = guildWith({
            quests: [{ data: quest }],
            users: [{ data: kids }],
            ledger_entries: [
                {
                    data: [
                        { kid_id: 'kid-a', delta_cents: 60 },
                        { kid_id: 'kid-a', delta_cents: 50 },
                    ],
                },
            ],
        });

        const view = await guild.current(parent);

        expect(view.progress).toBe(100);
        expect(view.contributions).toEqual([
            { kid_id: 'kid-a', display_name: 'Ava', xp: 110 },
            { kid_id: 'kid-b', display_name: 'Ben', xp: 0 },
        ]);
    });

    it('returns quest null with zeroed contributions when no guild quest is active', async () => {
        const { guild } = guildWith({
            quests: [{ data: null }],
            users: [{ data: kids }],
        });

        const view = await guild.current(parent);

        expect(view).toEqual({
            quest: null,
            progress: 0,
            contributions: [
                { kid_id: 'kid-a', display_name: 'Ava', xp: 0 },
                { kid_id: 'kid-b', display_name: 'Ben', xp: 0 },
            ],
        });
    });

    it('rejects when the quest read fails', async () => {
        const { guild } = guildWith({
            quests: [dbDown],
            users: [{ data: kids }],
        });
        await expectServerFault(guild.current(parent));
    });

    it('rejects when the kids read fails', async () => {
        const { guild } = guildWith({
            quests: [{ data: quest }],
            users: [dbDown],
            ledger_entries: [{ data: [] }],
        });
        await expectServerFault(guild.current(parent));
    });

    it('rejects when the ledger read fails', async () => {
        const { guild } = guildWith({
            quests: [{ data: quest }],
            users: [{ data: kids }],
            ledger_entries: [dbDown],
        });
        await expectServerFault(guild.current(parent));
    });
});

describe('GuildService.create', () => {
    const dto = { title: 'Pizza night', target_xp: 100 };

    it('returns the new guild quest after archiving the old one', async () => {
        const { guild } = guildWith({
            quests: [{ data: null }, { data: quest }],
        });

        await expect(guild.create(parent, dto)).resolves.toEqual(quest);
    });

    it('stops before inserting when archiving the old quest fails', async () => {
        const { guild, writes } = guildWith({
            quests: [dbDown, { data: quest }],
        });

        await expectServerFault(guild.create(parent, dto));
        expect(writes).not.toContainEqual({ table: 'quests', op: 'insert' });
    });
});
