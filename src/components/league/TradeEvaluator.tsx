import LeagueTradeEvaluator from '@/app/dashboard/league/[id]/LeagueTradeEvaluator';
import type { TradeEvaluatorContent } from '@/lib/trade/getTradeEvaluatorContent';

export default function TradeEvaluator({ content }: { content: TradeEvaluatorContent }) {
    return (
        <LeagueTradeEvaluator
            leagueName={content.leagueName}
            scoringType={content.scoringType}
            totalRosters={content.totalRosters}
            draftRounds={content.draftRounds}
            draftOrderProjected={content.draftOrderProjected}
            leagueType={content.leagueType}
            rosterPositions={content.rosterPositions}
            scoringSettings={content.scoringSettings}
            myTeamData={content.myTeamData}
            otherTeamsData={content.otherTeamsData}
        />
    );
}
