import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/dues/payout/claim-status?token=xxx
// Returns the current status of a payout item by claim token.
// No auth required — the token is a 32-byte random secret and is itself the bearer credential.
export async function GET(request: NextRequest): Promise<Response> {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
        return Response.json({ error: 'token required' }, { status: 400 });
    }

    const item = await prisma.payoutProposalItem.findUnique({
        where:  { winnerClaimToken: token },
        select: {
            status:     true,
            amount:     true,
            payoutSpot: { select: { label: true } },
        },
    });

    if (!item) {
        return Response.json({ error: 'not found' }, { status: 404 });
    }

    return Response.json({
        status: item.status,
        amount: item.amount,
        label:  item.payoutSpot.label,
    });
}
