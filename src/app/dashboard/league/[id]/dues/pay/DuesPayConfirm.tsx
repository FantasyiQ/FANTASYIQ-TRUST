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
    const [accepted, setAccepted]   = useState(false);
    const [pending,  setPending]    = useState(false);
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
                <h2 className="text-lg font-bold text-white">Pay League Dues</h2>
                <p className="text-sm text-gray-400 mt-0.5">
                    {leagueName.replace(/\s*\(\d{4}\)\s*$/, '')} · {season} season
                </p>
            </div>

            <div className="flex items-center justify-between rounded-xl bg-gray-800 border border-gray-700 px-4 py-3">
                <span className="text-sm text-gray-300">{memberName}</span>
                <span className="text-xl font-black text-white">${amount.toFixed(2)}</span>
            </div>

            {/* ── TOS checkbox ────────────────────────────────── */}
            <div className="flex items-start gap-2">
                <input
                    id={checkboxId}
                    type="checkbox"
                    checked={accepted}
                    onChange={e => setAccepted(e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-[#D4AF37] cursor-pointer"
                />
                <label htmlFor={checkboxId} className="text-xs text-gray-400 leading-snug cursor-pointer">
                    I agree to the{' '}
                    <Link href="/terms" className="text-[#D4AF37] underline" target="_blank">Terms of Service</Link>
                    , including the <strong className="text-gray-300">No-Refund Policy</strong>.
                </label>
            </div>

            {/* ── Trust callout ───────────────────────────────── */}
            <div className="rounded-xl border border-gray-700 bg-gray-800/50 px-4 py-3.5 space-y-1">
                <p className="text-xs font-bold text-white flex items-center gap-1.5">
                    🛡️ Protected League Dues
                </p>
                <p className="text-xs text-gray-400 leading-snug">
                    Your payment is protected against fraud, chargebacks, and payment disputes through FantasyiQ Trust.
                    Commissioners manage all league funds and handle any refunds.
                </p>
            </div>

            <button
                type="submit"
                disabled={!accepted || pending}
                className="w-full py-3 rounded-xl font-bold text-sm bg-[#D4AF37] text-black hover:bg-[#BF9D2F] transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
                {pending ? 'Redirecting to payment…' : `Pay $${amount.toFixed(2)}`}
            </button>
        </form>
    );
}

