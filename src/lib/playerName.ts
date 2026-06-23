/**
 * Canonical player-name normaliser for cross-source matching.
 *
 * Player values (KeepTradeCut / FantasyCalc), Sleeper rosters, and the internal
 * intelligence maps all spell names slightly differently. Collapse them to one
 * key so valuations attach correctly. Lowercases and strips:
 *   - apostrophes (straight + curly):  "Tre' Harris"        → "tre harris"
 *   - generational suffixes (Jr–V):    "Marvin Harrison Jr" → "marvin harrison"
 *   - periods:                         "D.J. Moore"         → "dj moore"
 *
 * IMPORTANT: use this everywhere a player is joined by name. Do not re-implement
 * a local copy — drift here silently breaks player valuations.
 */
export function normalizePlayerName(name: string): string {
    return name
        .toLowerCase()
        .replace(/['‘’]/g, '')                      // strip apostrophes (incl. curly)
        .replace(/\s+\b(jr\.?|sr\.?|ii|iii|iv|v)\s*$/i, '')   // strip generational suffix
        .replace(/\./g, '')                                    // strip periods
        .replace(/\s+/g, ' ')
        .trim();
}
