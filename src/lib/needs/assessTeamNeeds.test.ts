/**
 * Unit tests for the Unified Team Needs model.
 * Run: npx tsx --test src/lib/needs/assessTeamNeeds.test.ts
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { assessTeamNeeds, deriveSlots, type DerivedSlots } from './assessTeamNeeds.ts';

// RB with 2 dedicated starters → depthTarget = 2 + max(1, round(1)) = 3
const RB_SLOTS: DerivedSlots = { dedicated: { RB: 2 }, starters: { RB: 2 }, scope: ['RB'] };

function rb(values: number[], leagueAvg = 5000) {
    return assessTeamNeeds({
        playersByPos: { RB: values },
        slots: RB_SLOTS,
        leagueAvgByPos: { RB: leagueAvg },
    })[0];
}

describe('label resolution (2×2 + Solid)', () => {
    test('Strength = strong quality + deep', () => {
        const v = rb([3000, 2500, 2000, 1000]); // count4 deep, 3 above-threshold → strong
        assert.equal(v.depth, 'deep');
        assert.equal(v.strength, 'strong');
        assert.equal(v.label, 'Strength');
        assert.equal(v.urgency, 0.1);
    });

    test('Solid = average quality + deep', () => {
        const v = rb([1600, 1400, 1300]); // count3 deep, 1 above-threshold, mid value → average
        assert.equal(v.depth, 'deep');
        assert.equal(v.strength, 'average');
        assert.equal(v.label, 'Solid');
    });

    test('Top-heavy = strong quality + thin', () => {
        const v = rb([3000, 2800]); // count2 thin (<3), 2 above-threshold → strong
        assert.equal(v.depth, 'thin');
        assert.equal(v.strength, 'strong');
        assert.equal(v.label, 'Top-heavy');
    });

    test('Shallow = weak quality + deep', () => {
        const v = rb([1200, 1000, 800, 500]); // count4 deep, 0 above-threshold, low value → weak
        assert.equal(v.depth, 'deep');
        assert.equal(v.strength, 'weak');
        assert.equal(v.label, 'Shallow');
    });

    test('Need = weak quality + thin', () => {
        const v = rb([1000, 800]); // count2 thin, weak
        assert.equal(v.label, 'Need');
        assert.equal(v.urgency, 0.9);
    });

    test('Need = empty (cannot field starters) regardless of quality', () => {
        const v = rb([3000]); // count1 < 2 dedicated → empty → Need even though elite
        assert.equal(v.depth, 'empty');
        assert.equal(v.label, 'Need');
    });

    test('a league-average roster is Solid, NOT Strength (no over-grading to A)', () => {
        // posValue ≈ league avg, with starter-quality players — must read average,
        // not strong (this is the bug that produced all-A Core Strength grades).
        const v = rb([2500, 2500, 2000], 7000); // top3 sum 7000 == leagueAvg
        assert.equal(v.strength, 'average');
        assert.equal(v.label, 'Solid');
    });
});

describe('deriveSlots', () => {
    test('standard league: FLEX folds fractionally into RB/WR/TE', () => {
        const s = deriveSlots(['QB','RB','RB','WR','WR','TE','FLEX','K','DEF','BN','BN']);
        assert.equal(s.dedicated.RB, 2);
        assert.equal(s.dedicated.QB, 1);
        // FLEX (RB/WR/TE) adds 1/3 to each
        assert.ok(Math.abs(s.starters.RB - (2 + 1 / 3)) < 1e-9);
        assert.ok(Math.abs(s.starters.TE - (1 + 1 / 3)) < 1e-9);
        assert.ok(!s.scope.includes('FLEX')); // FLEX is not its own verdict
        assert.ok(s.scope.includes('DEF'));
    });

    test('superflex adds QB share', () => {
        const s = deriveSlots(['QB','RB','RB','WR','WR','TE','SUPER_FLEX','BN']);
        assert.ok(s.starters.QB > 1); // SF lifts QB demand above 1
    });

    test('IDP league: defensive slots bucket to a single IDP position', () => {
        const s = deriveSlots(['QB','RB','WR','TE','FLEX','DL','LB','DB','IDP_FLEX','BN']);
        assert.ok(s.scope.includes('IDP'));
        assert.equal(s.dedicated.IDP, 4); // DL + LB + DB + IDP_FLEX
    });

    test('non-IDP league has no IDP in scope', () => {
        const s = deriveSlots(['QB','RB','RB','WR','WR','TE','FLEX','BN']);
        assert.ok(!s.scope.includes('IDP'));
    });
});

describe('depth-only positions and urgency caps', () => {
    test('DEF is depth-only → strength average, no value needed', () => {
        const v = assessTeamNeeds({
            playersByPos: { DEF: [] },
            slots: { dedicated: { DEF: 1 }, starters: { DEF: 1 }, scope: ['DEF'] },
        })[0];
        assert.equal(v.strength, 'average');
        assert.equal(v.depth, 'empty');     // 0 < 1 dedicated
        assert.equal(v.label, 'Need');
        assert.ok(v.urgency <= 0.45);        // DEF cap
    });

    test('K need is capped low so it does not draft early', () => {
        const v = assessTeamNeeds({
            playersByPos: { K: [] },
            slots: { dedicated: { K: 1 }, starters: { K: 1 }, scope: ['K'] },
        })[0];
        assert.equal(v.label, 'Need');
        assert.ok(v.urgency <= 0.35);        // K cap beats the 0.9 Need urgency
    });
});
