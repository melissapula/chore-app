import { IsNotEmpty, IsObject, IsString, IsUrl } from 'class-validator';

/** A browser PushSubscription, as returned by PushManager.subscribe(). */
export class SubscriptionDto {
    @IsUrl({ require_tld: false })
    endpoint!: string;

    @IsObject()
    keys!: { p256dh: string; auth: string };
}

export class UnsubscribeDto {
    @IsString()
    @IsNotEmpty()
    endpoint!: string;
}
