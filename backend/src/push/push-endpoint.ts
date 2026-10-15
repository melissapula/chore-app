/**
 * Browser push services we'll deliver to. A PushSubscription's endpoint is a URL
 * the backend POSTs to, so an unchecked one lets a user point the server at any
 * address (localhost, cloud metadata, …). Only these hosts are real push services:
 *   Chrome / Edge-Android / Samsung / Brave → FCM, Firefox → Mozilla autopush,
 *   Safari (macOS 13+, iOS 16.4+) → Apple, Edge on Windows → WNS.
 *
 * Keep in sync with the CHECK constraint in migration 0020.
 */
const PUSH_HOSTS: readonly RegExp[] = [
    /^fcm\.googleapis\.com$/,
    /^([a-z0-9-]+\.)*push\.services\.mozilla\.com$/,
    /^web\.push\.apple\.com$/,
    /^([a-z0-9-]+\.)+notify\.windows\.com$/,
];

/** True when `endpoint` is a plain https URL on a known push service host. */
export function isAllowedPushEndpoint(endpoint: string): boolean {
    let url: URL;
    try {
        url = new URL(endpoint);
    } catch {
        return false;
    }
    if (url.protocol !== 'https:' || url.port !== '' || url.username) {
        return false;
    }
    return PUSH_HOSTS.some((host) => host.test(url.hostname));
}
