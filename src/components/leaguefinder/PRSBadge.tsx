import { prsTier, PRS_TIER_LABELS, PRS_TIER_STYLES } from '@/lib/lf-prs-display';

interface PRSBadgeProps {
    score:   number;
    /** Show the numeric score alongside the tier label */
    showScore?: boolean;
    /** Compact pill — no tier label, just score + coloured dot */
    compact?: boolean;
    /** Tooltip describing the breakdown */
    tooltip?: string;
}

/**
 * Displays a user's Player Reliability Score with tier-based colour coding.
 *
 * Tiers:
 *   0-20   Unproven   (gray)
 *   21-40  Developing (orange)
 *   41-60  Reliable   (amber)
 *   61-80  Trusted    (emerald)
 *   81-100 Elite      (gold)
 */
export default function PRSBadge({ score, showScore = true, compact = false, tooltip }: PRSBadgeProps) {
    const tier   = prsTier(score);
    const label  = PRS_TIER_LABELS[tier];
    const styles = PRS_TIER_STYLES[tier];

    const defaultTooltip = `Player Reliability Score: ${score}/100 (${label})\n\nBuilt from verified seasons, league retention, helpful votes, and commissioner approvals.`;

    if (compact) {
        return (
            <span
                className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded border ${styles}`}
                title={tooltip ?? defaultTooltip}
            >
                PRS {score}
            </span>
        );
    }

    return (
        <div
            className={`rounded-xl border px-4 py-3 text-center cursor-help ${styles}`}
            title={tooltip ?? defaultTooltip}
        >
            <div className="text-[9px] uppercase tracking-widest font-bold opacity-60 mb-0.5">
                PRS
            </div>
            <div className="text-2xl font-black tabular-nums leading-none">
                {showScore ? score : label}
            </div>
            {showScore && (
                <div className="text-[9px] font-bold mt-1 opacity-80">{label}</div>
            )}
        </div>
    );
}
