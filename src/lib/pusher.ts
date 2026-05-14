import PusherServer from 'pusher';
import PusherClient from 'pusher-js';

// ── Server-side Pusher instance (used in API routes / service layer) ──────────
let pusherServer: PusherServer | null = null;

export function getPusherServer(): PusherServer | null {
    const { PUSHER_APP_ID, PUSHER_KEY, PUSHER_SECRET, PUSHER_CLUSTER } = process.env;
    if (!PUSHER_APP_ID || !PUSHER_KEY || !PUSHER_SECRET || !PUSHER_CLUSTER) return null;

    if (!pusherServer) {
        pusherServer = new PusherServer({
            appId:   PUSHER_APP_ID,
            key:     PUSHER_KEY,
            secret:  PUSHER_SECRET,
            cluster: PUSHER_CLUSTER,
            useTLS:  true,
        });
    }
    return pusherServer;
}

// ── Client-side Pusher singleton (used in browser components) ─────────────────
let pusherClient: PusherClient | null = null;

export function getPusherClient(): PusherClient | null {
    if (typeof window === 'undefined') return null;

    const key     = process.env.NEXT_PUBLIC_PUSHER_KEY;
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
    if (!key || !cluster) return null;

    if (!pusherClient) {
        pusherClient = new PusherClient(key, {
            cluster,
            authEndpoint: '/api/pusher/auth',
        });
    }
    return pusherClient;
}

// Channel name for a user's private notification stream
export function userChannel(userId: string) {
    return `private-notifications-${userId}`;
}
