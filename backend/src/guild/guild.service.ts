import {
    BadRequestException,
    ForbiddenException,
    Injectable,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { AuthUser } from '../auth/auth-user.interface';
import { CreateGuildDto } from './dto/create-guild.dto';

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
 * to the caller's own household. Creating/closing goes through the parent's JWT
 * (RLS `quests_parent_all`).
 */
@Injectable()
export class GuildService {
    constructor(private readonly supabase: SupabaseService) {}

    /** The active guild quest + progress + per-kid contributions. All members. */
    async current(user: AuthUser): Promise<GuildView> {
        const svc = this.supabase.serviceClient();

        const { data: quest } = (await svc
            .from('quests')
            .select('id, title, reward, target_xp, status, started_at')
            .eq('household_id', user.householdId)
            .eq('scope', 'guild')
            .eq('status', 'active')
            .maybeSingle()) as { data: GuildQuest | null };

        // Kids in join order → stable chart-color assignment on the frontend.
        const { data: kidsData } = await svc
            .from('users')
            .select('id, display_name')
            .eq('household_id', user.householdId)
            .eq('role', 'kid')
            .order('created_at', { ascending: true });
        const kids = (kidsData ?? []) as { id: string; display_name: string }[];

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
        const { data: ledData } = await svc
            .from('ledger_entries')
            .select('kid_id, delta_cents')
            .eq('household_id', user.householdId)
            .gt('delta_cents', 0)
            .gte('created_at', quest.started_at);
        const ledger = (ledData ?? []) as {
            kid_id: string;
            delta_cents: number;
        }[];

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

        // Archive any existing active guild quest so only one runs at a time.
        await db
            .from('quests')
            .update({ status: 'archived' })
            .eq('household_id', user.householdId)
            .eq('scope', 'guild')
            .eq('status', 'active');

        const { data, error } = (await db
            .from('quests')
            .insert({
                household_id: user.householdId,
                scope: 'guild',
                kid_id: null,
                title: dto.title,
                reward: dto.reward ?? null,
                target_xp: dto.target_xp,
                status: 'active',
            })
            .select('id, title, reward, target_xp, status, started_at')
            .single()) as {
            data: GuildQuest | null;
            error: { message: string } | null;
        };
        if (error || !data) {
            throw new BadRequestException(
                error?.message ?? 'Could not create the guild quest',
            );
        }
        return data;
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
