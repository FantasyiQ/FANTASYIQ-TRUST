/**
 * Mock-draft needs adapter + per-pick decay + BPA-respect regression tests.
 * Run: npx tsx --test src/lib/mock-draft/NeedsEngine.test.ts
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildNeedsProfile, getNeedForPosition, updateNeedsAfterPick } from './NeedsEngine.ts';
import { scorePlayerForTeam } from './ScoringEngine.ts';
import type { MockPlayer, NeedsProfile, MockDraftSettings, PersonalityProfile } from './types.ts';
import type { PositionVerdict } from '../needs/assessTeamNeeds.ts';

const settings = { isRookieDraft: true } as unknown as MockDraftSettings;
const flat: PersonalityProfile = { riskTolerance: 'MEDIUM', needBias: 0.5, chaosBias: 0 };

function player(p: Partial<MockPlayer> & { position: MockPlayer['position']; baseScore: number }): MockPlayer {
    return { playerId: 'x', name: 'X', team: null, age: null, tier: 3, isRookie: true, injuryStatus: null, imageUrl: null, ...p };
}

describe('buildNeedsProfile + getNeedForPosition', () => {
    const verdicts: PositionVerdict[] = [
        { position: 'RB', depth: 'thin', strength: 'weak',   label: 'Need',     urgency: 0.9,  reason: 'r', count: 1 },
        { position: 'WR', depth: 'deep', strength: 'strong', label: 'Strength', urgency: 0.1,  reason: 'r', count: 5 },
        { position: 'TE', depth: 'thin', strength: 'strong', label: 'Top-heavy',urgency: 0.65, reason: 'r', count: 1 },
    ];
    const profile = buildNeedsProfile(verdicts, { RB: 2, WR: 2, TE: 1 });

    test('maps urgency + label + reason from verdicts', () => {
        assert.equal(getNeedForPosition(profile, 'RB'), 0.9);
        assert.equal(getNeedForPosition(profile, 'WR'), 0.1);
        assert.equal(profile.label.TE, 'Top-heavy');
        assert.equal(profile.reason.RB, 'r');
    });

    test('decayDenom = depthTarget(starters)', () => {
        // depthTarget(2) = 2 + max(1, round(1)) = 3
        assert.equal(profile.decayDenom.RB, 3);
    });
});

describe('per-pick decay (no tunnelling)', () => {
    const verdicts: PositionVerdict[] = [
        { position: 'RB', depth: 'thin', strength: 'weak', label: 'Need', urgency: 0.9, reason: 'r', count: 1 },
    ];
    let profile: NeedsProfile = buildNeedsProfile(verdicts, { RB: 2 }); // decayDenom 3

    test('each pick lowers urgency by 1/depthTarget', () => {
        const before = getNeedForPosition(profile, 'RB');           // 0.9
        profile = updateNeedsAfterPick(profile, player({ position: 'RB', baseScore: 80 }), settings);
        const after = getNeedForPosition(profile, 'RB');            // 0.9 - 1/3
        assert.ok(Math.abs((before - after) - 1 / 3) < 1e-9);
    });

    test('urgency floors at 0 after enough picks (CPU stops hammering)', () => {
        let p = buildNeedsProfile(verdicts, { RB: 2 });
        for (let i = 0; i < 5; i++) p = updateNeedsAfterPick(p, player({ position: 'RB', baseScore: 80 }), settings);
        assert.equal(getNeedForPosition(p, 'RB'), 0);
    });
});

describe('BPA still wins on a large value gap', () => {
    test('elite player at a decayed position beats a mediocre player at a high-need position', () => {
        // RB need decayed low, WR need high — but the elite RB has a big BPA edge
        const needs: NeedsProfile = {
            base: { RB: 0.5, WR: 0.9 }, picks: { RB: 2 }, decayDenom: { RB: 5, WR: 5 },
            label: {}, reason: {},
        };
        const eliteRB = player({ position: 'RB', baseScore: 90 });
        const medWR   = player({ position: 'WR', baseScore: 50 });
        const rb = scorePlayerForTeam(eliteRB, needs, 0, 0, 1, 0, flat).score;
        const wr = scorePlayerForTeam(medWR,   needs, 0, 0, 1, 0, flat).score;
        assert.ok(rb > wr, `expected elite RB (${rb}) to beat mediocre WR (${wr})`);
    });
});
