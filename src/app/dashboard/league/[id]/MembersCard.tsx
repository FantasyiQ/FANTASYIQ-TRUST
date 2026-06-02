'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';

// ── Types ─────────────────────────────────────────────────────────────────────

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
                    {member.lfCommissioner && member.lfCommissioner.reviewsCount > 0 && (
                        <span className="flex items-center gap-1.5">
                            <StarRow rating={member.lfCommissioner.avgRating} />
                            <span className="text-gray-600 text-[10px]">
                                {member.lfCommissioner.reviewsCount} review{member.lfCommissioner.reviewsCount !== 1 ? 's' : ''}
                            </span>
                        </span>
                    )}
                    {!member.userId && (
                        <span className="text-gray-700 text-[10px]">Not on FantasyiQ</span>
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

function MemberRow({ member }: { member: LeagueMemberData }) {
    const inner = (
        <div className="flex items-center gap-3">
            <Avatar id={member.sleeperAvatarId} name={member.displayName} size="sm" />
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-medium text-white text-sm truncate">
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
            </div>
        </div>
    );

    if (member.userId) {
        return (
            <Link
                href={`/leaguefinder/users/${member.userId}`}
                className="block px-4 py-3 hover:bg-gray-800/40 transition-colors rounded-lg"
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
    members: LeagueMemberData[];
}

export default function MembersCard({ members }: Props) {
    const [open, setOpen] = useState(false);

    if (members.length === 0) return null;

    const sorted       = sortMembers(members);
    const commissioner = sorted.find(m => m.isCommissioner);
    const rest         = sorted.filter(m => !m.isCommissioner);
    const registeredCount = members.filter(m => m.userId != null).length;

    return (
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
                        <span className="text-gray-600 font-normal text-base ml-2">({members.length})</span>
                    </h2>

                    <span className="inline-flex items-center gap-1.5 text-[10px] text-gray-500 bg-gray-800 border border-gray-700 px-2.5 py-1 rounded-full leading-none">
                        {registeredCount}/{members.length} on FantasyiQ
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
                                    <MemberRow key={m.sleeperUserId} member={m} />
                                ))}
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
