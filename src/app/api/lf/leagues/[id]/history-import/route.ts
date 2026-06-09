// POST /api/lf/leagues/[id]/history-import
// Commissioner submits one-time per-member history for their league.
// Creates PRS events, writes an audit log, locks the league against future imports,
// and notifies each affected member.
import { auth }   from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { calculateAndSavePrs } from '@/lib/prs';
import { notify } from '@/lib/notifications/service';
import { NotificationType } from '@/lib/notifications/types';
import { checkMutationLimit, getClientIp } from '@/lib/ratelimit';

// ── Types ─────────────────────────────────────────────────────────────────────

interface MemberEntry {
    userId:           string;
    completedSeasons: number;  // 0–20
    returned:         boolean; // did they return the following season?
    approved:         boolean; // does the commissioner vouch for them?
}

// ── Validation ────────────────────────────────────────────────────────────────

function validateEntry(raw: unknown): MemberEntry | null {
    if (!raw || typeof raw !== 'object') return null;
    const e = raw as Record<string, unknown>;
    if (typeof e.userId !== 'string' || !e.userId) return null;
    if (typeof e.completedSeasons !== 'number') return null;
    const seasons = Math.round(e.completedSeasons);
    if (seasons < 0 || seasons > 20) return null;
    return {
        userId:           e.userId,
        completedSeasons: seasons,
        returned:         e.returned === true,
        approved:         e.approved === true,
    };
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
    const rl = await checkMutationLimit(getClientIp(request));
    if (rl.limited) return rl.response!;

    const session = await auth();
    if (!session?.user?.id) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: leagueId } = await params;
    const commissionerUserId = session.user.id;

    // Verify commissioner owns this league.
    const league = await prisma.lFLeague.findUnique({
        where:  { id: leagueId },
        select: {
            id:            true,
            name:          true,
            commissioner:  { select: { ownerId: true, displayName: true } },
            historyImport: { select: { id: true, submittedAt: true, memberCount: true } },
        },
    });
    if (!league) return Response.json({ error: 'League not found' }, { status: 404 });
    if (league.commissioner.ownerId !== commissionerUserId) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // One-time lock — reject if already imported.
    if (league.historyImport) {
        return Response.json(
            {
                error:       'History already imported for this league.',
                importedAt:  league.historyImport.submittedAt,
                memberCount: league.historyImport.memberCount,
            },
            { status: 409 },
        );
    }

    // Parse body.
    let body: unknown;
    try { body = await request.json(); } catch {
        return Response.json({ error: 'Invalid JSON' }, { status: 400 });
    }
    const raw = (body as Record<string, unknown>)?.members;
    if (!Array.isArray(raw) || raw.length === 0) {
        return Response.json({ error: 'members array is required and must not be empty' }, { status: 400 });
    }

    // Validate every entry before touching the DB.
    const entries: MemberEntry[] = [];
    for (const item of raw) {
        const entry = validateEntry(item);
        if (!entry) {
            return Response.json({ error: 'Invalid member entry', item }, { status: 400 });
        }
        entries.push(entry);
    }

    // Deduplicate userIds — one entry per user.
    const seen = new Set<string>();
    const deduped = entries.filter(e => {
        if (seen.has(e.userId)) return false;
        seen.add(e.userId);
        return true;
    });

    // Verify all userIds belong to real users.
    const users = await prisma.user.findMany({
        where:  { id: { in: deduped.map(e => e.userId) } },
        select: { id: true, name: true },
    });
    const validUserIds = new Set(users.map(u => u.id));
    const invalid = deduped.filter(e => !validUserIds.has(e.userId));
    if (invalid.length > 0) {
        return Response.json(
            { error: 'Unknown userIds', ids: invalid.map(e => e.userId) },
            { status: 400 },
        );
    }

    // ── Write everything in a transaction ──────────────────────────────────────
    // 1. Create PrsEvents for each member.
    // 2. Write the audit log (PrsHistoryImport + entries).
    // The transaction guarantees the lock record is only created once
    // (unique constraint on leagueId will reject a race condition).

    const now = new Date();

    await prisma.$transaction(async (tx) => {
        // Build all PRS event rows.
        const prsEventData: {
            userId:    string;
            eventType: 'verified_season' | 'retention_stayed' | 'commish_approval';
            eventDate: Date;
        }[] = [];

        for (const entry of deduped) {
            for (let i = 0; i < entry.completedSeasons; i++) {
                prsEventData.push({ userId: entry.userId, eventType: 'verified_season', eventDate: now });
            }
            if (entry.returned) {
                prsEventData.push({ userId: entry.userId, eventType: 'retention_stayed', eventDate: now });
            }
            if (entry.approved) {
                prsEventData.push({ userId: entry.userId, eventType: 'commish_approval', eventDate: now });
            }
        }

        if (prsEventData.length > 0) {
            await tx.prsEvent.createMany({ data: prsEventData });
        }

        // Write audit log (unique leagueId acts as the lock).
        await tx.prsHistoryImport.create({
            data: {
                leagueId,
                submittedById: commissionerUserId,
                memberCount:   deduped.length,
                entries: {
                    create: deduped.map(e => ({
                        userId:           e.userId,
                        completedSeasons: e.completedSeasons,
                        returned:         e.returned,
                        approved:         e.approved,
                    })),
                },
            },
        });
    });

    // ── Recalculate PRS + notify (outside transaction, best-effort) ───────────
    const commishName = league.commissioner.displayName;
    const leagueName  = league.name;

    await Promise.allSettled(
        deduped.map(async (entry) => {
            await calculateAndSavePrs(entry.userId);

            const parts: string[] = [];
            if (entry.completedSeasons > 0) {
                parts.push(`${entry.completedSeasons} verified season${entry.completedSeasons !== 1 ? 's' : ''}`);
            }
            if (entry.returned)  parts.push('league retention');
            if (entry.approved)  parts.push('commissioner approval');

            if (parts.length > 0) {
                void notify({
                    userId: entry.userId,
                    type:   NotificationType.LF_PRS_HISTORY_ADDED,
                    title:  'Your FiQ Trust Score was updated',
                    body:   `${commishName} added history from ${leagueName} to your profile: ${parts.join(', ')}.`,
                    data:   { leagueId, leagueName },
                });
            }
        }),
    );

    return Response.json({ ok: true, processed: deduped.length });
}

// GET — check import status for this league (commissioner only)
export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
    const session = await auth();
    if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: leagueId } = await params;

    const league = await prisma.lFLeague.findUnique({
        where:  { id: leagueId },
        select: {
            commissioner:  { select: { ownerId: true } },
            historyImport: {
                select: {
                    submittedAt:  true,
                    memberCount:  true,
                    entries: {
                        select: {
                            userId:           true,
                            completedSeasons: true,
                            returned:         true,
                            approved:         true,
                        },
                    },
                },
            },
        },
    });
    if (!league) return Response.json({ error: 'League not found' }, { status: 404 });
    if (league.commissioner.ownerId !== session.user.id) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    return Response.json(league.historyImport ?? null);
}
