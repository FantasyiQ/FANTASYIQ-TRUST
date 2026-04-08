import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import { PrismaAdapter } from '@auth/prisma-adapter';
import bcrypt from 'bcryptjs';
import { prisma } from './lib/prisma';

export const { handlers, auth, signIn, signOut } = NextAuth({
    adapter: PrismaAdapter(prisma),
    session: { strategy: 'jwt' },

    pages: {
        signIn: '/sign-in',
    },

    providers: [
        Credentials({
            name: 'credentials',
            credentials: {
                email: { label: 'Email', type: 'email' },
                password: { label: 'Password', type: 'password' },
            },
            async authorize(credentials) {
                if (!credentials?.email || !credentials?.password) return null;

                const user = await prisma.user.findUnique({
                    where: { email: credentials.email as string },
                    select: {
                        id: true,
                        email: true,
                        name: true,
                        image: true,
                        hashedPassword: true,
                        subscriptionTier: true,
                    },
                });

                if (!user?.hashedPassword) return null;

                const valid = await bcrypt.compare(
                    credentials.password as string,
                    user.hashedPassword
                );
                if (!valid) return null;

                return {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    image: user.image,
                    subscriptionTier: user.subscriptionTier,
                };
            },
        }),

        Google({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        }),
    ],

    callbacks: {
        authorized({ auth: session, request }) {
            // Protect all /dashboard routes
            if (request.nextUrl.pathname.startsWith('/dashboard')) {
                return !!session?.user;
            }
            return true;
        },
        async jwt({ token, user, trigger }) {
            if (user) {
                token.sub = user.id;
                token.picture = user.image;
                // @ts-expect-error — extended field
                token.subscriptionTier = user.subscriptionTier;
            }
            // Re-fetch tier from DB when client calls session.update()
            if (trigger === 'update' && token.sub) {
                const fresh = await prisma.user.findUnique({
                    where: { id: token.sub },
                    select: { subscriptionTier: true },
                });
                if (fresh) {
                    token.subscriptionTier = fresh.subscriptionTier;
                }
            }
            return token;
        },
        async session({ session, token }) {
            if (session.user) {
                session.user.id = token.sub as string;
                session.user.image = token.picture as string | null | undefined;
                // @ts-expect-error — extended field
                session.user.subscriptionTier = token.subscriptionTier;
            }
            return session;
        },
    },
});
