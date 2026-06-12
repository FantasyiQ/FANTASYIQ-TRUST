'use client';

import { useState, useCallback, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';

// ── Types ─────────────────────────────────────────────────────────────────────

export type VouchType = 'endorsement' | 'approval' | 'flag';

export interface LeagueMemberData {
    sleeperUserId:    string;
    displayName:      string;
    username:         string | null;
    /** Raw Sleeper avatar ID — component builds the CDN URL. */
    sleeperAvatarId:  string | null;
    isCommissioner:   boolean;
    isCoCommissioner: boolean;
    /** Our platform user ID — null if not registered. */
    userId:           string | null;
    /** PRS score 0–100, null if not registered. */
    prsScore:         number | null;
    /** Basic trust score, null if not registered. */
    trustScore:       number | null;
    /** LF commissioner profile, present only for the commissioner if claimed. */
    lfCommissioner: {
        id:           string;
        avgRating:    number;
        reviewsCount: number;
    } | null;
    /** Existing vouch from the viewing commissioner, null if none yet. */
    existingVouch: VouchType | null;
}

// ── PRS helpers ───────────────────────────────────────────────────────────────

function prsTierStyles(score: number): string {
    if (score >= 81) return 'bg-[#D4AF37]/10 border-[#D4AF37]/40 text-[#D4AF37]';
    if (score >= 61) return 'bg-emerald-900/20 border-emerald-500/40 text-emerald-400';
    if (score >= 41) return 'bg-amber-900/20 border-amber-500/40 text-amber-400';
    if (score >= 21) return 'bg-orange-900/20 border-orange-500/40 text-orange-400';
    return 'bg-gray-800/40 border-gray-700 text-gray-500';
}

function prsTierLabel(score: number): string {
    if (score >= 81) return 'Elite';
    if (score >= 61) return 'Trusted';
    if (score >= 41) return 'Reliable';
    if (score >= 21) return 'Developing';
    return 'Unproven';
}

// ── Avatar ────────────────────────────────────────────────────────────────────

function Avatar({ id, name, size }: { id: string | null; name: string; size: 'sm' | 'lg' }) {
    const dim   = size === 'lg' ? 56 : 36;
    const cls   = size === 'lg' ? 'rounded-full shrink-0' : 'rounded-full shrink-0';
    const fallback = size === 'lg'
        ? 'w-14 h-14 rounded-full bg-gray-800 flex items-center justify-center text-lg font-bold text-gray-500 shrink-0'
        : 'w-9 h-9 rounded-full bg-gray-800 flex items-center justify-center text-sm font-bold text-gray-600 shrink-0';

    if (!id) {
        return (
            <div className={fallback}>
                {name[0]?.toUpperCase() ?? '?'}
            </div>
        );
    }

    return (
        <Image
            src={`https://sleepercdn.com/avatars/thumbs/${id}`}
            alt={name}
            width={dim}
            height={dim}
            className={cls}
            unoptimized
        />
    );
}

// ── Star rating (for commissioner LF rating) ──────────────────────────────────

function StarRow({ rating }: { rating: number }) {
    return (
        <span className="flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map(n => (
                <svg key={n} className={`w-3 h-3 ${n <= Math.round(rating) ? 'text-[#D4AF37]' : 'text-gray-700'}`}
                    viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
            ))}
            <span className="text-gray-500 text-[10px] ml-1">{rating.toFixed(1)}</span>
        </span>
    );
}

// ── Commissioner profile block ────────────────────────────────────────────────

function CommissionerProfile({ member }: { member: LeagueMemberData }) {
    const inner = (
        <div className="flex items-center gap-4">
            <Avatar id={member.sleeperAvatarId} name={member.displayName} size="lg" />
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-white text-base leading-tight truncate">
                        {member.displayName}
                    </span>
                    <span className="inline-flex items-center gap-1 bg-[#D4AF37]/10 border border-[#D4AF37]/40 text-[#D4AF37] text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide shrink-0">
                        Commissioner
                    </span>
                </div>
                {member.username && (
                    <p className="text-gray-600 text-xs mt-0.5">@{member.username}</p>
                )}
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                    {member.prsScore !== null && (
                        <PRSBadge score={member.prsScore} />
                    )}
                    {member.lfCommissioner && member.lfCommissioner.reviewsCount > 0 && (
                        <span className="flex items-center gap-1.5">
                            <StarRow rating={member.lfCommissioner.avgRating} />
                            <span className="text-gray-600 text-[10px]">
                                {member.lfCommissioner.reviewsCount} review{member.lfCommissioner.reviewsCount !== 1 ? 's' : ''}
                            </span>
                        </span>
                    )}
                    {!member.userId && (
                        <span className="text-gray-700 text-[10px] italic">Not on FantasyiQ</span>
                    )}
                </div>
            </div>
        </div>
    );

    if (member.userId) {
        return (
            <Link
                href={`/leaguefinder/users/${member.userId}`}
                className="block rounded-xl p-4 bg-gray-800/30 hover:bg-gray-800/60 border border-gray-800 hover:border-[#D4AF37]/30 transition-all group"
            >
                {inner}
            </Link>
        );
    }

    return (
        <div className="rounded-xl p-4 bg-gray-800/30 border border-gray-800">
            {inner}
        </div>
    );
}

// ── Member row ────────────────────────────────────────────────────────────────

function PRSBadge({ score }: { score: number }) {
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold border ${prsTierStyles(score)}`}>
            <span className="font-black">{score}</span>
            <span className="opacity-70 font-semibold">PRS</span>
        </span>
    );
}

const VOUCH_BADGE: Record<VouchType, string> = {
    endorsement: 'bg-[#D4AF37]/10 border-[#D4AF37]/40 text-[#D4AF37]',
    approval:    'bg-emerald-900/20 border-emerald-700/50 text-emerald-400',
    flag:        'bg-red-900/20 border-red-700/50 text-red-400',
};
const VOUCH_LABEL: Record<VouchType, string> = {
    endorsement: 'Endorsed',
    approval:    'Approved',
    flag:        'Flagged',
};

interface MemberRowProps {
    member:             LeagueMemberData;
    isViewerCommissioner: boolean;
    onVouchClick:       (member: LeagueMemberData) => void;
}

function MemberRow({ member, isViewerCommissioner, onVouchClick }: MemberRowProps) {
    const showVouch = isViewerCommissioner && !!member.userId && !member.isCommissioner;

    const inner = (
        <div className="flex items-center gap-3">
            <Avatar id={member.sleeperAvatarId} name={member.displayName} size="sm" />
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`font-medium text-sm truncate ${member.userId ? 'text-white group-hover:text-[#D4AF37] transition-colors' : 'text-gray-400'}`}>
                        {member.displayName}
                    </span>
                    {member.isCoCommissioner && (
                        <span className="inline-flex items-center bg-gray-800 border border-gray-700 text-gray-400 text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide shrink-0">
                            Co-Comm
                        </span>
                    )}
                </div>
                {member.username && (
                    <p className="text-gray-700 text-[11px]">@{member.username}</p>
                )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
                {showVouch && (
                    <button
                        type="button"
                        onClick={e => { e.preventDefault(); e.stopPropagation(); onVouchClick(member); }}
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border transition shrink-0 ${
                            member.existingVouch
                                ? VOUCH_BADGE[member.existingVouch]
                                : 'bg-gray-800/60 border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-300'
                        }`}
                    >
                        {member.existingVouch ? VOUCH_LABEL[member.existingVouch] : 'Vouch'}
                    </button>
                )}
                {member.prsScore !== null
                    ? <PRSBadge score={member.prsScore} />
                    : <span className="text-gray-700 text-[10px] italic">Not on FiQ</span>
                }
            </div>
        </div>
    );

    if (member.userId) {
        return (
            <Link
                href={`/leaguefinder/users/${member.userId}`}
                className="group block px-4 py-3 hover:bg-gray-800/40 transition-colors rounded-lg"
            >
                {inner}
            </Link>
        );
    }

    return (
        <div className="px-4 py-3">
            {inner}
        </div>
    );
}

// ── Vouch Modal ───────────────────────────────────────────────────────────────

const VOUCH_OPTIONS: { type: VouchType; label: string; sublabel: string; color: string; pts: string }[] = [
    { type: 'endorsement', label: 'Endorse',  sublabel: 'Great league member',   color: 'border-[#D4AF37]/50 bg-[#D4AF37]/10 text-[#D4AF37]',    pts: '+40 PRS' },
    { type: 'approval',    label: 'Approve',  sublabel: 'Reliable, no issues',   color: 'border-emerald-600/50 bg-emerald-900/20 text-emerald-400', pts: '+25 PRS' },
    { type: 'flag',        label: 'Flag',     sublabel: 'Problems or concerns',  color: 'border-red-700/50 bg-red-900/20 text-red-400',            pts: '−40 PRS' },
];

interface VouchModalProps {
    member:      LeagueMemberData;
    leagueDbId:  string;
    season:      string;
    onClose:     () => void;
    onSubmitted: (userId: string, vouchType: VouchType) => void;
}

function VouchModal({ member, leagueDbId, season, onClose, onSubmitted }: VouchModalProps) {
    const [selected, setSelected] = useState<VouchType | null>(member.existingVouch);
    const [note, setNote]         = useState('');
    const [loading, setLoading]   = useState(false);
    const [error, setError]       = useState<string | null>(null);

    async function submit() {
        if (!selected || !member.userId) return;
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/commish/vouch', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ toUserId: member.userId, leagueDbId, season, vouchType: selected, note: note.trim() || undefined }),
            });
            if (!res.ok) {
                const d = await res.json() as { error?: string };
                setError(d.error ?? 'Failed to save vouch');
                return;
            }
            onSubmitted(member.userId!, selected);
            onClose();
        } catch {
            setError('Network error — try again');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-label="Commissioner Vouch"
        >
            <div
                className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-sm space-y-4 shadow-2xl"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center justify-between">
                    <h3 className="font-bold text-white">Commissioner Vouch</h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-white transition text-lg leading-none">&times;</button>
                </div>

                <p className="text-xs text-gray-400">
                    Vouch for <span className="text-white font-semibold">{member.displayName}</span> based on their conduct in your league.
                    Your vouch affects their Player Reliability Score.
                </p>

                <div className="space-y-2">
                    {VOUCH_OPTIONS.map(opt => (
                        <button
                            key={opt.type}
                            type="button"
                            onClick={() => setSelected(opt.type)}
                            className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition text-left ${
                                selected === opt.type
                                    ? opt.color
                                    : 'border-gray-700 bg-gray-800/40 text-gray-300 hover:border-gray-600 hover:bg-gray-800'
                            }`}
                        >
                            <div>
                                <div className="font-semibold text-sm">{opt.label}</div>
                                <div className="text-[10px] opacity-70 mt-0.5">{opt.sublabel}</div>
                            </div>
                            <span className="text-[11px] font-bold shrink-0 ml-3 opacity-80">{opt.pts}</span>
                        </button>
                    ))}
                </div>

                <div>
                    <textarea
                        value={note}
                        onChange={e => setNote(e.target.value)}
                        placeholder="Optional note (not public)"
                        rows={2}
                        maxLength={300}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-600 resize-none focus:outline-none focus:border-gray-500"
                    />
                </div>

                {error && <p className="text-red-400 text-xs">{error}</p>}

                <div className="flex gap-2">
                    <button
                        onClick={onClose}
                        className="flex-1 px-4 py-2 rounded-lg border border-gray-700 text-gray-400 text-sm hover:border-gray-500 transition"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={submit}
                        disabled={!selected || loading}
                        className="flex-1 px-4 py-2 rounded-lg bg-[#D4AF37] text-gray-950 text-sm font-bold disabled:opacity-40 hover:bg-[#BF9D2F] transition"
                    >
                        {loading ? 'Saving…' : 'Save Vouch'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Sorting ───────────────────────────────────────────────────────────────────

function sortMembers(members: LeagueMemberData[]): LeagueMemberData[] {
    return [...members].sort((a, b) => {
        if (a.isCommissioner !== b.isCommissioner) return a.isCommissioner ? -1 : 1;
        if (a.isCoCommissioner !== b.isCoCommissioner) return a.isCoCommissioner ? -1 : 1;
        const prsA = a.prsScore ?? -1;
        const prsB = b.prsScore ?? -1;
        if (prsB !== prsA) return prsB - prsA;
        return a.displayName.localeCompare(b.displayName);
    });
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
    members:              LeagueMemberData[];
    isViewerCommissioner: boolean;
    leagueDbId:           string;
    season:               string;
}

export default function MembersCard({ members, isViewerCommissioner, leagueDbId, season }: Props) {
    const [open, setOpen]             = useState(false);
    const [vouchTarget, setVouchTarget] = useState<LeagueMemberData | null>(null);
    const [localMembers, setLocalMembers] = useState(members);

    const handleVouchSubmitted = useCallback((userId: string, vouchType: VouchType) => {
        setLocalMembers(prev => prev.map(m =>
            m.userId === userId ? { ...m, existingVouch: vouchType } : m
        ));
    }, []);

    if (localMembers.length === 0) return null;

    const sorted       = sortMembers(localMembers);
    const commissioner = sorted.find(m => m.isCommissioner);
    const rest         = sorted.filter(m => !m.isCommissioner);
    const registeredCount = localMembers.filter(m => m.userId != null).length;

    return (
        <>
            {vouchTarget && (
                <VouchModal
                    member={vouchTarget}
                    leagueDbId={leagueDbId}
                    season={season}
                    onClose={() => setVouchTarget(null)}
                    onSubmitted={handleVouchSubmitted}
                />
            )}

            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                {/* ── Expandable header ─────────────────────────────────────────── */}
                <button
                    type="button"
                    onClick={() => setOpen(o => !o)}
                    className="w-full text-left px-6 py-4 flex items-center justify-between hover:bg-gray-800/40 transition-colors"
                >
                    <div className="flex items-center gap-3 flex-wrap">
                        <h2 className="font-semibold text-lg leading-none">
                            Members
                            <span className="text-gray-600 font-normal text-base ml-2">({localMembers.length})</span>
                        </h2>

                        <span className="inline-flex items-center gap-1.5 text-[10px] text-gray-500 bg-gray-800 border border-gray-700 px-2.5 py-1 rounded-full leading-none">
                            {registeredCount}/{localMembers.length} on FantasyiQ
                        </span>
                    </div>

                    {/* Chevron */}
                    <svg
                        className={`w-4 h-4 text-gray-500 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
                        viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                </button>

                {/* ── Expanded content ──────────────────────────────────────────── */}
                {open && (
                    <>
                        <div className="px-6 py-5 space-y-4 border-t border-gray-800">
                            {/* Commissioner profile */}
                            {commissioner && (
                                <CommissionerProfile member={commissioner} />
                            )}

                            {/* Divider */}
                            {commissioner && rest.length > 0 && (
                                <div className="border-t border-gray-800" />
                            )}

                            {/* Member list */}
                            {rest.length > 0 && (
                                <div className="space-y-0.5 -mx-2">
                                    {rest.map(m => (
                                        <MemberRow
                                            key={m.sleeperUserId}
                                            member={m}
                                            isViewerCommissioner={isViewerCommissioner}
                                            onVouchClick={setVouchTarget}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </>
    );
}
