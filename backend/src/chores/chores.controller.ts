import {
    Body,
    Controller,
    Get,
    Param,
    ParseUUIDPipe,
    Patch,
    Post,
    UseGuards,
} from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth-user.interface';
import { ChoresService } from './chores.service';
import { CreateChoreDto } from './dto/create-chore.dto';
import { UpdateChoreDto } from './dto/update-chore.dto';

@Controller('chores')
@UseGuards(SupabaseAuthGuard)
export class ChoresController {
    constructor(private readonly chores: ChoresService) {}

    @Post()
    create(@CurrentUser() user: AuthUser, @Body() dto: CreateChoreDto) {
        return this.chores.create(user, dto);
    }

    @Get()
    list(@CurrentUser() user: AuthUser) {
        return this.chores.list(user);
    }

    @Patch(':id')
    update(
        @CurrentUser() user: AuthUser,
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateChoreDto,
    ) {
        return this.chores.update(user, id, dto);
    }

    @Post(':id/instances')
    spawn(
        @CurrentUser() user: AuthUser,
        @Param('id', ParseUUIDPipe) id: string,
    ) {
        return this.chores.spawnInstance(user, id);
    }
}
