// One-shot admin route: backfill DuesMember.sleeperUserId for existing rows.
// Hit GET /api/admin/backfill-dues-sleeper-ids once while logged in as admin.
// Safe to re-run — only processes rows where sleeperUserId IS NULL.
export const maxDuration = 300;

import { auth }   from '@/lib/auth';
import { prisma } from '@/lib/prisma';

async function requireAdmin() {
    const session = await auth();
    if (!session?.user?.id) return null;
    const user = await prisma.user.findUnique({
        where:  { id: session.user.id },
        select: { isAdmin: true },
    });
    return user?.isAdmin ? session.user.id : null;
}

async function fetchSleeperUsers(leagueId: string): Promise<{ display_name: string; user_id: string }[] | null> {
    try {
        const res = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/users`);
        if (!res.ok) return null;
        return res.json() as Promise<{ display_name: string; user_id: string }[]>;
    } catch {
        return null;
    }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export async function GET(): Promise<Response> {
    if (!await requireAdmin()) {
        return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

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
    const log: string[] = [`Found ${duesList.length} dues tracker(s) with ${totalMembers} unmatched member(s)`];

    const sleeperCache = new Map<string, Map<string, string>>(); // leagueId → display_name.lower → user_id
    let updated = 0;
    let skipped = 0;

    for (const dues of duesList) {
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
            log.push(`✗ No Sleeper league for "${dues.leagueName}" (${dues.season}) — skipped ${dues.members.length}`);
            skipped += dues.members.length;
            continue;
        }

        if (!sleeperCache.has(league.leagueId)) {
            await sleep(250);
            const users = await fetchSleeperUsers(league.leagueId);
            if (!users) {
                log.push(`✗ Sleeper API error for league ${league.leagueId}`);
                skipped += dues.members.length;
                continue;
            }
            const map = new Map(
                users
                    .filter(u => u.display_name && u.user_id)
                    .map(u => [u.display_name.toLowerCase(), String(u.user_id)])
            );
            sleeperCache.set(league.leagueId, map);
            log.push(`Fetched ${users.length} Sleeper user(s) for league ${league.leagueId}`);
        }

        const userMap = sleeperCache.get(league.leagueId)!;

        for (const member of dues.members) {
            const sleeperUserId = userMap.get(member.displayName.toLowerCase());
            if (!sleeperUserId) {
                log.push(`? No Sleeper match for "${member.displayName}" in "${dues.leagueName}"`);
                skipped++;
                continue;
            }
            await prisma.duesMember.update({
                where: { id: member.id },
                data:  { sleeperUserId },
            });
            log.push(`✓ "${member.displayName}" → ${sleeperUserId}`);
            updated++;
        }
    }

    log.push(`Done. Updated: ${updated}  Skipped: ${skipped}`);
    return Response.json({ ok: true, updated, skipped, log });
}
