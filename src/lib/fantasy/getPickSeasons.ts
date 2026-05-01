export interface GetPickSeasonsArgs {
    /** The season string from Sleeper (e.g. "2027") — the league's current season. */
    leagueSeason:   number;
    /** True if a draft exists for leagueSeason (even if not yet configured). */
    hasDraft:       boolean;
    /** True if that draft's status === 'complete'. */
    draftCompleted: boolean;
    /** True when a draft is actively in progress — forces future-only pick seasons. */
    isDrafting?:    boolean;
}

/**
 * Returns the three pick seasons to display in FantasyIQ Trust.
 *
 * When Sleeper advances a league (e.g. 2026 → 2027) it removes the prior year's
 * picks and renumbers everything forward. We do NOT want that until the new season's
 * draft is actually complete — so we hold picks on the previous season's window until
 * the draft finishes.
 *
 * NOTE: isDrafting is NOT used to skip the current season. Slow drafts stay in
 * 'drafting' status for days/weeks while picks are still being traded — hiding them
 * would be wrong. isDrafting only gates the draftCompleted check in callers.
 *
 * - Draft does not exist OR is not completed → [season-1, season, season+1, season+2]
 * - Draft completed                          → [season, season+1, season+2]
 *
 * NOTE: The "not done" case returns 4 seasons so that dynasty leagues can always
 * trade 2+ years of future picks (e.g. 2028 picks in a 2026-season league),
 * while still preserving the season-1 window for picks that predate Sleeper's
 * season advance.
 */
export function getPickSeasons({ leagueSeason, hasDraft, draftCompleted }: GetPickSeasonsArgs): string[] {
    if (hasDraft && draftCompleted) {
        return [String(leagueSeason), String(leagueSeason + 1), String(leagueSeason + 2)];
    }
    return [String(leagueSeason - 1), String(leagueSeason), String(leagueSeason + 1), String(leagueSeason + 2)];
}
