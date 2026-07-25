// Web push opt-in (SPEC §7). Asks permission, subscribes this device via the
// PushManager using the backend's VAPID public key, and registers the
// subscription with the API so the server can notify the user.
//
// The service worker is the PWA's own (generateSW) — our push handlers are
// imported into it via nuxt.config `pwa.workbox.importScripts`.

function urlBase64ToUint8Array(base64: string): Uint8Array {
    const padding = '='.repeat((4 - (base64.length % 4)) % 4);
    const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(b64);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
}

export function usePush() {
    const { authFetch } = useApi();

    function supported(): boolean {
        return (
            typeof window !== 'undefined' &&
            'serviceWorker' in navigator &&
            'PushManager' in window &&
            'Notification' in window
        );
    }

    async function enable(): Promise<void> {
        if (!supported()) {
            throw new Error('This device doesn’t support notifications.');
        }
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            throw new Error(
                'Notifications are blocked — allow them to enable.',
            );
        }

        const reg = await navigator.serviceWorker.ready;
        const { key } = await authFetch<{ key: string }>(
            '/push/vapid-public-key',
        );
        if (!key) throw new Error('Push isn’t configured on the server yet.');

        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
            sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(key),
            });
        }

        await authFetch('/push/subscribe', {
            method: 'POST',
            body: sub.toJSON(),
        });
    }

    return { supported, enable };
}
