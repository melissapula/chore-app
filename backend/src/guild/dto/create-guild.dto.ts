import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

/** Create a household guild quest (SPEC §4d). One active at a time. */
export class CreateGuildDto {
    @IsString()
    @IsNotEmpty()
    title!: string;

    @IsOptional()
    @IsString()
    reward?: string;

    @IsInt()
    @Min(1)
    target_xp!: number;
}
