import { prisma } from '@/lib/prisma';
import RookieRankingsEditor from './RookieRankingsEditor';

export const dynamic = 'force-dynamic';

export default async function RookieRankingsAdminPage() {
    const players = await prisma.rookieRankingsPlayer.findMany({
        where:   { season: '2026' },
        orderBy: [{ position: 'asc' }, { fiqScore: 'desc' }],
        select: {
            id:               true,
            playerName:       true,
            position:         true,
            school:           true,
            overallPick:      true,
            baseFiQScore:     true,
            opportunityScore: true,
            fiqScore:         true,
            fiqTier:          true,
        },
    });

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-white">Rookie Rankings</h1>
                <p className="text-gray-500 text-sm mt-1">
                    Edit Base FiQ scores. FiQ Score = Base × 0.75 + Opportunity × 0.25. Saves immediately.
                </p>
            </div>
            <RookieRankingsEditor players={players} />
        </div>
    );
}
