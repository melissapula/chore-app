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
}
