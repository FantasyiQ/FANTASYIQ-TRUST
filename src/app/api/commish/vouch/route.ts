// POST /api/commish/vouch
// Lets a commissioner leave a trust vouch for a member of their league.
// One vouch per (commissioner, member, league, season) — upserts on repeat calls.
// Also writes a PrsEvent with a sourceRef so it can be replaced if the type changes.

import { auth }                        from '@/lib/auth';
import { prisma }                      from '@/lib/prisma';
import { calculateAndSavePrs }         from '@/lib/prs';
import { checkMutationLimit, getClientIp } from '@/lib/ratelimit';
import type { PrsEventType }           from '@prisma/client';

const VOUCH_TYPES = ['endorsement', 'approval', 'flag'] as const;
type VouchType = typeof VOUCH_TYPES[number];

const EVENT_FOR_VOUCH: Record<VouchType, PrsEventType> = {
    endorsement: 'commish_endorsement',
    approval:    'commish_approval',
    flag:        'commish_flag',
};

export async function POST(request: Request): Promise<Response> {
    const rl = await checkMutationLimit(getClientIp(request));
    if (rl.limited) return rl.response!;

    const session = await auth();
    if (!session?.user?.id) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: unknown;
    try { body = await request.json(); } catch {
        return Response.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    if (!body || typeof body !== 'object') {
        return Response.json({ error: 'Invalid body' }, { status: 400 });
    }

    const { toUserId, leagueDbId, season, vouchType, note } = body as Record<string, unknown>;

    if (typeof toUserId !== 'string' || !toUserId)
        return Response.json({ error: 'toUserId required' }, { status: 400 });
    if (typeof leagueDbId !== 'string' || !leagueDbId)
        return Response.json({ error: 'leagueDbId required' }, { status: 400 });
    if (typeof season !== 'string' || !season)
        return Response.json({ error: 'season required' }, { status: 400 });
    if (!VOUCH_TYPES.includes(vouchType as VouchType))
        return Response.json({ error: 'Invalid vouchType' }, { status: 400 });
    if (note !== undefined && typeof note !== 'string')
        return Response.json({ error: 'note must be a string' }, { status: 400 });

    if (toUserId === session.user.id)
        return Response.json({ error: 'Cannot vouch for yourself' }, { status: 400 });

    // Verify the caller is commissioner of the given league.
    const league = await prisma.league.findUnique({
        where:  { id: leagueDbId },
        select: { userId: true, season: true, sleeperUserId: true },
    });
    if (!league) return Response.json({ error: 'League not found' }, { status: 404 });
    if (league.userId !== session.user.id)
        return Response.json({ error: 'Forbidden — not the league commissioner' }, { status: 403 });

    // Verify target user exists.
    const target = await prisma.user.findUnique({
        where:  { id: toUserId },
        select: { id: true },
    });
    if (!target) return Response.json({ error: 'Target user not found' }, { status: 404 });

    const sourceRef = `commish_vouch:${session.user.id}:${toUserId}:${season}`;

    // Upsert the vouch record and replace the PrsEvent atomically.
    await prisma.$transaction(async tx => {
        await tx.commissionerVouch.upsert({
            where:  { fromUserId_toUserId_season: {
                fromUserId: session.user.id,
                toUserId,
                season,
            }},
            create: { fromUserId: session.user.id, toUserId, leagueDbId, season, vouchType: vouchType as string, note: note as string | undefined },
            update: { vouchType: vouchType as string, note: (note as string | undefined) ?? null, leagueDbId },
        });

        // Replace any prior PrsEvent for this vouch so the type change is reflected.
        await tx.prsEvent.deleteMany({ where: { sourceRef } });
        await tx.prsEvent.create({
            data: {
                userId:    toUserId,
                eventType: EVENT_FOR_VOUCH[vouchType as VouchType],
                sourceRef,
            },
        });
    });

    // Recalculate PRS immediately — commish events are high-priority.
    await calculateAndSavePrs(toUserId);

    return Response.json({ ok: true });
}
