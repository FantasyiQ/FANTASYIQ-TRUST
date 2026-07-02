// GET /api/auth/yahoo — redirect user to Yahoo OAuth consent screen
import { auth } from '@/lib/auth';
import { YAHOO_AUTH_URL } from '@/lib/yahoo';
import { cookies } from 'next/headers';
import crypto from 'node:crypto';

function getRedirectUri(request: Request): string {
    const base = process.env.NEXTAUTH_URL ?? new URL(request.url).origin;
    return `${base}/api/auth/yahoo/callback`;
}

export async function GET(request: Request): Promise<Response> {
    const session = await auth();
    if (!session?.user?.id) {
        return Response.redirect(new URL('/login', request.url));
    }

    const clientId   = process.env.YAHOO_CLIENT_ID;
    if (!clientId) {
        return Response.json({ error: 'Yahoo OAuth not configured' }, { status: 500 });
    }

    // CSRF state
    const state = crypto.randomBytes(16).toString('hex');
    const cookieStore = await cookies();
    cookieStore.set('yahoo_oauth_state', state, {
        httpOnly: true,
        secure:   process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge:   600, // 10 minutes
        path:     '/',
    });

    const redirectUri = getRedirectUri(request);

    const params = new URLSearchParams({
        client_id:     clientId,
        redirect_uri:  redirectUri,
        response_type: 'code',
        scope:         'fspt-r',   // Fantasy Sports read
        state,
    });

    return Response.redirect(`${YAHOO_AUTH_URL}?${params.toString()}`);
}
