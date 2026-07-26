import {
    Body,
    Controller,
    Delete,
    Param,
    ParseUUIDPipe,
    Patch,
    Post,
    UseGuards,
} from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth-user.interface';
import { KidsService } from './kids.service';
import { CreateKidDto } from './dto/create-kid.dto';
import { UpdateKidDto } from './dto/update-kid.dto';

@Controller('kids')
@UseGuards(SupabaseAuthGuard)
export class KidsController {
    constructor(private readonly kids: KidsService) {}

    /** parent → create a kid (auth user + chore profile) in their household. */
    @Post()
    create(@CurrentUser() user: AuthUser, @Body() dto: CreateKidDto) {
        return this.kids.create(user, dto);
    }

    /** parent → edit a kid's name / login / avatar. */
    @Patch(':id')
    update(
        @CurrentUser() user: AuthUser,
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateKidDto,
    ) {
        return this.kids.update(user, id, dto);
    }

    /** parent → delete a kid and all their data. */
    @Delete(':id')
    remove(
        @CurrentUser() user: AuthUser,
        @Param('id', ParseUUIDPipe) id: string,
    ) {
        return this.kids.remove(user, id);
    }
}
