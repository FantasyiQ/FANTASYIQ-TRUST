export const dynamic = 'force-dynamic';

import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getLeagueUsers } from '@/lib/sleeper';

// ── Types ─────────────────────────────────────────────────────────────────────

interface EspnTeamRow {
    teamId:    number;
    name:      string;
    abbrev:    string;
    ownerId:   string | null;
    ownerName: string | null;
    wins:      number;
    losses:    number;
    ties:      number;
    fpts:      number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const POS_COLORS: Record<string, string> = {
    W: 'text-[#D4AF37]',
    L: 'text-red-400',
    T: 'text-gray-400',
};

function Record({ w, l, t }: { w: number; l: number; t: number }) {
    return (
        <span className="text-sm font-mono text-gray-300">
            <span className={POS_COLORS.W}>{w}</span>
            <span className="text-gray-600">-</span>
            <span className={POS_COLORS.L}>{l}</span>
            {t > 0 && <><span className="text-gray-600">-</span><span className={POS_COLORS.T}>{t}</span></>}
        </span>
    );
}

// ── ESPN members view ─────────────────────────────────────────────────────────

async function EspnMembersView({
    teams, mySwid, leagueName, season,
}: {
    teams: EspnTeamRow[]; mySwid: string | null; leagueName: string; season: string | null;
}) {
    // Match owners to FiQ accounts by SWID
    const ownerIds = teams.map(t => t.ownerId).filter(Boolean) as string[];
    const fiqUsers = ownerIds.length > 0
        ? await prisma.user.findMany({
            where:  { swid: { in: ownerIds } },
            select: { swid: true, name: true, id: true },
          })
        : [];
    const fiqBySWID = new Map(fiqUsers.map(u => [u.swid, u]));

    // Fallback match: DuesMember doesn't store an ESPN owner ID (only Sleeper
    // gets that), but it does link userId once someone pays — cross-reference
    // by team name against this league's dues roster so a real, paid-up member
    // whose User.swid is blank doesn't wrongly show as unregistered.
    const dues = await prisma.leagueDues.findFirst({
        where:  { leagueName: { equals: leagueName, mode: 'insensitive' }, season: season ?? undefined },
        select: { id: true },
    });
    const registeredTeamNames = new Set<string>();
    if (dues) {
        const duesLinks = await prisma.duesMember.findMany({
            where:  { leagueDuesId: dues.id, userId: { not: null } },
            select: { displayName: true },
        });
        duesLinks.forEach(d => registeredTeamNames.add(d.displayName.toLowerCase()));
    }

    const sorted = [...teams].sort((a, b) => {
        const wDiff = b.wins - a.wins;
        return wDiff !== 0 ? wDiff : b.fpts - a.fpts;
    });

    return (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
                <h2 className="font-semibold text-lg">League Members</h2>
                <span className="text-gray-500 text-sm">{teams.length} teams</span>
            </div>
            <div className="divide-y divide-gray-800/50">
                {sorted.map((team, i) => {
                    const displayName = team.name || team.abbrev || `Team ${team.teamId}`;
                    const hasAccount = (team.ownerId && fiqBySWID.has(team.ownerId))
                        || registeredTeamNames.has(displayName.toLowerCase());
                    const isMe       = mySwid && team.ownerId === mySwid;
                    const initials   = (team.ownerName ?? displayName)[0]?.toUpperCase() ?? '?';
                    return (
                        <div key={team.teamId} className={`flex items-center gap-4 px-5 py-3.5 ${isMe ? 'bg-[#D4AF37]/5' : 'hover:bg-gray-800/30'} transition`}>
                            <span className="text-gray-600 text-sm w-5 text-right shrink-0">{i + 1}</span>
                            <div className="w-9 h-9 rounded-full bg-gray-800 shrink-0 flex items-center justify-center text-sm font-bold text-gray-400">
                                {initials}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-medium text-sm text-white truncate">{displayName}</span>
                                    {isMe && (
                                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#D4AF37]/20 border border-[#D4AF37]/40 text-[#D4AF37]">You</span>
                                    )}
                                    {hasAccount && (
                                        <span className="text-[10px] text-emerald-400 font-semibold">✓ FiQ</span>
                                    )}
                                </div>
                                {team.ownerName && (
                                    <p className="text-gray-500 text-xs mt-0.5">{team.ownerName}</p>
                                )}
                            </div>
                            <div className="text-right shrink-0 space-y-0.5">
                                <Record w={team.wins} l={team.losses} t={team.ties} />
                                <p className="text-gray-600 text-xs">{team.fpts.toFixed(1)} pts</p>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ── Sleeper members view ──────────────────────────────────────────────────────

async function SleeperMembersView({
    leagueId,
    season,
    commissionerSleeperUserId,
    viewerSleeperUserId,
}: {
    leagueId:                 string;
    season:                   string | null;
    commissionerSleeperUserId: string | null;
    viewerSleeperUserId:       string | null;
}) {
    let members: Awaited<ReturnType<typeof getLeagueUsers>> = [];
    try { members = await getLeagueUsers(leagueId); } catch { /* Sleeper unreachable */ }

    if (members.length === 0) {
        return (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-10 text-center">
                <p className="text-gray-500 text-sm">No member data available — try resyncing the league.</p>
            </div>
        );
    }

    // Match Sleeper users to FiQ accounts. Primary signal is User.sleeperUserId
    // (set when someone connects Sleeper to their account), but that's blank for
    // users who registered another way (email/Google) — fall back to DuesMember,
    // which already links sleeperUserId -> userId once a member pays dues, so
    // someone can be a fully real, paid-up FiQ user without tripping the primary
    // check.
    const sleeperIds = members.map(m => m.user_id).filter(Boolean);
    const [fiqUsers, duesLinks] = sleeperIds.length > 0
        ? await Promise.all([
            prisma.user.findMany({
                where:  { sleeperUserId: { in: sleeperIds } },
                select: { sleeperUserId: true },
            }),
            prisma.duesMember.findMany({
                where:  { sleeperUserId: { in: sleeperIds }, userId: { not: null } },
                select: { sleeperUserId: true },
            }),
          ])
        : [[], []];
    const registeredSleeperIds = new Set<string>([
        ...fiqUsers.map(u => u.sleeperUserId).filter((id): id is string => !!id),
        ...duesLinks.map(d => d.sleeperUserId).filter((id): id is string => !!id),
    ]);

    const sorted = [...members].sort((a, b) => {
        const aIsComm = a.is_owner;
        const bIsComm = b.is_owner;
        if (aIsComm !== bIsComm) return aIsComm ? -1 : 1;
        return (a.display_name ?? '').localeCompare(b.display_name ?? '');
    });

    return (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
                <h2 className="font-semibold text-lg">League Members</h2>
                <span className="text-gray-500 text-sm">{members.length} members</span>
            </div>
            <div className="divide-y divide-gray-800/50">
                {sorted.map(m => {
                    const hasAccount = registeredSleeperIds.has(m.user_id);
                    const isMe = viewerSleeperUserId && m.user_id === viewerSleeperUserId;
                    const name = m.metadata?.team_name || m.display_name || m.username || 'Unknown';
                    const avatarId = m.avatar ?? null;
                    return (
                        <div key={m.user_id} className={`flex items-center gap-4 px-5 py-3.5 ${isMe ? 'bg-[#D4AF37]/5' : 'hover:bg-gray-800/30'} transition`}>
                            {avatarId ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                    src={`https://sleepercdn.com/avatars/thumbs/${avatarId}`}
                                    alt={name}
                                    className="w-9 h-9 rounded-full shrink-0 object-cover"
                                />
                            ) : (
                                <div className="w-9 h-9 rounded-full bg-gray-800 shrink-0 flex items-center justify-center text-sm font-bold text-gray-400">
                                    {name[0]?.toUpperCase() ?? '?'}
                                </div>
                            )}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-medium text-sm text-white truncate">{name}</span>
                                    {m.is_owner && (
                                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#D4AF37]/10 border border-[#D4AF37]/30 text-[#D4AF37]">Commish</span>
                                    )}
                                    {isMe && (
                                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-900/30 border border-blue-700/50 text-blue-400">You</span>
                                    )}
                                </div>
                                {m.display_name && m.metadata?.team_name && (
                                    <p className="text-gray-500 text-xs mt-0.5">@{m.display_name}</p>
                                )}
                            </div>
                            <div className="shrink-0">
                                {hasAccount ? (
                                    <span className="text-[10px] font-semibold text-emerald-400">✓ FiQ</span>
                                ) : (
                                    <span className="text-[10px] text-gray-700 italic">Not on FiQ</span>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function MembersPage({ params }: { params: Promise<{ id: string }> }) {
    const { id }    = await params;
    const session   = await auth();
    if (!session?.user?.id) redirect('/sign-in');

    const [league, dbUser] = await Promise.all([
        prisma.league.findUnique({
            where:  { id },
            select: {
                leagueId: true, leagueName: true, season: true,
                platform: true, standings: true, userId: true,
                sleeperUserId: true,
            },
        }),
        prisma.user.findUnique({
            where:  { id: session.user.id },
            select: { swid: true, sleeperUserId: true },
        }),
    ]);

    if (!league || league.userId !== session.user.id) notFound();

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-xl font-bold">Members</h1>
                <p className="text-gray-500 text-sm mt-0.5">{league.leagueName} · {league.season} Season</p>
            </div>

            {league.platform === 'espn' ? (
                <EspnMembersView
                    teams={(league.standings as EspnTeamRow[] | null) ?? []}
                    mySwid={dbUser?.swid ?? null}
                    leagueName={league.leagueName}
                    season={league.season}
                />
            ) : (
                <SleeperMembersView
                    leagueId={league.leagueId}
                    season={league.season}
                    commissionerSleeperUserId={league.sleeperUserId}
                    viewerSleeperUserId={dbUser?.sleeperUserId ?? null}
                />
            )}
        </div>
    );
}
