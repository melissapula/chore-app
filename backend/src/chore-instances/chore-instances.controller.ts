import {
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
import { ChoreInstancesService } from './chore-instances.service';

@Controller('chore-instances')
@UseGuards(SupabaseAuthGuard)
export class ChoreInstancesController {
    constructor(private readonly instances: ChoreInstancesService) {}

    @Get()
    list(@CurrentUser() user: AuthUser) {
        return this.instances.list(user);
    }

    // --- the paid state machine ---

    @Post(':id/claim')
    claim(
        @CurrentUser() user: AuthUser,
        @Param('id', ParseUUIDPipe) id: string,
    ) {
        return this.instances.claim(user, id);
    }

    @Post(':id/start')
    start(
        @CurrentUser() user: AuthUser,
        @Param('id', ParseUUIDPipe) id: string,
    ) {
        return this.instances.start(user, id);
    }

    @Post(':id/submit')
    submit(
        @CurrentUser() user: AuthUser,
        @Param('id', ParseUUIDPipe) id: string,
    ) {
        return this.instances.submit(user, id);
    }

    @Post(':id/approve')
    approve(
        @CurrentUser() user: AuthUser,
        @Param('id', ParseUUIDPipe) id: string,
    ) {
        return this.instances.approve(user, id);
    }

    @Post(':id/release')
    release(
        @CurrentUser() user: AuthUser,
        @Param('id', ParseUUIDPipe) id: string,
    ) {
        return this.instances.release(user, id);
    }
}
