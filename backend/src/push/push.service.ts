import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webpush from 'web-push';
import { SupabaseService } from '../supabase/supabase.service';
import { AuthUser } from '../auth/auth-user.interface';
import { SubscriptionDto } from './dto/subscription.dto';

export interface PushPayload {
    title: string;
    body: string;
    /** Where to send the user when they tap the notification. */
    url?: string;
}

/**
 * Web push (SPEC §7). Stores per-device subscriptions and sends notifications
 * with VAPID. Sending is best-effort and fire-and-forget: a transition must
 * never fail because a push didn't go out. If VAPID keys aren't configured the
 * whole thing quietly no-ops, so the app still runs without push set up.
 */
@Injectable()
export class PushService {
    private readonly logger = new Logger(PushService.name);
    private readonly enabled: boolean;
    private readonly vapidPublicKey: string;

    constructor(
        private readonly config: ConfigService,
        private readonly supabase: SupabaseService,
    ) {
        this.vapidPublicKey = this.config.get<string>('VAPID_PUBLIC_KEY') ?? '';
        const privateKey = this.config.get<string>('VAPID_PRIVATE_KEY') ?? '';
        const subject =
            this.config.get<string>('VAPID_SUBJECT') ??
            'mailto:admin@example.com';
        this.enabled = Boolean(this.vapidPublicKey && privateKey);
        if (this.enabled) {
            webpush.setVapidDetails(subject, this.vapidPublicKey, privateKey);
        } else {
            this.logger.warn(
                'VAPID keys not set — web push is disabled (set VAPID_* in .env)',
            );
        }
    }

    get publicKey(): string {
        return this.vapidPublicKey;
    }

    /** Save (or refresh) this device's subscription. RLS: user owns their rows. */
    async subscribe(user: AuthUser, dto: SubscriptionDto): Promise<void> {
        const db = this.supabase.userClient(user.accessToken);
        const { error } = await db.from('push_subscriptions').upsert(
            {
                user_id: user.id,
                household_id: user.householdId,
                endpoint: dto.endpoint,
                p256dh: dto.keys.p256dh,
                auth: dto.keys.auth,
            },
            { onConflict: 'endpoint' },
        );
        if (error) this.logger.error(`subscribe: ${error.message}`);
    }

    async unsubscribe(user: AuthUser, endpoint: string): Promise<void> {
        const db = this.supabase.userClient(user.accessToken);
        await db
            .from('push_subscriptions')
            .delete()
            .eq('endpoint', endpoint)
            .eq('user_id', user.id);
    }

    /** Send to specific users (their every device). Best-effort. */
    async notifyUsers(userIds: string[], payload: PushPayload): Promise<void> {
        if (!this.enabled || userIds.length === 0) return;
        const service = this.supabase.serviceClient();
        const { data, error } = await service
            .from('push_subscriptions')
            .select('id, endpoint, p256dh, auth')
            .in('user_id', userIds);
        if (error) {
            this.logger.error(`notifyUsers read: ${error.message}`);
            return;
        }
        const subs = (data ?? []) as {
            id: string;
            endpoint: string;
            p256dh: string;
            auth: string;
        }[];
        const body = JSON.stringify(payload);
        await Promise.all(
            subs.map(async (s) => {
                try {
                    await webpush.sendNotification(
                        {
                            endpoint: s.endpoint,
                            keys: { p256dh: s.p256dh, auth: s.auth },
                        },
                        body,
                    );
                } catch (e) {
                    const status = (e as { statusCode?: number }).statusCode;
                    // 404/410 → the subscription is dead; prune it.
                    if (status === 404 || status === 410) {
                        await service
                            .from('push_subscriptions')
                            .delete()
                            .eq('id', s.id);
                    } else {
                        this.logger.error(`push send failed: ${String(e)}`);
                    }
                }
            }),
        );
    }

    /** Notify every parent in a household (chore submitted, timer expired, …). */
    async notifyHouseholdParents(
        householdId: string,
        payload: PushPayload,
    ): Promise<void> {
        if (!this.enabled) return;
        const service = this.supabase.serviceClient();
        const { data, error } = await service
            .from('users')
            .select('id')
            .eq('household_id', householdId)
            .eq('role', 'parent');
        if (error) {
            this.logger.error(`notifyHouseholdParents: ${error.message}`);
            return;
        }
        const ids = ((data ?? []) as { id: string }[]).map((u) => u.id);
        await this.notifyUsers(ids, payload);
    }
}
