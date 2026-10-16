import 'reflect-metadata'; // Nest loads this at bootstrap; @Type needs it here.
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { isAllowedPushEndpoint } from './push-endpoint';
import { SubscriptionDto } from './dto/subscription.dto';

describe('isAllowedPushEndpoint', () => {
    it.each([
        'https://fcm.googleapis.com/fcm/send/abc123',
        'https://updates.push.services.mozilla.com/wpush/v2/abc',
        'https://web.push.apple.com/QGx1dW1p',
        'https://wns2-bl2p.notify.windows.com/w/?token=abc',
    ])('accepts a real push service endpoint: %s', (endpoint) => {
        expect(isAllowedPushEndpoint(endpoint)).toBe(true);
    });

    it.each([
        ['plain http', 'http://fcm.googleapis.com/fcm/send/abc'],
        ['localhost', 'https://localhost:3000/anything'],
        ['cloud metadata IP', 'http://169.254.169.254/latest/meta-data'],
        ['look-alike suffix', 'https://fcm.googleapis.com.evil.com/x'],
        ['userinfo trick', 'https://fcm.googleapis.com@evil.com/x'],
        ['custom port', 'https://fcm.googleapis.com:8443/x'],
        ['bare apex of WNS', 'https://notify.windows.com/x'],
        ['not a URL', 'not a url'],
    ])('rejects %s', (_label, endpoint) => {
        expect(isAllowedPushEndpoint(endpoint)).toBe(false);
    });
});

describe('SubscriptionDto', () => {
    const keys = { p256dh: 'BNcRdreALRFX', auth: 'tBHItJI5svbpez7K' };

    async function errorsFor(body: unknown): Promise<string[]> {
        const dto = plainToInstance(SubscriptionDto, body);
        const errors = await validate(dto, { whitelist: true });
        return errors.map((e) => e.property);
    }

    it('accepts a browser subscription', async () => {
        expect(
            await errorsFor({
                endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
                keys,
            }),
        ).toEqual([]);
    });

    it('rejects an endpoint on an arbitrary host', async () => {
        expect(
            await errorsFor({ endpoint: 'https://evil.example/hook', keys }),
        ).toEqual(['endpoint']);
    });

    it('rejects keys that are not strings', async () => {
        expect(
            await errorsFor({
                endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
                keys: { p256dh: 42, auth: '' },
            }),
        ).toEqual(['keys']);
    });
});
