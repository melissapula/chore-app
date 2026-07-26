import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    Logger,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { AuthUser } from '../auth/auth-user.interface';
import { DbResult } from '../db-types';
import { CreateKidDto } from './dto/create-kid.dto';
import { UpdateKidDto } from './dto/update-kid.dto';
import { kidEmail, kidPassword } from './kid-auth';

/** The kid row we return to the parent (no credentials). */
export interface KidRow {
    id: string;
    display_name: string;
    username: string | null;
    role: string;
    avatar_emoji: string | null;
    avatar_url: string | null;
}

/**
 * Parent-creates-kid onboarding (SPEC §1 multi-tenant). A kid needs its own
 * auth identity (RLS is keyed on auth.uid()), but no email inbox — so this runs
 * with the SERVICE ROLE to admin-create the auth user and insert the chore.users
 * row that RLS would otherwise block (the kid isn't the caller). This is one of
 * the two sanctioned service-role paths (the other is the cron sweep).
 */
@Injectable()
export class KidsService {
    private readonly logger = new Logger(KidsService.name);

    constructor(private readonly supabase: SupabaseService) {}

    async create(parent: AuthUser, dto: CreateKidDto): Promise<KidRow> {
        if (parent.role !== 'parent') {
            throw new ForbiddenException('Only a parent can add kids');
        }

        const service = this.supabase.serviceClient();
        const email = kidEmail(dto.username);

        // 1. Create the auth identity. email_confirm skips the (undeliverable)
        //    verification mail; the derived password is what the kid types.
        const { data: created, error: authErr } =
            await service.auth.admin.createUser({
                email,
                password: kidPassword(dto.pin),
                email_confirm: true,
                user_metadata: {
                    role: 'kid',
                    display_name: dto.display_name,
                },
            });
        if (authErr || !created?.user) {
            const msg = authErr?.message ?? 'Could not create the kid account';
            // A taken username collides on the synthesized email.
            if (/already|registered|exist/i.test(msg)) {
                throw new ConflictException('That username is already taken');
            }
            throw new BadRequestException(msg);
        }

        const kidId = created.user.id;

        // 2. Create the chore profile in the SAME household as the parent.
        const { data: profile, error: insErr } = (await service
            .from('users')
            .insert({
                id: kidId,
                household_id: parent.householdId,
                display_name: dto.display_name,
                role: 'kid',
                username: dto.username.trim().toLowerCase(),
                avatar_emoji: dto.avatar_emoji ?? null,
                avatar_url: dto.avatar_url ?? null,
                birthdate: dto.birthdate ?? null,
            })
            .select(
                'id, display_name, username, role, avatar_emoji, avatar_url',
            )
            .single()) as DbResult<KidRow>;

        if (insErr || !profile) {
            // Roll back the orphaned auth user so the username frees up and a
            // retry works cleanly.
            await service.auth.admin.deleteUser(kidId).catch((e) => {
                this.logger.error(
                    `Orphaned auth user ${kidId} — cleanup failed: ${String(e)}`,
                );
            });
            throw new BadRequestException(
                insErr?.message ?? 'Could not create the kid profile',
            );
        }

        return profile;
    }

    /**
     * Edit a kid (parent). Profile fields update the chore.users row; a new
     * username/PIN also updates the derived Auth email/password via the admin API.
     */
    async update(
        parent: AuthUser,
        kidId: string,
        dto: UpdateKidDto,
    ): Promise<KidRow> {
        if (parent.role !== 'parent') {
            throw new ForbiddenException('Only a parent can edit a kid');
        }
        const service = this.supabase.serviceClient();

        // The target must be a kid in the caller's own household.
        const { data: kid } = (await service
            .from('users')
            .select('id, household_id, role, username')
            .eq('id', kidId)
            .maybeSingle()) as DbResult<{
            id: string;
            household_id: string;
            role: string;
            username: string | null;
        }>;
        if (
            !kid ||
            kid.household_id !== parent.householdId ||
            kid.role !== 'kid'
        ) {
            throw new ForbiddenException('That kid is not in your household');
        }

        // Auth changes first (a failure here shouldn't leave the profile ahead).
        const newUsername = dto.username?.trim().toLowerCase();
        if (newUsername && newUsername !== kid.username) {
            const { error } = await service.auth.admin.updateUserById(kidId, {
                email: kidEmail(newUsername),
            });
            if (error) {
                if (/already|registered|exist/i.test(error.message)) {
                    throw new ConflictException(
                        'That username is already taken',
                    );
                }
                throw new BadRequestException(error.message);
            }
        }
        if (dto.pin) {
            const { error } = await service.auth.admin.updateUserById(kidId, {
                password: kidPassword(dto.pin),
            });
            if (error) throw new BadRequestException(error.message);
        }

        // Profile fields (only what was sent).
        const patch: Record<string, unknown> = {};
        if (dto.display_name !== undefined)
            patch.display_name = dto.display_name.trim();
        if (newUsername !== undefined) patch.username = newUsername;
        if (dto.avatar_emoji !== undefined)
            patch.avatar_emoji = dto.avatar_emoji;
        if (dto.avatar_url !== undefined) patch.avatar_url = dto.avatar_url;

        if (Object.keys(patch).length) {
            const { error } = await service
                .from('users')
                .update(patch)
                .eq('id', kidId);
            if (error) throw new BadRequestException(error.message);
        }

        const { data: updated, error: readErr } = (await service
            .from('users')
            .select(
                'id, display_name, username, role, avatar_emoji, avatar_url',
            )
            .eq('id', kidId)
            .single()) as DbResult<KidRow>;
        if (readErr || !updated) {
            throw new BadRequestException(
                readErr?.message ?? 'Could not load the updated kid',
            );
        }
        return updated;
    }

    /**
     * Delete a kid (parent). Removing the Auth user cascades: auth.users →
     * chore.users (FK on delete cascade) → their ledger, quests, notes, etc.
     * Irreversible — the frontend confirms first.
     */
    async remove(parent: AuthUser, kidId: string): Promise<{ ok: true }> {
        if (parent.role !== 'parent') {
            throw new ForbiddenException('Only a parent can remove a kid');
        }
        const service = this.supabase.serviceClient();

        const { data: kid } = (await service
            .from('users')
            .select('id, household_id, role')
            .eq('id', kidId)
            .maybeSingle()) as DbResult<{
            id: string;
            household_id: string;
            role: string;
        }>;
        if (
            !kid ||
            kid.household_id !== parent.householdId ||
            kid.role !== 'kid'
        ) {
            throw new ForbiddenException('That kid is not in your household');
        }

        const { error } = await service.auth.admin.deleteUser(kidId);
        if (error) throw new BadRequestException(error.message);
        return { ok: true };
    }
}
