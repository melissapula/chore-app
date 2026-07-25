import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth-user.interface';
import { PushService } from './push.service';
import { SubscriptionDto, UnsubscribeDto } from './dto/subscription.dto';

@Controller('push')
export class PushController {
    constructor(private readonly push: PushService) {}

    /** Public: the frontend needs this to call PushManager.subscribe(). */
    @Get('vapid-public-key')
    publicKey() {
        return { key: this.push.publicKey };
    }

    @Post('subscribe')
    @UseGuards(SupabaseAuthGuard)
    subscribe(@CurrentUser() user: AuthUser, @Body() dto: SubscriptionDto) {
        return this.push.subscribe(user, dto);
    }

    @Post('unsubscribe')
    @UseGuards(SupabaseAuthGuard)
    unsubscribe(@CurrentUser() user: AuthUser, @Body() dto: UnsubscribeDto) {
        return this.push.unsubscribe(user, dto.endpoint);
    }
}
