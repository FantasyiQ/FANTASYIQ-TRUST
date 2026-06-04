/**
 * Patches an existing commissioner subscription in Stripe to add leagueName
 * to description + metadata. Affects all future invoices/receipts.
 *
 * Run with:
 *   STRIPE_SECRET_KEY=sk_live_... WIPE_EMAIL=you@example.com npx tsx scripts/patch-commissioner-description.ts
 */

import Stripe from 'stripe';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const stripeKey = process.env.STRIPE_SECRET_KEY!;
const stripe    = new Stripe(stripeKey, { apiVersion: '2025-04-30.basil' });
const adapter   = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma    = new PrismaClient({ adapter });

async function run() {
    const email = process.env.WIPE_EMAIL;
    if (!email) { console.error('WIPE_EMAIL required'); process.exit(1); }

    const user = await prisma.user.findUnique({
        where:  { email },
        select: { id: true, name: true },
    });
    if (!user) { console.error('User not found'); process.exit(1); }

    // Find all commissioner subs with no description or missing leagueName
    const subs = await prisma.subscription.findMany({
        where:  { userId: user.id, type: 'commissioner', stripeSubscriptionId: { not: null } },
        select: { id: true, stripeSubscriptionId: true, tier: true, leagueName: true },
    });

    console.log(`Found ${subs.length} commissioner subscription(s):\n`);

    for (const sub of subs) {
        const stripeSub = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId!);
        const currentDesc = stripeSub.description ?? '(none)';
        const leagueName  = sub.leagueName ?? stripeSub.metadata?.leagueName ?? null;

        console.log(`  Sub: ${sub.stripeSubscriptionId}`);
        console.log(`  DB leagueName: ${sub.leagueName ?? 'null'}`);
        console.log(`  Stripe meta leagueName: ${stripeSub.metadata?.leagueName ?? 'null'}`);
        console.log(`  Current description: ${currentDesc}`);

        if (!leagueName) {
            console.log('  ⚠️  No leagueName found — skipping (update DB or Stripe manually)\n');
            continue;
        }

        const newDescription = `Commissioner Plan — ${leagueName}`;

        await stripe.subscriptions.update(sub.stripeSubscriptionId!, {
            description: newDescription,
            metadata: {
                ...stripeSub.metadata,
                leagueName,
                tier:     sub.tier,
                planType: 'commissioner',
            },
        });

        console.log(`  ✅ Updated description to: "${newDescription}"\n`);
    }

    console.log('Done.');
}

run()
    .catch(err => { console.error(err); process.exit(1); })
    .finally(() => prisma.$disconnect());
