// FantasyiQ Trust — Roster Context Commentary Engine v3.4
// Generates per-pick context notes that reference your actual roster state.

export interface PreDraftPositionalState {
    names:    string[];   // player names already at this position (best first by fiqScore)
    values:   number[];   // rawValues sorted desc
    fiqScores: number[];  // fiqScores sorted desc
}

interface RosterContextInput {
    position:           string;
    playerName:         string;
    playerFiqScore:     number;
    fills:              boolean;       // true if this position is below target depth
    deficit:            number;        // how many players short of target
    preState:           PreDraftPositionalState | null;
    competitiveWindow:  string;        // WIN_NOW / ASCENDING / PLATEAU / REBUILD
    tier:               number;
    age:                number | null;
}

export function computeRosterContextNote(input: RosterContextInput): string {
    const {
        position, playerName, playerFiqScore,
        fills, deficit, preState,
        competitiveWindow, tier, age,
    } = input;

    const topExistingName  = preState?.names[0] ?? null;
    const topExistingFiq   = preState?.fiqScores[0] ?? null;
    const positionCount    = preState?.names.length ?? 0;

    // 1. Fills a clear weakness
    if (fills && deficit >= 2) {
        return `You addressed a clear roster gap — your ${position} room needed reinforcement and this pick starts to fix it.`;
    }

    // 2. Heir apparent — player drafted behind an existing starter at same position
    if (
        fills && deficit === 1 &&
        topExistingName &&
        topExistingFiq != null &&
        topExistingFiq >= playerFiqScore + 5
    ) {
        return `This sets up a seamless transition behind ${topExistingName}, giving you long-term positional stability at ${position}.`;
    }

    // 3. Stacks well — position already stocked, but the pick adds real upside
    if (!fills && positionCount >= 2 && tier <= 2) {
        return `Even with depth at ${position}, the upside here is worth the investment — this stacks well with your existing room.`;
    }

    // 4. Redundant depth with lower tier — luxury pick
    if (!fills && positionCount >= 2 && tier >= 3) {
        return `A value-driven swing that adds flexibility to your ${position} depth chart and strengthens future trade capital.`;
    }

    // 5. WIN-NOW mode + high opportunity = immediate fit
    if (competitiveWindow === 'WIN_NOW' && (input.fills || tier <= 2)) {
        return `Fits your contention window — a ${position} who can contribute to your lineup immediately.`;
    }

    // 6. REBUILD/ASCENDING + young player = future-focused
    if ((competitiveWindow === 'REBUILD' || competitiveWindow === 'ASCENDING') && age != null && age <= 22) {
        return `A forward-looking addition — age ${age} gives this ${position} years to develop into a core piece of your build.`;
    }

    // 7. Position was empty before
    if (positionCount === 0) {
        return `This fills a position your roster was carrying almost nothing at — a necessary foundation pick.`;
    }

    // 8. Fallback
    return `A directional pick that reinforces your ${position} room and adds long-term roster flexibility.`;
}
