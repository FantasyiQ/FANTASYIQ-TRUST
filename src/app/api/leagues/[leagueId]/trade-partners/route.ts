import { type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { calculateAge } from '@/lib/calculateAge';
import { getLeagueRosters, getLeagueUsers, getPlayers } from '@/lib/sleeper';
import { calcDtv, DEFAULT_LEAGUE_SETTINGS } from '@/lib/trade-engine';
import type { Player, LeagueSettings, LeagueType } from '@/lib/trade-engine';
import { computePlayerBaseValue } from '@/lib/player-universe';
import type { UniversePlayer } from '@/lib/player-universe';

// ── Types ──────────────────────────────────────────────────────────────────────

export type RosterTier = 'Elite' | 'Contender' | 'Competitive' | 'Rebuilding';

export interface TradePartnerAsset {
    playerId:     string;
    name:         string;
    position:     string;
    team:         string | null;
    finalDtv:     number;
    delta:        number | null;
    injuryStatus: string | null;
    isNew:        boolean;
    isTraded:     boolean;
}

export interface TradePartner {
    rosterId:               number;
    ownerId:                string | null;
    displayName:            string;
    tradeFitScore:          number;        // 0–100 normalised
    yourNeeds:              string[];      // positions where you are Weak
    theirNeeds:             string[];      // positions where they are Weak
    suggestedAssetsForYou:  TradePartnerAsset[];
    suggestedAssetsForThem: TradePartnerAsset[];
    notes:                  string[];
    tier:                   RosterTier;
    totalRosterValue:       number;
}

export interface TradePartnersResponse {
    meta: {
        generatedAt:   string;
        leagueId:      string;
        teamCount:     number;
        myRosterId:    number | null;
        myDisplayName: string | null;
    };
    partners: TradePartner[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const KTC_CAP        = 9999;
const SKILL_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE']);
const SCORED_POSITIONS: ReadonlyArray<string> = ['QB', 'RB', 'WR', 'TE'];

function normalise(raw: number): number {
    return Math.min(100, Math.max(1, Math.round((raw / KTC_CAP) * 100)));
}

function normalizeName(name: string): string {
    return name
        .toLowerCase()
        .replace(/\s+\b(jr\.?|sr\.?|ii|iii|iv|v)\s*$/i, '')
        .replace(/\./g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function buildLeagueSettings(
    rosterPositions: string[],
    scoringSettings: Record<string, number> | null,
): LeagueSettings {
    const ss = scoringSettings ?? {};
    let qbSlots = 0, rbSlots = 0, wrSlots = 0, teSlots = 0, flexSlots = 0, sfSlots = 0;
    for (const pos of rosterPositions) {
        if (pos === 'QB')                          qbSlots++;
        else if (pos === 'RB')                     rbSlots++;
        else if (pos === 'WR')                     wrSlots++;
        else if (pos === 'TE')                     teSlots++;
        else if (pos === 'FLEX' || pos === 'REC_FLEX') flexSlots++;
        else if (pos === 'SUPER_FLEX')             sfSlots++;
    }
    return {
        passTd:     ss.pass_td      ?? DEFAULT_LEAGUE_SETTINGS.passTd,
        bonusRecTe: ss.bonus_rec_te ?? DEFAULT_LEAGUE_SETTINGS.bonusRecTe,
        qbSlots:    qbSlots  || DEFAULT_LEAGUE_SETTINGS.qbSlots,
        rbSlots:    rbSlots  || DEFAULT_LEAGUE_SETTINGS.rbSlots,
        wrSlots:    wrSlots  || DEFAULT_LEAGUE_SETTINGS.wrSlots,
        teSlots:    teSlots  || DEFAULT_LEAGUE_SETTINGS.teSlots,
        flexSlots,
        sfSlots,
    };
}

function scoringTypeToPpr(scoringType: string | null): 0 | 0.5 | 1 {
    if (scoringType === 'ppr')      return 1;
    if (scoringType === 'half_ppr') return 0.5;
    return 0;
}

// Tiers are league-relative percentiles — identical logic to roster-values route.
// Built once from the full sorted value list, then used as a lookup per team.
// percentile 0.0 = top of league, 1.0 = bottom of league.
function buildTierClassifier(sortedValuesDesc: number[]): (value: number) => RosterTier {
    const n = sortedValuesDesc.length;
    return (value: number): RosterTier => {
        const rank = sortedValuesDesc.filter(v => v > value).length;
        const percentile = n > 1 ? rank / n : 0;
        if (percentile <= 0.20) return 'Elite';
        if (percentile <= 0.50) return 'Contender';
        if (percentile <= 0.80) return 'Competitive';
        return 'Rebuilding';
    };
}

type StrengthClass = 'Strong' | 'Neutral' | 'Weak';
function strengthClass(ratio: number): StrengthClass {
    if (ratio > 1.15) return 'Strong';
    if (ratio < 0.85) return 'Weak';
    return 'Neutral';
}

// ── Route ──────────────────────────────────────────────────────────────────────

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ leagueId: string }> },
): Promise<Response> {
    const { leagueId } = await params;
    const ownerId = request.nextUrl.searchParams.get('ownerId');

    if (!ownerId) {
        return Response.json({ error: 'ownerId query param required' }, { status: 400 });
    }

    // 1. Load league config from DB
    const league = await prisma.league.findFirst({
        where: { leagueId },
        select: {
            leagueName:      true,
            leagueType:      true,
            scoringType:     true,
            scoringSettings: true,
            rosterPositions: true,
            totalRosters:    true,
        },
    });
    if (!league) {
        return Response.json({ error: 'League not found' }, { status: 404 });
    }

    const leagueType      = (league.leagueType as LeagueType) ?? 'Redraft';
    const scoringSettings = (league.scoringSettings as Record<string, number> | null) ?? {};
    const leagueSettings  = buildLeagueSettings(league.rosterPositions, scoringSettings);
    const ppr             = scoringTypeToPpr(league.scoringType);
    const superflex       = leagueSettings.sfSlots > 0;
    const leagueSize      = league.totalRosters;

    // 2. Fetch Sleeper rosters + members + KTC universe + snapshot in parallel
    const [rosters, members, ktcRows, sleeperAllPlayers, latestSnapshot] = await Promise.all([
        getLeagueRosters(leagueId),
        getLeagueUsers(leagueId),
        prisma.fantasyCalcValue.findMany({
            where: { OR: [{ dynastyValue: { gt: 0 } }, { redraftValue: { gt: 0 } }] },
            select: {
                playerName: true, nameLower: true, position: true,
                dynastyValue: true, dynastyValueSf: true,
                redraftValue: true, redraftValueSf: true,
            },
        }),
        prisma.sleeperPlayer.findMany({
            where:  { active: true },
            select: { playerId: true, fullName: true, team: true, injuryStatus: true, birthDate: true, age: true },
        }),
        prisma.fantasyCalcSnapshot.findFirst({
            orderBy: { takenAt: 'desc' },
            select:  { takenAt: true },
        }),
    ]);

    // 3. Resolve all player IDs across all rosters
    const allPlayerIds = [...new Set(rosters.flatMap(r => r.players ?? []))];
    const playerById   = await getPlayers(allPlayerIds);

    // 4. Build Sleeper lookup by name (exact + normalized)
    type SleeperInfo = { team: string; injuryStatus: string | null; birthDate: string | null; age: number | null };
    const sleeperExact      = new Map<string, SleeperInfo>();
    const sleeperNormalized = new Map<string, SleeperInfo>();
    for (const p of sleeperAllPlayers) {
        const val   = { team: p.team, injuryStatus: p.injuryStatus, birthDate: p.birthDate, age: p.age };
        const exact = p.fullName.toLowerCase();
        const normd = normalizeName(p.fullName);
        if (!sleeperExact.has(exact))      sleeperExact.set(exact, val);
        if (!sleeperNormalized.has(normd)) sleeperNormalized.set(normd, val);
    }

    // 5. Build DTV map keyed by lowercase name
    const dtvByName = new Map<string, { universe: UniversePlayer; finalDtv: number }>();
    for (const r of ktcRows) {
        const exact   = r.nameLower;
        const normd   = normalizeName(r.nameLower);
        const sl      = sleeperExact.get(exact) ?? sleeperNormalized.get(normd) ?? null;
        const rawTeam = sl?.team ?? null;
        const team    = (rawTeam && rawTeam !== 'FA') ? rawTeam : null;
        const age     = calculateAge(sl?.birthDate) ?? sl?.age ?? 0;

        const u: UniversePlayer = {
            name:            r.playerName,
            position:        r.position,
            team,
            age,
            dynasty:         normalise(r.dynastyValue),
            dynastySf:       normalise(r.dynastyValueSf),
            redraft:         normalise(r.redraftValue),
            redraftSf:       normalise(r.redraftValueSf),
            trend:           null,
            injuryStatus:    sl?.injuryStatus ?? null,
            birthDate:       null,
            playerImageUrl:  null,
        };
        const baseValue = SKILL_POSITIONS.has(r.position)
            ? computePlayerBaseValue(u, r.position, {
                leagueType, superflex, ppr, leagueSize,
                passTd: leagueSettings.passTd, bonusRecTe: leagueSettings.bonusRecTe,
              })
            : 0;

        const playerShell: Player = {
            rank: 0, name: r.playerName, position: r.position,
            team: team ?? 'FA', age, baseValue,
            injuryStatus: sl?.injuryStatus,
        };
        const dtv = SKILL_POSITIONS.has(r.position)
            ? calcDtv(playerShell, ppr, leagueType, undefined, leagueSettings)
            : { finalDtv: 0 };

        dtvByName.set(exact, { universe: u, finalDtv: dtv.finalDtv });
        if (!dtvByName.has(normd)) dtvByName.set(normd, { universe: u, finalDtv: dtv.finalDtv });
    }

    // 6. Build delta lookup from latest snapshot batch
    type DeltaInfo = { dynastyDelta: number; prevTeam: string | null; isNew: boolean };
    const deltaByName = new Map<string, DeltaInfo>();
    if (latestSnapshot) {
        const batchStart = new Date(latestSnapshot.takenAt.getTime() - 60 * 1000);
        const snapRows = await prisma.fantasyCalcSnapshot.findMany({
            where: { takenAt: { gte: batchStart } },
            select: { nameLower: true, dynastyValue: true, team: true },
        });
        const snapMap = new Map(snapRows.map(s => [s.nameLower, s]));
        for (const [nameLower, { universe }] of dtvByName) {
            const snap = snapMap.get(nameLower);
            if (!snap) {
                deltaByName.set(nameLower, { dynastyDelta: 0, prevTeam: null, isNew: true });
            } else {
                deltaByName.set(nameLower, {
                    dynastyDelta: universe.dynasty - normalise(snap.dynastyValue),
                    prevTeam:     snap.team ?? null,
                    isNew:        false,
                });
            }
        }
    }

    // 7. Member display-name lookup
    const memberMap = new Map(members.map(m => [m.user_id, m]));

    // 8. Build each team's data (only skill-position players for matching)
    interface RosterAsset {
        playerId:     string;
        name:         string;
        position:     string;
        team:         string | null;
        finalDtv:     number;
        delta:        number | null;
        injuryStatus: string | null;
        isNew:        boolean;
        isTraded:     boolean;
    }
    interface TeamBucket {
        rosterId:         number;
        ownerId:          string | null;
        displayName:      string;
        players:          RosterAsset[];          // skill positions only, sorted DTV desc
        posValues:        Record<string, number>; // QB / RB / WR / TE sums
        totalRosterValue: number;
        avgDelta:         number | null;
    }

    const teamBuckets: TeamBucket[] = rosters.map(roster => {
        const member      = roster.owner_id ? memberMap.get(roster.owner_id) : undefined;
        const displayName = member?.metadata?.team_name || member?.display_name || `Team ${roster.roster_id}`;

        const players: RosterAsset[] = (roster.players ?? [])
            .map(pid => {
                const slim = playerById[pid];
                if (!slim || !SKILL_POSITIONS.has(slim.position)) return null;

                const nameLower = slim.full_name.toLowerCase();
                const normd     = normalizeName(slim.full_name);
                const entry     = dtvByName.get(nameLower) ?? dtvByName.get(normd) ?? null;
                const deltaInfo = deltaByName.get(nameLower) ?? deltaByName.get(normd) ?? null;
                const rawTeam   = slim.team && slim.team !== 'FA' ? slim.team : null;
                const isTraded  = !!(deltaInfo && deltaInfo.prevTeam !== null && deltaInfo.prevTeam !== rawTeam);

                return {
                    playerId:     pid,
                    name:         slim.full_name,
                    position:     slim.position,
                    team:         rawTeam,
                    finalDtv:     entry?.finalDtv ?? 0,
                    delta:        deltaInfo?.dynastyDelta ?? null,
                    injuryStatus: entry?.universe.injuryStatus ?? null,
                    isNew:        deltaInfo?.isNew ?? false,
                    isTraded,
                } satisfies RosterAsset;
            })
            .filter((p): p is RosterAsset => p !== null)
            .sort((a, b) => b.finalDtv - a.finalDtv);

        const posValues: Record<string, number> = { QB: 0, RB: 0, WR: 0, TE: 0 };
        for (const p of players) {
            if (p.position in posValues) posValues[p.position] += p.finalDtv;
        }
        for (const pos of SCORED_POSITIONS) {
            posValues[pos] = Math.round(posValues[pos] * 10) / 10;
        }

        const totalRosterValue = Math.round(players.reduce((s, p) => s + p.finalDtv, 0) * 10) / 10;
        const deltas    = players.map(p => p.delta).filter((d): d is number => d !== null);
        const avgDelta  = deltas.length > 0 ? deltas.reduce((a, b) => a + b, 0) / deltas.length : null;

        return { rosterId: roster.roster_id, ownerId: roster.owner_id, displayName, players, posValues, totalRosterValue, avgDelta };
    });

    // 9. League-average positional value
    const leagueAvg: Record<string, number> = { QB: 0, RB: 0, WR: 0, TE: 0 };
    for (const pos of SCORED_POSITIONS) {
        leagueAvg[pos] = teamBuckets.reduce((s, t) => s + t.posValues[pos], 0) / (teamBuckets.length || 1);
    }

    function strengthRatios(posValues: Record<string, number>): Record<string, number> {
        const out: Record<string, number> = {};
        for (const pos of SCORED_POSITIONS) {
            out[pos] = leagueAvg[pos] > 0 ? posValues[pos] / leagueAvg[pos] : 1;
        }
        return out;
    }

    // 9b. Build percentile-based tier map — same classifier as roster-values route
    //     so both tabs always show identical tiers.
    const sortedValues = teamBuckets
        .map(t => t.totalRosterValue)
        .sort((a, b) => b - a);
    const classifyTier = buildTierClassifier(sortedValues);
    const tierByRosterId = new Map<number, RosterTier>(
        teamBuckets.map(t => [t.rosterId, classifyTier(t.totalRosterValue)])
    );

    // 10. Identify the requesting user's team
    const myBucket = teamBuckets.find(t => t.ownerId === ownerId) ?? null;
    const myMember = myBucket?.ownerId ? memberMap.get(myBucket.ownerId) : undefined;
    const myDisplayName = myMember?.metadata?.team_name || myMember?.display_name || null;

    if (!myBucket) {
        const body: TradePartnersResponse = {
            meta: { generatedAt: new Date().toISOString(), leagueId, teamCount: teamBuckets.length, myRosterId: null, myDisplayName: null },
            partners: [],
        };
        return Response.json(body, { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } });
    }

    const myRatios    = strengthRatios(myBucket.posValues);
    const myNeeds     = SCORED_POSITIONS.filter(pos => strengthClass(myRatios[pos]) === 'Weak');
    const myStrengths = SCORED_POSITIONS.filter(pos => strengthClass(myRatios[pos]) === 'Strong');
    const myTier      = tierByRosterId.get(myBucket.rosterId) ?? 'Competitive';
    const myDeltas    = myBucket.players.map(p => p.delta).filter((d): d is number => d !== null);
    const myAvgDelta  = myDeltas.length > 0 ? myDeltas.reduce((a, b) => a + b, 0) / myDeltas.length : null;

    // 11. Score each other team
    const rawScored = teamBuckets
        .filter(t => t.rosterId !== myBucket.rosterId)
        .map(partner => {
            const theirRatios    = strengthRatios(partner.posValues);
            const theirNeeds     = SCORED_POSITIONS.filter(pos => strengthClass(theirRatios[pos]) === 'Weak');
            const theirStrengths = SCORED_POSITIONS.filter(pos => strengthClass(theirRatios[pos]) === 'Strong');
            const theirTier      = tierByRosterId.get(partner.rosterId) ?? 'Competitive';

            // Complementarity: reward large gaps that match across rosters
            let rawScore = 0;
            for (const pos of SCORED_POSITIONS) {
                const avg      = leagueAvg[pos] || 1;
                const myGap    = avg - myBucket.posValues[pos];   // positive = I am below avg (need)
                const theirGap = avg - partner.posValues[pos];    // positive = they are below avg (need)

                if (myGap > 0 && theirGap < 0) {
                    // I need pos, they have surplus
                    rawScore += (myGap * (-theirGap)) / (avg * avg) * 100;
                }
                if (theirGap > 0 && myGap < 0) {
                    // They need pos, I have surplus
                    rawScore += (theirGap * (-myGap)) / (avg * avg) * 100;
                }
            }

            // Delta bonus: their rising assets are more valuable to acquire
            const theirAvgDelta = partner.avgDelta;
            if (theirAvgDelta !== null && theirAvgDelta > 3)  rawScore += 8;
            if (myAvgDelta    !== null && myAvgDelta    < -3)  rawScore += 5;

            // Tier contrast bonus (Contender ↔ Rebuilder = natural swap)
            const isMeWinNow    = myTier    === 'Elite'      || myTier    === 'Contender';
            const isThemWinNow  = theirTier === 'Elite'      || theirTier === 'Contender';
            const isMeRebuilder = myTier    === 'Rebuilding' || myTier    === 'Competitive';
            const isThemRebuilder = theirTier === 'Rebuilding' || theirTier === 'Competitive';
            const tierContrast  = (isMeWinNow && isThemRebuilder) || (isMeRebuilder && isThemWinNow);
            if (tierContrast) rawScore += 5;

            // Suggested assets for you: their best players at your needed positions
            const suggestedAssetsForYou: TradePartnerAsset[] = myNeeds.length > 0
                ? partner.players.filter(p => (myNeeds as string[]).includes(p.position)).slice(0, 3)
                : partner.players.slice(0, 3);

            // Suggested assets for them: your best players at their needed positions
            const suggestedAssetsForThem: TradePartnerAsset[] = theirNeeds.length > 0
                ? myBucket.players.filter(p => (theirNeeds as string[]).includes(p.position)).slice(0, 3)
                : myBucket.players.slice(0, 3);

            // Human-readable notes
            const notes: string[] = [];
            for (const pos of myNeeds) {
                if ((theirStrengths as string[]).includes(pos)) {
                    notes.push(`They are strong at ${pos} (${Math.round(theirRatios[pos] * 100)}% of league avg) where you are weak (${Math.round(myRatios[pos] * 100)}%)`);
                }
            }
            for (const pos of myStrengths) {
                if ((theirNeeds as string[]).includes(pos)) {
                    notes.push(`You are strong at ${pos} (${Math.round(myRatios[pos] * 100)}% of league avg) where they are weak (${Math.round(theirRatios[pos] * 100)}%)`);
                }
            }
            if (theirAvgDelta !== null && theirAvgDelta > 3) {
                notes.push(`Their roster is trending up (+${theirAvgDelta.toFixed(1)} avg dynasty delta) — buy-high opportunity`);
            }
            if (myAvgDelta !== null && myAvgDelta < -3) {
                notes.push(`Your roster is trending down (${myAvgDelta.toFixed(1)} avg delta) — consider moving declining assets`);
            }
            if (tierContrast) {
                notes.push(`${myTier} vs ${theirTier} — natural win-now vs rebuild trade structure`);
            }
            if (notes.length === 0) {
                notes.push('Similar roster construction — look for depth vs. starter swaps');
            }

            return {
                partner,
                theirNeeds,
                rawScore,
                suggestedAssetsForYou,
                suggestedAssetsForThem,
                notes,
                theirTier,
            };
        });

    // 12. Normalise raw scores → 0–100
    const raws   = rawScored.map(p => p.rawScore);
    const minRaw = Math.min(...raws);
    const maxRaw = Math.max(...raws);
    const range  = maxRaw - minRaw;

    const partners: TradePartner[] = rawScored
        .map(({ partner, theirNeeds, rawScore, suggestedAssetsForYou, suggestedAssetsForThem, notes, theirTier }) => ({
            rosterId:               partner.rosterId,
            ownerId:                partner.ownerId,
            displayName:            partner.displayName,
            tradeFitScore:          range > 0 ? Math.round(((rawScore - minRaw) / range) * 100) : 50,
            yourNeeds:              myNeeds,
            theirNeeds,
            suggestedAssetsForYou,
            suggestedAssetsForThem,
            notes,
            tier:                   theirTier,
            totalRosterValue:       partner.totalRosterValue,
        }))
        .sort((a, b) => b.tradeFitScore - a.tradeFitScore);

    const body: TradePartnersResponse = {
        meta: {
            generatedAt:   new Date().toISOString(),
            leagueId,
            teamCount:     teamBuckets.length,
            myRosterId:    myBucket.rosterId,
            myDisplayName,
        },
        partners,
    };

    return Response.json(body, {
        headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    });
}
