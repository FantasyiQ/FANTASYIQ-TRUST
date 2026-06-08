'use client';

import { useState } from 'react';
import Link from 'next/link';

interface Props {
    token:        string;
    leagueName:   string;
    spotLabel:    string;
    amount:       number;
    status:       string | null;  // query param status from callback
    alreadyDone:  boolean;
}

export default function ClaimClient({ token, leagueName, spotLabel, amount, status, alreadyDone }: Props) {
    const [loading, setLoading] = useState(false);
    const [error,   setError]   = useState<string | null>(null);

    async function handleClaim() {
        setLoading(true);
        setError(null);
        try {
            const res  = await fetch('/api/stripe/connect/winner-onboard', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ claimToken: token }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json.error ?? 'Something went wrong');
            if (json.url) {
                window.location.href = json.url;
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Something went wrong');
            setLoading(false);
        }
    }

    if (alreadyDone || status === 'success' || status === 'already_paid') {
        return (
            <div className="text-center space-y-4">
                <div className="text-5xl">🎉</div>
                <h2 className="text-xl font-bold text-white">Payout on its way!</h2>
                <p className="text-gray-400 text-sm leading-relaxed max-w-sm mx-auto">
                    Your <strong className="text-white">${amount.toFixed(2)} {spotLabel}</strong> payout for{' '}
                    <strong className="text-white">{leagueName}</strong> has been transferred to your Stripe account.
                    Stripe will deposit it to your bank within 2–5 business days.
                </p>
                <Link href="/dashboard" className="inline-block mt-4 text-[#D4AF37] hover:underline text-sm">
                    Back to dashboard
                </Link>
            </div>
        );
    }

    if (status === 'pending') {
        return (
            <div className="text-center space-y-4">
                <div className="text-5xl">⏳</div>
                <h2 className="text-xl font-bold text-white">Almost there</h2>
                <p className="text-gray-400 text-sm leading-relaxed max-w-sm mx-auto">
                    Stripe is still verifying your account. This usually takes a few minutes.
                    Check back shortly — your payout will be sent automatically once verification is complete.
                </p>
                <button onClick={handleClaim} className="mt-4 text-sm text-[#D4AF37] hover:underline">
                    Retry / Continue setup
                </button>
            </div>
        );
    }

    if (status === 'manual') {
        return (
            <div className="text-center space-y-4">
                <div className="text-5xl">✅</div>
                <h2 className="text-xl font-bold text-white">You&apos;re all set</h2>
                <p className="text-gray-400 text-sm leading-relaxed max-w-sm mx-auto">
                    Your account is verified. Your commissioner will send your{' '}
                    <strong className="text-white">${amount.toFixed(2)}</strong> payout directly.
                    Contact your commissioner if you have any questions.
                </p>
            </div>
        );
    }

    if (status === 'error') {
        return (
            <div className="text-center space-y-4">
                <div className="text-5xl">⚠️</div>
                <h2 className="text-xl font-bold text-white">Something went wrong</h2>
                <p className="text-gray-400 text-sm max-w-sm mx-auto">
                    We couldn&apos;t process your payout automatically. Please contact your commissioner or{' '}
                    <a href="mailto:support@fantasyiqtrust.com" className="text-[#D4AF37] hover:underline">
                        FiQ support
                    </a>.
                </p>
                <button onClick={handleClaim} className="mt-4 text-sm text-[#D4AF37] hover:underline">
                    Try again
                </button>
            </div>
        );
    }

    // Default: show "Claim Your Winnings" CTA
    return (
        <div className="text-center space-y-6">
            <div className="text-5xl">🏆</div>
            <div>
                <h2 className="text-xl font-bold text-white">You won!</h2>
                <p className="text-[#D4AF37] font-bold text-2xl mt-1">${amount.toFixed(2)}</p>
                <p className="text-gray-400 text-sm mt-1">{spotLabel} · {leagueName}</p>
            </div>

            <div className="bg-gray-800 rounded-xl p-4 text-left text-sm text-gray-400 space-y-2">
                <p className="font-semibold text-white text-xs uppercase tracking-wider">How it works</p>
                <p>1. Click below to set up your free Stripe payout account (takes ~5 min).</p>
                <p>2. Enter your name, last 4 of your SSN, and bank account.</p>
                <p>3. FiQ automatically sends your winnings to your bank account.</p>
                <p className="text-xs text-gray-500 mt-2">
                    Stripe identity verification is required by federal KYC law before any payout can be sent.
                </p>
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <button
                onClick={handleClaim}
                disabled={loading}
                className="w-full py-3 rounded-xl bg-[#D4AF37] text-black font-bold text-sm hover:bg-[#c9a227] transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {loading ? 'Redirecting to Stripe…' : 'Claim Your Winnings'}
            </button>

            <p className="text-xs text-gray-600">
                Your payout is held securely in escrow until you claim it.
                If you don&apos;t claim within 90 days, contact your commissioner.
            </p>
        </div>
    );
}
