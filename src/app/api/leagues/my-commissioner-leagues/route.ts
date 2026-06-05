import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
    const session = await auth();
    if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const userId = session.user.id;

    const [leagues, allDues] = await Promise.all([
        prisma.league.findMany({
            where:   { userId },
            select:  { id: true, leagueName: true, season: true, platform: true, avatar: true },
            orderBy: [{ leagueName: 'asc' }, { season: 'desc' }],
        }),
        prisma.leagueDues.findMany({
            where:  { commissionerId: userId },
            select: { id: true, leagueName: true, season: true },
        }),
    ]);

    const duesMap = new Map<string, string>(); // `${leagueName.lower}:${season}` → duesId
    for (const d of allDues) {
        duesMap.set(`${d.leagueName.toLowerCase()}:${d.season}`, d.id);
    }

    // Deduplicate: one entry per league name (highest season, already sorted desc)
    const seen = new Map<string, typeof leagues[0]>();
    for (const l of leagues) {
        const key = l.leagueName.toLowerCase().trim();
        if (!seen.has(key)) seen.set(key, l);
    }

    const result = [...seen.values()].map(l => ({
        id:         l.id,
        leagueName: l.leagueName,
        season:     l.season,
        platform:   l.platform,
        avatar:     l.avatar ?? null,
        duesId:     duesMap.get(`${l.leagueName.toLowerCase()}:${l.season}`) ?? null,
    }));

    return Response.json(result);
}
