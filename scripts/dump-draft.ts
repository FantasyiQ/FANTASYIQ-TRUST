/**
 * Dumps raw Sleeper draft data for one league.
 * Run:  npx dotenv-cli -e .env.local -- npx tsx scripts/dump-draft.ts
 */

import { prisma }              from '../lib/prisma';
import { getLeague, getLeagueDrafts } from '../lib/sleeper';

async function main() {
    const leagues = await prisma.league.findMany({
        where:  { platform: 'sleeper' },
        select: { id: true, leagueId: true, leagueName: true, draftType: true },
        take: 5,
    });

    for (const league of leagues) {
        try {
            const [sl, drafts] = await Promise.all([
                getLeague(league.leagueId),
                getLeagueDrafts(league.leagueId),
            ]);

            const currentDraft = sl.draft_id
                ? (drafts as any[]).find(d => d.draft_id === sl.draft_id) ?? null
                : null;

            console.log(`\n=== ${league.leagueName} ===`);
            console.log('draft_id:', sl.draft_id);
            if (currentDraft) {
                console.log('draft.type:              ', currentDraft.type);
                console.log('draft.status:            ', currentDraft.status);
                console.log('draft.metadata:          ', JSON.stringify(currentDraft.metadata));
                console.log('draft.settings.type:     ', currentDraft.settings?.type);
                console.log('draft.settings.is_auction:', currentDraft.settings?.is_auction);
                console.log('draft.name:              ', currentDraft.name);
            } else {
                console.log('(no matching draft found)');
            }
        } catch (err) {
            console.error(`Error for ${league.leagueName}:`, err);
        }
    }

    await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
