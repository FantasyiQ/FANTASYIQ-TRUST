import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ leagueId: string }> },
): Promise<Response> {
    const { leagueId } = await params;
    const session = await auth();
    if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true },
    });
    if (!user) return Response.json({ error: 'User not found.' }, { status: 404 });

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
