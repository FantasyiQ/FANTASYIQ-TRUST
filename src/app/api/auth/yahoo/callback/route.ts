// GET /api/auth/yahoo/callback — receive Yahoo auth code, exchange for tokens, store
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { exchangeYahooCode, getYahooGuid } from '@/lib/yahoo';
import { cookies } from 'next/headers';

function getRedirectUri(request: Request): string {
    const base = process.env.NEXTAUTH_URL ?? new URL(request.url).origin;
    return `${base}/api/auth/yahoo/callback`;
}

export async function GET(request: Request): Promise<Response> {
    const session = await auth();
    if (!session?.user?.id) {
        return Response.redirect(new URL('/login', request.url));
    }
    const userId = session.user.id;

    const url    = new URL(request.url);
    const code   = url.searchParams.get('code');
    const state  = url.searchParams.get('state');
    const errParam = url.searchParams.get('error');

    // Provider returned an error (user denied, invalid scope, app misconfig, …).
    // Surface the real reason instead of a generic "cancelled" so it's diagnosable.
    if (errParam) {
        const detail = url.searchParams.get('error_description') ?? '';
        console.error('[Yahoo OAuth callback] provider error:', errParam, detail);
        const u = new URL('/dashboard/sync/yahoo', request.url);
        u.searchParams.set('error', 'denied');
        u.searchParams.set('reason', errParam);
        if (detail) u.searchParams.set('detail', detail.slice(0, 300));
        return Response.redirect(u);
    }

    if (!code) {
        return Response.redirect(new URL('/dashboard/sync/yahoo?error=no_code', request.url));
    }

    // Verify CSRF state
    const cookieStore = await cookies();
    const savedState  = cookieStore.get('yahoo_oauth_state')?.value;
    cookieStore.delete('yahoo_oauth_state');

    if (!savedState || savedState !== state) {
        return Response.redirect(new URL('/dashboard/sync/yahoo?error=state_mismatch', request.url));
    }

    try {
        const redirectUri = getRedirectUri(request);
        const tokens      = await exchangeYahooCode(code, redirectUri);
        const yahooUserId = await getYahooGuid(tokens.access_token);

        const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

        await prisma.user.update({
            where: { id: userId },
            data:  {
                yahooUserId,
                yahooAccessToken:   tokens.access_token,
                yahooRefreshToken:  tokens.refresh_token,
                yahooTokenExpiresAt: expiresAt,
            },
        });

        return Response.redirect(new URL('/dashboard/sync/yahoo?connected=true', request.url));
    } catch (err) {
        console.error('[Yahoo OAuth callback]', err);
        const u = new URL('/dashboard/sync/yahoo', request.url);
        u.searchParams.set('error', 'token_exchange');
        u.searchParams.set('detail', (err instanceof Error ? err.message : String(err)).slice(0, 300));
        return Response.redirect(u);
    }
}
