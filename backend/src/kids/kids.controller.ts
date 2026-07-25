import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth-user.interface';
import { KidsService } from './kids.service';
import { CreateKidDto } from './dto/create-kid.dto';

@Controller('kids')
@UseGuards(SupabaseAuthGuard)
export class KidsController {
    constructor(private readonly kids: KidsService) {}

    /** parent → create a kid (auth user + chore profile) in their household. */
    @Post()
    create(@CurrentUser() user: AuthUser, @Body() dto: CreateKidDto) {
        return this.kids.create(user, dto);
    }
}
