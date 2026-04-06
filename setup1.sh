#!/bin/bash
echo "FantasyIQ Trust MVP — Part 1 of 2"
echo ""

mkdir -p prisma lib types \
    'app/api/auth/[...nextauth]' \
    app/api/auth/register \
    app/api/stripe/checkout \
    app/api/stripe/webhook \
    app/api/leagues \
    app/pricing \
    app/dashboard \
    app/login \
    app/register
echo "  Done: Directories created"

cat << 'EOF' > .env.example
DATABASE_URL="postgresql://user:password@host/dbname?sslmode=require"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="generate-with-openssl-rand-base64-32"
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_PUBLISHABLE_KEY="pk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
STRIPE_PRICE_PRO="price_..."
STRIPE_PRICE_ALL_PRO="price_..."
STRIPE_PRICE_ELITE="price_..."
EOF
cp .env.example .env
echo "  Done: .env.example + .env"

cat << 'EOF' > prisma/schema.prisma
generator client {
    provider = "prisma-client-js"
}

datasource db {
    provider = "postgresql"
    url      = env("DATABASE_URL")
}

model User {
    id               String    @id @default(cuid())
    email            String    @unique
    name             String?
    passwordHash     String?
    image            String?
    stripeCustomerId String?   @unique
    createdAt        DateTime  @default(now())
    updatedAt        DateTime  @updatedAt
    subscription     Subscription?
    leagues          League[]
    commissionerPlans CommissionerPlan[]
    accounts         Account[]
    sessions         Session[]
}

model Account {
    id                String  @id @default(cuid())
    userId            String
    type              String
    provider          String
    providerAccountId String
    refresh_token     String?
    access_token      String?
    expires_at        Int?
    token_type        String?
    scope             String?
    id_token          String?
    session_state     String?
    user              User @relation(fields: [userId], references: [id], onDelete: Cascade)
    @@unique([provider, providerAccountId])
}

model Session {
    id           String   @id @default(cuid())
    sessionToken String   @unique
    userId       String
    expires      DateTime
    user         User @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model Subscription {
    id                   String    @id @default(cuid())
    userId               String    @unique
    stripeSubscriptionId String?   @unique
    tier                 String    @default("free")
    status               String    @default("inactive")
    currentPeriodStart   DateTime?
    currentPeriodEnd     DateTime?
    createdAt            DateTime  @default(now())
    updatedAt            DateTime  @updatedAt
    user                 User @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model CommissionerPlan {
    id                   String    @id @default(cuid())
    userId               String
    stripeSubscriptionId String?   @unique
    tier                 String
    leagueSize           Int
    status               String    @default("inactive")
    createdAt            DateTime  @default(now())
    updatedAt            DateTime  @updatedAt
    user                 User @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model League {
    id               String    @id @default(cuid())
    userId           String
    platform         String
    platformLeagueId String
    leagueName       String
    seasonYear       Int
    leagueSize       Int?
    scoringFormat    String?
    lastSyncedAt     DateTime?
    createdAt        DateTime  @default(now())
    updatedAt        DateTime  @updatedAt
    user             User @relation(fields: [userId], references: [id], onDelete: Cascade)
    @@unique([userId, platform, platformLeagueId, seasonYear])
}
EOF
echo "  Done: prisma/schema.prisma"

cat << 'EOF' > lib/prisma.ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
EOF
echo "  Done: lib/prisma.ts"

cat << 'EOF' > lib/stripe.ts
import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2024-12-18.acacia",
});

export const PLAYER_TIERS = {
    pro: {
        name: "Pro",
        price: 5.99,
        leagueMin: 1,
        leagueMax: 2,
        priceId: process.env.STRIPE_PRICE_PRO!,
    },
    all_pro: {
        name: "All-Pro",
        price: 10.99,
        leagueMin: 3,
        leagueMax: 5,
        priceId: process.env.STRIPE_PRICE_ALL_PRO!,
    },
    elite: {
        name: "Elite",
        price: 17.99,
        leagueMin: 1,
        leagueMax: Infinity,
        priceId: process.env.STRIPE_PRICE_ELITE!,
    },
} as const;

export const COMMISSIONER_PRICING = {
    pro: {
        name: "Commissioner Pro",
        sizes: { 8: 39.99, 10: 49.99, 12: 59.99, 14: 69.99, 16: 79.99, 32: 159.99 },
    },
    all_pro: {
        name: "Commissioner All-Pro",
        sizes: { 8: 69.99, 10: 89.99, 12: 104.99, 14: 124.99, 16: 139.99, 32: 239.99 },
    },
    elite: {
        name: "Commissioner Elite",
        sizes: { 8: 109.99, 10: 129.99, 12: 149.99, 14: 169.99, 16: 189.99, 32: 299.99 },
    },
} as const;
EOF
echo "  Done: lib/stripe.ts"

cat << 'EOF' > lib/auth.ts
import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "./prisma";
import bcrypt from "bcryptjs";

export const { handlers, auth, signIn, signOut } = NextAuth({
    adapter: PrismaAdapter(prisma),
    providers: [
        CredentialsProvider({
            name: "credentials",
            credentials: {
                email: { label: "Email", type: "email" },
                password: { label: "Password", type: "password" },
            },
            async authorize(credentials) {
                if (!credentials?.email || !credentials?.password) return null;
                const user = await prisma.user.findUnique({
                    where: { email: credentials.email as string },
                });
                if (!user || !user.passwordHash) return null;
                const isValid = await bcrypt.compare(
                    credentials.password as string,
                    user.passwordHash
                );
                if (!isValid) return null;
                return { id: user.id, email: user.email, name: user.name };
            },
        }),
    ],
    session: { strategy: "jwt" },
    pages: { signIn: "/login" },
    callbacks: {
        async jwt({ token, user }) {
            if (user) token.id = user.id;
            return token;
        },
        async session({ session, token }) {
            if (session.user) session.user.id = token.id as string;
            return session;
        },
    },
});
EOF
echo "  Done: lib/auth.ts"

cat << 'EOF' > types/index.ts
export interface PricingTier {
    name: string;
    price: number;
    leagueMin: number;
    leagueMax: number;
    priceId: string;
}

export interface CommissionerTier {
    name: string;
    sizes: Record<number, number>;
}

export interface LeagueData {
    id: string;
    platform: string;
    platformLeagueId: string;
    leagueName: string;
    seasonYear: number;
    leagueSize?: number;
    scoringFormat?: string;
    lastSyncedAt?: Date;
}

export interface UserProfile {
    id: string;
    email: string;
    name?: string;
    subscriptionTier: string;
    subscriptionStatus: string;
    leagueCount: number;
}

export type SubscriptionTier = "free" | "pro" | "all_pro" | "elite";
export type SubscriptionStatus = "active" | "inactive" | "past_due" | "canceled";
EOF
echo "  Done: types/index.ts"

cat << 'EOF' > middleware.ts
export { auth as middleware } from "./lib/auth";

export const config = {
    matcher: ["/dashboard/:path*"],
};
EOF
echo "  Done: middleware.ts"

echo ""
echo "Part 1 complete — 8 files created!"
echo "   Now run: bash setup2.sh"