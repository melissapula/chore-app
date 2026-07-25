import {
    Body,
    Controller,
    Get,
    Param,
    ParseUUIDPipe,
    Post,
    UseGuards,
} from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth-user.interface';
import { GuildService } from './guild.service';
import { CreateGuildDto } from './dto/create-guild.dto';

@Controller('guild')
@UseGuards(SupabaseAuthGuard)
export class GuildController {
    constructor(private readonly guild: GuildService) {}

    /** member → the active guild quest, progress, and per-kid contributions. */
    @Get()
    current(@CurrentUser() user: AuthUser) {
        return this.guild.current(user);
    }

    /** parent → start a guild quest (replaces any active one). */
    @Post()
    create(@CurrentUser() user: AuthUser, @Body() dto: CreateGuildDto) {
        return this.guild.create(user, dto);
    }

    /** parent → mark the guild quest granted. */
    @Post(':id/complete')
    complete(
        @CurrentUser() user: AuthUser,
        @Param('id', ParseUUIDPipe) id: string,
    ) {
        return this.guild.complete(user, id);
    }
}
