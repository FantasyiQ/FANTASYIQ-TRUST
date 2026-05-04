import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { detectEspnSeason } from '@/lib/espn';

/**
 * POST /api/espn/validate
 * Body: { leagueId, espnS2, swid }
 * Returns: { status: 'valid' | 'invalid' | 'expired', season?: number }
 */
export async function POST(request: NextRequest): Promise<Response> {
    const session = await auth();
    if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json() as { leagueId?: string; espnS2?: string; swid?: string };
    const leagueId = body.leagueId?.replace(/\s/g, '');
    const espnS2   = body.espnS2?.replace(/\s/g, '');
    const swid     = body.swid?.replace(/\s/g, '');

    if (!leagueId || !espnS2 || !swid) {
        return Response.json({ status: 'invalid', reason: 'Missing fields' });
    }

    try {
        const season = await detectEspnSeason(leagueId, espnS2, swid);
        return Response.json({ status: 'valid', season });
    } catch (err) {
        const message = err instanceof Error ? err.message : '';
        if (message.includes('credentials') || message.includes('expired')) {
            return Response.json({ status: 'expired' });
        }
        if (message.includes('league ID')) {
            return Response.json({ status: 'invalid', reason: 'League not found' });
        }
        return Response.json({ status: 'invalid', reason: message });
    }
}
