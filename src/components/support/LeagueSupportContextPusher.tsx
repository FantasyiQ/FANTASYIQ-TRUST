'use client';

import { useEffect } from 'react';
import { useSupportContextUpdater } from '@/lib/support/SupportContextStore';
import type { SupportContext } from '@/lib/support/SupportContextStore';

type Props = Pick<
    SupportContext,
    'platform' | 'seasonPhase' | 'draftCompleted' | 'hasDraftReport' |
    'playoffStartWeek' | 'championshipWeek'
>;

/**
 * Rendered inside LeagueHeader (server component).
 * Pushes league-specific context into the SupportContextStore so the FiQ
 * Assistant can give platform- and phase-aware answers.
 */
export default function LeagueSupportContextPusher(props: Props) {
    const update = useSupportContextUpdater();

    useEffect(() => {
        update(props);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.platform, props.seasonPhase, props.draftCompleted, props.playoffStartWeek, props.championshipWeek]);

    return null;
}
