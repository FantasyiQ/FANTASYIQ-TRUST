// GET /api/projection-accuracy?season=2026
// Public read of the season-to-date FIQ projection accuracy summary —
// aggregate stats only, no per-user/per-league data, safe unauthenticated.

import { getNflState } from '@/lib/sleeper';
import { getSeasonProjectionAccuracy } from '@/lib/rankings/projectionAccuracy';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
    const url    = new URL(request.url);
    const season = url.searchParams.get('season') ?? (await getNflState()).season;

    const summary = await getSeasonProjectionAccuracy(season);
    if (!summary) return Response.json({ available: false });

    return Response.json({ available: true, ...summary });
}
