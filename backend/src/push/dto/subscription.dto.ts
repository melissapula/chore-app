import { Type } from 'class-transformer';
import {
    IsNotEmpty,
    IsString,
    MaxLength,
    ValidateBy,
    ValidateNested,
} from 'class-validator';
import { isAllowedPushEndpoint } from '../push-endpoint';

class PushKeysDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(256)
    p256dh!: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(256)
    auth!: string;
}

/** A browser PushSubscription, as returned by PushManager.subscribe(). */
export class SubscriptionDto {
    @ValidateBy({
        name: 'isPushEndpoint',
        validator: {
            validate: (v: unknown) =>
                typeof v === 'string' && isAllowedPushEndpoint(v),
            defaultMessage: () =>
                'endpoint must be an https URL on a known browser push service',
        },
    })
    endpoint!: string;

    @ValidateNested()
    @Type(() => PushKeysDto)
    keys!: PushKeysDto;
}

export class UnsubscribeDto {
    @IsString()
    @IsNotEmpty()
    endpoint!: string;
}
