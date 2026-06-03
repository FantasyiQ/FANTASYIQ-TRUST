export const dynamic = 'force-dynamic';

import { prisma }        from '@/lib/prisma';
import { Prisma }        from '@prisma/client';
import Link              from 'next/link';
import LeagueCard        from '@/components/leaguefinder/LeagueCard';

interface SearchParams {
    format?:       string;
    scoring?:      string;
    size?:         string;
    platform?:     string;
    minBuyIn?:     string;
    maxBuyIn?:     string;
    minRating?:    string;
    minStability?: string;
    minActivity?:  string;
    verifiedOnly?: string;
    minPrs?:       string;  // filter to leagues requiring at least this PRS from members
    hideUnproven?: string;  // filter to leagues with any PRS requirement (≥21)
}

const FORMATS   = ['Dynasty', 'Redraft', 'Best Ball'];
const SCORINGS  = ['PPR', 'Half PPR', 'Standard', 'TE Premium'];
const SIZES     = ['8', '10', '12', '14', '16', '32'];
const PLATFORMS = ['Sleeper', 'ESPN', 'Yahoo', 'NFL Fantasy'];

export default async function LeagueFinderPage({
    searchParams,
}: {
    searchParams: Promise<SearchParams>;
}) {
    const sp = await searchParams;

    // Build Prisma where clause from filters
    const where: Prisma.LFLeagueWhereInput = {};
    if (sp.format   ) where.format   = sp.format;
    if (sp.scoring  ) where.scoring  = sp.scoring;
    if (sp.platform ) where.platform = sp.platform;
    if (sp.size     ) where.size     = parseInt(sp.size, 10);
    if (sp.minBuyIn || sp.maxBuyIn) {
        where.buyIn = {};
        if (sp.minBuyIn) (where.buyIn as Prisma.IntNullableFilter).gte = parseInt(sp.minBuyIn, 10);
        if (sp.maxBuyIn) (where.buyIn as Prisma.IntNullableFilter).lte = parseInt(sp.maxBuyIn, 10);
    }
    if (sp.minRating)    where.commissioner  = { avgRating:     { gte: parseFloat(sp.minRating) } };
    if (sp.minStability) where.stabilityScore = { gte: parseInt(sp.minStability, 10) };
    if (sp.minActivity)  where.activityScore  = { gte: parseInt(sp.minActivity, 10)  };
    if (sp.verifiedOnly === 'true') where.reviews = { some: { verified: true } };
    if (sp.minPrs) where.requiresMinPrs = { gte: parseInt(sp.minPrs, 10) };
    else if (sp.hideUnproven === 'true') where.requiresMinPrs = { gte: 21 };

    const leagues = await prisma.lFLeague.findMany({
        where,
        orderBy: [{ rankingScore: 'desc' }, { commissioner: { avgRating: 'desc' } }, { stabilityScore: 'desc' }],
        include: { commissioner: true },
        take:    50,
    });

    return (
        <div className="min-h-screen bg-gray-950 text-white">
            <div className="max-w-6xl mx-auto px-4 py-10 space-y-8">

                {/* ── Header ─────────────────────────────────────────── */}
                <div className="flex items-end justify-between flex-wrap gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-white">League Finder</h1>
                        <p className="text-gray-500 text-sm mt-1">
                            Find your next dynasty or redraft league — vetted by the community.
                        </p>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                        <Link
                            href="/dss/leaderboard"
                            className="px-3 py-1.5 rounded-lg text-xs font-bold border border-[#D4AF37]/40 text-[#D4AF37] hover:bg-[#D4AF37]/10 transition"
                        >
                            🏆 DSS Leaderboard
                        </Link>
                        <Link
                            href="/leaguefinder/commissioners/new"
                            className="px-3 py-1.5 rounded-lg text-xs font-bold border border-gray-700 text-gray-300 hover:border-[#D4AF37] hover:text-[#D4AF37] transition"
                        >
                            + Register as Commissioner
                        </Link>
                        <Link
                            href="/leaguefinder/leagues/new"
                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#D4AF37] text-gray-950 hover:bg-[#BF9D2F] transition"
                        >
                            + List a League
                        </Link>
                    </div>
                </div>

                {/* ── Filters ────────────────────────────────────────── */}
                <FilterBar current={sp} />

                {/* ── Results ────────────────────────────────────────── */}
                <div>
                    <p className="text-xs text-gray-600 mb-4">
                        {leagues.length === 50 ? '50+' : leagues.length} league{leagues.length !== 1 ? 's' : ''} found
                    </p>

                    {leagues.length === 0 ? (
                        <div className="rounded-2xl bg-gray-900 border border-gray-800 px-6 py-14 text-center">
                            <div className="text-3xl mb-3">🔍</div>
                            <h3 className="font-bold text-white mb-1">No leagues found</h3>
                            <p className="text-gray-500 text-sm">Try adjusting your filters or list a new league.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {leagues.map(l => (
                                <LeagueCard
                                    key={l.id}
                                    id={l.id}
                                    name={l.name}
                                    platform={l.platform}
                                    format={l.format}
                                    scoring={l.scoring}
                                    size={l.size}
                                    buyIn={l.buyIn}
                                    activityScore={l.activityScore}
                                    stabilityScore={l.stabilityScore}
                                    completedSeasons={l.completedSeasons}
                                    requiresMinPrs={l.requiresMinPrs}
                                    commissioner={{
                                        id:           l.commissioner.id,
                                        displayName:  l.commissioner.displayName,
                                        avgRating:    l.commissioner.avgRating,
                                        reviewsCount: l.commissioner.reviewsCount,
                                    }}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ── Filter bar ────────────────────────────────────────────────────────────────

function FilterBar({ current }: { current: SearchParams }) {
    const pills = (options: string[], key: keyof SearchParams, label: string) => (
        <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-[10px] uppercase tracking-wider text-gray-600 mr-1">{label}</span>
            {options.map(opt => {
                const active = current[key] === opt;
                const next   = new URLSearchParams(current as Record<string, string>);
                if (active) next.delete(key); else next.set(key, opt);
                return (
                    <Link
                        key={opt}
                        href={`/leaguefinder?${next.toString()}`}
                        className={`text-xs px-2.5 py-1 rounded-full border transition ${
                            active
                                ? 'bg-[#D4AF37] text-gray-950 border-[#D4AF37] font-bold'
                                : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-500'
                        }`}
                    >
                        {opt}
                    </Link>
                );
            })}
        </div>
    );

    const scoreFilter = (
        options: { label: string; value: string }[],
        key: keyof SearchParams,
        label: string,
    ) => (
        <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-[10px] uppercase tracking-wider text-gray-600 mr-1">{label}</span>
            {options.map(opt => {
                const active = current[key] === opt.value;
                const next   = new URLSearchParams(current as Record<string, string>);
                if (active) next.delete(key); else next.set(key, opt.value);
                return (
                    <Link
                        key={opt.value}
                        href={`/leaguefinder?${next.toString()}`}
                        className={`text-xs px-2.5 py-1 rounded-full border transition ${
                            active
                                ? 'bg-[#D4AF37] text-gray-950 border-[#D4AF37] font-bold'
                                : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-500'
                        }`}
                    >
                        {opt.label}
                    </Link>
                );
            })}
        </div>
    );

    const clearParams = new URLSearchParams();
    const hasFilters  = Object.values(current).some(Boolean);

    // Verified toggle
    const verifiedActive = current.verifiedOnly === 'true';
    const verifiedNext   = new URLSearchParams(current as Record<string, string>);
    if (verifiedActive) verifiedNext.delete('verifiedOnly'); else verifiedNext.set('verifiedOnly', 'true');

    return (
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-3">
            {pills(FORMATS,   'format',   'Format')}
            {pills(SCORINGS,  'scoring',  'Scoring')}
            {pills(SIZES,     'size',     'Size')}
            {pills(PLATFORMS, 'platform', 'Platform')}
            <div className="border-t border-gray-800/60 pt-3 space-y-3">
                {scoreFilter(
                    [{ label: '3★+', value: '3' }, { label: '4★+', value: '4' }, { label: '4.5★+', value: '4.5' }],
                    'minRating', 'Commissioner'
                )}
                {scoreFilter(
                    [{ label: 'Stab 40+', value: '40' }, { label: 'Stab 60+', value: '60' }, { label: 'Stab 80+', value: '80' }],
                    'minStability', 'Stability'
                )}
                {scoreFilter(
                    [{ label: 'Active 40+', value: '40' }, { label: 'Active 60+', value: '60' }, { label: 'Active 80+', value: '80' }],
                    'minActivity', 'Activity'
                )}
                <div className="flex flex-wrap gap-1.5 items-center">
                    <span className="text-[10px] uppercase tracking-wider text-gray-600 mr-1">Trust</span>
                    <Link
                        href={`/leaguefinder?${verifiedNext.toString()}`}
                        className={`text-xs px-2.5 py-1 rounded-full border transition ${
                            verifiedActive
                                ? 'bg-[#D4AF37] text-gray-950 border-[#D4AF37] font-bold'
                                : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-500'
                        }`}
                    >
                        Verified reviews only
                    </Link>
                </div>
                {scoreFilter(
                    [
                        { label: 'Reliable+ req',  value: '41' },
                        { label: 'Trusted+ req',   value: '61' },
                        { label: 'Elite only',     value: '81' },
                    ],
                    'minPrs', 'Min PRS'
                )}
                {/* Hide unproven toggle — shows leagues with any PRS gate */}
                {(() => {
                    const hideUnprovenActive = current.hideUnproven === 'true';
                    const hideUnprovenNext   = new URLSearchParams(current as Record<string, string>);
                    if (hideUnprovenActive) hideUnprovenNext.delete('hideUnproven');
                    else { hideUnprovenNext.set('hideUnproven', 'true'); hideUnprovenNext.delete('minPrs'); }
                    return (
                        <div className="flex flex-wrap gap-1.5 items-center">
                            <span className="text-[10px] uppercase tracking-wider text-gray-600 mr-1 invisible">.</span>
                            <Link
                                href={`/leaguefinder?${hideUnprovenNext.toString()}`}
                                className={`text-xs px-2.5 py-1 rounded-full border transition ${
                                    hideUnprovenActive
                                        ? 'bg-[#D4AF37] text-gray-950 border-[#D4AF37] font-bold'
                                        : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-500'
                                }`}
                            >
                                Vetted leagues only
                            </Link>
                        </div>
                    );
                })()}
            </div>
            {hasFilters && (
                <div className="pt-1">
                    <Link
                        href={`/leaguefinder?${clearParams.toString()}`}
                        className="text-xs text-gray-500 hover:text-gray-300 transition"
                    >
                        ✕ Clear all filters
                    </Link>
                </div>
            )}
        </div>
    );
}
