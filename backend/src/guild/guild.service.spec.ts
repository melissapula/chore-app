import {
    BadRequestException,
    ForbiddenException,
    HttpException,
} from '@nestjs/common';
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

    // start_guild_quest() returns the whole chore.quests row.
    const fullRow = {
        ...quest,
        household_id: 'house-1',
        scope: 'guild',
        kid_id: null,
        deadline: null,
        emoji: null,
        redeemed_at: null,
        created_at: '2026-10-01T00:00:00Z',
    };

    it('returns the new guild quest with only the GuildQuest fields', async () => {
        const { guild } = guildWith({
            start_guild_quest: [{ data: fullRow }],
        });

        await expect(guild.create(parent, dto)).resolves.toEqual(quest);
    });

    it('never writes to quests directly (the SQL function archives and inserts atomically)', async () => {
        const { guild, writes } = guildWith({
            start_guild_quest: [{ data: fullRow }],
        });

        await guild.create(parent, dto);

        expect(writes).toEqual([]);
    });

    it('rejects a kid with 403 before calling the database', async () => {
        const kid: AuthUser = { ...parent, id: 'kid-a', role: 'kid' };
        // Nothing queued: any database call would throw "no reply queued".
        const { guild } = guildWith({});

        await expect(guild.create(kid, dto)).rejects.toBeInstanceOf(
            ForbiddenException,
        );
    });

    it("returns 400 with the function's message when it refuses", async () => {
        const { guild } = guildWith({
            start_guild_quest: [
                {
                    error: {
                        message: 'only a parent can start a guild quest',
                        code: 'P0001',
                    },
                },
            ],
        });

        const err: unknown = await guild
            .create(parent, dto)
            .catch((e: unknown) => e);

        expect(err).toBeInstanceOf(BadRequestException);
        expect((err as BadRequestException).message).toBe(
            'only a parent can start a guild quest',
        );
    });

    it('rejects as a server fault when the database call fails', async () => {
        const { guild } = guildWith({ start_guild_quest: [dbDown] });

        await expectServerFault(guild.create(parent, dto));
    });
});
