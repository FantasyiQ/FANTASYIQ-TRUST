// Legacy LeagueFinder PRS computation has been removed.
// The unified event-driven PRS lives in src/lib/prs.ts.
// This file now only re-exports pure display helpers.
export { prsTier, PRS_TIER_LABELS, PRS_TIER_STYLES } from '@/lib/lf-prs-display';
export type { PRSTier } from '@/lib/lf-prs-display';

