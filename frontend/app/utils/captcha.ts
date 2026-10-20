// Sign-in CAPTCHA plumbing for /login. Supabase Auth verifies the Turnstile
// token server-side, so the browser only has to pass it along — and send
// nothing at all when no site key is configured (local dev, previews).

/** Auth `options` fragment: `{ captchaToken }` when we have one, else `{}`. */
export function captchaOptions(token: string | undefined): {
    captchaToken?: string;
} {
    return token ? { captchaToken: token } : {};
}

/** True when Supabase rejected the request for a missing/invalid CAPTCHA. */
export function isCaptchaError(
    err: { code?: string; message?: string } | null,
): boolean {
    if (!err) return false;
    if (err.code === 'captcha_failed') return true;
    return /captcha/i.test(err.message ?? '');
}
