import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getLeagueUsers } from '@/lib/sleeper';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ leagueId: string }> },
): Promise<Response> {
    const { leagueId } = await params;
    const session = await auth();
    if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true, sleeperUserId: true },
    });
    if (!user) return Response.json({ error: 'User not found.' }, { status: 404 });

    // Verify the requesting user is the commissioner (is_owner) of this Sleeper league.
    if (!user.sleeperUserId) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
    }
    try {
        const members = await getLeagueUsers(leagueId);
        const commissioner = members.find(m => m.is_owner);
        if (!commissioner || String(commissioner.user_id).trim() !== String(user.sleeperUserId).trim()) {
            return Response.json({ error: 'Forbidden' }, { status: 403 });
        }
    } catch {
        return Response.json({ error: 'Could not verify commissioner status' }, { status: 502 });
    }

    const body = await request.json() as { leagueName?: string; season?: string };
    const { leagueName, season } = body;
    if (!leagueName || !season) {
        return Response.json({ error: 'leagueName and season required.' }, { status: 400 });
    }

    // Reuse existing invite for this league+season if one exists
    let invite = await prisma.leagueInvite.findFirst({
        where: { sleeperLeagueId: leagueId, season },
        select: { token: true },
    });

    if (!invite) {
        invite = await prisma.leagueInvite.create({
            data: {
                sleeperLeagueId: leagueId,
                leagueName,
                season,
                createdById: user.id,
            },
            select: { token: true },
        });
    }

    // Return the path only — client builds the full URL using window.location.origin
    // so it always resolves to the correct domain regardless of env var configuration.
    return Response.json({ path: `/invite/${invite.token}` });
}
