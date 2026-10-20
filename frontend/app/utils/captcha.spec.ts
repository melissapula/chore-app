import { describe, expect, it } from 'vitest';
import { captchaOptions, isCaptchaError } from './captcha';

describe('captchaOptions', () => {
    it('passes a Turnstile token through as captchaToken', () => {
        expect(captchaOptions('tok')).toEqual({ captchaToken: 'tok' });
    });

    it('sends nothing when there is no token', () => {
        expect(captchaOptions(undefined)).toEqual({});
    });

    it('sends nothing for an empty token', () => {
        expect(captchaOptions('')).toEqual({});
    });
});

describe('isCaptchaError', () => {
    it('recognises the captcha_failed error code', () => {
        expect(isCaptchaError({ code: 'captcha_failed' })).toBe(true);
    });

    it('recognises a captcha message when the code is missing', () => {
        const err = {
            message:
                'captcha protection: request disallowed (invalid-input-response)',
        };

        expect(isCaptchaError(err)).toBe(true);
    });

    it('ignores a wrong-password error', () => {
        const err = {
            code: 'invalid_credentials',
            message: 'Invalid login credentials',
        };

        expect(isCaptchaError(err)).toBe(false);
    });

    it('ignores no error at all', () => {
        expect(isCaptchaError(null)).toBe(false);
    });
});
