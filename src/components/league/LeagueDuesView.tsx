import Link from 'next/link';
import type { LeagueDuesData } from '@/lib/league/getLeagueDues';

function statusBadge(status: string) {
    switch (status) {
        case 'paid':           return 'bg-green-900/40 text-green-400 border-green-800';
        case 'unpaid':         return 'bg-red-900/30 text-red-400 border-red-800';
        case 'pending_refund': return 'bg-yellow-900/30 text-yellow-400 border-yellow-800';
        default:               return 'bg-gray-800 text-gray-500 border-gray-700';
    }
}

function statusLabel(status: string) {
    switch (status) {
        case 'paid':           return 'Paid';
        case 'unpaid':         return 'Unpaid';
        case 'pending_refund': return 'Pending Refund';
        default:               return status;
    }
}

function methodLabel(method: string | null) {
    switch (method) {
        case 'stripe_direct':    return 'Stripe';
        case 'stripe_on_behalf': return 'Stripe';
        case 'manual':           return 'Manual';
        default:                 return null;
    }
}

export default function LeagueDuesView({
    league, duesId, buyInAmount, isCommissioner, currentUserId,
    pot, payments, members, payouts,
}: LeagueDuesData) {
    const myMember      = members.find(m => m.userId === currentUserId) ?? null;
    const payoutTotal   = payouts.reduce((s, p) => s + p.amount, 0);
    const fullPot       = pot?.full ?? 0;
    const payoutBalanced = pot ? Math.abs(payoutTotal - fullPot) < 0.01 : false;
    const potWhole      = pot ? pot.total >= pot.full && members.length >= (pot.paidCount + pot.unpaidCount) : false;

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-2xl font-bold">League Dues &amp; Payouts</h1>
                    <p className="text-gray-400 text-sm mt-0.5">{league.leagueName} · {league.season} Season</p>
                </div>
                {isCommissioner && duesId && (
                    <Link href={`/dashboard/commissioner/dues/${duesId}`}
                        className="shrink-0 bg-[#C8A951] hover:bg-[#b8992f] text-gray-950 font-bold px-4 py-2 rounded-lg text-sm transition">
                        Full Management →
                    </Link>
                )}
            </div>

            {/* No dues */}
            {!pot && (
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-10 text-center space-y-3">
                    <div className="text-4xl">💰</div>
                    <h2 className="text-lg font-bold">No Dues Tracking Yet</h2>
                    {isCommissioner ? (
                        <>
                            <p className="text-gray-400 text-sm max-w-sm mx-auto">
                                Set up dues tracking to monitor buy-ins, pot totals, and payout results.
                            </p>
                            <Link href="/dashboard/commissioner/dues"
                                className="inline-block bg-[#C8A951] hover:bg-[#b8992f] text-gray-950 font-bold px-6 py-2.5 rounded-lg transition text-sm mt-2">
                                Set Up Dues
                            </Link>
                        </>
                    ) : (
                        <p className="text-gray-500 text-sm max-w-sm mx-auto">
                            Your commissioner hasn&apos;t set up dues tracking yet.
                        </p>
                    )}
                </div>
            )}

            {/* Pot summary */}
            {pot && (
                <>
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-5">
                        <div className="flex items-center justify-between gap-4">
                            <h2 className="font-bold text-lg">League Pot</h2>
                            <span className={`text-sm font-semibold ${potWhole ? 'text-green-400' : 'text-yellow-400'}`}>
                                {potWhole ? '✓ Pot Complete' : `$${(pot.full - pot.total).toFixed(2)} remaining`}
                            </span>
                        </div>
                        <div className="flex items-end gap-2">
                            <span className="text-4xl font-extrabold text-white">${pot.total.toFixed(2)}</span>
                            <span className="text-gray-500 text-lg mb-0.5">/ ${pot.full.toFixed(2)}</span>
                        </div>
                        <div className="w-full bg-gray-800 rounded-full h-3 overflow-hidden">
                            <div className="bg-[#C8A951] h-3 rounded-full transition-all duration-500" style={{ width: `${pot.progress}%` }} />
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                            <div className="text-center bg-gray-800/40 rounded-xl py-3 border border-gray-800">
                                <p className="text-2xl font-bold text-green-400">{pot.paidCount}</p>
                                <p className="text-gray-500 text-xs mt-0.5">Paid</p>
                            </div>
                            <div className="text-center bg-gray-800/40 rounded-xl py-3 border border-gray-800">
                                <p className="text-2xl font-bold text-red-400">{pot.unpaidCount}</p>
                                <p className="text-gray-500 text-xs mt-0.5">Unpaid</p>
                            </div>
                            <div className="text-center bg-gray-800/40 rounded-xl py-3 border border-gray-800">
                                <p className="text-2xl font-bold text-gray-300">
                                    {members.length}<span className="text-gray-600 text-base font-medium">/{league.totalRosters}</span>
                                </p>
                                <p className="text-gray-500 text-xs mt-0.5">Rostered</p>
                            </div>
                        </div>
                        {payments && (payments.stripe.count > 0 || payments.manual.count > 0) && (
                            <div className="border-t border-gray-800 pt-4 space-y-2">
                                <p className="text-gray-600 text-xs font-semibold uppercase tracking-wide">Payment Breakdown</p>
                                {payments.stripe.count > 0 && (
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="flex items-center gap-1.5 text-gray-400">
                                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block shrink-0" />
                                            ${payments.stripe.total.toFixed(2)}
                                            <span className="text-green-500 font-semibold">Stripe (Verified)</span>
                                        </span>
                                        <span className="text-gray-600">{payments.stripe.count} member{payments.stripe.count !== 1 ? 's' : ''}</span>
                                    </div>
                                )}
                                {payments.manual.count > 0 && (
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="flex items-center gap-1.5 text-gray-400">
                                            <span className="w-1.5 h-1.5 rounded-full bg-gray-500 inline-block shrink-0" />
                                            ${payments.manual.total.toFixed(2)}
                                            <span className="text-gray-400 font-medium">Manual</span>
                                        </span>
                                        <span className="text-gray-600">{payments.manual.count} member{payments.manual.count !== 1 ? 's' : ''}</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* My status */}
                    {myMember && (
                        <div className={`rounded-2xl px-6 py-5 border ${
                            myMember.duesStatus === 'paid'
                                ? 'bg-green-900/15 border-green-800'
                                : myMember.duesStatus === 'pending_refund'
                                    ? 'bg-yellow-900/15 border-yellow-800'
                                    : 'bg-red-900/10 border-red-900'
                        }`}>
                            <div className="flex items-center justify-between gap-4 flex-wrap">
                                <div>
                                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Your Dues Status</p>
                                    <div className="flex items-center gap-3">
                                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-bold border ${statusBadge(myMember.duesStatus)}`}>
                                            {statusLabel(myMember.duesStatus)}
                                        </span>
                                        {myMember.duesStatus === 'paid' && myMember.paymentMethod && (
                                            <span className="text-xs text-gray-500">via {methodLabel(myMember.paymentMethod) ?? myMember.paymentMethod}</span>
                                        )}
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs text-gray-500">Buy-in</p>
                                    <p className="text-xl font-bold text-white">${buyInAmount.toFixed(2)}</p>
                                </div>
                            </div>
                            {myMember.teamName && <p className="text-gray-500 text-xs mt-2">{myMember.teamName}</p>}
                        </div>
                    )}

                    {/* Member roster */}
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between gap-4">
                            <h2 className="font-bold">League Roster</h2>
                            <span className="text-gray-500 text-sm">{members.length} of {league.totalRosters} added</span>
                        </div>
                        {members.length === 0 ? (
                            <div className="px-6 py-10 text-center text-gray-500 text-sm">No members added yet.</div>
                        ) : (
                            <ul className="divide-y divide-gray-800/50">
                                {members.map(member => (
                                    <li key={member.id} className={`flex items-center justify-between gap-4 px-6 py-4 ${member.userId === currentUserId ? 'bg-gray-800/20' : ''}`}>
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <p className="font-medium text-white text-sm truncate">{member.displayName}</p>
                                                {member.userId === currentUserId && <span className="text-xs text-gray-500 shrink-0">(you)</span>}
                                            </div>
                                            {member.teamName && <p className="text-gray-500 text-xs mt-0.5 truncate">{member.teamName}</p>}
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            {member.paymentMethod && member.duesStatus === 'paid' && (
                                                <span className="text-xs text-gray-600">{methodLabel(member.paymentMethod)}</span>
                                            )}
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${statusBadge(member.duesStatus)}`}>
                                                {statusLabel(member.duesStatus)}
                                            </span>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                        {isCommissioner && duesId && (
                            <div className="px-6 py-3 border-t border-gray-800 flex justify-end">
                                <Link href={`/dashboard/commissioner/dues/${duesId}`}
                                    className="text-sm text-[#C8A951]/70 hover:text-[#C8A951] font-medium transition">
                                    Manage roster &amp; payments →
                                </Link>
                            </div>
                        )}
                    </div>

                    {/* Payouts */}
                    {payouts.length > 0 && (
                        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                            <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between gap-4">
                                <h2 className="font-bold">Payout Structure</h2>
                                <span className="text-gray-500 text-sm">${pot.full.toFixed(2)} total</span>
                            </div>
                            <div className="px-6 py-5 space-y-2">
                                {payouts.map((spot, i) => (
                                    <div key={spot.id} className="flex items-center justify-between text-sm py-1.5">
                                        <div className="flex items-center gap-3">
                                            <span className="w-6 h-6 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center text-xs font-bold text-gray-400 shrink-0">
                                                {i + 1}
                                            </span>
                                            <span className="text-gray-300">{spot.label}</span>
                                        </div>
                                        <span className="font-semibold text-white">${spot.amount.toFixed(2)}</span>
                                    </div>
                                ))}
                                <div className="border-t border-gray-800 mt-3 pt-3 flex items-center justify-between text-sm font-bold">
                                    <span className="text-gray-400">Total</span>
                                    <span className={payoutBalanced ? 'text-green-400' : 'text-red-400'}>
                                        ${payoutTotal.toFixed(2)}
                                        {!payoutBalanced && (
                                            <span className="text-red-500 text-xs font-normal ml-2">
                                                ({payoutTotal > fullPot ? '+' : '-'}${Math.abs(payoutTotal - fullPot).toFixed(2)} off)
                                            </span>
                                        )}
                                    </span>
                                </div>
                            </div>
                            {isCommissioner && duesId && (
                                <div className="px-6 py-3 border-t border-gray-800 flex justify-end">
                                    <Link href={`/dashboard/commissioner/dues/${duesId}/payouts`}
                                        className="text-sm text-[#C8A951]/70 hover:text-[#C8A951] font-medium transition">
                                        Edit payout spots →
                                    </Link>
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
