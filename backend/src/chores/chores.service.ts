import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { AuthUser } from '../auth/auth-user.interface';
import { CreateChoreDto } from './dto/create-chore.dto';

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
        throw new BadRequestException('Required chores must set due_type');
      }
    }

    const row = {
      ...dto,
      household_id: user.householdId,
      // Required chores are always $0 (SPEC §3a); paid default to 0 if omitted.
      value_cents: dto.chore_type === 'required' ? 0 : (dto.value_cents ?? 0),
    };

    const db = this.supabase.userClient(user.accessToken);
    const { data, error } = await db
      .from('chores')
      .insert(row)
      .select()
      .single();
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  /** List the household's chore templates. */
  async list(user: AuthUser) {
    const db = this.supabase.userClient(user.accessToken);
    const { data, error } = await db
      .from('chores')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  /**
   * Spawn a live instance from a paid template (state OPEN, ready to claim).
   * Recurring auto-spawn and the required-chore flow come in later build steps.
   */
  async spawnInstance(user: AuthUser, choreId: string) {
    this.assertParent(user);
    const db = this.supabase.userClient(user.accessToken);

    const { data: template, error: tErr } = await db
      .from('chores')
      .select('id, chore_type, value_cents, gates_pay, active')
      .eq('id', choreId)
      .maybeSingle();
    if (tErr) throw new BadRequestException(tErr.message);
    if (!template) throw new NotFoundException('Chore template not found');
    if (template.chore_type !== 'paid') {
      throw new BadRequestException(
        'Only paid chores can be spawned right now (required flow is build step 5)',
      );
    }
    if (!template.active) {
      throw new BadRequestException('Chore template is inactive');
    }

    const { data, error } = await db
      .from('chore_instances')
      .insert({
        household_id: user.householdId,
        chore_id: template.id,
        state: 'OPEN',
        gates_pay: template.gates_pay,
        value_cents_snapshot: template.value_cents,
      })
      .select()
      .single();
    if (error) throw new BadRequestException(error.message);
    return data;
  }
}
