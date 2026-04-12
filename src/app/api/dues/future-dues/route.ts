import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

async function getCommissioner(email: string) {
    return prisma.user.findUnique({ where: { email }, select: { id: true } });
}

async function assertCommissionerOwns(duesId: string, userId: string) {
    const dues = await prisma.leagueDues.findUnique({
        where: { id: duesId },
        select: { commissionerId: true, leagueName: true, buyInAmount: true },
    });
    if (!dues || dues.commissionerId !== userId) return null;
    return dues;
}

// POST — add a future dues obligation
export async function POST(request: NextRequest): Promise<Response> {
    const session = await auth();
    if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await getCommissioner(session.user.email);
    if (!user) return Response.json({ error: 'User not found' }, { status: 404 });

    const body = await request.json() as {
        duesId?: string; memberId?: string; season?: string; amount?: number; notes?: string;
    };
    const { duesId, memberId, season, amount, notes } = body;

    if (!duesId || !memberId || !season || amount == null) {
        return Response.json({ error: 'duesId, memberId, season, and amount are required' }, { status: 400 });
    }

    const dues = await assertCommissionerOwns(duesId, user.id);
    if (!dues) return Response.json({ error: 'Forbidden' }, { status: 403 });

    // Confirm member belongs to this dues tracker
    const member = await prisma.duesMember.findUnique({
        where: { id: memberId },
        select: { leagueDuesId: true },
    });
    if (!member || member.leagueDuesId !== duesId) {
        return Response.json({ error: 'Member not found' }, { status: 404 });
    }

    try {
        const obligation = await prisma.futureDuesObligation.create({
            data: { leagueDuesId: duesId, memberId, season, amount, notes: notes?.trim() || null },
            include: { member: { select: { displayName: true, teamName: true } } },
        });
        return Response.json(obligation, { status: 201 });
    } catch {
        return Response.json({ error: 'This member already has a future dues obligation for that season' }, { status: 409 });
    }
}

// DELETE — remove a pending obligation
export async function DELETE(request: NextRequest): Promise<Response> {
    const session = await auth();
    if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await getCommissioner(session.user.email);
    if (!user) return Response.json({ error: 'User not found' }, { status: 404 });

    const id = request.nextUrl.searchParams.get('id');
    if (!id) return Response.json({ error: 'id is required' }, { status: 400 });

    const obligation = await prisma.futureDuesObligation.findUnique({
        where: { id },
        select: { leagueDues: { select: { commissionerId: true } }, status: true },
    });
    if (!obligation || obligation.leagueDues.commissionerId !== user.id) {
        return Response.json({ error: 'Not found' }, { status: 404 });
    }

    await prisma.futureDuesObligation.delete({ where: { id } });
    return Response.json({ success: true });
}

// PATCH — mark as paid manually
export async function PATCH(request: NextRequest): Promise<Response> {
    const session = await auth();
    if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await getCommissioner(session.user.email);
    if (!user) return Response.json({ error: 'User not found' }, { status: 404 });

    const id = request.nextUrl.searchParams.get('id');
    if (!id) return Response.json({ error: 'id is required' }, { status: 400 });

    const obligation = await prisma.futureDuesObligation.findUnique({
        where: { id },
        select: { leagueDues: { select: { commissionerId: true } }, status: true },
    });
    if (!obligation || obligation.leagueDues.commissionerId !== user.id) {
        return Response.json({ error: 'Not found' }, { status: 404 });
    }

    const updated = await prisma.futureDuesObligation.update({
        where: { id },
        data: { status: 'paid', paidAt: new Date(), paymentMethod: 'manual' },
        include: { member: { select: { displayName: true, teamName: true } } },
    });
    return Response.json(updated);
}
