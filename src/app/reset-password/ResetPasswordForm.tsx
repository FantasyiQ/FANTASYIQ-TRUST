'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function ResetPasswordForm({ token }: { token: string }) {
    const router = useRouter();
    const [password,  setPassword]  = useState('');
    const [confirm,   setConfirm]   = useState('');
    const [pending,   setPending]   = useState(false);
    const [done,      setDone]      = useState(false);
    const [error,     setError]     = useState('');

    if (!token) {
        return (
            <main className="min-h-screen bg-gray-950 flex items-center justify-center px-4 py-16">
                <div className="w-full max-w-md">
                    <div className="text-center mb-8">
                        <Link href="/" className="text-2xl font-bold text-white">
                            Fantasy<span className="text-[#D4AF37]">i</span>Q Trust
                        </Link>
                    </div>
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center space-y-4">
                        <h1 className="text-xl font-bold text-white">Invalid reset link</h1>
                        <p className="text-gray-400 text-sm">
                            This password reset link is missing or invalid.{' '}
                            <Link href="/forgot-password" className="text-[#D4AF37] hover:underline">
                                Request a new one
                            </Link>.
                        </p>
                    </div>
                </div>
            </main>
        );
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError('');
        if (password !== confirm) {
            setError('Passwords do not match.');
            return;
        }
        if (password.length < 8) {
            setError('Password must be at least 8 characters.');
            return;
        }
        setPending(true);
        try {
            const res = await fetch('/api/auth/reset-password', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ token, password }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setError(data.error ?? 'Something went wrong. Please try again.');
            } else {
                setDone(true);
                setTimeout(() => router.push('/sign-in'), 3000);
            }
        } catch {
            setError('Something went wrong. Please try again.');
        } finally {
            setPending(false);
        }
    }

    return (
        <main className="min-h-screen bg-gray-950 flex items-center justify-center px-4 py-16">
            <div className="w-full max-w-md">
                <div className="text-center mb-8">
                    <Link href="/" className="text-2xl font-bold text-white">
                        Fantasy<span className="text-[#D4AF37]">i</span>Q Trust
                    </Link>
                </div>

                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8">
                    {done ? (
                        <div className="text-center space-y-4">
                            <div className="w-12 h-12 rounded-full bg-green-900/40 border border-green-800 flex items-center justify-center mx-auto">
                                <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                            </div>
                            <h1 className="text-xl font-bold text-white">Password updated</h1>
                            <p className="text-gray-400 text-sm">
                                Your password has been changed. Redirecting you to sign in…
                            </p>
                        </div>
                    ) : (
                        <>
                            <h1 className="text-2xl font-bold text-white mb-1">Set a new password</h1>
                            <p className="text-gray-400 text-sm mb-6">Must be at least 8 characters.</p>

                            {error && (
                                <div className="mb-4 px-4 py-3 rounded-lg bg-red-950/50 border border-red-800 text-red-400 text-sm">
                                    {error}
                                </div>
                            )}

                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div>
                                    <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-1.5">
                                        New password
                                    </label>
                                    <input
                                        id="password"
                                        type="password"
                                        autoComplete="new-password"
                                        required
                                        value={password}
                                        onChange={e => setPassword(e.target.value)}
                                        className="w-full bg-gray-800 border border-gray-700 text-white placeholder-gray-500 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[#D4AF37] transition"
                                        placeholder="At least 8 characters"
                                    />
                                </div>

                                <div>
                                    <label htmlFor="confirm" className="block text-sm font-medium text-gray-300 mb-1.5">
                                        Confirm new password
                                    </label>
                                    <input
                                        id="confirm"
                                        type="password"
                                        autoComplete="new-password"
                                        required
                                        value={confirm}
                                        onChange={e => setConfirm(e.target.value)}
                                        className="w-full bg-gray-800 border border-gray-700 text-white placeholder-gray-500 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[#D4AF37] transition"
                                        placeholder="Repeat your password"
                                    />
                                </div>

                                <button
                                    type="submit"
                                    disabled={pending}
                                    className="w-full bg-[#D4AF37] hover:bg-[#BF9D2F] disabled:opacity-60 disabled:cursor-not-allowed text-gray-950 font-bold py-2.5 rounded-lg transition"
                                >
                                    {pending ? 'Saving…' : 'Save new password'}
                                </button>
                            </form>
                        </>
                    )}
                </div>

                {!done && (
                    <p className="text-center text-gray-500 text-sm mt-6">
                        <Link href="/sign-in" className="text-[#D4AF37] hover:underline font-medium">
                            ← Back to sign in
                        </Link>
                    </p>
                )}
            </div>
        </main>
    );
}
