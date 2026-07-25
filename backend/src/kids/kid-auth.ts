/**
 * How a kid's username + PIN map to Supabase Auth credentials.
 *
 * Kids have no email inbox, so we don't use OTP for them. Instead the parent
 * picks a username + PIN; we admin-create an auth user whose email/password are
 * DERIVED from those two values, and the kid logs in by typing the same
 * username + PIN. Because the derivation is deterministic, the login screen can
 * recompute the credentials client-side with no server round-trip.
 *
 * IMPORTANT: the frontend duplicates these two functions (kid login, in
 * `frontend/app/pages/login.vue`). Keep them byte-for-byte in sync — if the
 * scheme changes here, existing kids can no longer log in.
 */

/** Domain for synthesized kid emails. Not a real mail domain — never delivered. */
export const KID_EMAIL_DOMAIN = 'choreq.local';

/** username → the synthesized (never-delivered) auth email. */
export function kidEmail(username: string): string {
    return `${username.trim().toLowerCase()}@${KID_EMAIL_DOMAIN}`;
}

/**
 * PIN → auth password. Prefixed so any 4-digit PIN clears Supabase's 6-char
 * minimum; the kid only ever sees/types the bare PIN.
 */
export function kidPassword(pin: string): string {
    return `choreq_${pin.trim()}`;
}
