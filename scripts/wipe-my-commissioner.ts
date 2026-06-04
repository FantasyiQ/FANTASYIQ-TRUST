/**
 * Wipes all commissioner subscriptions + commissioner plan assignments for a single user.
 * Does NOT touch: player plan, user account, billing history.
 *
 * Run with:
 *   WIPE_EMAIL=you@example.com npx tsx scripts/wipe-my-commissioner.ts
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma  = new PrismaClient({ adapter });

async function run() {
    const email = process.env.WIPE_EMAIL;
    if (!email) { console.error('ERROR: WIPE_EMAIL env var required.'); process.exit(1); }

    const user = await prisma.user.findUnique({
        where:  { email },
        select: { id: true, name: true, email: true },
    });
    if (!user) { console.error(`No user found with email: ${email}`); process.exit(1); }
    console.log(`User: ${user.name} (${user.email}) — id: ${user.id}`);

    // Show current state
    const commSubs = await prisma.subscription.findMany({
        where:  { userId: user.id, type: 'commissioner' },
        select: { id: true, tier: true, status: true, leagueName: true },
    });
    const allSubs = await prisma.subscription.findMany({
        where:  { userId: user.id },
        select: { id: true, type: true, tier: true, status: true },
    });
    const commLeagues = await prisma.league.findMany({
        where:  { userId: user.id, assignedPlanType: 'commissioner' },
        select: { id: true, leagueName: true },
    });

    console.log(`\nAll subscriptions (${allSubs.length}):`);
    for (const s of allSubs) console.log(`  ${s.type} | ${s.tier} | ${s.status}`);

    console.log(`\nCommissioner subscriptions to delete (${commSubs.length}):`);
    for (const s of commSubs) console.log(`  ${s.id} | ${s.tier} | ${s.status} | ${s.leagueName}`);

    console.log(`\nLeagues with commissioner plan assignment (${commLeagues.length}):`);
    for (const l of commLeagues) console.log(`  ${l.id} | ${l.leagueName}`);

    if (commSubs.length === 0 && commLeagues.length === 0) {
        console.log('\nNothing to delete.');
        return;
    }

    // 1. Clear commissioner plan assignments on leagues
    const clearedLeagues = await prisma.league.updateMany({
        where: { userId: user.id, assignedPlanType: 'commissioner' },
        data:  { assignedPlanId: null, assignedPlanType: null },
    });

    // 2. Delete commissioner subscriptions
    const deletedSubs = await prisma.subscription.deleteMany({
        where: { userId: user.id, type: 'commissioner' },
    });

    console.log(`\nCleared ${clearedLeagues.count} league commissioner assignments.`);
    console.log(`Deleted ${deletedSubs.count} commissioner subscription(s).`);
    console.log('Done. Player plan is untouched.');
}

run()
    .catch(err => { console.error(err); process.exit(1); })
    .finally(() => prisma.$disconnect());
