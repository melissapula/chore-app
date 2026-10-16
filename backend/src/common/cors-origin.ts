/**
 * Turn the FRONTEND_ORIGIN env value into the exact string browsers send in
 * their Origin header. CORS compares it byte-for-byte, so a pasted
 * `https://app.example/` (trailing slash) silently blocks every request.
 * Throws on a value that isn't a URL, so a typo fails at boot, not in the browser.
 */
export function toCorsOrigin(raw: string | undefined): string | undefined {
    const value = raw?.trim();
    if (!value) return undefined;
    try {
        return new URL(value).origin;
    } catch {
        throw new Error(`FRONTEND_ORIGIN is not a valid URL: "${value}"`);
    }
}
