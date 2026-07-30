// Minimal PWA service worker — exists purely to satisfy browser install
// criteria (Add to Home Screen). Deliberately does no caching: every fetch
// falls through to the network untouched, so authenticated dashboard pages
// and Stripe checkout redirects are never served stale.
self.addEventListener('install', () => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});
