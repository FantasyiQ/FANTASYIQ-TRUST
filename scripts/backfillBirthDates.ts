/**
 * One-time backfill: copies birth_date from live Sleeper API into SleeperPlayer.birthDate.
 * Safe to re-run — only updates rows where birthDate is NULL and Sleeper has the value.
 *
 * Run: npx tsx scripts/backfillBirthDates.ts
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
    console.log('Fetching Sleeper player data for birth_date backfill...');
    const res = await fetch('https://api.sleeper.app/v1/players/nfl', {
        headers: { 'User-Agent': 'FantasyIQ-DOB-Backfill/1.0' },
    });
    if (!res.ok) throw new Error(`Sleeper API: ${res.status}`);
    const raw = await res.json() as Record<string, { birth_date?: string | null }>;

    const dobById = new Map<string, string>();
    for (const [id, p] of Object.entries(raw)) {
        if (p.birth_date) dobById.set(id, p.birth_date);
    }
    console.log(`  ${dobById.size} players with birth_date in Sleeper API`);

    const toFill = await prisma.sleeperPlayer.findMany({
        where:  { birthDate: null },
        select: { playerId: true },
    });
    console.log(`  ${toFill.length} DB rows missing birthDate — backfilling...`);

    let updated = 0;
    const BATCH = 100;
    for (let i = 0; i < toFill.length; i += BATCH) {
        await Promise.all(
            toFill.slice(i, i + BATCH).map(p => {
                const dob = dobById.get(p.playerId);
                if (!dob) return Promise.resolve();
                updated++;
                return prisma.sleeperPlayer.update({
                    where: { playerId: p.playerId },
                    data:  { birthDate: dob },
                });
            })
        );
    }

    console.log(`✅ Backfilled ${updated} players`);
    await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
