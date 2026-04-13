/**
 * Clears all subscription rows and resets subscriptionTier to FREE for all users.
 * Use this when switching Stripe modes (test ↔ live) to remove stale subscription IDs.
 *
 * Run with: npx tsx scripts/reset-test-subscriptions.ts
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function run() {
    const deleted = await prisma.subscription.deleteMany({});
    console.log(`Deleted ${deleted.count} subscription row(s).`);

    const reset = await prisma.user.updateMany({
        data: { subscriptionTier: 'FREE', stripeCustomerId: null },
    });
    console.log(`Reset ${reset.count} user(s) to FREE tier and cleared Stripe customer IDs.`);

    await prisma.$disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
