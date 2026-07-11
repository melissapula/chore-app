import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

/**
 * Create a chore template (SPEC §4, chores). Covers both types; the service and
 * DB constraints enforce the required-chore invariants (value 0, has assignee,
 * has due_type).
 */
export class CreateChoreDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsIn(['paid', 'required'])
  chore_type!: 'paid' | 'required';

  @IsOptional()
  @IsString()
  icon_emoji?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  value_cents?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  est_minutes?: number;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsIn(['once', 'daily', 'weekly', 'custom'])
  recurrence?: 'once' | 'daily' | 'weekly' | 'custom';

  @IsOptional()
  @IsInt()
  @Min(1)
  start_timer_mins?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  finish_timer_mins?: number;

  @IsOptional()
  @IsBoolean()
  gates_pay?: boolean;

  @IsOptional()
  @IsBoolean()
  is_risky?: boolean;

  @IsOptional()
  @IsUUID()
  assigned_kid_id?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  eligible_kid_ids?: string[];

  @IsOptional()
  @IsIn(['end_of_day', 'end_of_week'])
  due_type?: 'end_of_day' | 'end_of_week';
}
