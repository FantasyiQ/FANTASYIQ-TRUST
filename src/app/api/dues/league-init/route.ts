import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest): Promise<Response> {
    const session = await auth();
    if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json() as {
        leagueName?: string;
        season?: string;
        buyInAmount?: number;
        teamCount?: number;
        payoutSpots?: { label: string; amount: number }[];
        members?: { displayName: string; teamName?: string }[];
    };

    const { leagueName, season, buyInAmount, teamCount, payoutSpots = [], members = [] } = body;

    if (!leagueName || !season || !buyInAmount || !teamCount) {
        return Response.json({ error: 'leagueName, season, buyInAmount, and teamCount are required.' }, { status: 400 });
    }
    if (buyInAmount <= 0 || teamCount < 2) {
        return Response.json({ error: 'Invalid buy-in or team count.' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true },
    });
    if (!user) return Response.json({ error: 'User not found.' }, { status: 404 });

    // Prevent duplicates
    const existing = await prisma.leagueDues.findFirst({
        where: {
            leagueName: { equals: leagueName, mode: 'insensitive' },
            season,
        },
        select: { id: true },
    });
    if (existing) return Response.json({ id: existing.id }, { status: 200 });

    const dues = await prisma.leagueDues.create({
        data: {
            commissionerId: user.id,
            leagueName,
            season,
            buyInAmount,
            teamCount,
            potTotal: 0,
            status: 'active',
            members: {
                create: members.map(m => ({
                    displayName: m.displayName,
                    teamName: m.teamName ?? null,
                    duesStatus: 'unpaid',
                })),
            },
            payoutSpots: {
                create: payoutSpots.map((s, i) => ({
                    label: s.label,
                    amount: s.amount,
                    sortOrder: i,
                })),
            },
        },
    });

    return Response.json({ id: dues.id }, { status: 201 });
}
