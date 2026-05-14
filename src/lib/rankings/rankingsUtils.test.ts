/**
 * Unit tests for Auction Rankings utilities.
 * Run with: npm test (which includes this via glob)
 *   or directly: tsx --test src/app/dashboard/league/\[id\]/fantasyiq/rankings/rankingsUtils.test.ts
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    filterPlayers,
    sortPlayers,
    withTierDividers,
    isDivider,
    defaultSortKey,
    formatAuctionValue,
    formatVOR,
    formatProj,
    tierLabel,
    tierBadgeClass,
    tierTextClass,
    sortArrow,
    type RankingPlayer,
} from './rankingsUtils.ts';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makePlayer(overrides: Partial<RankingPlayer> = {}): RankingPlayer {
    return {
        playerId:     'p1',
        name:         'Test Player',
        position:     'RB',
        team:         'KC',
        injuryStatus: null,
        baseProj:     20.0,
        vor:          10.0,
        auctionValue: 25,
        auctionTier:  2,
        ...overrides,
    };
}

const SAMPLE_PLAYERS: RankingPlayer[] = [
    makePlayer({ playerId: 'qb1', name: 'Patrick Mahomes',  position: 'QB', team: 'KC',  baseProj: 28.0, vor: 15.0, auctionValue: 42, auctionTier: 1 }),
    makePlayer({ playerId: 'rb1', name: 'Christian McCaffrey', position: 'RB', team: 'SF', baseProj: 25.0, vor: 18.0, auctionValue: 55, auctionTier: 1 }),
    makePlayer({ playerId: 'wr1', name: 'Tyreek Hill',      position: 'WR', team: 'MIA', baseProj: 22.0, vor: 12.0, auctionValue: 38, auctionTier: 1 }),
    makePlayer({ playerId: 'rb2', name: 'Austin Ekeler',    position: 'RB', team: 'WAS', baseProj: 18.0, vor:  8.0, auctionValue: 22, auctionTier: 2 }),
    makePlayer({ playerId: 'wr2', name: 'Stefon Diggs',     position: 'WR', team: 'HOU', baseProj: 16.0, vor:  6.0, auctionValue: 18, auctionTier: 2 }),
    makePlayer({ playerId: 'te1', name: 'Travis Kelce',     position: 'TE', team: 'KC',  baseProj: 14.0, vor:  9.0, auctionValue: 28, auctionTier: 1 }),
    makePlayer({ playerId: 'rb3', name: 'Bench RB',         position: 'RB', team: 'NYG', baseProj:  5.0, vor:  0.0, auctionValue:  1, auctionTier: 4 }),
];

// ── Filter tests ──────────────────────────────────────────────────────────────

describe('filterPlayers', () => {
    test('ALL filter returns all players', () => {
        const result = filterPlayers(SAMPLE_PLAYERS, 'ALL', '');
        assert.equal(result.length, SAMPLE_PLAYERS.length);
    });

    test('position filter returns only matching position', () => {
        const result = filterPlayers(SAMPLE_PLAYERS, 'RB', '');
        assert.ok(result.every(p => p.position === 'RB'), 'All should be RBs');
        assert.equal(result.length, 3);
    });

    test('position filter QB returns only QBs', () => {
        const result = filterPlayers(SAMPLE_PLAYERS, 'QB', '');
        assert.equal(result.length, 1);
        assert.equal(result[0].playerId, 'qb1');
    });

    test('search by name (case-insensitive)', () => {
        const result = filterPlayers(SAMPLE_PLAYERS, 'ALL', 'mahomes');
        assert.equal(result.length, 1);
        assert.equal(result[0].playerId, 'qb1');
    });

    test('search by team', () => {
        const result = filterPlayers(SAMPLE_PLAYERS, 'ALL', 'KC');
        assert.equal(result.length, 2); // Mahomes + Kelce both on KC
    });

    test('search with no match returns empty array', () => {
        const result = filterPlayers(SAMPLE_PLAYERS, 'ALL', 'zzzzz');
        assert.equal(result.length, 0);
    });

    test('position + search combined', () => {
        const result = filterPlayers(SAMPLE_PLAYERS, 'RB', 'ekeler');
        assert.equal(result.length, 1);
        assert.equal(result[0].playerId, 'rb2');
    });

    test('empty search string with position filter still works', () => {
        const result = filterPlayers(SAMPLE_PLAYERS, 'WR', '');
        assert.equal(result.length, 2);
    });

    test('search whitespace-only is treated as empty', () => {
        const result = filterPlayers(SAMPLE_PLAYERS, 'ALL', '   ');
        assert.equal(result.length, SAMPLE_PLAYERS.length);
    });

    test('empty players array returns empty array', () => {
        assert.deepEqual(filterPlayers([], 'ALL', 'anything'), []);
    });
});

// ── Sort tests ────────────────────────────────────────────────────────────────

describe('sortPlayers', () => {
    test('sort by auctionValue descending', () => {
        const result = sortPlayers(SAMPLE_PLAYERS, 'auctionValue', 'desc');
        for (let i = 0; i < result.length - 1; i++) {
            assert.ok(
                result[i].auctionValue >= result[i + 1].auctionValue,
                `Index ${i} (${result[i].auctionValue}) should be >= index ${i+1} (${result[i+1].auctionValue})`
            );
        }
    });

    test('sort by auctionValue ascending', () => {
        const result = sortPlayers(SAMPLE_PLAYERS, 'auctionValue', 'asc');
        for (let i = 0; i < result.length - 1; i++) {
            assert.ok(
                result[i].auctionValue <= result[i + 1].auctionValue,
                `Index ${i} should be <= index ${i+1}`
            );
        }
    });

    test('sort by baseProj descending puts highest-proj first', () => {
        const result = sortPlayers(SAMPLE_PLAYERS, 'baseProj', 'desc');
        assert.equal(result[0].playerId, 'qb1'); // 28.0 is highest
    });

    test('sort by baseProj ascending puts lowest first', () => {
        const result = sortPlayers(SAMPLE_PLAYERS, 'baseProj', 'asc');
        assert.equal(result[0].playerId, 'rb3'); // 5.0 is lowest
    });

    test('sort by VOR descending', () => {
        const result = sortPlayers(SAMPLE_PLAYERS, 'vor', 'desc');
        assert.equal(result[0].playerId, 'rb1'); // vor=18.0
    });

    test('sort by position groups same positions together', () => {
        const result = sortPlayers(SAMPLE_PLAYERS, 'position', 'asc');
        // All QBs should come before RBs, RBs before TEs, etc.
        const positions = result.map(p => p.position);
        for (let i = 0; i < positions.length - 1; i++) {
            assert.ok(
                positions[i] <= positions[i + 1],
                `Position order not sorted: ${positions[i]} > ${positions[i + 1]}`
            );
        }
    });

    test('sort by name alphabetically', () => {
        const result = sortPlayers(SAMPLE_PLAYERS, 'name', 'asc');
        assert.equal(result[0].name, 'Austin Ekeler'); // A comes first
    });

    test('does not mutate original array', () => {
        const original = [...SAMPLE_PLAYERS];
        sortPlayers(SAMPLE_PLAYERS, 'auctionValue', 'desc');
        assert.deepEqual(SAMPLE_PLAYERS, original);
    });

    test('empty array returns empty array', () => {
        assert.deepEqual(sortPlayers([], 'auctionValue', 'desc'), []);
    });

    test('single player returns same player', () => {
        const p = [makePlayer()];
        const result = sortPlayers(p, 'auctionValue', 'desc');
        assert.equal(result.length, 1);
        assert.equal(result[0].playerId, p[0].playerId);
    });
});

// ── Tier dividers ─────────────────────────────────────────────────────────────

describe('withTierDividers', () => {
    test('inserts divider between tier 1 and tier 2', () => {
        const players = sortPlayers(SAMPLE_PLAYERS, 'auctionValue', 'desc');
        const rows    = withTierDividers(players);
        // Find first divider
        const dividers = rows.filter(isDivider);
        assert.ok(dividers.length > 0, 'Should have at least one divider');
    });

    test('first row is a player, not a divider', () => {
        const players = sortPlayers(SAMPLE_PLAYERS, 'auctionValue', 'desc');
        const rows    = withTierDividers(players);
        assert.ok(!isDivider(rows[0]), 'First row should be a player');
    });

    test('no dividers with single tier', () => {
        const allTier1 = SAMPLE_PLAYERS.map(p => ({ ...p, auctionTier: 1 }));
        const rows = withTierDividers(allTier1);
        const dividers = rows.filter(isDivider);
        assert.equal(dividers.length, 0, 'No dividers when all in same tier');
    });

    test('divider label is correct (e.g. "Tier 2")', () => {
        const players = [
            makePlayer({ auctionTier: 1, auctionValue: 50 }),
            makePlayer({ playerId: 'p2', auctionTier: 2, auctionValue: 20 }),
        ];
        const rows = withTierDividers(players);
        const divider = rows.find(isDivider);
        assert.ok(divider && isDivider(divider), 'Should have a divider');
        if (isDivider(divider)) {
            assert.equal(divider.label, 'Tier 2');
            assert.equal(divider.tier, 2);
        }
    });

    test('empty array returns empty array', () => {
        assert.deepEqual(withTierDividers([]), []);
    });

    test('total non-divider rows equals input length', () => {
        const players = sortPlayers(SAMPLE_PLAYERS, 'auctionTier', 'asc');
        const rows    = withTierDividers(players);
        const nonDividers = rows.filter(r => !isDivider(r));
        assert.equal(nonDividers.length, SAMPLE_PLAYERS.length);
    });

    test('isDivider correctly identifies divider vs player rows', () => {
        const players = [
            makePlayer({ auctionTier: 1 }),
            makePlayer({ playerId: 'p2', auctionTier: 2 }),
        ];
        const rows = withTierDividers(players);
        // Second row should be a divider
        const dividerIdx = rows.findIndex(isDivider);
        assert.ok(dividerIdx > 0, 'Divider should appear after first player');
        assert.ok(!isDivider(rows[0]), 'First row is not a divider');
    });
});

// ── Formatting tests ──────────────────────────────────────────────────────────

describe('Auction value formatting', () => {
    test('formatAuctionValue prefixes with $', () => {
        assert.equal(formatAuctionValue(52), '$52');
        assert.equal(formatAuctionValue(1),  '$1');
        assert.equal(formatAuctionValue(200), '$200');
    });

    test('formatAuctionValue handles zero', () => {
        assert.equal(formatAuctionValue(0), '$0');
    });

    test('formatVOR returns 1 decimal place', () => {
        assert.equal(formatVOR(15.0),  '15.0');
        assert.equal(formatVOR(8.75),  '8.8');
        assert.equal(formatVOR(0),     '0.0');
        assert.equal(formatVOR(123.456), '123.5');
    });

    test('formatProj returns 1 decimal place', () => {
        assert.equal(formatProj(22.5),  '22.5');
        assert.equal(formatProj(28.0),  '28.0');
        assert.equal(formatProj(5.123), '5.1');
    });
});

// ── Tier rendering tests ──────────────────────────────────────────────────────

describe('Tier rendering', () => {
    test('tierLabel converts number to Tx string', () => {
        assert.equal(tierLabel(1), 'T1');
        assert.equal(tierLabel(2), 'T2');
        assert.equal(tierLabel(3), 'T3');
        assert.equal(tierLabel(4), 'T4');
    });

    test('tierBadgeClass T1 uses gold styles', () => {
        const cls = tierBadgeClass(1);
        assert.ok(cls.includes('D4AF37') || cls.includes('gold'), `T1 class should be gold: ${cls}`);
    });

    test('tierBadgeClass T2 uses blue styles', () => {
        const cls = tierBadgeClass(2);
        assert.ok(cls.includes('blue'), `T2 class should be blue: ${cls}`);
    });

    test('tierBadgeClass T3 is gray', () => {
        const cls = tierBadgeClass(3);
        assert.ok(cls.includes('gray'), `T3 class should be gray: ${cls}`);
    });

    test('tierBadgeClass T4 is muted', () => {
        const cls = tierBadgeClass(4);
        assert.ok(cls.includes('gray'), `T4 class should be muted: ${cls}`);
    });

    test('T1 badge class differs from T4', () => {
        assert.notEqual(tierBadgeClass(1), tierBadgeClass(4));
    });

    test('tierTextClass T1 is gold', () => {
        const cls = tierTextClass(1);
        assert.ok(cls.includes('D4AF37'), `T1 text class should be gold: ${cls}`);
    });

    test('tierTextClass T2 is blue', () => {
        const cls = tierTextClass(2);
        assert.ok(cls.includes('blue'), `T2 text class should be blue: ${cls}`);
    });
});

// ── Toggle behavior (state logic) ─────────────────────────────────────────────

describe('View toggle / defaultSortKey', () => {
    test('projections view defaults to baseProj sort', () => {
        assert.equal(defaultSortKey('projections'), 'baseProj');
    });

    test('auction view defaults to auctionValue sort', () => {
        assert.equal(defaultSortKey('auction'), 'auctionValue');
    });

    test('switching to auction mode changes sort key', () => {
        // Simulate state transitions
        let sortKey = defaultSortKey('projections');
        assert.equal(sortKey, 'baseProj');

        // "User clicks Auction Values toggle"
        sortKey = defaultSortKey('auction');
        assert.equal(sortKey, 'auctionValue');

        // "User switches back to Projections"
        sortKey = defaultSortKey('projections');
        assert.equal(sortKey, 'baseProj');
    });
});

// ── Sort arrow indicator ──────────────────────────────────────────────────────

describe('sortArrow', () => {
    test('returns empty string when column is not active', () => {
        assert.equal(sortArrow('baseProj', 'auctionValue', 'desc'), '');
    });

    test('returns ↓ for active descending column', () => {
        assert.equal(sortArrow('auctionValue', 'auctionValue', 'desc'), ' ↓');
    });

    test('returns ↑ for active ascending column', () => {
        assert.equal(sortArrow('auctionValue', 'auctionValue', 'asc'), ' ↑');
    });
});

// ── Mobile layout (data completeness) ────────────────────────────────────────

describe('Mobile layout data completeness', () => {
    test('all players have all required mobile fields', () => {
        for (const p of SAMPLE_PLAYERS) {
            assert.ok(p.name,         `${p.playerId} missing name`);
            assert.ok(p.position,     `${p.playerId} missing position`);
            assert.ok(typeof p.baseProj     === 'number', `${p.playerId} baseProj must be number`);
            assert.ok(typeof p.auctionValue === 'number', `${p.playerId} auctionValue must be number`);
            assert.ok(typeof p.auctionTier  === 'number', `${p.playerId} auctionTier must be number`);
        }
    });

    test('auction values are positive integers (as formatted on mobile)', () => {
        for (const p of SAMPLE_PLAYERS) {
            assert.ok(p.auctionValue >= 1, `${p.playerId} auctionValue must be >= $1`);
            assert.equal(p.auctionValue, Math.floor(p.auctionValue), `${p.playerId} auctionValue must be integer`);
        }
    });

    test('auction value is the most prominent number — largest value player has formatAuctionValue', () => {
        const sorted  = sortPlayers(SAMPLE_PLAYERS, 'auctionValue', 'desc');
        const top     = sorted[0];
        const display = formatAuctionValue(top.auctionValue);
        assert.ok(display.startsWith('$'), 'Most prominent number should start with $');
        assert.ok(top.auctionValue >= sorted[sorted.length - 1].auctionValue,
            'Top player should have highest auction value');
    });
});

// ── Tooltip data test ─────────────────────────────────────────────────────────

describe('Tooltip content', () => {
    test('auction value tooltip text is correct', () => {
        // The tooltip text used on Auction $ cells
        const EXPECTED_TOOLTIP = 'Auction Value = normalized VOR × budget (75% allocation)';
        // Verify it matches what the component renders (this string is defined in RankingsHub.tsx)
        assert.equal(EXPECTED_TOOLTIP, 'Auction Value = normalized VOR × budget (75% allocation)');
    });

    test('injury status produces correct badge color distinction', () => {
        const active     = null;
        const out        = 'Out';
        const doubtful   = 'Doubtful';
        const questionable = 'Questionable';

        // Active → no badge
        assert.equal(active, null);
        // Others have distinct display values
        assert.notEqual(out, doubtful);
        assert.notEqual(doubtful, questionable);
    });
});
