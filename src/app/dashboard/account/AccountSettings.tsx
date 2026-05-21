'use client';

import { useState } from 'react';
import { signOut } from 'next-auth/react';

interface Props {
    name:  string | null;
    email: string;
}

export default function AccountSettings({ name, email }: Props) {
    const [deleteStep, setDeleteStep] = useState<'idle' | 'confirm' | 'deleting'>('idle');
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
            // Sign out and redirect to home
            await signOut({ callbackUrl: '/?deleted=1' });
        } catch (err) {
            setDeleteError(err instanceof Error ? err.message : 'Something went wrong');
            setDeleteStep('confirm');
        }
    }

    return (
        <div className="space-y-6">

            {/* Profile */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
                <h2 className="font-semibold text-white">Profile</h2>
                <div className="space-y-3">
                    <div className="flex items-center justify-between gap-4 py-2 border-b border-gray-800/60">
                        <span className="text-sm text-gray-400">Name</span>
                        <span className="text-sm text-white font-medium">{name ?? '—'}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4 py-2">
                        <span className="text-sm text-gray-400">Email</span>
                        <span className="text-sm text-white font-medium">{email}</span>
                    </div>
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
