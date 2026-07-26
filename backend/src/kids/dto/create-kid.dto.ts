import {
    IsDateString,
    IsNotEmpty,
    IsOptional,
    IsString,
    Matches,
    MaxLength,
} from 'class-validator';

/**
 * Parent-creates-kid payload. The username + PIN become the kid's login
 * (see kid-auth.ts); avatar/birthdate mirror the parent onboarding fields.
 */
export class CreateKidDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(40)
    display_name!: string;

    // Letters/digits/_/- , 2–20 chars. Becomes `<username>@choreq.local`.
    @Matches(/^[a-zA-Z0-9_-]{2,20}$/, {
        message:
            'Username must be 2–20 characters: letters, numbers, _ or - only',
    })
    username!: string;

    // 4–8 digit PIN. Kept as a string so leading zeros survive.
    @Matches(/^\d{4,8}$/, { message: 'PIN must be 4–8 digits' })
    pin!: string;

    @IsOptional()
    @IsString()
    avatar_emoji?: string;

    // A data: URL (parent may upload a photo, like their own avatar). Client
    // downscales to ~160px; cap it so a crafted client can't send a huge blob.
    @IsOptional()
    @IsString()
    @MaxLength(1_500_000)
    avatar_url?: string;

    @IsOptional()
    @IsDateString()
    birthdate?: string;
}
