import { IsIn, IsUUID, Matches } from 'class-validator';

/** Parent's release/hold decision for one kid's week (SPEC §3a pay gate). */
export class DecideGateDto {
    @IsUUID()
    kid_id!: string;

    // The Monday of the target week, YYYY-MM-DD.
    @Matches(/^\d{4}-\d{2}-\d{2}$/, {
        message: 'week_start must be YYYY-MM-DD',
    })
    week_start!: string;

    @IsIn(['release', 'hold'])
    decision!: 'release' | 'hold';
}
