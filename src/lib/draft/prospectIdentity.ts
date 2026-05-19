// FantasyiQ Trust — Prospect Identity Engine v3.4
// Translates raw fiqScore + positional context into human-readable scouting identity.
// Athletic/scheme metrics don't exist in the current data model, so
// opportunityScore (year-1 role signal) and age serve as proxies.

interface ProspectIdentityInput {
    fiqScore:         number;
    position:         string;   // already normalized (QB/RB/WR/TE)
    opportunityScore: number | null;
    age:              number | null;
    tier:             number;
}

// Base identity from fiqScore
function baseIdentity(fiqScore: number): string {
    if (fiqScore >= 85) return 'an elite, rare-trait prospect with immediate impact potential';
    if (fiqScore >= 78) return 'a high-upside playmaker with breakout traits';
    if (fiqScore >= 72) return 'a strong developmental prospect with a clear path to relevance';
    if (fiqScore >= 65) return 'a solid contributor who fits your roster construction';
    return 'a long-term bet with situational upside';
}

// Position-specific flavor suffix
function positionFlavor(
    position: string,
    fiqScore: number,
    opportunityScore: number | null,
    age: number | null,
): string {
    const opp = opportunityScore ?? 0;

    if (position === 'TE') {
        if (fiqScore >= 80) return ' — a modern move-TE with mismatch ability across the field';
        if (fiqScore >= 72) return ' — a developmental TE with the tools to carve out a role';
        return '';
    }

    if (position === 'RB') {
        if (opp >= 70) return ' — a high-opportunity back with three-down workload upside';
        if (opp >= 50) return ' — a versatile back with a clear path to touches';
        if (fiqScore >= 78) return ' — a powerful runner with pass-game upside';
        return '';
    }

    if (position === 'WR') {
        if (opp >= 70 && fiqScore >= 78) return ' — a separator who wins at all three levels of routes';
        if (opp >= 70) return ' — a target-rich receiver in an opportunity-dense role';
        if (fiqScore >= 80) return ' — a dynamic route runner with elite separation ability';
        if (age != null && age <= 21) return ' — a raw but explosive talent with years of upside';
        return '';
    }

    if (position === 'QB') {
        if (fiqScore >= 85) return ' — a field-stretcher who elevates those around him';
        if (fiqScore >= 78) return ' — a dual-threat playmaker who creates value in multiple formats';
        return '';
    }

    return '';
}

export function computeProspectIdentity(input: ProspectIdentityInput): string {
    const { fiqScore, position, opportunityScore, age } = input;
    const base   = baseIdentity(fiqScore);
    const flavor = positionFlavor(position, fiqScore, opportunityScore, age);
    return base + flavor;
}
