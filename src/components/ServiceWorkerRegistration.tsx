'use client';

import { useEffect } from 'react';

// Registers the PWA service worker so the app is installable (Add to Home
// Screen / desktop install). The worker itself does no caching — every
// request still goes straight to the network, so authenticated dashboard
// data and Stripe checkout flows are never served stale from a cache.
export default function ServiceWorkerRegistration() {
    useEffect(() => {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js').catch(() => {});
        }
    }, []);

    return null;
}
