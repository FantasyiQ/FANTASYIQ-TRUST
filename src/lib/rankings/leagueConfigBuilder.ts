// FantasyIQ Trust — League Config Builder
//
// Converts raw Sleeper league data into the LeagueScoring and LeagueLineup
// types consumed by buildLeagueDefensiveAndKickerRankings.
//
// Sleeper returns scoring_settings as a flat Record<string, number> with
// many possible keys. We extract and default all fields defensively.

import type { LeagueScoring, LeagueLineup } from './defensiveTypes';

// ── Sleeper scoring key aliases ────────────────────────────────────────────────
// Sleeper has used different keys across seasons/versions; we try both.
function pick(s: Record<string, number>, ...keys: string[]): number {
    for (const k of keys) {
        if (s[k] !== undefined) return s[k];
    }
    return 0;
}

// ── IDP ────────────────────────────────────────────────────────────────────────

function buildIdpScoring(s: Record<string, number>): LeagueScoring['idp'] {
    return {
        // Sleeper uses idp_ prefix for individual defensive player scoring keys
        soloTackle:      pick(s, 'idp_tkl_solo',  'solo_tackle',   'tackle_solo',   'tkl'),
        assist:          pick(s, 'idp_tkl_ast',   'ast_tackle',    'tackle_ast',    'tkl_ast'),
        sack:            pick(s, 'idp_sack',       'sack',          'sacks'),
        tfl:             pick(s, 'idp_tkl_loss',  'tkl_loss',      'tfl',           'tackle_for_loss'),
        interception:    pick(s, 'idp_int',        'int',           'interception',  'def_int'),
        forcedFumble:    pick(s, 'idp_ff',         'ff',            'forced_fumble', 'def_ff'),
        fumbleRecovery:  pick(s, 'idp_fum_rec',   'fr',            'fumble_rec',    'def_fr'),
        passDefended:    pick(s, 'idp_pass_def',  'pd',            'pass_defended', 'def_pd'),
        defensiveTd:     pick(s, 'idp_def_td',    'def_td',        'defensive_td'),
        safety:          pick(s, 'idp_safe',       'safe',          'safety',        'def_safe'),
        qbHit:           pick(s, 'idp_qb_hit',    'qb_hit',        'def_qb_hit'),
    };
}

// ── Kicker ─────────────────────────────────────────────────────────────────────
// Sleeper may use combined range buckets or fine-grained per-distance buckets.
// We use the widest range that covers our three tiers (0-39, 40-49, 50+).

function buildKickerScoring(s: Record<string, number>): LeagueScoring['kicker'] {
    // 0–39: use whichever bucket exists; fall back to fgm (catch-all)
    const fg0_39 =
        pick(s, 'fgm_0_39') ||
        (pick(s, 'fgm_0_19') + pick(s, 'fgm_20_29') + pick(s, 'fgm_30_39')) / 3 ||
        pick(s, 'fgm', 'fg_made');

    const fg40_49 = pick(s, 'fgm_40_49', 'fg_40_49');

    const fg50 =
        pick(s, 'fgm_50p') ||
        pick(s, 'fgm_50_59') ||
        pick(s, 'fg_50_plus') ||
        pick(s, 'fgm_60p');

    return {
        fg_0_39:    fg0_39   || 3,   // standard default
        fg_40_49:   fg40_49  || 4,
        fg_50_plus: fg50     || 5,
        xp:         pick(s, 'xpm', 'xp_made', 'pat') || 1,
        missedFg:   pick(s, 'fgmiss', 'fg_miss', 'fgm_miss') || 0,
        missedXp:   pick(s, 'xpmiss', 'xp_miss', 'pat_miss')  || 0,
    };
}

// ── DEF/ST ─────────────────────────────────────────────────────────────────────

const DEF_PA_BUCKETS: { key: string; maxPoints: number }[] = [
    { key: 'pts_allow_0',     maxPoints: 0        },
    { key: 'pts_allow_1_6',   maxPoints: 6        },
    { key: 'pts_allow_7_13',  maxPoints: 13       },
    { key: 'pts_allow_14_20', maxPoints: 20       },
    { key: 'pts_allow_21_27', maxPoints: 27       },
    { key: 'pts_allow_28_34', maxPoints: 34       },
    { key: 'pts_allow_35p',   maxPoints: 45       },
    { key: 'pts_allow_35_45', maxPoints: 45       },
    { key: 'pts_allow_46p',   maxPoints: Infinity },
];

// Standard fantasy defaults when the league uses DEF/ST but hasn't customised PA buckets
const DEFAULT_PA_BUCKETS: { maxPoints: number; points: number }[] = [
    { maxPoints: 0,        points: 10 },
    { maxPoints: 6,        points: 7  },
    { maxPoints: 13,       points: 4  },
    { maxPoints: 17,       points: 1  },
    { maxPoints: 20,       points: 0  },
    { maxPoints: 27,       points: -1 },
    { maxPoints: 34,       points: -4 },
    { maxPoints: 45,       points: -7 },
    { maxPoints: Infinity, points: -10 },
];

function buildDefenseScoring(s: Record<string, number>): LeagueScoring['defense'] {
    // Extract PA buckets — use defaults if none are configured
    const configuredBuckets = DEF_PA_BUCKETS
        .map(b => ({ maxPoints: b.maxPoints, points: s[b.key] ?? NaN }))
        .filter(b => !isNaN(b.points));

    // Deduplicate by maxPoints (some leagues define both pts_allow_35p and pts_allow_35_45)
    const seen = new Set<number>();
    const deduped = configuredBuckets.filter(b => {
        if (seen.has(b.maxPoints)) return false;
        seen.add(b.maxPoints);
        return true;
    });

    return {
        sack:             pick(s, 'sack',        'def_sack')           || 1,
        interception:     pick(s, 'int',         'def_int')            || 2,
        fumbleRecovery:   pick(s, 'fumble_rec',  'def_fr',    'fr')    || 2,
        defensiveTd:      pick(s, 'def_td',      'defensive_td')       || 6,
        safety:           pick(s, 'safe',        'def_safe',  'safety') || 2,
        returnTd:         pick(s, 'def_st_td',   'st_td',     'return_td') || 6,
        pointsAllowedBuckets: deduped.length >= 3 ? deduped : DEFAULT_PA_BUCKETS,
    };
}

// ── Lineup ─────────────────────────────────────────────────────────────────────

// Map Sleeper roster_positions slot names to our lineup counts.
const IDP_SLOT_TO_POSITION: Record<string, keyof LeagueLineup['starters'] | null> = {
    // Defensive linemen
    DE:  'DL', DT: 'DL', DL: 'DL', D_LINE: 'DL',
    // Linebackers
    LB:  'LB', OLB: 'LB', ILB: 'LB', MLB: 'LB',
    // Defensive backs
    DB:  'DB', CB: 'DB', S: 'DB', SS: 'DB', FS: 'DB',
    // Flex IDP
    IDP_FLEX: 'IDP', IDP: 'IDP',
    // Special teams
    K:   'K',
    DEF: 'DEF', DST: 'DEF', D_ST: 'DEF',
};

export function buildLeagueLineup(
    rosterPositions: string[],
    totalTeams:      number,
    benchSize?:      number,
): LeagueLineup {
    const starters: LeagueLineup['starters'] = { DL: 0, LB: 0, DB: 0, IDP: 0, K: 0, DEF: 0 };
    let bench  = 0;
    let total  = 0;

    for (const slot of rosterPositions) {
        const mapped = IDP_SLOT_TO_POSITION[slot.toUpperCase()];
        if (mapped !== undefined && mapped !== null) {
            starters[mapped]++;
        } else if (slot === 'BN') {
            bench++;
        }
        total++;
    }

    return {
        teams:    totalTeams,
        starters,
        benchSize: benchSize ?? bench,
    };
}

// ── Combined builder ───────────────────────────────────────────────────────────

export function buildLeagueConfig(
    scoringSettings: Record<string, number>,
    rosterPositions: string[],
    totalTeams:      number,
): { scoring: LeagueScoring; lineup: LeagueLineup } {
    return {
        scoring: {
            idp:     buildIdpScoring(scoringSettings),
            kicker:  buildKickerScoring(scoringSettings),
            defense: buildDefenseScoring(scoringSettings),
        },
        lineup: buildLeagueLineup(rosterPositions, totalTeams),
    };
}
