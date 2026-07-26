import {
    IsArray,
    IsBoolean,
    IsIn,
    IsInt,
    IsOptional,
    IsString,
    IsUUID,
    Min,
    ValidateIf,
} from 'class-validator';

/**
 * Edit an existing chore template. All fields optional — only what's sent is
 * changed. `chore_type` is intentionally not editable (a paid chore can't become
 * a required one). DB constraints still enforce the per-type invariants.
 */
export class UpdateChoreDto {
    @IsOptional()
    @IsString()
    title?: string;

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
    @IsUUID()
    assigned_kid_id?: string;

    @IsOptional()
    @IsIn(['end_of_day', 'end_of_week'])
    due_type?: 'end_of_day' | 'end_of_week';

    @IsOptional()
    @IsBoolean()
    gates_pay?: boolean;

    // §3b risky flag (paid or required).
    @IsOptional()
    @IsBoolean()
    is_risky?: boolean;

    // §3b paid eligibility. null clears it → open to all kids.
    @IsOptional()
    @ValidateIf((_o, v) => v !== null)
    @IsArray()
    @IsUUID('all', { each: true })
    eligible_kid_ids?: string[] | null;

    @IsOptional()
    @IsBoolean()
    active?: boolean;
}
