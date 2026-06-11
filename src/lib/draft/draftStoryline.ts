// FantasyiQ Trust — Draft Storyline Engine v3.4
// Generates a 2-3 sentence cohesive narrative that summarizes the draft.

import type { PickAlignment } from './reportCard';
import type { DraftIdentityLabel } from './draftIdentityLabel';
import type { ClassStrength } from './reportCard';
import type { DTVSnapshot } from './teamDTVDelta';

interface DraftStorylineInput {
    picks:            PickAlignment[];
    identityLabel:    DraftIdentityLabel;
    trajectoryWindow: string;
    avgScore:         number;
    dtvSnapshot:      DTVSnapshot | null;
    classStrength:    ClassStrength;
}

function formatDynastyValue(value: number): string {
    if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
    return String(value);
}

export function computeDraftStoryline(input: DraftStorylineInput): string {
    const { picks, identityLabel, trajectoryWindow, avgScore, dtvSnapshot, classStrength } = input;

    if (picks.length === 0) return '';

    // Best pick by total score
    const bestPick = [...picks].sort((a, b) => b.totalScore - a.totalScore)[0];
    const bestName = bestPick?.playerName ?? 'your top pick';

    // Opener by identity archetype
    const OPENER: Record<DraftIdentityLabel, string> = {
        'Upside Hunter':          'You came into this draft hunting ceiling, and you found it.',
        'Value Sniper':           'You found value at every turn in this draft.',
        'Positional Architect':   'You drafted with a clear plan — filling gaps and building depth systematically.',
        'Future-Focused Builder': 'You played the long game in this draft, prioritizing upside over short-term production.',
        'Balanced Builder':       'You built a balanced haul — a little of everything this roster needed.',
    };

    // Middle sentence: class feel + execution quality + DTV addendum
    const classFeel = classStrength === 'strong'
        ? 'a deep class'
        : classStrength === 'weak'
            ? 'a thin class'
            : 'this class';

    const quality = avgScore >= 19
        ? 'nearly every pick aligned with your build'
        : avgScore >= 15
            ? 'most picks hit their mark'
            : 'you still found pieces that open new options going forward';

    const dtvLine = dtvSnapshot && dtvSnapshot.delta > 0
        ? ` The draft added ${formatDynastyValue(dtvSnapshot.delta)} in dynasty trade value.`
        : '';

    const middle = `You worked ${classFeel} efficiently — ${quality}.${dtvLine}`;

    // Closing by trajectory window
    const CLOSE: Record<string, string> = {
        WIN_NOW:   `${bestName} and your new additions are ready to help you contend now — the window is open.`,
        ASCENDING: `${bestName} headlines a class that should push your trajectory forward over the next year or two.`,
        PLATEAU:   `${bestName} gives a stable roster a genuine boost — one more piece that shifts the balance.`,
        REBUILD:   `${bestName} is the kind of player that makes rebuilds worth it — upside over production, future over now.`,
    };

    const close = CLOSE[trajectoryWindow] ?? CLOSE['PLATEAU'];

    return `${OPENER[identityLabel]} ${middle} ${close}`;
}
