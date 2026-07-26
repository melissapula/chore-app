import {
    IsDateString,
    IsOptional,
    IsString,
    Matches,
    MaxLength,
    ValidateIf,
} from 'class-validator';

/**
 * Edit a kid (parent). All fields optional. Changing `username` or `pin` also
 * updates the kid's Supabase Auth user (email/password are derived from them),
 * so this runs with the service role. avatar_* accept null to clear (e.g. switch
 * from an uploaded photo back to an emoji).
 */
export class UpdateKidDto {
    @IsOptional()
    @IsString()
    @MaxLength(40)
    display_name?: string;

    @IsOptional()
    @Matches(/^[a-zA-Z0-9_-]{2,20}$/, {
        message:
            'Username must be 2–20 characters: letters, numbers, _ or - only',
    })
    username?: string;

    @IsOptional()
    @Matches(/^\d{4,8}$/, { message: 'PIN must be 4–8 digits' })
    pin?: string;

    // null allowed → clears the field.
    @IsOptional()
    @ValidateIf((_o, v) => v !== null)
    @IsString()
    avatar_emoji?: string | null;

    @IsOptional()
    @ValidateIf((_o, v) => v !== null)
    @IsString()
    @MaxLength(1_500_000)
    avatar_url?: string | null;

    // §3b: powers the risky-chore age warning. null clears it.
    @IsOptional()
    @ValidateIf((_o, v) => v !== null)
    @IsDateString()
    birthdate?: string | null;
}
