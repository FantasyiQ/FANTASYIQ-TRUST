import type { NextAuthConfig } from 'next-auth';

// Edge-compatible config — no Prisma, no bcrypt.
// Used by middleware only. Full auth.ts adds the adapter + providers.
export const authConfig: NextAuthConfig = {
    pages: {
        signIn: '/sign-in',
    },
    providers: [],
    callbacks: {
        authorized({ auth: session, request }) {
            if (request.nextUrl.pathname.startsWith('/dashboard')) {
                return !!session?.user;
            }
            return true;
        },
    },
};
