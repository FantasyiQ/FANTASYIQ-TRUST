// POST /api/prs/events
// Records a PRS behavioral event. Triggers immediate recalculation for high-priority event types.
// Callers: server-side game logic, commissioner actions, season lifecycle hooks.
// Auth: session user (records their own event) OR admin.
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { calculateAndSavePrs, IMMEDIATE_TRIGGER_EVENTS } from '@/lib/prs';
import { checkMutationLimit, getClientIp } from '@/lib/ratelimit';
import type { PrsEventType } from '@prisma/client';

// Low-trust events: user-generated activity that a player legitimately self-reports.
const USER_EVENT_TYPES = new Set<PrsEventType>([
    'lineup_set', 'lineup_missed', 'trade_response', 'trade_ignored', 'waiver_active',
]);

// High-trust events: must originate from admin tools, server-side crons, or commissioner
// actions — never from the user themselves.  Self-reporting these would inflate PRS scores.
const SYSTEM_EVENT_TYPES = new Set<PrsEventType>([
    'verified_season', 'season_abandoned', 'retention_stayed', 'retention_left',
    'retention_removed', 'commish_approval', 'commish_endorsement',
    'commish_flag', 'commish_ban', 'veto_abuse', 'collusion_flag',
    'tanking_flag', 'toxicity_report', 'rule_violation',
]);

const VALID_EVENT_TYPES = new Set<PrsEventType>([...USER_EVENT_TYPES, ...SYSTEM_EVENT_TYPES]);

export async function POST(request: Request): Promise<Response> {
    const rl = await checkMutationLimit(getClientIp(request));
    if (rl.limited) return rl.response!;

    const session = await auth();
    if (!session?.user?.id) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return Response.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    if (!body || typeof body !== 'object') {
        return Response.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const { user_id, event_type, event_value } = body as Record<string, unknown>;

    if (typeof user_id !== 'string' || !user_id) {
        return Response.json({ error: 'user_id is required' }, { status: 400 });
    }
    if (typeof event_type !== 'string' || !VALID_EVENT_TYPES.has(event_type as PrsEventType)) {
        return Response.json({ error: 'Invalid event_type' }, { status: 400 });
    }
    if (event_value !== undefined && typeof event_value !== 'number') {
        return Response.json({ error: 'event_value must be a number' }, { status: 400 });
    }

    const isSelf = session.user.id === user_id;

    // Non-admins writing for themselves are restricted to low-trust user events.
    // System events (commish actions, verified seasons, bans, etc.) require admin.
    let isAdmin = false;
    if (!isSelf || SYSTEM_EVENT_TYPES.has(event_type as PrsEventType)) {
        const caller = await prisma.user.findUnique({
            where:  { id: session.user.id },
            select: { isAdmin: true },
        });
        isAdmin = !!caller?.isAdmin;

        if (!isSelf && !isAdmin) {
            return Response.json({ error: 'Forbidden' }, { status: 403 });
        }
        if (isSelf && SYSTEM_EVENT_TYPES.has(event_type as PrsEventType) && !isAdmin) {
            return Response.json({ error: 'Forbidden' }, { status: 403 });
        }
    }

    const targetExists = await prisma.user.findUnique({
        where: { id: user_id },
        select: { id: true },
    });
    if (!targetExists) {
        return Response.json({ error: 'User not found' }, { status: 404 });
    }

    await prisma.prsEvent.create({
        data: {
            userId:     user_id,
            eventType:  event_type as PrsEventType,
            eventValue: event_value != null ? Math.round(event_value as number) : undefined,
        },
    });

    // Recalculate immediately for high-priority events.
    if (IMMEDIATE_TRIGGER_EVENTS.has(event_type as PrsEventType)) {
        await calculateAndSavePrs(user_id);
    }

    return Response.json({ ok: true });
}
