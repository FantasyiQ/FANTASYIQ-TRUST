export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import { auth }     from '@/lib/auth';
import { prisma }   from '@/lib/prisma';
import Link         from 'next/link';
import { StarRating }    from '@/components/leaguefinder/StarRating';
import PRSBadge          from '@/components/leaguefinder/PRSBadge';
import TrustScoreCard    from '@/components/leaguefinder/TrustScoreCard';

export default async function UserProfilePage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id }  = await params;
    const session = await auth();
    const isMe    = session?.user?.id === id;

    const [user, commissionerProfile, activeLeagueCount, vouchesReceived] = await Promise.all([
        prisma.user.findUnique({
            where:  { id },
            select: {
                id:         true,
                name:       true,
                trustScore: true,
                prsScore:   true,
                dssScore:   true,
                createdAt:  true,
                dssRecord:  true,
                prsRecord: {
                    select: {
                        seasonScore:       true,
                        retentionScore:    true,
                        engagementScore:   true,
                        commissionerTrust: true,
                        behaviorScore:     true,
                        prs:               true,
                    },
                },
                lfReviews: {
                    orderBy: [{ seasonYear: 'desc' }],
                    take:    50,
                    include: {
                        league:      { select: { id: true, name: true, platform: true, format: true } },
                        commissioner:{ select: { id: true, displayName: true } },
                    },
                },
            },
        }),
        prisma.lFCommissioner.findUnique({
            where:   { ownerId: id },
            include: { leagues: { select: { id: true, name: true } } },
        }),
        prisma.league.count({
            where: { userId: id, isHistorical: false },
        }),
        prisma.commissionerVouch.findMany({
            where:   { toUserId: id },
            orderBy: { createdAt: 'desc' },
            select:  {
                id:         true,
                vouchType:  true,
                season:     true,
                note:       true,
                createdAt:  true,
                fromUser:   { select: { id: true, name: true } },
                leagueDbId: true,
            },
        }),
    ]);

    if (!user) notFound();

    const verifiedCount = user.lfReviews.filter(r => r.verified).length;
    const prs           = user.prsRecord?.prs ?? user.prsScore ?? 0;

    // Unique leagues + format breakdown
    const leaguesMap = new Map(user.lfReviews.map(r => [r.league.id, r.league]));
    const leagues    = Array.from(leaguesMap.values());
    const byFormat   = leagues.reduce<Record<string, number>>((acc, l) => {
        acc[l.format] = (acc[l.format] ?? 0) + 1;
        return acc;
    }, {});
    const topFormat  = Object.entries(byFormat).sort((a, b) => b[1] - a[1])[0];

    // Activity heatmap — reviews per year
    const yearCounts = user.lfReviews.reduce<Record<number, number>>((acc, r) => {
        acc[r.seasonYear] = (acc[r.seasonYear] ?? 0) + 1;
        return acc;
    }, {});
    const currentYear = new Date().getFullYear();
    const minYear     = user.lfReviews.length > 0
        ? Math.min(...user.lfReviews.map(r => r.seasonYear))
        : currentYear - 4;
    const heatmapYears = Array.from(
        { length: currentYear - minYear + 1 },
        (_, i) => minYear + i,
    );

    // Badges
    const badges: { icon: string; label: string; color: BadgeColor }[] = [];
    if (user.trustScore >= 20)      badges.push({ icon: '⭐', label: 'Trusted Reviewer', color: 'gold' });
    if (user.trustScore >= 10)      badges.push({ icon: '✅', label: 'Reliable Player',   color: 'emerald' });
    if (verifiedCount >= 5)         badges.push({ icon: '🎖️', label: 'Veteran',           color: 'purple' });
    if (verifiedCount >= 3)         badges.push({ icon: '🔒', label: 'Verified Member',   color: 'sky' });
    if (user.lfReviews.length >= 3) badges.push({ icon: '📝', label: 'Active Reviewer',   color: 'gray' });
    if (commissionerProfile)        badges.push({ icon: '📋', label: 'Commissioner',       color: 'gold' });
    if (topFormat && topFormat[1] >= 3) badges.push({ icon: '🏈', label: `${topFormat[0]} Specialist`, color: 'sky' });

    return (
        <div className="min-h-screen bg-gray-950 text-white">
            <div className="max-w-3xl mx-auto px-4 py-10 space-y-8">

                {/* ── Breadcrumb ──────────────────────────────────────── */}
                <nav className="text-xs text-gray-600 flex items-center gap-1.5">
                    <Link href="/leaguefinder" className="hover:text-gray-400 transition">League Finder</Link>
                    <span>/</span>
                    <span className="text-white">{user.name ?? 'User'}</span>
                    {isMe && <span className="ml-2 text-[10px] text-[#D4AF37] font-bold">(you)</span>}
                </nav>

                {/* ── Profile card ─────────────────────────────────── */}
                <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6 space-y-4">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div>
                            <h1 className="text-2xl font-bold text-white">{user.name ?? 'Anonymous'}</h1>
                            <p className="text-xs text-gray-600 mt-0.5">
                                Member since {new Date(user.createdAt).getFullYear()}
                                {leagues.length > 0 && (
                                    <> · Plays in <span className="text-gray-400 font-semibold">{leagues.length} league{leagues.length !== 1 ? 's' : ''}</span></>
                                )}
                                {topFormat && topFormat[1] >= 2 && (
                                    <> · {topFormat[0]} specialist</>
                                )}
                            </p>
                        </div>
                        <div className="flex items-start gap-3">
                            <PRSBadge score={prs} />
                            <TrustScoreCard prsScore={prs} compact showImprove={false} />
                        </div>
                    </div>

                    {/* Stats row */}
                    <div className="grid grid-cols-4 gap-2">
                        <StatBox label="Reviews"          value={user.lfReviews.length} />
                        <StatBox label="Verified Seasons" value={verifiedCount} />
                        <StatBox label="Leagues"          value={leagues.length} />
                        <StatBox label="Comm. Leagues"    value={commissionerProfile?.leagues.length ?? 0} />
                    </div>

                    {/* Format breakdown */}
                    {Object.keys(byFormat).length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                            {Object.entries(byFormat)
                                .sort((a, b) => b[1] - a[1])
                                .map(([fmt, count]) => (
                                    <span
                                        key={fmt}
                                        className="text-[10px] px-2.5 py-1 rounded-full border bg-gray-800 border-gray-700 text-gray-400"
                                    >
                                        {fmt}: <span className="text-white font-bold">{count}</span>
                                    </span>
                                ))}
                        </div>
                    )}

                    {/* Badges */}
                    {badges.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                            {badges.map(b => (
                                <UserBadge key={b.label} icon={b.icon} label={b.label} color={b.color} />
                            ))}
                        </div>
                    )}
                </div>

                {/* ── PRS Breakdown ────────────────────────────────── */}
                <section className="space-y-3">
                    <h2 className="text-sm font-bold text-white uppercase tracking-wider">Player Reliability Score</h2>
                    <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-3">
                        <div className="flex items-center gap-3">
                            <PRSBadge score={prs} />
                            <div className="flex-1 space-y-2">
                                <PRSBar label="Season Reliability"  pts={user.prsRecord?.seasonScore       ?? 0} max={100} detail="verified seasons vs abandoned" />
                                <PRSBar label="Retention"           pts={user.prsRecord?.retentionScore    ?? 0} max={100} detail="leagues returned to over time" />
                                <PRSBar label="Engagement"          pts={user.prsRecord?.engagementScore   ?? 0} max={100} detail="lineups, trades & waiver activity" />
                                <PRSBar label="Commissioner Trust"  pts={user.prsRecord?.commissionerTrust ?? 0} max={100} detail="approvals, flags & endorsements" />
                                <PRSBar label="Behavior"            pts={user.prsRecord?.behaviorScore     ?? 0} max={100} detail="conduct & rule adherence" />
                            </div>
                        </div>
                        <div className="flex items-center justify-between">
                            {activeLeagueCount > 0 ? (
                                <p className="text-[10px] text-gray-500">
                                    <span className="text-gray-300 font-semibold">{activeLeagueCount}</span> active league{activeLeagueCount !== 1 ? 's' : ''} tracked
                                </p>
                            ) : (
                                <p className="text-[10px] text-gray-600">No synced leagues yet</p>
                            )}
                            {!user.prsRecord ? (
                                <p className="text-[10px] text-gray-600">Score updates nightly once leagues are synced</p>
                            ) : (
                                <p className="text-[10px] text-gray-600">Updates nightly</p>
                            )}
                        </div>
                    </div>
                </section>

                {/* ── Commissioner Vouches (public — flags hidden) ─── */}
                {vouchesReceived.some(v => v.vouchType !== 'flag') && (
                    <section className="space-y-3">
                        <h2 className="text-sm font-bold text-white uppercase tracking-wider">Commissioner Trust</h2>
                        <div className="space-y-2">
                            {vouchesReceived.filter(v => v.vouchType !== 'flag').map(v => {
                                const styles = {
                                    endorsement: 'border-[#D4AF37]/30 bg-[#D4AF37]/5 text-[#D4AF37]',
                                    approval:    'border-emerald-700/30 bg-emerald-900/10 text-emerald-400',
                                };
                                const labels = {
                                    endorsement: 'Endorsed',
                                    approval:    'Approved',
                                };
                                const style = styles[v.vouchType as keyof typeof styles] ?? styles.approval;
                                const label = labels[v.vouchType as keyof typeof labels] ?? v.vouchType;
                                return (
                                    <div key={v.id} className={`rounded-xl border px-4 py-3 ${style}`}>
                                        <div className="flex items-center justify-between gap-3 flex-wrap">
                                            <div>
                                                <span className="text-xs font-bold">{label}</span>
                                                <span className="text-[10px] opacity-60 ml-2">by {v.fromUser.name ?? 'A commissioner'} · {v.season} season</span>
                                            </div>
                                        </div>
                                        {v.note && (
                                            <p className="text-[11px] opacity-80 mt-1 leading-relaxed">{v.note}</p>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                )}

                {/* ── DSS Section ─────────────────────────────────── */}
                {user.dssRecord && (
                    <section className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h2 className="text-sm font-bold text-white uppercase tracking-wider">Dynasty Skill Score</h2>
                            <Link href="/dss/leaderboard" className="text-[10px] text-[#D4AF37] hover:opacity-80 transition">
                                View leaderboard →
                            </Link>
                        </div>
                        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-3">
                            <div className="flex items-center gap-3">
                                <DSSBadge score={user.dssRecord.dss} />
                                <div className="flex-1 space-y-2">
                                    <PRSBar label="Win Rate"        pts={user.dssRecord.winRateScore}   max={100} detail="weighted avg across leagues" />
                                    <PRSBar label="Points For"      pts={user.dssRecord.pfScore}        max={100} detail="PF percentile rank" />
                                    <PRSBar label="Playoff Rate"    pts={user.dssRecord.playoffScore}   max={100} detail="% of seasons in playoff position" />
                                    <PRSBar label="League Strength" pts={user.dssRecord.leagueStrScore} max={100} detail="avg opponent win rate" />
                                </div>
                            </div>
                            <p className="text-[10px] text-gray-600">
                                Based on {user.dssRecord.dynastyLeagues} dynasty league{user.dssRecord.dynastyLeagues !== 1 ? 's' : ''} · {user.dssRecord.totalGames} total games played
                            </p>
                        </div>
                    </section>
                )}

                {/* ── Trust Score Card (own profile only) ─────────── */}
                {isMe && (
                    <section className="space-y-3">
                        <h2 className="text-sm font-bold text-white uppercase tracking-wider">Your Trust Score</h2>
                        <TrustScoreCard prsScore={user.prsScore} />
                    </section>
                )}

                {/* ── Activity Heatmap ─────────────────────────────── */}
                {heatmapYears.length > 0 && (
                    <section className="space-y-3">
                        <h2 className="text-sm font-bold text-white uppercase tracking-wider">Activity</h2>
                        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
                            <div className="flex items-end gap-2 flex-wrap">
                                {heatmapYears.map(year => {
                                    const count = yearCounts[year] ?? 0;
                                    const intensity =
                                        count === 0 ? 'bg-gray-800 border-gray-700 text-gray-700' :
                                        count === 1 ? 'bg-[#D4AF37]/20 border-[#D4AF37]/30 text-[#D4AF37]/70' :
                                        count <= 3  ? 'bg-[#D4AF37]/40 border-[#D4AF37]/50 text-[#D4AF37]' :
                                                      'bg-[#D4AF37]/70 border-[#D4AF37] text-gray-950';
                                    return (
                                        <div key={year} className="flex flex-col items-center gap-1">
                                            <div
                                                className={`w-10 h-10 rounded-lg border flex items-center justify-center text-xs font-bold transition ${intensity}`}
                                                title={count > 0 ? `${count} review${count !== 1 ? 's' : ''} in ${year}` : `No reviews in ${year}`}
                                            >
                                                {count > 0 ? count : '—'}
                                            </div>
                                            <span className="text-[9px] text-gray-600">{year}</span>
                                        </div>
                                    );
                                })}
                            </div>
                            <p className="text-[10px] text-gray-700 mt-3">Reviews written per season</p>
                        </div>
                    </section>
                )}

                {/* ── Commissioner Profile ─────────────────────────── */}
                {commissionerProfile && (
                    <section className="space-y-3">
                        <h2 className="text-sm font-bold text-white uppercase tracking-wider">Commissioner</h2>
                        <Link
                            href={`/leaguefinder/commissioners/${commissionerProfile.id}`}
                            className="flex items-center justify-between rounded-xl border border-[#D4AF37]/30 bg-[#D4AF37]/5 px-4 py-3 hover:bg-[#D4AF37]/10 transition"
                        >
                            <div>
                                <div className="text-sm font-bold text-white">{commissionerProfile.displayName}</div>
                                <div className="text-[10px] text-gray-500 mt-0.5">
                                    {commissionerProfile.leagues.length} league{commissionerProfile.leagues.length !== 1 ? 's' : ''} listed
                                </div>
                            </div>
                            <span className="text-[#D4AF37] text-xs">View profile →</span>
                        </Link>
                    </section>
                )}

                {/* ── Leagues played in ────────────────────────────── */}
                {leagues.length > 0 && (
                    <section className="space-y-3">
                        <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                            Leagues Played In ({leagues.length})
                        </h2>
                        <div className="grid gap-2 sm:grid-cols-2">
                            {leagues.map(l => (
                                <Link
                                    key={l.id}
                                    href={`/leaguefinder/leagues/${l.id}`}
                                    className="rounded-xl border border-gray-800 bg-gray-900 p-3 hover:border-gray-700 transition"
                                >
                                    <div className="text-sm font-semibold text-white">{l.name}</div>
                                    <div className="text-[10px] text-gray-500 mt-0.5">
                                        {l.platform} · {l.format}
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </section>
                )}

                {/* ── Reviews written ──────────────────────────────── */}
                <section className="space-y-3">
                    <h2 className="text-sm font-bold text-white uppercase tracking-wider">Reviews Written</h2>
                    {user.lfReviews.length === 0 ? (
                        <p className="text-gray-600 text-sm">No reviews yet.</p>
                    ) : (
                        <div className="space-y-3">
                            {user.lfReviews.map(r => (
                                <div key={r.id} className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-2">
                                    <div className="flex items-start justify-between gap-3 flex-wrap">
                                        <div>
                                            <Link
                                                href={`/leaguefinder/leagues/${r.league.id}`}
                                                className="text-sm font-semibold text-white hover:text-[#D4AF37] transition"
                                            >
                                                {r.league.name}
                                            </Link>
                                            <div className="text-[10px] text-gray-600 mt-0.5">
                                                Commissioner:{' '}
                                                <Link
                                                    href={`/leaguefinder/commissioners/${r.commissioner.id}`}
                                                    className="hover:text-gray-400 transition"
                                                >
                                                    {r.commissioner.displayName}
                                                </Link>
                                                {' · '}{r.seasonYear} season
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <StarRating rating={r.ratingOverall} />
                                            {r.verified && (
                                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border bg-emerald-900/30 text-emerald-400 border-emerald-800">
                                                    Verified
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    {r.text && (
                                        <p className="text-xs text-gray-400 leading-relaxed">{r.text}</p>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatBox({ label, value }: { label: string; value: number }) {
    return (
        <div className="rounded-lg bg-gray-800/60 border border-gray-700/50 px-2 py-2.5 text-center">
            <div className="text-[9px] uppercase tracking-wider text-gray-500 leading-tight">{label}</div>
            <div className="text-lg font-bold text-white mt-0.5">{value}</div>
        </div>
    );
}

function DSSBadge({ score }: { score: number }) {
    const color =
        score >= 85 ? 'text-[#D4AF37] border-[#D4AF37]/50 bg-[#D4AF37]/10' :
        score >= 70 ? 'text-sky-400 border-sky-800 bg-sky-900/20' :
        score >= 50 ? 'text-gray-300 border-gray-600 bg-gray-800' :
                      'text-gray-500 border-gray-700 bg-gray-900';
    const label =
        score >= 85 ? 'Elite' :
        score >= 70 ? 'Solid' :
        score >= 50 ? 'Average' : 'Developing';
    return (
        <div className={`flex-shrink-0 rounded-xl border px-3 py-2 text-center min-w-[64px] ${color}`}>
            <div className="text-xl font-black leading-none">{score}</div>
            <div className="text-[9px] font-bold uppercase tracking-wider mt-0.5 opacity-80">DSS</div>
            <div className="text-[8px] opacity-60 mt-0.5">{label}</div>
        </div>
    );
}

function PRSBar({ label, pts, max, detail }: { label: string; pts: number; max: number; detail: string }) {
    const pct = max > 0 ? (pts / max) * 100 : 0;
    return (
        <div className="space-y-0.5">
            <div className="flex items-center justify-between text-[9px]">
                <span className="text-gray-500">{label}</span>
                <span className="text-gray-400 font-bold">{pts}/{max} <span className="text-gray-600 font-normal">({detail})</span></span>
            </div>
            <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden">
                <div
                    className="h-full rounded-full bg-[#D4AF37] transition-all"
                    style={{ width: `${pct}%` }}
                />
            </div>
        </div>
    );
}

type BadgeColor = 'gold' | 'emerald' | 'purple' | 'sky' | 'gray';

function UserBadge({ icon, label, color }: { icon: string; label: string; color: BadgeColor }) {
    const styles: Record<BadgeColor, string> = {
        gold:    'bg-[#D4AF37]/10 text-[#D4AF37]      border-[#D4AF37]/30',
        emerald: 'bg-emerald-900/20 text-emerald-400   border-emerald-800',
        purple:  'bg-purple-900/20 text-purple-400     border-purple-800',
        sky:     'bg-sky-900/20   text-sky-400         border-sky-800',
        gray:    'bg-gray-800     text-gray-400        border-gray-700',
    };
    return (
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border flex items-center gap-1 ${styles[color]}`}>
            <span>{icon}</span>{label}
        </span>
    );
}
