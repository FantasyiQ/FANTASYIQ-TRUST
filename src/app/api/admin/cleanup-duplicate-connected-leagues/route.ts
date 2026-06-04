import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// One-time cleanup: remove duplicate ConnectedLeague rows.
// Admin-only. Safe to call multiple times (idempotent).
export async function POST(): Promise<Response> {
    const session = await auth();
    if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await prisma.user.findUnique({
        where:  { id: session.user.id },
        select: { isAdmin: true },
    });
    if (!user?.isAdmin) return Response.json({ error: 'Forbidden' }, { status: 403 });

    // Bucket 1: same userId + leagueExtId (non-null) — keep oldest
    const extIdGroups = await prisma.$queryRaw<{ userId: string; leagueExtId: string; ids: string[] }[]>`
        SELECT "userId", "leagueExtId", array_agg(id ORDER BY "createdAt" ASC) AS ids
        FROM "ConnectedLeague"
        WHERE "leagueExtId" IS NOT NULL
        GROUP BY "userId", "leagueExtId"
        HAVING count(*) > 1
    `;

    let extIdDeleted = 0;
    for (const row of extIdGroups) {
        const [, ...toDelete] = row.ids;
        const { count } = await prisma.connectedLeague.deleteMany({ where: { id: { in: toDelete } } });
        extIdDeleted += count;
    }

    // Bucket 2: same userId + leagueName where leagueExtId IS NULL — keep oldest
    const nameGroups = await prisma.$queryRaw<{ userId: string; leagueName: string; ids: string[] }[]>`
        SELECT "userId", "leagueName", array_agg(id ORDER BY "createdAt" ASC) AS ids
        FROM "ConnectedLeague"
        WHERE "leagueExtId" IS NULL
        GROUP BY "userId", "leagueName"
        HAVING count(*) > 1
    `;

    let nameDeleted = 0;
    for (const row of nameGroups) {
        const [, ...toDelete] = row.ids;
        const { count } = await prisma.connectedLeague.deleteMany({ where: { id: { in: toDelete } } });
        nameDeleted += count;
    }

    return Response.json({
        extIdDuplicatesRemoved: extIdDeleted,
        nameDuplicatesRemoved:  nameDeleted,
        total: extIdDeleted + nameDeleted,
    });
}
