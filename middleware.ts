import NextAuth from 'next-auth';
import { authConfig } from './auth.config';
import { type NextRequest, NextResponse } from 'next/server';

const { auth } = NextAuth(authConfig);

export default auth((req: NextRequest & { auth: unknown }) => {
    const res = NextResponse.next();

    // Security headers on every response
    res.headers.set('X-Frame-Options', 'DENY');
    res.headers.set('X-Content-Type-Options', 'nosniff');
    res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

    return res;
});

export const config = {
    matcher: ['/dashboard/:path*'],
};
