'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';

interface Props {
    name:  string | null;
    email: string;
}

export default function AccountSettings({ name, email }: Props) {
    const router = useRouter();

    // ── Email edit state ─────────────────────────────────────────────────────
    const [emailEditing, setEmailEditing] = useState(false);
    const [emailValue,   setEmailValue]   = useState(email);
    const [emailSaving,  setEmailSaving]  = useState(false);
    const [emailError,   setEmailError]   = useState<string | null>(null);
    const [emailSuccess, setEmailSuccess] = useState(false);

    async function saveEmail() {
        const trimmed = emailValue.trim().toLowerCase();
        if (trimmed === email.toLowerCase()) {
            setEmailEditing(false);
            return;
        }
        setEmailSaving(true);
        setEmailError(null);
        try {
            const res = await fetch('/api/user/profile', {
                method:  'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ email: trimmed }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json.error ?? 'Update failed');
            setEmailEditing(false);
            setEmailSuccess(true);
            setTimeout(() => setEmailSuccess(false), 3000);
            router.refresh(); // re-render server component with fresh DB value
        } catch (err) {
            setEmailError(err instanceof Error ? err.message : 'Something went wrong');
        } finally {
            setEmailSaving(false);
        }
    }

    function cancelEmail() {
        setEmailValue(email);
        setEmailEditing(false);
        setEmailError(null);
    }

    // ── Delete state ─────────────────────────────────────────────────────────
    const [deleteStep,  setDeleteStep]  = useState<'idle' | 'confirm' | 'deleting'>('idle');
    const [deleteError, setDeleteError] = useState<string | null>(null);

    async function handleDelete() {
        setDeleteStep('deleting');
        setDeleteError(null);
        try {
            const res = await fetch('/api/user/delete', { method: 'DELETE' });
            if (!res.ok) {
                const json = await res.json().catch(() => ({}));
                throw new Error(json.error ?? 'Deletion failed');
            }
            await signOut({ callbackUrl: '/?deleted=1' });
        } catch (err) {
            setDeleteError(err instanceof Error ? err.message : 'Something went wrong');
            setDeleteStep('confirm');
        }
    }

    return (
        <div className="space-y-6">

            {/* Profile */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-1">
                <h2 className="font-semibold text-white mb-3">Profile</h2>

                {/* Name row */}
                <div className="flex items-center justify-between gap-4 py-3 border-b border-gray-800/60">
                    <span className="text-sm text-gray-400 shrink-0">Name</span>
                    <span className="text-sm text-white font-medium">{name ?? '—'}</span>
                </div>

                {/* Email row */}
                <div className="py-3">
                    {emailEditing ? (
                        <div className="space-y-2">
                            <label className="text-sm text-gray-400">Email</label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="email"
                                    value={emailValue}
                                    onChange={e => { setEmailValue(e.target.value); setEmailError(null); }}
                                    onKeyDown={e => { if (e.key === 'Enter') saveEmail(); if (e.key === 'Escape') cancelEmail(); }}
                                    disabled={emailSaving}
                                    autoFocus
                                    className="flex-1 bg-gray-800 border border-gray-700 focus:border-[#D4AF37]/60 outline-none rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 transition disabled:opacity-50"
                                    placeholder="you@example.com"
                                />
                                <button
                                    onClick={saveEmail}
                                    disabled={emailSaving || !emailValue.trim()}
                                    className="shrink-0 bg-[#D4AF37]/15 border border-[#D4AF37]/50 text-[#D4AF37] font-bold px-4 py-2 rounded-lg transition text-sm hover:bg-[#D4AF37]/25 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {emailSaving ? 'Saving…' : 'Save'}
                                </button>
                                <button
                                    onClick={cancelEmail}
                                    disabled={emailSaving}
                                    className="shrink-0 border border-gray-700 hover:border-gray-500 text-gray-400 hover:text-white font-medium px-3 py-2 rounded-lg transition text-sm disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                            </div>
                            {emailError && (
                                <p className="text-xs text-red-400">{emailError}</p>
                            )}
                            <p className="text-xs text-gray-600">
                                This is the email address used to sign in to your account.
                            </p>
                        </div>
                    ) : (
                        <div className="flex items-center justify-between gap-4">
                            <span className="text-sm text-gray-400 shrink-0">Email</span>
                            <div className="flex items-center gap-3 min-w-0">
                                {emailSuccess && (
                                    <span className="text-xs text-green-400 shrink-0">Updated</span>
                                )}
                                <span className="text-sm text-white font-medium truncate">{email}</span>
                                <button
                                    onClick={() => { setEmailEditing(true); setEmailValue(email); }}
                                    className="shrink-0 text-xs text-gray-500 hover:text-[#D4AF37] transition font-medium"
                                >
                                    Edit
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Data & Privacy */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
                <div>
                    <h2 className="font-semibold text-white">Data & Privacy</h2>
                    <p className="text-gray-500 text-xs mt-0.5">Your rights under GDPR and CCPA.</p>
                </div>

                <div className="space-y-3">
                    {/* Export */}
                    <div className="flex items-center justify-between gap-4 p-4 bg-gray-800/50 rounded-xl border border-gray-700">
                        <div>
                            <p className="text-sm font-medium text-white">Export my data</p>
                            <p className="text-xs text-gray-500 mt-0.5">Download a JSON copy of all data we hold on your account.</p>
                        </div>
                        <a
                            href="/api/user/export"
                            download
                            className="shrink-0 border border-gray-600 hover:border-gray-400 text-gray-300 hover:text-white font-semibold px-4 py-2 rounded-lg transition text-sm"
                        >
                            Download →
                        </a>
                    </div>

                    {/* Delete */}
                    <div className="flex items-start justify-between gap-4 p-4 bg-red-950/20 rounded-xl border border-red-900/40">
                        <div>
                            <p className="text-sm font-medium text-red-400">Delete my account</p>
                            <p className="text-xs text-gray-500 mt-0.5">
                                Permanently deletes your account, all data, and cancels active subscriptions. This cannot be undone.
                            </p>
                            {deleteError && (
                                <p className="text-xs text-red-400 mt-1.5">{deleteError}</p>
                            )}
                        </div>
                        <div className="shrink-0">
                            {deleteStep === 'idle' && (
                                <button
                                    onClick={() => setDeleteStep('confirm')}
                                    className="border border-red-800 hover:border-red-600 text-red-400 hover:text-red-300 font-semibold px-4 py-2 rounded-lg transition text-sm"
                                >
                                    Delete →
                                </button>
                            )}
                            {deleteStep === 'confirm' && (
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => { setDeleteStep('idle'); setDeleteError(null); }}
                                        className="border border-gray-700 hover:border-gray-500 text-gray-400 hover:text-white font-medium px-3 py-2 rounded-lg transition text-sm"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleDelete}
                                        className="bg-red-600 hover:bg-red-500 text-white font-bold px-4 py-2 rounded-lg transition text-sm"
                                    >
                                        Yes, delete
                                    </button>
                                </div>
                            )}
                            {deleteStep === 'deleting' && (
                                <span className="text-sm text-gray-500 italic">Deleting…</span>
                            )}
                        </div>
                    </div>
                </div>
            </div>

        </div>
    );
}
