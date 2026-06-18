import { type NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getEspnTransactions } from '@/lib/espn';

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ leagueId: string }> },
) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { leagueId } = await params;

    const [league, dbUser] = await Promise.all([
        prisma.league.findFirst({
            where:  { id: leagueId, userId: session.user.id },
            select: { leagueId: true, platform: true, season: true, standings: true },
        }),
        prisma.user.findUnique({
            where:  { id: session.user.id },
            select: { espnS2: true, swid: true },
        }),
    ]);

    if (!league) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (league.platform !== 'espn') return NextResponse.json({ transactions: [] });
    if (!dbUser?.espnS2 || !dbUser.swid) {
        return NextResponse.json({ transactions: [], note: 'Connect ESPN credentials to view transactions.' });
    }

    type EspnTeamRow = { teamId: number; name: string; ownerName: string | null };
    const espnTeams = (league.standings as EspnTeamRow[] | null) ?? [];
    const teamById  = new Map(espnTeams.map(t => [t.teamId, t]));

    const all = await getEspnTransactions(
        league.leagueId, Number(league.season ?? new Date().getFullYear()), dbUser.espnS2, dbUser.swid,
    );

    // Exclude trades (those go through trade-history endpoint)
    const transactions = all
        .filter(t => t.type !== 'TRADE_ACCEPT' && t.type !== 'TRADE_PROPOSE')
        .sort((a, b) => b.date - a.date)
        .slice(0, 100)
        .map(t => ({
            id:       t.id,
            type:     t.type,
            date:     t.date,
            teamName: teamById.get(t.teamId)?.name ?? `Team ${t.teamId}`,
            items:    t.items.map(i => ({
                playerName: i.playerName,
                type:       i.type,
            })),
        }));

    return NextResponse.json({ transactions });
}
