import { prisma }  from '@/lib/prisma';
import { auth }    from '@/lib/auth';
import Link        from 'next/link';
import Image       from 'next/image';
import type { Metadata } from 'next';

export const revalidate = 86400;

export const metadata: Metadata = {
    title:       'Dynasty Skill Leaderboard | FiQ',
    description: 'Top dynasty fantasy football players ranked by Dynasty Skill Score (DSS).',
};

const STALE_HOURS = 48;
const MIN_GAMES   = 4;

function dssTier(score: number) {
    if (score >= 85) return { label: 'Elite',      color: 'text-[#D4AF37] border-[#D4AF37]/50 bg-[#D4AF37]/10' };
    if (score >= 70) return { label: 'Solid',      color: 'text-sky-400   border-sky-800        bg-sky-900/20' };
    if (score >= 50) return { label: 'Average',    color: 'text-gray-300  border-gray-600       bg-gray-800' };
    return               { label: 'Developing', color: 'text-gray-500  border-gray-700       bg-gray-900' };
}

function rankStyle(rank: number) {
    if (rank === 1) return 'text-[#D4AF37] font-black';
    if (rank === 2) return 'text-gray-300  font-black';
    if (rank === 3) return 'text-amber-700 font-black';
    return 'text-gray-600 font-bold';
}

export default async function DssLeaderboardPage() {
    const session = await auth();
    const cutoff  = new Date(Date.now() - STALE_HOURS * 60 * 60 * 1000);

    const rows = await prisma.dssScore.findMany({
        where: {
            totalGames:     { gte: MIN_GAMES },
            dynastyLeagues: { gte: 1 },
            computedAt:     { gte: cutoff },
        },
        orderBy: [
            { dss:            'desc' },
            { totalGames:     'desc' },
            { dynastyLeagues: 'desc' },
        ],
        take: 500,
        select: {
            userId:         true,
            dss:            true,
            dynastyLeagues: true,
            totalGames:     true,
            winRateScore:   true,
            pfScore:        true,
            playoffScore:   true,
            leagueStrScore: true,
            user: {
                select: { name: true, image: true },
            },
        },
    });

    const meRank = session?.user?.id
        ? rows.findIndex(r => r.userId === session.user.id) + 1
        : 0;

    return (
        <div className="min-h-screen bg-gray-950 text-white">
            <div className="max-w-4xl mx-auto px-4 py-10 space-y-8">

                {/* ── Header ─────────────────────────────────────── */}
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <Link href="/leaguefinder" className="text-xs text-gray-600 hover:text-gray-400 transition">
                            League Finder
                        </Link>
                        <span className="text-gray-700">/</span>
                        <span className="text-xs text-white">DSS Leaderboard</span>
                    </div>
                    <h1 className="text-3xl font-black text-white tracking-tight">Dynasty Skill Leaderboard</h1>
                    <p className="text-sm text-gray-500">
                        Top dynasty players across all connected leagues · Scores updated nightly
                    </p>
                </div>

                {/* ── My rank callout ────────────────────────────── */}
                {meRank > 0 && (
                    <div className="rounded-xl border border-[#D4AF37]/30 bg-[#D4AF37]/5 px-4 py-3 flex items-center justify-between">
                        <span className="text-sm text-gray-300">Your current rank</span>
                        <span className="text-xl font-black text-[#D4AF37]">#{meRank}</span>
                    </div>
                )}

                {/* ── Legend ─────────────────────────────────────── */}
                <div className="flex flex-wrap gap-2 text-[10px]">
                    {(['Elite', 'Solid', 'Average', 'Developing'] as const).map(tier => {
                        const scores: Record<string, string> = {
                            Elite: '85–100', Solid: '70–84', Average: '50–69', Developing: '0–49',
                        };
                        const tier_ = dssTier(tier === 'Elite' ? 90 : tier === 'Solid' ? 75 : tier === 'Average' ? 55 : 30);
                        return (
                            <span key={tier} className={`px-2.5 py-1 rounded-full border font-bold ${tier_.color}`}>
                                {tier} {scores[tier]}
                            </span>
                        );
                    })}
                    <span className="px-2.5 py-1 rounded-full border border-gray-800 bg-gray-900 text-gray-600 ml-auto">
                        Min 4 dynasty games · Dynasty leagues only
                    </span>
                </div>

                {/* ── Empty state ─────────────────────────────────── */}
                {rows.length === 0 ? (
                    <div className="rounded-2xl border border-gray-800 bg-gray-900 p-12 text-center space-y-2">
                        <div className="text-3xl">🏆</div>
                        <p className="text-gray-400 font-semibold">No scores yet</p>
                        <p className="text-xs text-gray-600">
                            DSS scores are computed nightly. Check back after 4:30am UTC.
                        </p>
                    </div>
                ) : (
                    <>
                        {/* ── Desktop table ───────────────────────── */}
                        <div className="hidden sm:block rounded-2xl border border-gray-800 bg-gray-900 overflow-hidden">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-gray-800 text-[10px] uppercase tracking-wider text-gray-600">
                                        <th className="text-left px-4 py-3 w-12">Rank</th>
                                        <th className="text-left px-4 py-3">Player</th>
                                        <th className="text-center px-4 py-3">DSS</th>
                                        <th className="text-center px-4 py-3">Tier</th>
                                        <th className="text-center px-4 py-3">Leagues</th>
                                        <th className="text-center px-4 py-3">Games</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-800/50">
                                    {rows.map((row, i) => {
                                        const rank   = i + 1;
                                        const tier   = dssTier(row.dss);
                                        const isMe   = session?.user?.id === row.userId;
                                        return (
                                            <tr
                                                key={row.userId}
                                                className={`group transition hover:bg-gray-800/40 ${isMe ? 'bg-[#D4AF37]/5' : ''}`}
                                            >
                                                <td className={`px-4 py-3 text-sm tabular-nums ${rankStyle(rank)}`}>
                                                    {rank <= 3 ? (rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉') : `#${rank}`}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <Link
                                                        href={`/leaguefinder/users/${row.userId}`}
                                                        className="flex items-center gap-2.5 hover:opacity-80 transition"
                                                    >
                                                        {row.user.image ? (
                                                            <Image
                                                                src={row.user.image}
                                                                alt=""
                                                                width={28}
                                                                height={28}
                                                                className="rounded-full"
                                                            />
                                                        ) : (
                                                            <div className="w-7 h-7 rounded-full bg-gray-700 flex items-center justify-center text-[10px] font-bold text-gray-400">
                                                                {(row.user.name ?? '?')[0]?.toUpperCase()}
                                                            </div>
                                                        )}
                                                        <span className={`font-semibold ${isMe ? 'text-[#D4AF37]' : 'text-white'}`}>
                                                            {row.user.name ?? 'Anonymous'}
                                                            {isMe && <span className="ml-1.5 text-[9px] font-bold text-[#D4AF37]/70">(you)</span>}
                                                        </span>
                                                    </Link>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className="text-lg font-black tabular-nums text-white">{row.dss}</span>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${tier.color}`}>
                                                        {tier.label}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-center text-gray-400 tabular-nums">
                                                    {row.dynastyLeagues}
                                                </td>
                                                <td className="px-4 py-3 text-center text-gray-500 tabular-nums text-xs">
                                                    {row.totalGames}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* ── Mobile cards ────────────────────────── */}
                        <div className="sm:hidden space-y-2">
                            {rows.map((row, i) => {
                                const rank = i + 1;
                                const tier = dssTier(row.dss);
                                const isMe = session?.user?.id === row.userId;
                                return (
                                    <Link
                                        key={row.userId}
                                        href={`/leaguefinder/users/${row.userId}`}
                                        className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition hover:border-gray-700 ${
                                            isMe ? 'border-[#D4AF37]/30 bg-[#D4AF37]/5' : 'border-gray-800 bg-gray-900'
                                        }`}
                                    >
                                        <span className={`text-sm w-8 shrink-0 ${rankStyle(rank)}`}>
                                            {rank <= 3 ? (rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉') : `#${rank}`}
                                        </span>

                                        {row.user.image ? (
                                            <Image src={row.user.image} alt="" width={32} height={32} className="rounded-full shrink-0" />
                                        ) : (
                                            <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-xs font-bold text-gray-400 shrink-0">
                                                {(row.user.name ?? '?')[0]?.toUpperCase()}
                                            </div>
                                        )}

                                        <div className="flex-1 min-w-0">
                                            <div className={`font-semibold text-sm truncate ${isMe ? 'text-[#D4AF37]' : 'text-white'}`}>
                                                {row.user.name ?? 'Anonymous'}
                                            </div>
                                            <div className="text-[10px] text-gray-500">
                                                {row.dynastyLeagues} league{row.dynastyLeagues !== 1 ? 's' : ''} · {row.totalGames} games
                                            </div>
                                        </div>

                                        <div className="text-right shrink-0">
                                            <div className="text-xl font-black text-white">{row.dss}</div>
                                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${tier.color}`}>
                                                {tier.label}
                                            </span>
                                        </div>
                                    </Link>
                                );
                            })}
                        </div>

                        <p className="text-[10px] text-gray-700 text-center">
                            Showing {rows.length} eligible dynasty players · Updated nightly at 4:30am UTC
                        </p>
                    </>
                )}
            </div>
        </div>
    );
}
