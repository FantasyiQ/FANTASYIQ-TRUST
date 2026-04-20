'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Member {
    id: string;
    displayName: string;
    teamName: string | null;
    email: string | null;
    duesStatus: string;
    paidAt: Date | null;
    paymentMethod: string | null;
}

interface Props {
    member: Member;
    duesId: string;
    buyInAmount: number;
    potWhole: boolean;
    commissionerId: string;
}

export default function MemberRow({ member, duesId, buyInAmount }: Props) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [showModal, setShowModal] = useState(false);

    const isPaid   = member.duesStatus === 'paid';
    const isStripe = member.paymentMethod === 'stripe_direct' || member.paymentMethod === 'stripe_on_behalf';
    const isManual = member.paymentMethod === 'manual';

    async function payOnBehalf() {
        setError('');
        setLoading(true);
        try {
            const res = await fetch('/api/dues/members/pay-on-behalf', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ memberId: member.id, duesId }),
            });
            const data = await res.json();
            if (!res.ok) { setError(data.error ?? 'Failed.'); setLoading(false); return; }
            window.location.href = data.url;
        } catch {
            setError('Something went wrong.');
            setLoading(false);
        }
    }

    async function markPaidManually() {
        setShowModal(false);
        setError('');
        setLoading(true);
        try {
            const res = await fetch(`/api/dues/${duesId}/member-status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ memberId: member.id, status: 'paid' }),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error ?? 'Failed to mark as paid. Make sure you have enough collected funds.');
                setLoading(false);
                return;
            }
            router.refresh();
        } catch {
            setError('Something went wrong.');
            setLoading(false);
        }
    }

    async function removeMember() {
        if (!confirm(`Remove ${member.displayName} from the roster?`)) return;
        setLoading(true);
        try {
            const res = await fetch('/api/dues/members/remove', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ memberId: member.id, duesId }),
            });
            if (!res.ok) { setLoading(false); return; }
            router.refresh();
        } catch {
            setLoading(false);
        }
    }

    return (
        <>
            <li className="px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                    <p className="font-medium text-white text-sm">{member.displayName}</p>
                    {member.teamName && <p className="text-gray-500 text-xs mt-0.5">{member.teamName}</p>}
                    {member.email && <p className="text-gray-600 text-xs">{member.email}</p>}
                    {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
                </div>

                <div className="flex items-center gap-3 shrink-0 flex-wrap">
                    {isPaid ? (
                        <div className="text-right space-y-0.5">
                            {/* Payment method badge */}
                            {isStripe && (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-900/40 text-green-400 border border-green-800">
                                    ✓ Verified Payment — ${buyInAmount.toFixed(2)}
                                </span>
                            )}
                            {isManual && (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-800 text-gray-400 border border-gray-700">
                                    Commissioner Entered — ${buyInAmount.toFixed(2)}
                                </span>
                            )}
                            {!isStripe && !isManual && (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-900/40 text-green-400 border border-green-800">
                                    ✓ Paid ${buyInAmount.toFixed(2)}
                                </span>
                            )}
                            {member.paidAt && (
                                <p className="text-gray-600 text-xs">
                                    {isStripe ? 'Via Stripe · ' : isManual ? 'Manual entry · ' : ''}
                                    {new Date(member.paidAt).toLocaleDateString()}
                                </p>
                            )}
                        </div>
                    ) : (
                        <div className="flex items-center gap-2">
                            {/* Unpaid badge */}
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-900/30 text-red-400 border border-red-900">
                                Unpaid
                            </span>
                            {/* Pay on behalf (Stripe — recommended) */}
                            <button
                                onClick={payOnBehalf}
                                disabled={loading}
                                className="text-xs bg-[#C8A951]/10 hover:bg-[#C8A951]/20 text-[#C8A951] border border-[#C8A951]/30 font-semibold px-3 py-1.5 rounded-lg transition disabled:opacity-50">
                                {loading ? '...' : 'Pay on Behalf →'}
                            </button>
                            {/* Record manual (secondary, less prominent) */}
                            <button
                                onClick={() => setShowModal(true)}
                                disabled={loading}
                                className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-500 border border-gray-700 font-medium px-2.5 py-1.5 rounded-lg transition disabled:opacity-50">
                                Record Manual
                            </button>
                        </div>
                    )}
                    {!isPaid && (
                        <button
                            onClick={removeMember}
                            disabled={loading}
                            className="text-gray-700 hover:text-red-400 text-xs transition disabled:opacity-50">
                            ✕
                        </button>
                    )}
                </div>
            </li>

            {/* Manual payment warning modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl">
                        <div className="flex items-start gap-3">
                            <span className="text-amber-400 text-xl shrink-0 mt-0.5">⚠</span>
                            <div>
                                <h3 className="font-bold text-white">Manual Payment (Not Recommended)</h3>
                                <p className="text-gray-400 text-sm mt-2 leading-relaxed">
                                    Manual payments rely on commissioner accuracy and are not visible to the league. For full transparency and automatic pot tracking, members should pay through their own account.
                                </p>
                                <p className="text-gray-600 text-xs mt-2">
                                    Make sure you have recorded the cash received before marking as paid.
                                </p>
                            </div>
                        </div>
                        <div className="flex gap-3 pt-1">
                            <button
                                onClick={() => setShowModal(false)}
                                className="flex-1 bg-[#C8A951] hover:bg-[#b8992f] text-black font-bold py-2.5 rounded-xl text-sm transition"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={markPaidManually}
                                disabled={loading}
                                className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 font-semibold py-2.5 rounded-xl text-sm transition border border-gray-700 disabled:opacity-50"
                            >
                                {loading ? '…' : 'Continue Anyway'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
