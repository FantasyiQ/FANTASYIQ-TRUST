import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    validatePayoutTotal,
    isDuesPaymentIdempotent,
    extractDuesMetadata,
    isMemberInDues,
} from './payout-validation.ts';

// ── validatePayoutTotal ───────────────────────────────────────────────────────

describe('validatePayoutTotal', () => {
    test('passes when payout equals pot exactly', () => {
        const result = validatePayoutTotal(500, 500);
        assert.equal(result.valid, true);
    });

    test('passes within $0.02 rounding tolerance', () => {
        const result = validatePayoutTotal(500.01, 500);
        assert.equal(result.valid, true);
    });

    test('fails when payout exceeds pot beyond tolerance', () => {
        const result = validatePayoutTotal(500.03, 500);
        assert.equal(result.valid, false);
        if (!result.valid) {
            assert.equal(result.status, 400);
            assert.match(result.error, /does not match/);
        }
    });

    test('fails when payout is under pot beyond tolerance', () => {
        const result = validatePayoutTotal(499.97, 500);
        assert.equal(result.valid, false);
    });

    test('fails when payout drastically exceeds pot (over-release guard)', () => {
        const result = validatePayoutTotal(600, 500);
        assert.equal(result.valid, false);
        if (!result.valid) {
            assert.match(result.error, /\$600\.00/);
            assert.match(result.error, /\$500\.00/);
        }
    });

    test('passes with custom tolerance', () => {
        const result = validatePayoutTotal(500.05, 500, 0.10);
        assert.equal(result.valid, true);
    });
});

// ── isDuesPaymentIdempotent ───────────────────────────────────────────────────

describe('isDuesPaymentIdempotent', () => {
    test('returns true when member already paid (blocks double-pay)', () => {
        assert.equal(isDuesPaymentIdempotent('paid'), true);
    });

    test('returns false for unpaid member (allows payment)', () => {
        assert.equal(isDuesPaymentIdempotent('unpaid'), false);
    });

    test('returns false for pending status', () => {
        assert.equal(isDuesPaymentIdempotent('pending'), false);
    });
});

// ── extractDuesMetadata ───────────────────────────────────────────────────────

describe('extractDuesMetadata', () => {
    test('extracts duesId and memberId when both present', () => {
        const result = extractDuesMetadata({ duesId: 'dues_1', memberId: 'mem_1', type: 'LEAGUE_DUES' });
        assert.deepEqual(result, { duesId: 'dues_1', memberId: 'mem_1' });
    });

    test('returns null when duesId missing', () => {
        assert.equal(extractDuesMetadata({ memberId: 'mem_1' }), null);
    });

    test('returns null when memberId missing', () => {
        assert.equal(extractDuesMetadata({ duesId: 'dues_1' }), null);
    });

    test('returns null for null metadata', () => {
        assert.equal(extractDuesMetadata(null), null);
    });

    test('returns null for undefined metadata', () => {
        assert.equal(extractDuesMetadata(undefined), null);
    });
});

// ── isMemberInDues ────────────────────────────────────────────────────────────

describe('isMemberInDues', () => {
    test('returns true when member belongs to the dues record', () => {
        assert.equal(isMemberInDues('dues_abc', 'dues_abc'), true);
    });

    test('returns false when member belongs to a different dues record (cross-league guard)', () => {
        assert.equal(isMemberInDues('dues_abc', 'dues_xyz'), false);
    });
});
