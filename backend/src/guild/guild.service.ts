import {
    BadRequestException,
    ForbiddenException,
    Injectable,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { AuthUser } from '../auth/auth-user.interface';
import { DbResult } from '../db-types';
import { CreateGuildDto } from './dto/create-guild.dto';

/** SQLSTATE of a plpgsql `raise exception` with no explicit code. */
const RAISED_BY_FUNCTION = 'P0001';

export interface GuildQuest {
    id: string;
    title: string;
    reward: string | null;
    target_xp: number;
    status: string;
    started_at: string;
}

/** Per-kid contribution to the current guild quest (stable order = join order). */
interface Contribution {
    kid_id: string;
    display_name: string;
    xp: number;
}

export interface GuildView {
    quest: GuildQuest | null;
    progress: number; // capped at target
    contributions: Contribution[];
}

/**
 * Guild quests (SPEC §4d): one household-wide reward the whole family pools XP
 * toward. Every positive XP earned after the quest's `started_at` counts, and
 * personal balances are UNTOUCHED — the parent funds the family reward.
 *
 * The per-kid contribution breakdown must be read across all kids' ledgers,
 * which a kid can't do under RLS — so we aggregate with the service role, scoped
 * to the caller's own household. Creating goes through `start_guild_quest()`
 * (migration 0023: archive + insert in one transaction); closing goes through
 * the parent's JWT (RLS `quests_parent_all`).
 */
@Injectable()
export class GuildService {
    constructor(private readonly supabase: SupabaseService) {}

    /** The active guild quest + progress + per-kid contributions. All members. */
    async current(user: AuthUser): Promise<GuildView> {
        const svc = this.supabase.serviceClient();

        const { data: quest, error: questErr } = (await svc
            .from('quests')
            .select('id, title, reward, target_xp, status, started_at')
            .eq('household_id', user.householdId)
            .eq('scope', 'guild')
            .eq('status', 'active')
            .maybeSingle()) as DbResult<GuildQuest>;
        // A failed read must not pass for "no quest" / "0 XP" — throw a plain
        // Error so DbErrorFilter logs it and answers a generic 500.
        if (questErr) throw new Error(`guild quest read: ${questErr.message}`);

        // Kids in join order → stable chart-color assignment on the frontend.
        const { data: kidsData, error: kidsErr } = (await svc
            .from('users')
            .select('id, display_name')
            .eq('household_id', user.householdId)
            .eq('role', 'kid')
            .order('created_at', { ascending: true })) as DbResult<
            { id: string; display_name: string }[]
        >;
        if (kidsErr) throw new Error(`guild kids read: ${kidsErr.message}`);
        const kids = kidsData ?? [];

        if (!quest) {
            return {
                quest: null,
                progress: 0,
                contributions: kids.map((k) => ({
                    kid_id: k.id,
                    display_name: k.display_name,
                    xp: 0,
                })),
            };
        }

        // Positive XP earned across the household since the quest started.
        const { data: ledData, error: ledErr } = (await svc
            .from('ledger_entries')
            .select('kid_id, delta_cents')
            .eq('household_id', user.householdId)
            .gt('delta_cents', 0)
            .gte('created_at', quest.started_at)) as DbResult<
            { kid_id: string; delta_cents: number }[]
        >;
        if (ledErr) throw new Error(`guild ledger read: ${ledErr.message}`);
        const ledger = ledData ?? [];

        const byKid: Record<string, number> = {};
        for (const l of ledger) {
            byKid[l.kid_id] = (byKid[l.kid_id] ?? 0) + l.delta_cents;
        }

        const contributions = kids.map((k) => ({
            kid_id: k.id,
            display_name: k.display_name,
            xp: byKid[k.id] ?? 0,
        }));
        const raw = contributions.reduce((s, c) => s + c.xp, 0);

        return {
            quest,
            progress: Math.min(raw, quest.target_xp),
            contributions,
        };
    }

    /** Parent creates a guild quest, replacing any current one (one active). */
    async create(user: AuthUser, dto: CreateGuildDto): Promise<GuildQuest> {
        if (user.role !== 'parent') {
            throw new ForbiddenException(
                'Only a parent can start a guild quest',
            );
        }
        const db = this.supabase.userClient(user.accessToken);

        // One transaction: archives the active guild quest and inserts the new
        // one, so a failed insert can't leave the household with none (0023).
        const { data, error } = (await db.rpc('start_guild_quest', {
            p_title: dto.title,
            p_reward: dto.reward ?? null,
            p_target_xp: dto.target_xp,
        })) as {
            data: GuildQuest | null;
            error: { message: string; code?: string } | null;
        };
        if (error) {
            // P0001 = a `raise exception` in the function (its own refusal,
            // safe to show). Anything else is a server fault → generic 500.
            if (error.code === RAISED_BY_FUNCTION) {
                throw new BadRequestException(error.message);
            }
            throw new Error(`guild start: ${error.message}`);
        }
        if (!data) throw new Error('guild start: no row returned');

        // The function returns the whole quests row; keep the response shape.
        const { id, title, reward, target_xp, status, started_at } = data;
        return { id, title, reward, target_xp, status, started_at };
    }

    /** Parent marks the guild quest granted (no ledger — the parent funds it). */
    async complete(user: AuthUser, id: string): Promise<GuildQuest> {
        if (user.role !== 'parent') {
            throw new ForbiddenException('Only a parent can complete a quest');
        }
        const db = this.supabase.userClient(user.accessToken);
        const { data, error } = (await db
            .from('quests')
            .update({
                status: 'redeemed',
                redeemed_at: new Date().toISOString(),
            })
            .eq('id', id)
            .eq('scope', 'guild')
            .select('id, title, reward, target_xp, status, started_at')
            .maybeSingle()) as {
            data: GuildQuest | null;
            error: { message: string } | null;
        };
        if (error) throw new BadRequestException(error.message);
        if (!data) throw new BadRequestException('Guild quest not found');
        return data;
    }
}
