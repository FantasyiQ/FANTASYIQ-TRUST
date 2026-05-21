import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getLeagueUsers, getLeagueRosters } from '@/lib/sleeper';
import { checkMutationLimit, getClientIp } from '@/lib/ratelimit';

export async function POST(
    _req: NextRequest,
    { params }: { params: Promise<{ duesId: string }> },
): Promise<Response> {
    const rl = await checkMutationLimit(getClientIp(_req));
    if (rl.limited) return rl.response!;


    const { duesId } = await params;
    const session = await auth();
    if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true },
    });
    if (!user) return Response.json({ error: 'User not found.' }, { status: 404 });

    const dues = await prisma.leagueDues.findUnique({
        where: { id: duesId },
        select: {
            commissionerId: true,
            leagueName: true,
            season: true,
            members: { select: { displayName: true } },
        },
    });
    if (!dues) return Response.json({ error: 'Not found.' }, { status: 404 });
    if (dues.commissionerId !== user.id) return Response.json({ error: 'Forbidden.' }, { status: 403 });

    // Find the synced League record that matches this dues record
    const league = await prisma.league.findFirst({
        where: {
            userId: user.id,
            leagueName: { equals: dues.leagueName, mode: 'insensitive' },
            season: dues.season,
        },
        select: { leagueId: true, platform: true, standings: true },
    });

    if (!league) {
        return Response.json(
            { error: 'No synced league found matching this dues record. Make sure the league name and season match exactly.' },
            { status: 404 },
        );
    }

    let teams: { displayName: string; teamName: string | null }[] = [];

    if (league.platform === 'espn') {
        // ESPN: build team list from stored standings JSON
        type EspnTeam = { teamId: number; name: string; abbrev?: string };
        const espnTeams = (league.standings as EspnTeam[] | null) ?? [];
        if (espnTeams.length === 0) {
            return Response.json(
                { error: 'ESPN standings not yet synced. Please re-sync your ESPN league first.' },
                { status: 404 },
            );
        }
        teams = espnTeams.map(t => ({ displayName: t.name, teamName: t.abbrev ?? null }));
    } else {
        // Sleeper: fetch live roster + member data
        const [members, rosters] = await Promise.all([
            getLeagueUsers(league.leagueId),
            getLeagueRosters(league.leagueId),
        ]);
        const memberMap = new Map(members.map(m => [m.user_id, m]));
        teams = rosters.map(roster => {
            const member      = roster.owner_id ? memberMap.get(roster.owner_id) : undefined;
            const displayName = member?.display_name ?? `Team ${roster.roster_id}`;
            const teamName    = member?.metadata?.team_name ?? displayName;
            return { displayName, teamName: teamName !== displayName ? teamName : null };
        });
    }

    // Skip teams already in the dues record (match by displayName, case-insensitive)
    const existingNames = new Set(dues.members.map(m => m.displayName.toLowerCase()));
    const toAdd = teams.filter(t => !existingNames.has(t.displayName.toLowerCase()));

    if (toAdd.length === 0) {
        return Response.json({ added: 0, message: 'All roster members are already added.' });
    }

    await prisma.duesMember.createMany({
        data: toAdd.map(t => ({
            leagueDuesId: duesId,
            displayName:  t.displayName,
            teamName:     t.teamName ?? null,
            duesStatus:   'unpaid',
        })),
    });

    return Response.json({ added: toAdd.length });
}
