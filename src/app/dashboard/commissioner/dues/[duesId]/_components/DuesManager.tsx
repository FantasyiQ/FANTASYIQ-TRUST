'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import InviteLinkButton from '@/components/InviteLinkButton';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DuesMember {
    id: string;
    displayName: string;
    teamName: string | null;
    email: string | null;
    duesStatus: string;
    paidAt: string | null; // JSON-serialised Date
    paymentMethod: string | null;
}

export interface PayoutSpot {
    id: string;
    label: string;
    amount: number;
    sortOrder: number;
}

export interface DuesManagerProps {
    duesId: string;
    leagueName: string;
    season: string;
    buyInAmount: number;
    teamCount: number;
    potTotal: number;
    members: DuesMember[];
    payoutSpots: PayoutSpot[];
    hasProposal: boolean;
    sleeperLeagueId: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function potProgress(paid: number, total: number) {
    if (total <= 0) return 0;
    return Math.min(100, Math.round((paid / total) * 100));
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function DuesManager({
    duesId,
    leagueName,
    season,
    buyInAmount,
    teamCount,
    potTotal,
    members,
    payoutSpots,
    hasProposal,
    sleeperLeagueId,
}: DuesManagerProps) {
    const router = useRouter();

    // Per-member loading / modal state
    const [loadingMemberId, setLoadingMemberId] = useState<string | null>(null);
    const [memberError, setMemberError]         = useState<Record<string, string>>({});
    const [manualModalId, setManualModalId]     = useState<string | null>(null);

    // Sync state
    const [syncing, setSyncing]       = useState(false);
    const [syncMessage, setSyncMessage] = useState<string | null>(null);
    const [syncError, setSyncError]   = useState<string | null>(null);

    // ---------------------------------------------------------------------------
    // Derived values
    // ---------------------------------------------------------------------------

    const fullPot     = buyInAmount * teamCount;
    const progress    = potProgress(potTotal, fullPot);
    const paidCount   = members.filter(m => m.duesStatus === 'paid').length;
    const unpaidCount = members.filter(m => m.duesStatus === 'unpaid').length;
    const potWhole    = potTotal >= fullPot && members.length === teamCount;

    const stripePaid = members.filter(m =>
        m.duesStatus === 'paid' && (m.paymentMethod === 'stripe_direct' || m.paymentMethod === 'stripe_on_behalf')
    );
    const manualPaid = members.filter(m =>
        m.duesStatus === 'paid' && m.paymentMethod === 'manual'
    );
    const stripeTotal = stripePaid.length * buyInAmount;
    const manualTotal = manualPaid.length * buyInAmount;

    const payoutTotal   = payoutSpots.reduce((s, p) => s + p.amount, 0);
    const payoutSurplus = payoutTotal - fullPot;

    // ---------------------------------------------------------------------------
    // Member actions
    // ---------------------------------------------------------------------------

    function setMemberLoading(id: string, on: boolean) {
        setLoadingMemberId(on ? id : null);
    }
    function setMemberErr(id: string, msg: string) {
        setMemberError(prev => ({ ...prev, [id]: msg }));
    }
    function clearMemberErr(id: string) {
        setMemberError(prev => { const n = { ...prev }; delete n[id]; return n; });
    }

    async function payOnBehalf(member: DuesMember) {
        clearMemberErr(member.id);
        setMemberLoading(member.id, true);
        try {
            const res  = await fetch('/api/dues/members/pay-on-behalf', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ memberId: member.id, duesId }),
            });
            const data = await res.json();
            if (!res.ok) { setMemberErr(member.id, data.error ?? 'Failed.'); setMemberLoading(member.id, false); return; }
            window.location.href = data.url;
        } catch {
            setMemberErr(member.id, 'Something went wrong.');
            setMemberLoading(member.id, false);
        }
    }

    async function markPaidManually(member: DuesMember) {
        setManualModalId(null);
        clearMemberErr(member.id);
        setMemberLoading(member.id, true);
        try {
            const res  = await fetch(`/api/dues/${duesId}/member-status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ memberId: member.id, status: 'paid' }),
            });
            const data = await res.json();
            if (!res.ok) {
                setMemberErr(member.id, data.error ?? 'Failed. Make sure there are enough collected funds.');
                setMemberLoading(member.id, false);
                return;
            }
            router.refresh();
        } catch {
            setMemberErr(member.id, 'Something went wrong.');
            setMemberLoading(member.id, false);
        }
    }

    async function removeMember(member: DuesMember) {
        if (!confirm(`Remove ${member.displayName} from the roster?`)) return;
        setMemberLoading(member.id, true);
        try {
            const res = await fetch('/api/dues/members/remove', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ memberId: member.id, duesId }),
            });
            if (!res.ok) { setMemberLoading(member.id, false); return; }
            router.refresh();
        } catch {
            setMemberLoading(member.id, false);
        }
    }

    async function syncMembers() {
        setSyncing(true);
        setSyncMessage(null);
        setSyncError(null);
        try {
            const res  = await fetch(`/api/dues/${duesId}/sync-members`, { method: 'POST' });
            const data = await res.json() as { added?: number; message?: string; error?: string };
            if (!res.ok) {
                setSyncError(data.error ?? 'Sync failed.');
            } else if ((data.added ?? 0) === 0) {
                setSyncMessage(data.message ?? 'All members already synced.');
            } else {
                setSyncMessage(`✓ Added ${data.added} member${data.added === 1 ? '' : 's'} from Sleeper.`);
                router.refresh();
            }
        } catch {
            setSyncError('Something went wrong. Please try again.');
        } finally {
            setSyncing(false);
        }
    }

    // ---------------------------------------------------------------------------
    // Render
    // ---------------------------------------------------------------------------

    return (
        <main className="min-h-screen bg-gray-950 text-white pt-24 pb-16 px-6">
            <div className="max-w-4xl mx-auto space-y-6">

                {/* ── Header ─────────────────────────────────────────────── */}
                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                        <Link href="/dashboard/commissioner/dues"
                            className="text-gray-500 hover:text-gray-300 text-sm transition">
                            ← Back to Dues Tracker
                        </Link>
                        <h1 className="text-2xl font-bold mt-3">{leagueName}</h1>
                        <p className="text-gray-400 text-sm mt-0.5">
                            {season} Season · ${buyInAmount}/team · {teamCount} teams
                        </p>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                        <Link href={`/dashboard/commissioner/dues/${duesId}/future-dues`}
                            className="border border-gray-700 hover:border-[#C8A951]/50 text-gray-300 font-semibold px-4 py-2 rounded-lg text-sm transition">
                            Future Dues
                        </Link>
                        <Link href={`/dashboard/commissioner/dues/${duesId}/payouts`}
                            className="border border-gray-700 hover:border-[#C8A951]/50 text-gray-300 font-semibold px-4 py-2 rounded-lg text-sm transition">
                            Payout Spots
                        </Link>
                        {hasProposal && (
                            <Link href={`/dashboard/commissioner/dues/${duesId}/proposal`}
                                className="bg-[#C8A951] hover:bg-[#b8992f] text-black font-bold px-4 py-2 rounded-lg text-sm transition">
                                Review Proposal
                            </Link>
                        )}
                    </div>
                </div>

                {/* ── Pot Summary ────────────────────────────────────────── */}
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="font-bold text-lg">League Pot</h2>
                        <span className={`text-sm font-semibold ${potWhole ? 'text-green-400' : 'text-yellow-400'}`}>
                            {potWhole ? '✓ Pot Complete' : `$${(fullPot - potTotal).toFixed(2)} remaining`}
                        </span>
                    </div>
                    <div className="flex items-end gap-2">
                        <span className="text-4xl font-extrabold text-white">${potTotal.toFixed(2)}</span>
                        <span className="text-gray-500 text-lg mb-1">/ ${fullPot.toFixed(2)}</span>
                    </div>
                    <div className="w-full bg-gray-800 rounded-full h-3">
                        <div className="bg-[#C8A951] h-3 rounded-full transition-all" style={{ width: `${progress}%` }} />
                    </div>
                    <div className="grid grid-cols-3 gap-4 pt-1">
                        <div className="text-center">
                            <p className="text-2xl font-bold text-green-400">{paidCount}</p>
                            <p className="text-gray-500 text-xs mt-0.5">Paid</p>
                        </div>
                        <div className="text-center">
                            <p className="text-2xl font-bold text-red-400">{unpaidCount}</p>
                            <p className="text-gray-500 text-xs mt-0.5">Unpaid</p>
                        </div>
                        <div className="text-center">
                            <p className="text-2xl font-bold text-gray-300">{members.length}/{teamCount}</p>
                            <p className="text-gray-500 text-xs mt-0.5">Roster Added</p>
                        </div>
                    </div>

                    {paidCount > 0 && (
                        <div className="border-t border-gray-800 pt-3 space-y-1.5">
                            <p className="text-gray-600 text-xs font-semibold uppercase tracking-wide">Payment Breakdown</p>
                            {stripePaid.length > 0 && (
                                <div className="flex items-center justify-between text-xs">
                                    <span className="flex items-center gap-1.5 text-gray-400">
                                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block shrink-0" />
                                        ${stripeTotal.toFixed(2)} Stripe
                                        <span className="text-green-500 font-semibold">(Verified)</span>
                                    </span>
                                    <span className="text-gray-600">{stripePaid.length} member{stripePaid.length !== 1 ? 's' : ''}</span>
                                </div>
                            )}
                            {manualPaid.length > 0 && (
                                <div className="flex items-center justify-between text-xs">
                                    <span className="flex items-center gap-1.5 text-gray-400">
                                        <span className="w-1.5 h-1.5 rounded-full bg-gray-500 inline-block shrink-0" />
                                        ${manualTotal.toFixed(2)} Manual
                                        <span className="text-gray-500 font-medium">(Commissioner Entered)</span>
                                    </span>
                                    <span className="text-gray-600">{manualPaid.length} member{manualPaid.length !== 1 ? 's' : ''}</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* ── League Roster ──────────────────────────────────────── */}
                <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between gap-4 flex-wrap">
                        <div>
                            <h2 className="font-bold">League Roster</h2>
                            <p className="text-gray-500 text-xs mt-0.5">{members.length} of {teamCount} added</p>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                            {sleeperLeagueId && (
                                <InviteLinkButton
                                    sleeperLeagueId={sleeperLeagueId}
                                    leagueName={leagueName}
                                    season={season}
                                />
                            )}
                            <div className="flex flex-col items-end gap-1">
                                <button
                                    onClick={syncMembers}
                                    disabled={syncing}
                                    className="border border-gray-700 hover:border-[#C8A951]/50 disabled:opacity-50 text-gray-300 font-semibold px-3 py-1.5 rounded-lg text-sm transition">
                                    {syncing ? 'Syncing…' : 'Sync from Sleeper'}
                                </button>
                                {syncMessage && <p className="text-green-400 text-xs">{syncMessage}</p>}
                                {syncError   && <p className="text-red-400 text-xs max-w-xs text-right">{syncError}</p>}
                            </div>
                        </div>
                    </div>

                    {members.length === 0 ? (
                        <div className="px-6 py-12 flex flex-col items-center gap-3 text-center">
                            <p className="text-gray-400 text-sm">No members added yet.</p>
                            <p className="text-gray-600 text-xs max-w-xs">
                                Your Sleeper league is connected — sync your roster to import members automatically.
                            </p>
                            <button
                                onClick={syncMembers}
                                disabled={syncing}
                                className="bg-[#C8A951] hover:bg-[#b8992f] disabled:opacity-50 text-gray-950 font-bold px-5 py-2.5 rounded-xl transition text-sm">
                                {syncing ? 'Syncing…' : 'Sync Roster from Sleeper'}
                            </button>
                            {syncError && <p className="text-red-400 text-xs max-w-xs text-center">{syncError}</p>}
                        </div>
                    ) : (
                        <ul className="divide-y divide-gray-800/50">
                            {members.map(member => {
                                const isPaid    = member.duesStatus === 'paid';
                                const isStripe  = member.paymentMethod === 'stripe_direct' || member.paymentMethod === 'stripe_on_behalf';
                                const isManual  = member.paymentMethod === 'manual';
                                const isLoading = loadingMemberId === member.id;
                                const err       = memberError[member.id];

                                return (
                                    <li key={member.id} className="px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
                                        <div className="min-w-0">
                                            <p className="font-medium text-white text-sm">{member.displayName}</p>
                                            {member.teamName && <p className="text-gray-500 text-xs mt-0.5">{member.teamName}</p>}
                                            {member.email    && <p className="text-gray-600 text-xs">{member.email}</p>}
                                            {err             && <p className="text-red-400 text-xs mt-1">{err}</p>}
                                        </div>

                                        <div className="flex items-center gap-3 shrink-0 flex-wrap">
                                            {isPaid ? (
                                                <div className="text-right space-y-0.5">
                                                    {isStripe && (
                                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-900/40 text-green-400 border border-green-800">
                                                            ✓ Verified — ${buyInAmount.toFixed(2)}
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
                                                            {isStripe ? 'Via Stripe · ' : isManual ? 'Manual · ' : ''}
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
                                                        onClick={() => payOnBehalf(member)}
                                                        disabled={isLoading}
                                                        className="text-xs bg-[#C8A951]/10 hover:bg-[#C8A951]/20 text-[#C8A951] border border-[#C8A951]/30 font-semibold px-3 py-1.5 rounded-lg transition disabled:opacity-50">
                                                        {isLoading ? '…' : 'Pay on Behalf →'}
                                                    </button>
                                                    <button
                                                        onClick={() => setManualModalId(member.id)}
                                                        disabled={isLoading}
                                                        className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-500 border border-gray-700 font-medium px-2.5 py-1.5 rounded-lg transition disabled:opacity-50">
                                                        Record Manual
                                                    </button>
                                                </div>
                                            )}
                                            {!isPaid && (
                                                <button
                                                    onClick={() => removeMember(member)}
                                                    disabled={isLoading}
                                                    className="text-gray-700 hover:text-red-400 text-xs transition disabled:opacity-50">
                                                    ✕
                                                </button>
                                            )}
                                        </div>

                                        {/* Manual payment modal (per-member, rendered inside list item for scoping) */}
                                        {manualModalId === member.id && (
                                            <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                                                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl">
                                                    <div className="flex items-start gap-3">
                                                        <span className="text-amber-400 text-xl shrink-0 mt-0.5">⚠</span>
                                                        <div>
                                                            <h3 className="font-bold text-white">Manual Payment (Not Recommended)</h3>
                                                            <p className="text-gray-400 text-sm mt-2 leading-relaxed">
                                                                Manual payments rely on commissioner accuracy and are not visible to the league.
                                                                For full transparency and automatic pot tracking, members should pay through their own account.
                                                            </p>
                                                            <p className="text-gray-600 text-xs mt-2">
                                                                Make sure you have recorded the cash received before marking as paid.
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-3 pt-1">
                                                        <button
                                                            onClick={() => setManualModalId(null)}
                                                            className="flex-1 bg-[#C8A951] hover:bg-[#b8992f] text-black font-bold py-2.5 rounded-xl text-sm transition">
                                                            Cancel
                                                        </button>
                                                        <button
                                                            onClick={() => markPaidManually(member)}
                                                            disabled={isLoading}
                                                            className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 font-semibold py-2.5 rounded-xl text-sm transition border border-gray-700 disabled:opacity-50">
                                                            {isLoading ? '…' : 'Continue Anyway'}
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>

                {/* ── Payout Spots ───────────────────────────────────────── */}
                <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between gap-4">
                        <div>
                            <h2 className="font-bold">Payout Spots</h2>
                            <p className="text-gray-500 text-xs mt-0.5">Where the pot goes at season end</p>
                        </div>
                        <Link href={`/dashboard/commissioner/dues/${duesId}/payouts`}
                            className="text-[#C8A951]/70 hover:text-[#C8A951] text-sm font-medium transition">
                            {payoutSpots.length > 0 ? 'Edit →' : 'Set up →'}
                        </Link>
                    </div>

                    {payoutSpots.length === 0 ? (
                        <div className="px-6 py-10 flex flex-col items-center gap-3 text-center">
                            <p className="text-gray-400 text-sm">No payout spots defined yet.</p>
                            <p className="text-gray-600 text-xs max-w-xs">
                                Define where the pot goes — 1st place, 2nd, survivor, etc.
                            </p>
                            <Link href={`/dashboard/commissioner/dues/${duesId}/payouts`}
                                className="border border-gray-700 hover:border-[#C8A951]/50 text-gray-300 font-semibold px-4 py-2 rounded-lg text-sm transition">
                                Set Up Payout Spots
                            </Link>
                        </div>
                    ) : (
                        <div className="px-6 py-5 space-y-2">
                            {payoutSpots.map((spot, i) => (
                                <div key={spot.id} className="flex items-center justify-between text-sm">
                                    <span className="flex items-center gap-2 text-gray-300">
                                        <span className="w-5 h-5 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center text-xs text-gray-500 font-semibold shrink-0">
                                            {i + 1}
                                        </span>
                                        {spot.label}
                                    </span>
                                    <span className="text-white font-semibold">${spot.amount.toFixed(2)}</span>
                                </div>
                            ))}
                            <div className="border-t border-gray-800 pt-3 mt-1 flex items-center justify-between text-sm font-bold">
                                <span className="text-gray-400">Total</span>
                                <span className={
                                    payoutTotal === fullPot  ? 'text-green-400' :
                                    payoutSurplus > 0        ? 'text-red-400'   : 'text-yellow-400'
                                }>
                                    ${payoutTotal.toFixed(2)}
                                    {payoutTotal !== fullPot && (
                                        <span className="ml-1.5 text-xs font-normal">
                                            ({payoutSurplus > 0
                                                ? `+$${payoutSurplus.toFixed(2)} over`
                                                : `$${Math.abs(payoutSurplus).toFixed(2)} short`})
                                        </span>
                                    )}
                                </span>
                            </div>
                        </div>
                    )}
                </div>

            </div>
        </main>
    );
}
