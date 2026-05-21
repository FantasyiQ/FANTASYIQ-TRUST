'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function ForgotPasswordForm() {
    const [email,   setEmail]   = useState('');
    const [pending, setPending] = useState(false);
    const [sent,    setSent]    = useState(false);
    const [error,   setError]   = useState('');

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError('');
        setPending(true);
        try {
            const res = await fetch('/api/auth/forgot-password', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ email }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                setError(data.error ?? 'Something went wrong. Please try again.');
            } else {
                setSent(true);
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
                    {sent ? (
                        <div className="text-center space-y-4">
                            <div className="w-12 h-12 rounded-full bg-green-900/40 border border-green-800 flex items-center justify-center mx-auto">
                                <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                            </div>
                            <h1 className="text-xl font-bold text-white">Check your email</h1>
                            <p className="text-gray-400 text-sm leading-relaxed">
                                If an account exists for <strong className="text-white">{email}</strong>, we&apos;ve sent a
                                password reset link. It expires in 1 hour.
                            </p>
                            <p className="text-gray-500 text-xs">
                                Didn&apos;t get it? Check your spam folder or{' '}
                                <button
                                    type="button"
                                    onClick={() => setSent(false)}
                                    className="text-[#D4AF37] hover:underline"
                                >
                                    try again
                                </button>.
                            </p>
                        </div>
                    ) : (
                        <>
                            <h1 className="text-2xl font-bold text-white mb-1">Forgot your password?</h1>
                            <p className="text-gray-400 text-sm mb-6">
                                Enter your email and we&apos;ll send you a reset link.
                            </p>

                            {error && (
                                <div className="mb-4 px-4 py-3 rounded-lg bg-red-950/50 border border-red-800 text-red-400 text-sm">
                                    {error}
                                </div>
                            )}

                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div>
                                    <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-1.5">
                                        Email
                                    </label>
                                    <input
                                        id="email"
                                        type="email"
                                        autoComplete="email"
                                        required
                                        value={email}
                                        onChange={e => setEmail(e.target.value)}
                                        className="w-full bg-gray-800 border border-gray-700 text-white placeholder-gray-500 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[#D4AF37] transition"
                                        placeholder="you@example.com"
                                    />
                                </div>

                                <button
                                    type="submit"
                                    disabled={pending}
                                    className="w-full bg-[#D4AF37] hover:bg-[#BF9D2F] disabled:opacity-60 disabled:cursor-not-allowed text-gray-950 font-bold py-2.5 rounded-lg transition"
                                >
                                    {pending ? 'Sending…' : 'Send reset link'}
                                </button>
                            </form>
                        </>
                    )}
                </div>

                <p className="text-center text-gray-500 text-sm mt-6">
                    <Link href="/sign-in" className="text-[#D4AF37] hover:underline font-medium">
                        ← Back to sign in
                    </Link>
                </p>
            </div>
        </main>
    );
}
