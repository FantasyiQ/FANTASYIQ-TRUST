import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

function appUrl(): string {
    return process.env.NEXTAUTH_URL ?? process.env.AUTH_URL ?? 'http://localhost:3000';
}

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

    return Response.json({ url: `${appUrl()}/invite/${invite.token}` });
}
