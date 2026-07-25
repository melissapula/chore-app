import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { AuthUser } from '../auth/auth-user.interface';
import { CreateChoreDto } from './dto/create-chore.dto';
import { ChoreInstanceRow, ChoreRow, DbResult } from '../db-types';

@Injectable()
export class ChoresService {
    constructor(private readonly supabase: SupabaseService) {}

    private assertParent(user: AuthUser): void {
        if (user.role !== 'parent') {
            throw new ForbiddenException('Only a parent can manage chores');
        }
    }

    /** Create a chore template. */
    async create(user: AuthUser, dto: CreateChoreDto) {
        this.assertParent(user);

        if (dto.chore_type === 'required') {
            if (!dto.assigned_kid_id) {
                throw new BadRequestException(
                    'Required chores must set assigned_kid_id',
                );
            }
            if (!dto.due_type) {
                throw new BadRequestException(
                    'Required chores must set due_type',
                );
            }
        }

        const row = {
            ...dto,
            household_id: user.householdId,
            // Required chores are always $0 (SPEC §3a); paid default to 0 if omitted.
            value_cents:
                dto.chore_type === 'required' ? 0 : (dto.value_cents ?? 0),
        };

        const db = this.supabase.userClient(user.accessToken);
        const { data, error } = (await db
            .from('chores')
            .insert(row)
            .select()
            .single()) as DbResult<ChoreRow>;
        if (error) throw new BadRequestException(error.message);
        return data;
    }

    /** List the household's chore templates. */
    async list(user: AuthUser) {
        const db = this.supabase.userClient(user.accessToken);
        const { data, error } = (await db
            .from('chores')
            .select('*')
            .order('created_at', { ascending: false })) as DbResult<ChoreRow[]>;
        if (error) throw new BadRequestException(error.message);
        return data;
    }

    /**
     * end-of-day / end-of-week due date for a required instance (SPEC §3a).
     * No timezone is stored yet, so this uses the server clock — good enough for
     * a single-family MVP; revisit with a household timezone if it matters.
     */
    private dueDateFor(dueType: 'end_of_day' | 'end_of_week'): string {
        const d = new Date();
        if (dueType === 'end_of_week') {
            // End of the upcoming Sunday (week ends Sunday). 0 = Sunday.
            const daysUntilSunday = (7 - d.getDay()) % 7;
            d.setDate(d.getDate() + daysUntilSunday);
        }
        d.setHours(23, 59, 59, 999);
        return d.toISOString();
    }

    /**
     * Spawn a live instance from a template.
     *  - Paid:     state OPEN, ready to claim (SPEC §2).
     *  - Required: state ASSIGNED to the template's kid, with a due_date derived
     *              from due_type (SPEC §3a). No timers, no race.
     * Recurring auto-spawn comes in a later build step.
     */
    async spawnInstance(user: AuthUser, choreId: string) {
        this.assertParent(user);
        const db = this.supabase.userClient(user.accessToken);

        const { data: template, error: tErr } = (await db
            .from('chores')
            .select(
                'id, chore_type, value_cents, gates_pay, active, assigned_kid_id, due_type',
            )
            .eq('id', choreId)
            .maybeSingle()) as DbResult<
            Pick<
                ChoreRow,
                | 'id'
                | 'chore_type'
                | 'value_cents'
                | 'gates_pay'
                | 'active'
                | 'assigned_kid_id'
                | 'due_type'
            >
        >;
        if (tErr) throw new BadRequestException(tErr.message);
        if (!template) throw new NotFoundException('Chore template not found');
        if (!template.active) {
            throw new BadRequestException('Chore template is inactive');
        }

        // Shared snapshot fields; the flow-specific bits are added per type.
        const base = {
            household_id: user.householdId,
            chore_id: template.id,
            gates_pay: template.gates_pay,
            value_cents_snapshot: template.value_cents,
        };

        let insert: Record<string, unknown>;
        if (template.chore_type === 'required') {
            if (!template.assigned_kid_id || !template.due_type) {
                throw new BadRequestException(
                    'Required template is missing an assignee or due type',
                );
            }
            insert = {
                ...base,
                state: 'ASSIGNED',
                assigned_to: template.assigned_kid_id,
                due_date: this.dueDateFor(
                    template.due_type as 'end_of_day' | 'end_of_week',
                ),
            };
        } else {
            insert = { ...base, state: 'OPEN' };
        }

        const { data, error } = (await db
            .from('chore_instances')
            .insert(insert)
            .select()
            .single()) as DbResult<ChoreInstanceRow>;
        if (error) throw new BadRequestException(error.message);
        return data;
    }
}
