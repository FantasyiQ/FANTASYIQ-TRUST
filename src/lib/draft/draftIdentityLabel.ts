// FantasyiQ Trust — Draft Identity Label Engine v3.4
// Translates pick patterns into one of five human-readable archetypes.

import type { PickAlignment } from './reportCard';

export type DraftIdentityLabel =
    | 'Upside Hunter'
    | 'Value Sniper'
    | 'Positional Architect'
    | 'Future-Focused Builder'
    | 'Balanced Builder';

export const DRAFT_IDENTITY_DESC: Record<DraftIdentityLabel, string> = {
    'Upside Hunter':          'You prioritized high-ceiling T1/T2 talent above all else.',
    'Value Sniper':           'You consistently found value above your pick slot.',
    'Positional Architect':   'You filled gaps and built depth with a clear plan.',
    'Future-Focused Builder': 'You invested in young talent with years of upside ahead.',
    'Balanced Builder':       'You blended value, need, and upside across the board.',
};

export function computeDraftIdentityLabel(picks: PickAlignment[]): DraftIdentityLabel {
    if (picks.length === 0) return 'Balanced Builder';

    const total        = picks.length;
    const elitePicks   = picks.filter(p => p.tier <= 2).length;
    const highNeed     = picks.filter(p => p.needFit >= 4).length;
    const youngPicks   = picks.filter(p => p.age != null && p.age <= 22).length;
    const highVopPicks = picks.filter(p => p.vop >= 5).length;
    const avgVop       = picks.reduce((s, p) => s + p.vop, 0) / total;

    // Score each archetype (0.0–1.0+; must clear a minimum threshold)
    const upsideScore    = elitePicks   / total;                           // threshold: ≥ 0.40
    const valueScore     = highVopPicks / total + (avgVop > 8 ? 0.15 : 0); // threshold: ≥ 0.35
    const architectScore = highNeed     / total;                           // threshold: ≥ 0.50
    const futureScore    = youngPicks   / total;                           // threshold: ≥ 0.40

    const candidates: [DraftIdentityLabel, number][] = [
        ['Upside Hunter',          upsideScore    >= 0.40 ? upsideScore    : -1],
        ['Value Sniper',           valueScore     >= 0.35 ? valueScore     : -1],
        ['Positional Architect',   architectScore >= 0.50 ? architectScore : -1],
        ['Future-Focused Builder', futureScore    >= 0.40 ? futureScore    : -1],
    ];

    const best = candidates.sort((a, b) => b[1] - a[1])[0];
    return best[1] > 0 ? best[0] : 'Balanced Builder';
}
