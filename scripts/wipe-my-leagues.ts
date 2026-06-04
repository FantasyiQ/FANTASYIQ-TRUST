/**
 * Wipes all synced leagues for a single user (by email).
 * Deletes: League rows + ConnectedLeague rows.
 * Does NOT touch: subscriptions, user account, billing.
 *
 * Run with:
 *   WIPE_EMAIL=you@example.com npx tsx scripts/wipe-my-leagues.ts
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

    console.log(`Found user: ${user.name} (${user.email}) — id: ${user.id}`);

    const leagues = await prisma.league.count({ where: { userId: user.id } });
    const connected = await prisma.connectedLeague.count({ where: { userId: user.id } });
    console.log(`  ${leagues} League rows, ${connected} ConnectedLeague rows`);

    if (leagues === 0 && connected === 0) {
        console.log('Nothing to delete.');
        return;
    }

    const [del1, del2] = await Promise.all([
        prisma.league.deleteMany({ where: { userId: user.id } }),
        prisma.connectedLeague.deleteMany({ where: { userId: user.id } }),
    ]);

    console.log(`Deleted ${del1.count} League rows, ${del2.count} ConnectedLeague rows.`);
    console.log('Done. Player plan is untouched.');
}

run()
    .catch(err => { console.error(err); process.exit(1); })
    .finally(() => prisma.$disconnect());
