// Shared, collision-safe resolver for matching an external player name
// (FantasyCalc, FiQ rookie rankings, ESPN roster data, etc.) to its Sleeper
// player record. Some real players share an exact fullName (e.g. two
// "Justin Jefferson"s — WR/MIN and LB/CLE), and external sources often carry
// a generational suffix ("Kenneth Walker III", "Brian Thomas Jr.") that
// Sleeper's own fullName omits — a bare, unnormalized string match misses
// those entirely. Resolve by exact name+position first, then normalized
// name+position, only falling back to a bare (then normalized) name match
// when that name is unambiguous across the whole player pool — so a miss
// never silently attaches one player's team/age/id onto a different player's
// row, and a suffix difference never causes a miss it shouldn't.
//
// Callers must fetch candidates broadly (e.g. all active players of the
// relevant positions) rather than pre-filtering the Sleeper query by an
// exact-string `fullName: { in: [...] }` list built from the external
// source's own names — that pre-filter silently drops the real match before
// this resolver ever sees it, for the exact same suffix-mismatch reason.
//
// Team defenses need one more fallback: ESPN names them "<Nickname> D/ST"
// (e.g. "Cowboys D/ST"), but Sleeper — the canonical source — names them by
// full team name ("Dallas Cowboys"). Every real NFL nickname is one word, so
// matching on the last word of Sleeper's own DEF names is a safe, general
// fallback — gated to position === 'DEF' only, so it can never attach a
// team-defense row to a non-DEF player.

import { normalizePlayerName } from '@/lib/playerName';

export function buildSleeperNameResolver<T extends { fullName: string; position: string }>(
    players: T[],
): (name: string, position: string) => T | undefined {
    const byNamePos     = new Map<string, T>();
    const byNormNamePos = new Map<string, T>();
    const byNameCount     = new Map<string, number>();
    const byName          = new Map<string, T>();
    const byNormNameCount = new Map<string, number>();
    const byNormName      = new Map<string, T>();
    const byDefNickname    = new Map<string, T>();

    for (const p of players) {
        const exact = p.fullName.toLowerCase();
        const normd = normalizePlayerName(p.fullName);
        byNamePos.set(`${exact}|${p.position}`, p);
        byNormNamePos.set(`${normd}|${p.position}`, p);
        byNameCount.set(exact, (byNameCount.get(exact) ?? 0) + 1);
        byName.set(exact, p);
        byNormNameCount.set(normd, (byNormNameCount.get(normd) ?? 0) + 1);
        byNormName.set(normd, p);
        if (p.position === 'DEF') {
            const nickname = normalizePlayerName(p.fullName.split(' ').pop() ?? p.fullName);
            byDefNickname.set(nickname, p);
        }
    }

    return (name: string, position: string): T | undefined => {
        const exact = name.toLowerCase();
        const normd = normalizePlayerName(name);
        const direct = byNamePos.get(`${exact}|${position}`)
            ?? byNormNamePos.get(`${normd}|${position}`)
            ?? (byNameCount.get(exact) === 1 ? byName.get(exact) : undefined)
            ?? (byNormNameCount.get(normd) === 1 ? byNormName.get(normd) : undefined);
        if (direct || position !== 'DEF') return direct;
        const nickname = normalizePlayerName(name.replace(/\s*(D\/ST|DST|DEF)\s*$/i, ''));
        return byDefNickname.get(nickname);
    };
}
