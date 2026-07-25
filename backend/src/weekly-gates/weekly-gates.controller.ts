import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth-user.interface';
import { WeeklyGatesService } from './weekly-gates.service';
import { DecideGateDto } from './dto/decide-gate.dto';

@Controller('weekly-gates')
@UseGuards(SupabaseAuthGuard)
export class WeeklyGatesController {
    constructor(private readonly gates: WeeklyGatesService) {}

    /** Every kid's gate for a week (default: the current week). `?week=YYYY-MM-DD`. */
    @Get()
    forWeek(@CurrentUser() user: AuthUser, @Query('week') week?: string) {
        return this.gates.forWeek(user, week);
    }

    /** parent → release/hold a kid's week. */
    @Post('decide')
    decide(@CurrentUser() user: AuthUser, @Body() dto: DecideGateDto) {
        return this.gates.decide(user, dto);
    }
}
