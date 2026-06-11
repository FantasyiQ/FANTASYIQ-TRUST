// FantasyiQ Trust — Team DTV Delta Engine v3.4
// Computes how much dynasty trade value this draft added to your roster.
// rawValue = dynasty trade value (integer, same units as FantasyCalc API).

import type { RichRosterPlayer } from './reportCard';

export interface DTVSnapshot {
    preDraftTotal:  number;   // dynasty value sum of pre-draft roster
    postDraftTotal: number;   // preDraftTotal + draft picks added
    delta:          number;   // what the draft added (sum of picks' rawValue)
    deltaLabel:     string;   // e.g. "+4,200 Dynasty Value Added"
}

function formatDynastyValue(value: number): string {
    if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
    return String(value);
}

export function computeDTVSnapshot(rosterRich: RichRosterPlayer[]): DTVSnapshot {
    const preDraftTotal = rosterRich
        .filter(p => !p.isDraftPick)
        .reduce((s, p) => s + (p.rawValue ?? 0), 0);

    const pickTotal = rosterRich
        .filter(p => p.isDraftPick)
        .reduce((s, p) => s + (p.rawValue ?? 0), 0);

    const postDraftTotal = preDraftTotal + pickTotal;
    const delta          = pickTotal;
    const sign           = delta >= 0 ? '+' : '';
    const deltaLabel     = `${sign}${formatDynastyValue(delta)} Dynasty Value Added`;

    return { preDraftTotal, postDraftTotal, delta, deltaLabel };
}

export function computePickDTVNote(rawValue: number, tier: number): string {
    if (!rawValue || rawValue === 0) return '';
    const formatted = formatDynastyValue(rawValue);
    if (tier === 1) return `High-value asset — ${formatted} dynasty value`;
    if (tier === 2) return `Strong dynasty piece — ${formatted} dynasty value`;
    if (tier === 3) return `Developmental asset — ${formatted} dynasty value`;
    return `${formatted} dynasty trade value`;
}
