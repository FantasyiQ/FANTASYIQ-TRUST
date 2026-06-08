'use client';

import { useId, useState } from 'react';
import Link from 'next/link';

interface Props {
    leagueName:    string;
    season:        string;
    memberName:    string;
    amount:        number;
    createSession: () => Promise<void>;
}

export default function DuesPayConfirm({ leagueName, season, memberName, amount, createSession }: Props) {
    const [accepted, setAccepted] = useState(false);
    const [pending,  setPending]  = useState(false);
    const checkboxId = useId();

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!accepted) return;
        setPending(true);
        await createSession();
    }

    return (
        <form onSubmit={handleSubmit} className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-5">
            {/* ── Payment summary ─────────────────────────────── */}
            <div>
                <h2 className="text-lg font-bold text-white">Secure Your League Seat</h2>
                <p className="text-sm text-gray-400 mt-0.5">
                    {leagueName.replace(/\s*\(\d{4}\)\s*$/, '')} · {season} season
                </p>
            </div>

            <div className="flex items-center justify-between rounded-xl bg-gray-800 border border-gray-700 px-4 py-3">
                <div>
                    <p className="text-sm text-gray-300 font-medium">{memberName}</p>
                    <p className="text-xs text-gray-500 mt-0.5">League seat · {season}</p>
                </div>
                <span className="text-xl font-black text-white">${amount.toFixed(2)}</span>
            </div>

            {/* ── Seat purchase framing ────────────────────────── */}
            <div className="rounded-xl border border-gray-700 bg-gray-800/40 px-4 py-3.5 space-y-1.5">
                <p className="text-xs font-bold text-white">What you&apos;re paying for</p>
                <p className="text-xs text-gray-400 leading-snug">
                    Paying dues secures your seat in the league and adds your buy-in to the prize pool.
                    Like a tournament entry or concert ticket — once your seat is secured, the prize pool
                    is locked to protect every other member. If you leave the league, your seat and
                    buy-in remain in the pool.
                </p>
            </div>

            {/* ── League Integrity badge ───────────────────────── */}
            <div className="rounded-xl border border-[#D4AF37]/20 bg-[#D4AF37]/5 px-4 py-3.5 space-y-2">
                <p className="text-xs font-bold text-[#D4AF37]">League Integrity Protected</p>
                <ul className="space-y-1">
                    {[
                        'Paid seats are locked — commissioners cannot remove paid members or alter their prize pool allocations',
                        'Prize pool cannot be altered once dues are collected',
                        'Commissioners never have direct access to league funds',
                        'Payouts go directly to verified winners via Stripe',
                    ].map(item => (
                        <li key={item} className="flex items-start gap-1.5 text-xs text-gray-400">
                            <span className="text-[#D4AF37] mt-0.5 shrink-0">✓</span>
                            {item}
                        </li>
                    ))}
                </ul>
            </div>

            {/* ── Acknowledgment checkbox ──────────────────────── */}
            <div className="flex items-start gap-2">
                <input
                    id={checkboxId}
                    type="checkbox"
                    checked={accepted}
                    onChange={e => setAccepted(e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-[#D4AF37] cursor-pointer"
                />
                <label htmlFor={checkboxId} className="text-xs text-gray-400 leading-snug cursor-pointer">
                    I understand I am purchasing a seat in this league. My buy-in is added to the prize
                    pool and is <strong className="text-white">non-refundable</strong> — if I leave, my
                    seat stays in the pool. I agree to the{' '}
                    <Link href="/terms" className="text-[#D4AF37] underline" target="_blank">Terms of Service</Link>.
                </label>
            </div>

            <button
                type="submit"
                disabled={!accepted || pending}
                className="w-full py-3 rounded-xl font-bold text-sm bg-[#D4AF37] text-black hover:bg-[#BF9D2F] transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
                {pending ? 'Redirecting to payment…' : `Secure My Seat — $${amount.toFixed(2)}`}
            </button>
        </form>
    );
}
