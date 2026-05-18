'use client';

import type { TeamTrajectory } from '@/lib/teamTrajectory';

interface Props {
    trajectory: TeamTrajectory;
    teamName:   string;
}

const MODE_CONFIG = {
    CONTENDER:  { label: 'Contender',  bg: 'bg-[#D4AF37]/10', text: 'text-[#D4AF37]',  border: 'border-[#D4AF37]/40' },
    ASCENDING:  { label: 'Ascending',  bg: 'bg-green-900/20',  text: 'text-green-400',  border: 'border-green-700/40' },
    STUCK:      { label: 'Stuck',      bg: 'bg-gray-800',      text: 'text-gray-400',   border: 'border-gray-700' },
    DECLINING:  { label: 'Declining',  bg: 'bg-red-900/20',    text: 'text-red-400',    border: 'border-red-700/40' },
    REBUILDER:  { label: 'Rebuilder',  bg: 'bg-blue-900/20',   text: 'text-blue-400',   border: 'border-blue-700/40' },
};

const CURVE_CONFIG = {
    EARLY_PEAK: { label: 'Peaking Now',  color: 'text-[#D4AF37]' },
    LATE_PEAK:  { label: 'Peak Ahead',   color: 'text-green-400' },
    FLAT:       { label: 'Holding Flat', color: 'text-gray-400'  },
    FALLING:    { label: 'Falling',      color: 'text-red-400'   },
};

const DIRECTION_CONFIG = {
    BUY_PRODUCTION:  { label: 'Buy Production',  color: 'text-[#D4AF37]',  desc: 'You have strong picks and youth — trade for proven starters to compete now.' },
    BUY_PICKS:       { label: 'Buy Picks',        color: 'text-blue-400',   desc: 'Accumulate future capital. Sell aging production and rebuild through the draft.' },
    HOLD:            { label: 'Hold',             color: 'text-gray-300',   desc: 'Your team is well-positioned. Stay the course and look for value upgrades.' },
    SELL_PRODUCTION: { label: 'Sell Production',  color: 'text-orange-400', desc: 'Your key players are aging. Sell high now and restock picks and youth.' },
};

function MetricBar({ label, value, invert = false, hint }: {
    label:   string;
    value:   number;  // 0–100
    invert?: boolean; // true = low value is good (age curve)
    hint?:   string;
}) {
    // Display color based on how "good" the score is
    const displayValue = invert ? 100 - value : value;
    const barColor =
        displayValue >= 70 ? 'bg-green-500' :
        displayValue >= 45 ? 'bg-[#D4AF37]' :
                             'bg-gray-600';

    return (
        <div className="space-y-1">
            <div className="flex items-center justify-between">
                <span className="text-gray-400 text-xs">{label}</span>
                <span className="text-gray-300 text-xs tabular-nums">{displayValue}/100</span>
            </div>
            <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <div
                    className={`h-full rounded-full transition-all ${barColor}`}
                    style={{ width: `${value}%` }}
                />
            </div>
            {hint && <p className="text-gray-600 text-[10px]">{hint}</p>}
        </div>
    );
}

export default function TeamIntelligenceCard({ trajectory, teamName }: Props) {
    const mode      = MODE_CONFIG[trajectory.mode];
    const curve     = CURVE_CONFIG[trajectory.winCurve];
    const direction = DIRECTION_CONFIG[trajectory.recommendedDirection];

    return (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4">
            {/* Header */}
            <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                    <h3 className="font-semibold text-white text-sm">Team Intelligence</h3>
                    <p className="text-gray-500 text-xs mt-0.5">{teamName}</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${mode.bg} ${mode.text} ${mode.border}`}>
                        {mode.label}
                    </span>
                    <span className={`text-[10px] font-medium ${curve.color}`}>
                        {curve.label}
                    </span>
                </div>
            </div>

            {/* Composite bar */}
            <div className="space-y-1">
                <div className="flex items-center justify-between">
                    <span className="text-gray-300 text-xs font-medium">Overall Score</span>
                    <span className="text-white text-xs font-bold tabular-nums">{trajectory.composite}/100</span>
                </div>
                <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div
                        className={`h-full rounded-full transition-all ${
                            trajectory.composite >= 70 ? 'bg-[#D4AF37]' :
                            trajectory.composite >= 45 ? 'bg-green-500' :
                                                          'bg-blue-500'
                        }`}
                        style={{ width: `${trajectory.composite}%` }}
                    />
                </div>
            </div>

            {/* Metric bars */}
            <div className="space-y-3">
                <MetricBar
                    label="Starter Quality"
                    value={trajectory.starterQuality}
                />
                <MetricBar
                    label="Roster Age"
                    value={trajectory.rosterAgeCurve}
                    invert
                    hint={trajectory.rosterAgeCurve > 65 ? 'Aging core — monitor carefully' : undefined}
                />
                <MetricBar
                    label="Pick Capital"
                    value={trajectory.pickLeverage}
                />
                <MetricBar
                    label="Future vs Production"
                    value={100 - trajectory.productionFutureRatio}
                    hint={trajectory.productionFutureRatio > 75 ? 'Heavy production — limited upside' :
                          trajectory.productionFutureRatio < 30 ? 'Heavy future — limited floor' : undefined}
                />
            </div>

            {/* Recommended direction */}
            <div className="pt-1 border-t border-gray-800">
                <p className="text-gray-500 text-[10px] uppercase tracking-wider mb-1">Recommended Direction</p>
                <p className={`text-sm font-bold ${direction.color}`}>{direction.label}</p>
                <p className="text-gray-500 text-xs mt-0.5">{direction.desc}</p>
            </div>
        </div>
    );
}
