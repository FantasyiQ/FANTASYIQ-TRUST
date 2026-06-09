import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Routes that require authentication
const PROTECTED_PREFIXES = ['/dashboard', '/admin', '/onboarding'];

// NextAuth v5 session cookie names (prod uses __Secure- prefix; dev does not)
const SESSION_COOKIES = ['__Secure-authjs.session-token', 'authjs.session-token'];

function hasSession(request: NextRequest): boolean {
    return SESSION_COOKIES.some(name => !!request.cookies.get(name)?.value);
}

// Edge-safe nonce generation using Web Crypto (available in both Node.js and edge runtimes)
function generateNonce(): string {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return btoa(Array.from(bytes, b => String.fromCharCode(b)).join(''));
}

function buildCsp(nonce: string): string {
    return [
        `default-src 'self'`,
        // 'strict-dynamic' trusts scripts loaded by nonce-bearing scripts (e.g. Next.js chunk loader)
        `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
        // Tailwind and Next.js inject inline styles; unsafe-inline is acceptable for styles
        `style-src 'self' 'unsafe-inline'`,
        `img-src 'self' blob: data: https://sleepercdn.com https://lh3.googleusercontent.com`,
        `font-src 'self'`,
        // Sentry browser SDK sends error reports; vitals for Vercel Analytics if added later
        `connect-src 'self' https://*.sentry.io https://vitals.vercel-insights.com`,
        // Sentry session replay uses a blob: web worker
        `worker-src blob:`,
        `frame-src 'none'`,
        `object-src 'none'`,
        `base-uri 'self'`,
        `form-action 'self'`,
        `upgrade-insecure-requests`,
    ].join('; ');
}

export function middleware(request: NextRequest): NextResponse {
    const { pathname } = request.nextUrl;

    // Auth gate — redirect before generating nonce (redirect responses don't need CSP)
    const isProtected = PROTECTED_PREFIXES.some(p => pathname.startsWith(p));
    if (isProtected && !hasSession(request)) {
        const signIn = new URL('/sign-in', request.url);
        signIn.searchParams.set('callbackUrl', pathname);
        return NextResponse.redirect(signIn);
    }

    // Generate a per-request nonce and inject Content-Security-Policy.
    // The x-nonce request header lets server components read the nonce (e.g. for <Script nonce>).
    const nonce = generateNonce();
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-nonce', nonce);

    const response = NextResponse.next({ request: { headers: requestHeaders } });
    response.headers.set('Content-Security-Policy', buildCsp(nonce));
    return response;
}

export const config = {
    matcher: [
        /*
         * Match all request paths except:
         *  - Next.js internals (_next/static, _next/image)
         *  - API routes (CSP headers don't apply to JSON responses)
         *  - Static metadata files (favicon, sitemap, robots)
         */
        '/((?!_next/static|_next/image|favicon\\.ico|sitemap\\.xml|robots\\.txt|api/).*)',
    ],
};
