import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Routes that require authentication
const PROTECTED_PREFIXES = ['/dashboard', '/admin'];

// NextAuth v5 session cookie names (prod uses __Secure- prefix; dev does not)
const SESSION_COOKIES = ['__Secure-authjs.session-token', 'authjs.session-token'];

function hasSession(request: NextRequest): boolean {
    return SESSION_COOKIES.some(name => !!request.cookies.get(name)?.value);
}

export function middleware(request: NextRequest): NextResponse {
    const { pathname } = request.nextUrl;

    const isProtected = PROTECTED_PREFIXES.some(p => pathname.startsWith(p));
    if (!isProtected) return NextResponse.next();

    if (!hasSession(request)) {
        const signIn = new URL('/sign-in', request.url);
        signIn.searchParams.set('callbackUrl', pathname);
        return NextResponse.redirect(signIn);
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        /*
         * Match /dashboard/* and /admin/* but skip:
         *  - Next.js internals (_next/static, _next/image)
         *  - API routes (they handle auth themselves)
         *  - Static files (favicon, images, etc.)
         */
        '/dashboard/:path*',
        '/admin/:path*',
    ],
};
