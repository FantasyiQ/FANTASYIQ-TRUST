/**
 * One-time backfill: populate DuesMember.sleeperUserId for existing rows.
 *
 * For each dues tracker with members missing a sleeperUserId:
 *   1. Find the commissioner's matching Sleeper League record
 *   2. Fetch Sleeper league users (cached per leagueId)
 *   3. Match DuesMember.displayName → Sleeper display_name (case-insensitive)
 *   4. Update sleeperUserId in place
 *
 * Run with:
 *   node --env-file=.env scripts/backfill-dues-sleeper-user-ids.mjs
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg }    from '@prisma/adapter-pg';
import pg              from 'pg';

// Neon: DATABASE_URL is the pgBouncer/pooler URL; pg.Pool needs the direct URL
const poolerUrl        = process.env.DATABASE_URL ?? '';
const connectionString = poolerUrl.replace(/-pooler\./, '.');
const pool   = new pg.Pool({ connectionString, max: 1 });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function fetchSleeperUsers(leagueId) {
    const res = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/users`);
    if (!res.ok) return null;
    return res.json();
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
    const duesList = await prisma.leagueDues.findMany({
        where:  { members: { some: { sleeperUserId: null } } },
        select: {
            id:             true,
            leagueName:     true,
            season:         true,
            commissionerId: true,
            members: {
                where:  { sleeperUserId: null },
                select: { id: true, displayName: true },
            },
        },
    });

    const totalMembers = duesList.reduce((s, d) => s + d.members.length, 0);
    console.log(`Found ${duesList.length} dues tracker(s) with ${totalMembers} unmatched member(s)\n`);

    const sleeperCache = new Map(); // leagueId → Map<display_name.lower, user_id>
    let updated = 0;
    let skipped = 0;

    for (const dues of duesList) {
        console.log(`→ "${dues.leagueName}" (${dues.season}) — ${dues.members.length} member(s) to match`);

        // Find the commissioner's Sleeper League record for this dues tracker
        const league = await prisma.league.findFirst({
            where: {
                userId:     dues.commissionerId,
                leagueName: { equals: dues.leagueName, mode: 'insensitive' },
                season:     dues.season,
                platform:   'sleeper',
            },
            select: { leagueId: true },
        });

        if (!league) {
            console.log(`  ✗ No Sleeper league record found — skipping ${dues.members.length} member(s)\n`);
            skipped += dues.members.length;
            continue;
        }

        // Fetch Sleeper users, caching per leagueId to avoid duplicate API calls
        if (!sleeperCache.has(league.leagueId)) {
            await sleep(250); // polite to Sleeper rate limits
            const users = await fetchSleeperUsers(league.leagueId);
            if (!users || !Array.isArray(users)) {
                console.log(`  ✗ Sleeper API error for league ${league.leagueId} — skipping\n`);
                skipped += dues.members.length;
                continue;
            }
            // Build case-insensitive display_name → user_id map
            const map = new Map(
                users
                    .filter(u => u.display_name && u.user_id)
                    .map(u => [u.display_name.toLowerCase(), String(u.user_id)])
            );
            sleeperCache.set(league.leagueId, map);
            console.log(`  Fetched ${users.length} Sleeper user(s) for league ${league.leagueId}`);
        }

        const userMap = sleeperCache.get(league.leagueId);

        for (const member of dues.members) {
            const sleeperUserId = userMap.get(member.displayName.toLowerCase());
            if (!sleeperUserId) {
                console.log(`  ? No Sleeper match for "${member.displayName}"`);
                skipped++;
                continue;
            }
            await prisma.duesMember.update({
                where: { id: member.id },
                data:  { sleeperUserId },
            });
            console.log(`  ✓ "${member.displayName}" → ${sleeperUserId}`);
            updated++;
        }
        console.log('');
    }

    console.log(`Done. Updated: ${updated}  Skipped: ${skipped}`);
}

main()
    .catch(err => { console.error(err); process.exit(1); })
    .finally(() => prisma.$disconnect());
