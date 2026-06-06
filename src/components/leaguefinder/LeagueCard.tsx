import Link from 'next/link';
import { StarRating } from './StarRating';
import { prsTier, PRS_TIER_LABELS, PRS_TIER_STYLES } from '@/lib/lf-prs-display';

const ACTIVITY_LABELS: Record<number, string> = {
    20:  'Very low activity',
    40:  'Low activity',
    60:  'Moderate activity',
    80:  'High activity',
    100: 'Very high activity',
};

interface Props {
    id:               string;
    name:             string;
    platform:         string;
    format:           string;
    scoring:          string;
    size:             number;
    buyIn:            number | null;
    activityScore:    number;
    stabilityScore:   number;
    completedSeasons: number;
    requiresMinPrs:   number | null | undefined;
    commissioner: {
        id:           string;
        displayName:  string;
        avgRating:    number;
        reviewsCount: number;
        prsScore:     number | null;
    };
}

function healthLabel(score: number) {
    return score >= 80 ? 'Excellent' :
           score >= 65 ? 'Good'      :
           score >= 50 ? 'Fair'      :
                         'Developing';
}

function ScorePill({ label, score, tooltip }: { label: string; score: number; tooltip: string }) {
    const color =
        score >= 80 ? 'text-emerald-400 bg-emerald-900/20 border-emerald-800' :
        score >= 50 ? 'text-[#D4AF37]   bg-[#D4AF37]/10  border-[#D4AF37]/30' :
                      'text-gray-400    bg-gray-800       border-gray-700';
    return (
        <div className={`text-center rounded-lg border px-2 py-1.5 cursor-help ${color}`} title={tooltip}>
            <div className="text-[8px] uppercase tracking-wider font-semibold">{label}</div>
            <div className="text-sm font-bold">{score}</div>
        </div>
    );
}

export default function LeagueCard({
    id, name, platform, format, scoring, size, buyIn,
    activityScore, stabilityScore, completedSeasons, requiresMinPrs, commissioner,
}: Props) {
    const seasons = completedSeasons ?? Math.round(stabilityScore / 20);
    const stabilityTooltip = `Stability: ${stabilityScore} — ${seasons} completed season${seasons !== 1 ? 's' : ''} with payouts`;
    const activityTooltip  = `Activity: ${activityScore} — ${ACTIVITY_LABELS[activityScore] ?? 'Unrated'}`;

    const health = Math.round(
        0.5 * stabilityScore +
        0.3 * activityScore  +
        0.2 * (commissioner.avgRating * 20)
    );
    const hLabel = healthLabel(health);
    const healthColor =
        health >= 80 ? 'text-emerald-400' :
        health >= 65 ? 'text-[#D4AF37]'   :
        health >= 50 ? 'text-gray-300'    :
                       'text-gray-600';

    return (
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 flex flex-col gap-3">
            {/* Name + badges */}
            <div>
                <div className="flex items-start justify-between gap-2">
                    <Link
                        href={`/leaguefinder/leagues/${id}`}
                        className="text-base font-bold text-white hover:text-[#D4AF37] transition leading-tight"
                    >
                        {name}
                    </Link>
                    <div
                        className="shrink-0 text-right cursor-help"
                        title={`League Health: ${health} (${hLabel}) = 50% Stability + 30% Activity + 20% Commissioner Rating`}
                    >
                        <div className="text-[8px] text-gray-600 uppercase tracking-wider">Health</div>
                        <div className={`text-base font-black tabular-nums ${healthColor}`}>{health}</div>
                    </div>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                    <Badge color="sky">{platform}</Badge>
                    <Badge color="purple">{format}</Badge>
                    <Badge color="gold">{scoring}</Badge>
                    <Badge color="gray">{size}-team</Badge>
                    {buyIn != null && buyIn > 0 && (
                        <Badge color="emerald">${buyIn} buy-in</Badge>
                    )}
                    {(buyIn == null || buyIn === 0) && (
                        <Badge color="gray">Free</Badge>
                    )}
                    {requiresMinPrs != null && (
                        <span
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${PRS_TIER_STYLES[prsTier(requiresMinPrs)]}`}
                            title={`Requires PRS ${requiresMinPrs}+ (${PRS_TIER_LABELS[prsTier(requiresMinPrs)]})`}
                        >
                            PRS {requiresMinPrs}+ req
                        </span>
                    )}
                </div>
            </div>

            {/* Scores */}
            <div className="grid grid-cols-2 gap-2">
                <ScorePill label="Stability" score={stabilityScore} tooltip={stabilityTooltip} />
                <ScorePill label="Activity"  score={activityScore}  tooltip={activityTooltip}  />
            </div>

            {/* Commissioner */}
            <div className="flex items-center gap-2 pt-1 border-t border-gray-800">
                <div className="w-6 h-6 rounded-full bg-gray-700 flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                    {commissioner.displayName.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                    <Link
                        href={`/leaguefinder/commissioners/${commissioner.id}`}
                        className="text-xs font-semibold text-gray-300 hover:text-white transition truncate"
                    >
                        {commissioner.displayName}
                    </Link>
                    <div className="flex items-center gap-1 mt-0.5">
                        <StarRating rating={commissioner.avgRating} />
                        <span className="text-[10px] text-gray-500">
                            {commissioner.avgRating.toFixed(1)} ({commissioner.reviewsCount})
                        </span>
                    </div>
                </div>
                {commissioner.prsScore != null && (
                    <span
                        className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded border ${PRS_TIER_STYLES[prsTier(commissioner.prsScore)]}`}
                        title={`Commissioner PRS: ${commissioner.prsScore}/100 (${PRS_TIER_LABELS[prsTier(commissioner.prsScore)]})`}
                    >
                        PRS {commissioner.prsScore}
                    </span>
                )}
            </div>
        </div>
    );
}

function Badge({
    children,
    color,
}: {
    children: React.ReactNode;
    color: 'sky' | 'purple' | 'gold' | 'gray' | 'emerald';
}) {
    const styles = {
        sky:     'bg-sky-900/30     text-sky-400     border-sky-800',
        purple:  'bg-purple-900/30  text-purple-400  border-purple-800',
        gold:    'bg-[#D4AF37]/10   text-[#D4AF37]   border-[#D4AF37]/30',
        gray:    'bg-gray-800       text-gray-400    border-gray-700',
        emerald: 'bg-emerald-900/30 text-emerald-400 border-emerald-800',
    };
    return (
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${styles[color]}`}>
            {children}
        </span>
    );
}
