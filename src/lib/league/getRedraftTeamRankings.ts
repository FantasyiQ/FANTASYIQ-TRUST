// Team-level rankings for Redraft leagues — built on the same real Value
// Over Replacement (VOR) engine that powers the Redraft player board
// (computeRealRedraftBoard), not the Dynasty Trade Value pipeline used by
// getLeagueRankings.ts for Dynasty leagues. VOR is season-projection and
// opportunity driven (real per-game production/projection, format-specific
// ADP, positional replacement level) with no age curve or long-term
// dynasty variable in it — see realRedraftBoard.ts's header for the full
// model. Kept as a separate module rather than folded into
// getLeagueRankings.ts so the two valuation models never leak into each
// other's code path.
//
// Power Rankings (win/points-for/schedule strength) is computed here too,
// independently of getLeagueRankings.ts, so the redraft rankings page never
// has to pay for that function's own tier/Stripe re-check just to get its
// leagueType-agnostic power-score math.

import { prisma } from '@/lib/prisma';
import { getLeagueRosters, getLeagueUsers, getPlayers } from '@/lib/sleeper';
import { normalizePlayerName as normalizeName } from '@/lib/playerName';
import { computeRealRedraftBoard } from '@/lib/rankings/realRedraftBoard';
import type { TeamRankingRow, PowerRankingRow } from './getLeagueRankings';

interface EspnRosterPlayer {
    name:     string;
    position: string;
}
interface EspnStandingsTeam {
    teamId:    number;
    name:      string;
    ownerName: string | null;
    wins:      number;
    losses:    number;
    ties:      number;
    fpts:      number;
    players?:  EspnRosterPlayer[];
}

export interface RedraftLeagueRankings {
    teamRankings:  TeamRankingRow[];
    powerRankings: PowerRankingRow[];
}

function rosterTier(rank: number, total: number): 'Elite' | 'Contender' | 'Competitive' | 'Rebuilding' {
    const pct = total > 1 ? (rank - 1) / total : 0;
    if (pct <= 0.20) return 'Elite';
    if (pct <= 0.50) return 'Contender';
    if (pct <= 0.80) return 'Competitive';
    return 'Rebuilding';
}

function computePowerScore(
    wins: number, losses: number, pf: number, pa: number,
    maxPf: number, maxPa: number,
): number {
    if (wins === 0 && losses === 0 && pf === 0) return 50;
    const pfNorm = maxPf > 0 ? pf / maxPf : 0;
    const winPct = (wins + losses) > 0 ? wins / (wins + losses) : 0;
    if (maxPa === 0) {
        return Math.round(pfNorm * 62.5 + winPct * 37.5);
    }
    const sosNorm = pa / maxPa;
    return Math.round(pfNorm * 50 + winPct * 30 + sosNorm * 20);
}

export async function getRedraftTeamRankings(leagueDbId: string): Promise<RedraftLeagueRankings> {
    const league = await prisma.league.findUnique({
        where:  { id: leagueDbId },
        select: {
            leagueId: true, platform: true, standings: true,
            scoringSettings: true, rosterPositions: true, totalRosters: true,
        },
    });
    if (!league) return { teamRankings: [], powerRankings: [] };

    const scoringSettings = (league.scoringSettings as Record<string, number> | null) ?? {};
    const rosterPositions = (league.rosterPositions as string[] | null) ?? [];
    const totalTeams      = league.totalRosters;

    // High limit — this is a server-side team-value aggregation over every
    // rostered player, not the paginated top-N board the UI shows.
    const board = await computeRealRedraftBoard(scoringSettings, rosterPositions, totalTeams, 1000);
    const vorByPlayerId = new Map(board.map(p => [p.playerId, p]));
    const vorByName     = new Map(board.map(p => [normalizeName(p.name), p]));

    // ESPN team defenses are named "<Nickname> D/ST" (e.g. "Cowboys D/ST"),
    // but Sleeper — the source computeRealRedraftBoard draws from — names
    // them by full team name ("Dallas Cowboys"), so a direct name match
    // always misses for DEF. Every real NFL nickname is one word, so
    // matching on the board's own last word is a safe, general fallback —
    // not specific to any one league's data.
    const vorByDefNickname = new Map(
        board.filter(p => p.position === 'DEF').map(p => [normalizeName(p.name.split(' ').pop() ?? p.name), p]),
    );
    function resolveDefByNickname(name: string) {
        const nickname = name.replace(/\s*(D\/ST|DST|DEF)\s*$/i, '').trim();
        return vorByDefNickname.get(normalizeName(nickname));
    }

    // Only count positions this league actually rosters — matches
    // getLeagueRankings.ts's RANKED_POSITIONS convention for Dynasty.
    const RANKED = new Set<string>(['QB', 'RB', 'WR', 'TE']);
    if (rosterPositions.includes('K'))   RANKED.add('K');
    if (rosterPositions.includes('DEF')) RANKED.add('DEF');

    function buildTeamRow(
        rosterId: number, teamName: string, ownerName: string,
        rosterPlayers: { playerId?: string; name: string; position: string }[],
    ): TeamRankingRow {
        const scored = rosterPlayers
            .filter(p => RANKED.has(p.position))
            .map(p => {
                const hit = (p.playerId && vorByPlayerId.get(p.playerId))
                    || vorByName.get(normalizeName(p.name))
                    || (p.position === 'DEF' ? resolveDefByNickname(p.name) : undefined);
                return { name: p.name, position: p.position, vor: hit ? Math.round(hit.vor * 10) / 10 : 0 };
            })
            .sort((a, b) => b.vor - a.vor);

        const totalDtv  = Math.round(scored.reduce((s, p) => s + Math.max(0, p.vor), 0) * 10) / 10;
        const topPlayer = scored[0]
            ? { name: scored[0].name, position: scored[0].position, finalDtv: scored[0].vor }
            : null;

        return {
            rank: 0, rosterId, teamName, ownerName,
            totalDtv, playerCount: scored.length, topPlayer,
            tier: 'Rebuilding', // overwritten after sort below
        };
    }

    let teamRows:  TeamRankingRow[];
    let powerRows: PowerRankingRow[];

    if (league.platform === 'espn') {
        const teams = (league.standings as EspnStandingsTeam[] | null) ?? [];
        teamRows = teams.map(t => buildTeamRow(
            t.teamId,
            t.name || `Team ${t.teamId}`,
            t.ownerName ?? t.name ?? `Team ${t.teamId}`,
            (t.players ?? []).map(p => ({ name: p.name, position: p.position })),
        ));

        const maxPf = Math.max(...teams.map(t => t.fpts), 1);
        powerRows = teams
            .map(t => ({
                rank: 0, rosterId: t.teamId, teamName: t.name || `Team ${t.teamId}`,
                ownerName: t.ownerName ?? t.name ?? `Team ${t.teamId}`,
                wins: t.wins, losses: t.losses, pf: t.fpts, pa: 0,
                powerScore: computePowerScore(t.wins, t.losses, t.fpts, 0, maxPf, 0),
            }))
            .sort((a, b) => b.powerScore - a.powerScore || b.pf - a.pf)
            .map((r, i) => ({ ...r, rank: i + 1 }));
    } else {
        const [rosters, members] = await Promise.all([
            getLeagueRosters(league.leagueId),
            getLeagueUsers(league.leagueId),
        ]);
        const ownerDisplayName = new Map(members.map(m => [m.user_id, m.display_name ?? `Team ${m.user_id}`]));
        const allPlayerIds = [...new Set(rosters.flatMap(r => r.players ?? []))];
        const playerById   = await getPlayers(allPlayerIds);

        teamRows = rosters.map(r => {
            const ownerName = r.owner_id ? (ownerDisplayName.get(r.owner_id) ?? `Team ${r.roster_id}`) : `Team ${r.roster_id}`;
            const rosterPlayers = (r.players ?? [])
                .map(pid => {
                    const slim = playerById[pid];
                    return slim ? { playerId: pid, name: slim.full_name, position: slim.position } : null;
                })
                .filter((p): p is { playerId: string; name: string; position: string } => p !== null);
            return buildTeamRow(r.roster_id, `Team ${r.roster_id}`, ownerName, rosterPlayers);
        });

        const rosterRows = rosters.map(r => ({
            rosterId:  r.roster_id,
            ownerName: r.owner_id ? (ownerDisplayName.get(r.owner_id) ?? `Team ${r.roster_id}`) : `Team ${r.roster_id}`,
            wins:   r.settings?.wins   ?? 0,
            losses: r.settings?.losses ?? 0,
            pf: (r.settings?.fpts         ?? 0) + (r.settings?.fpts_decimal         ?? 0) / 100,
            pa: (r.settings?.fpts_against ?? 0) + (r.settings?.fpts_against_decimal ?? 0) / 100,
        }));
        const maxPf = Math.max(...rosterRows.map(r => r.pf), 1);
        const maxPa = Math.max(...rosterRows.map(r => r.pa), 0);

        powerRows = rosterRows
            .map(r => ({
                rank: 0, rosterId: r.rosterId, teamName: `Team ${r.rosterId}`, ownerName: r.ownerName,
                wins: r.wins, losses: r.losses, pf: r.pf, pa: r.pa,
                powerScore: computePowerScore(r.wins, r.losses, r.pf, r.pa, maxPf, maxPa),
            }))
            .sort((a, b) => b.powerScore - a.powerScore || b.pf - a.pf)
            .map((r, i) => ({ ...r, rank: i + 1 }));
    }

    teamRows.sort((a, b) => b.totalDtv - a.totalDtv);
    teamRows.forEach((r, i) => {
        r.rank = i + 1;
        r.tier = rosterTier(i + 1, teamRows.length);
    });

    return { teamRankings: teamRows, powerRankings: powerRows };
}
