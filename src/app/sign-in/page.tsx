'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { signInAction, signInWithGoogle } from '@/app/actions/auth';

export default function SignInPage() {
    const [state, action, pending] = useActionState(signInAction, null);

    return (
        <main className="min-h-screen bg-gray-950 flex items-center justify-center px-4 py-16">
            <div className="w-full max-w-md">
                {/* Brand */}
                <div className="text-center mb-8">
                    <Link href="/" className="text-2xl font-bold text-white">
                        Fantasy<span className="text-[#C8A951]">i</span>Q Trust
                    </Link>
                </div>

                {/* Card */}
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8">
                    <h1 className="text-2xl font-bold text-white mb-1">Welcome back</h1>
                    <p className="text-gray-400 text-sm mb-6">Sign in to your account.</p>

                    {/* Google */}
                    <form action={signInWithGoogle}>
                        <button
                            type="submit"
                            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-100 text-gray-900 font-semibold py-2.5 rounded-lg transition mb-4"
                        >
                            <GoogleIcon />
                            Sign in with Google
                        </button>
                    </form>

                    <div className="flex items-center gap-3 mb-4">
                        <div className="flex-1 h-px bg-gray-800" />
                        <span className="text-gray-500 text-xs">or</span>
                        <div className="flex-1 h-px bg-gray-800" />
                    </div>

                    {/* Error */}
                    {state?.error && (
                        <div className="mb-4 px-4 py-3 rounded-lg bg-red-950/50 border border-red-800 text-red-400 text-sm">
                            {state.error}
                        </div>
                    )}

                    {/* Credentials form */}
                    <form action={action} className="space-y-4">
                        <div>
                            <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-1.5">
                                Email
                            </label>
                            <input
                                id="email"
                                name="email"
                                type="email"
                                autoComplete="email"
                                required
                                className="w-full bg-gray-800 border border-gray-700 text-white placeholder-gray-500 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[#C8A951] transition"
                                placeholder="you@example.com"
                            />
                        </div>

                        <div>
                            <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-1.5">
                                Password
                            </label>
                            <input
                                id="password"
                                name="password"
                                type="password"
                                autoComplete="current-password"
                                required
                                className="w-full bg-gray-800 border border-gray-700 text-white placeholder-gray-500 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[#C8A951] transition"
                                placeholder="Your password"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={pending}
                            className="w-full bg-[#C8A951] hover:bg-[#b8992f] disabled:opacity-60 disabled:cursor-not-allowed text-gray-950 font-bold py-2.5 rounded-lg transition"
                        >
                            {pending ? 'Signing in…' : 'Sign in'}
                        </button>
                    </form>
                </div>

                {/* Footer link */}
                <p className="text-center text-gray-500 text-sm mt-6">
                    Don&apos;t have an account?{' '}
                    <Link href="/sign-up" className="text-[#C8A951] hover:underline font-medium">
                        Sign up
                    </Link>
                </p>
            </div>
        </main>
    );
}

function GoogleIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
            <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" />
            <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" />
            <path fill="#FBBC05" d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332Z" />
            <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58Z" />
        </svg>
    );
}
