import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { checkSearchLimit, getClientIp } from '@/lib/ratelimit';
import { computeRealProjectedPoints } from '@/lib/rankings/leagueScoringPoints';
import { calculateAge, isPlausiblyActivePlayer } from '@/lib/calculateAge';

// GET /api/players/search?q=mahomes&position=QB&season=2025&week=1&leagueId=...
// Returns players with injury status and (optionally) weekly projection.
// When leagueId is supplied, projPts is computed under that league's real
// scoring_settings (e.g. for the in-league DFS lineup builder); otherwise it
// falls back to a generic PPR total since there's no league to anchor to.
export async function GET(request: NextRequest): Promise<Response> {
    const rl = await checkSearchLimit(getClientIp(request));
    if (rl.limited) return rl.response;

    const { searchParams } = request.nextUrl;
    const q        = (searchParams.get('q')?.trim() ?? '').slice(0, 100); // cap length
    const position = searchParams.get('position') ?? '';
    const season   = searchParams.get('season') ?? '';
    const week     = searchParams.get('week') ? parseInt(searchParams.get('week')!) : null;
    const leagueId = searchParams.get('leagueId') ?? '';

    if (q.length < 2) return Response.json([]);

    const [players, league] = await Promise.all([
        prisma.sleeperPlayer.findMany({
            where: {
                OR: [{ active: true }, { team: { not: 'FA' } }],
                fullName: { contains: q, mode: 'insensitive' },
                ...(position ? { position } : {}),
            },
            select: {
                playerId:        true,
                fullName:        true,
                position:        true,
                team:            true,
                jerseyNumber:    true,
                height:          true,
                weight:          true,
                age:             true,
                birthDate:       true,
                depthChartOrder: true,
                yearsExp:        true,
                injuryStatus:    true,
                injuryBodyPart:  true,
                projections:    season && week != null ? {
                    where: { season, week },
                    select: { pointsPpr: true, pointsStd: true, pointsHalfPpr: true, rawProjection: true },
                    take: 1,
                } : false,
            },
            orderBy: { fullName: 'asc' },
            take: 40, // fetch extra headroom — stale-record filtering below may drop a few before the take:20 cap
        }),
        leagueId
            ? prisma.league.findUnique({ where: { id: leagueId }, select: { scoringSettings: true, scoringType: true } })
            : Promise.resolve(null),
    ]);

    const scoringSettings = league?.scoringSettings as Record<string, number> | null;
    // active:true / team!=FA alone miss long-retired players Sleeper's feed
    // still marks as rosterable (see feedback_stale_sleeper_player_data,
    // feedback_mock_draft_stale_rookie_pool) — a real search for a retired
    // player's name shouldn't surface them as a live, selectable option.
    const results = players
        .filter(p => !p.birthDate || isPlausiblyActivePlayer({
            team: p.team, age: calculateAge(p.birthDate) ?? p.age,
            depthChartOrder: p.depthChartOrder, yearsExp: p.yearsExp,
        }))
        .slice(0, 20)
        .map(p => {
            const proj = 'projections' in p ? p.projections[0] : undefined;
            const projPts = proj
                ? computeRealProjectedPoints(proj.rawProjection as Record<string, number> | null, scoringSettings, proj, league?.scoringType ?? null)
                : null;
            return { ...p, projPts };
        });

    return Response.json(results);
}
