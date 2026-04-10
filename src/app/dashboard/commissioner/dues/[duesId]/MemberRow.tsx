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

    const isPaid = member.duesStatus === 'paid';

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
            // Redirect to Stripe checkout
            window.location.href = data.url;
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
        <li className="px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
            <div>
                <p className="font-medium text-white text-sm">{member.displayName}</p>
                {member.teamName && <p className="text-gray-500 text-xs mt-0.5">{member.teamName}</p>}
                {member.email && <p className="text-gray-600 text-xs">{member.email}</p>}
                {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
            </div>
            <div className="flex items-center gap-3 shrink-0">
                {isPaid ? (
                    <div className="text-right">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-900/40 text-green-400 border border-green-800">
                            ✓ Paid ${buyInAmount.toFixed(2)}
                        </span>
                        {member.paidAt && (
                            <p className="text-gray-600 text-xs mt-0.5">
                                {member.paymentMethod === 'stripe_on_behalf' ? 'Paid by commissioner · ' : ''}
                                {new Date(member.paidAt).toLocaleDateString()}
                            </p>
                        )}
                    </div>
                ) : (
                    <div className="flex items-center gap-2">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-900/30 text-red-400 border border-red-900">
                            Unpaid
                        </span>
                        <button
                            onClick={payOnBehalf}
                            disabled={loading}
                            className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 font-semibold px-3 py-1.5 rounded-lg transition disabled:opacity-50">
                            {loading ? '...' : 'Pay on Behalf →'}
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
    );
}
