/**
 * Backfill: re-assign leagues that are covered by a commissioner plan
 * but were stuck on the player plan (synced before commissioner purchase).
 *
 * For each commissioner subscription with a leagueName, find the user's League
 * rows that match by name and are NOT already assigned to a commissioner plan,
 * then reassign them.
 *
 * Run with:
 *   WIPE_EMAIL=you@example.com npx tsx scripts/fix-commissioner-league-assignments.ts
 *   (omit WIPE_EMAIL to run for ALL users)
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma  = new PrismaClient({ adapter });

async function run() {
    const email = process.env.WIPE_EMAIL ?? null;

    const commSubs = await prisma.subscription.findMany({
        where: {
            type:       'commissioner',
            status:     { in: ['active', 'trialing'] },
            leagueName: { not: null },
            ...(email ? { user: { email } } : {}),
        },
        select: { id: true, userId: true, leagueName: true, tier: true },
    });

    console.log(`Found ${commSubs.length} active commissioner subscription(s) with a league name.\n`);

    let totalFixed = 0;

    for (const sub of commSubs) {
        if (!sub.leagueName) continue;

        const affected = await prisma.league.updateMany({
            where: {
                userId:           sub.userId,
                leagueName:       { equals: sub.leagueName, mode: 'insensitive' },
                assignedPlanType: { not: 'commissioner' },
            },
            data: {
                assignedPlanId:   sub.id,
                assignedPlanType: 'commissioner',
            },
        });

        if (affected.count > 0) {
            console.log(`  ✅ ${sub.leagueName} (${sub.tier}) — reassigned ${affected.count} league row(s) to commissioner plan`);
            totalFixed += affected.count;
        } else {
            console.log(`  — ${sub.leagueName} (${sub.tier}) — already correct or no matching league row`);
        }
    }

    console.log(`\nDone. Fixed ${totalFixed} league assignment(s).`);
}

run()
    .catch(err => { console.error(err); process.exit(1); })
    .finally(() => prisma.$disconnect());
