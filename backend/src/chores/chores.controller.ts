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
import { ChoresService } from './chores.service';
import { CreateChoreDto } from './dto/create-chore.dto';

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

  @Post(':id/instances')
  spawn(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.chores.spawnInstance(user, id);
  }
}
