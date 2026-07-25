// Push handlers, imported into the generated PWA service worker via the
// workbox `importScripts` config (nuxt.config.ts → pwa.workbox.importScripts).
// The backend (web-push) sends a JSON body of { title, body, url }.

self.addEventListener('push', (event) => {
    let payload = {};
    try {
        payload = event.data ? event.data.json() : {};
    } catch (e) {
        payload = {
            title: 'ChoreQuest',
            body: event.data ? event.data.text() : '',
        };
    }
    const title = payload.title || 'ChoreQuest';
    event.waitUntil(
        self.registration.showNotification(title, {
            body: payload.body || '',
            data: { url: payload.url || '/' },
            tag: payload.tag,
        }),
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const url = (event.notification.data && event.notification.data.url) || '/';
    event.waitUntil(
        self.clients
            .matchAll({ type: 'window', includeUncontrolled: true })
            .then((clientList) => {
                for (const client of clientList) {
                    if ('focus' in client) {
                        client.navigate(url);
                        return client.focus();
                    }
                }
                if (self.clients.openWindow)
                    return self.clients.openWindow(url);
            }),
    );
});
