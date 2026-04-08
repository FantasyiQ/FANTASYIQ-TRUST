import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import { PrismaAdapter } from '@auth/prisma-adapter';
import bcrypt from 'bcryptjs';
import { prisma } from '../../lib/prisma';

export const { handlers, auth, signIn, signOut } = NextAuth({
    adapter: PrismaAdapter(prisma),

    // JWT strategy is required when using Credentials provider.
    // Google OAuth users get database sessions via the adapter.
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
        async jwt({ token, user }) {
            if (user) {
                token.id = user.id;
                // @ts-expect-error — extended user field from authorize()
                token.subscriptionTier = user.subscriptionTier;
            }
            return token;
        },
        async session({ session, token }) {
            if (session.user) {
                session.user.id = token.id as string;
                // @ts-expect-error — extended session field
                session.user.subscriptionTier = token.subscriptionTier;
            }
            return session;
        },
    },
});
