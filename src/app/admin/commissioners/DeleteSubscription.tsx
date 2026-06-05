'use client';

import { useState, useTransition } from 'react';
import { adminDeleteSubscription } from '@/app/admin/actions';

export default function DeleteSubscription({ subId }: { subId: string }) {
    const [confirming, setConfirming] = useState(false);
    const [pending, startTransition] = useTransition();
    const [deleted, setDeleted] = useState(false);

    function confirm() {
        startTransition(async () => {
            await adminDeleteSubscription(subId);
            setDeleted(true);
        });
    }

    if (deleted) return <span className="text-xs text-gray-600 italic">deleted</span>;

    if (confirming) {
        return (
            <span className="flex items-center gap-1">
                <span className="text-xs text-red-400">Delete?</span>
                <button
                    onClick={confirm}
                    disabled={pending}
                    className="text-xs text-red-500 hover:text-red-400 font-semibold disabled:opacity-50"
                >
                    {pending ? '…' : 'Yes'}
                </button>
                <button
                    onClick={() => setConfirming(false)}
                    className="text-xs text-gray-500 hover:text-gray-300"
                >
                    No
                </button>
            </span>
        );
    }

    return (
        <button
            onClick={() => setConfirming(true)}
            className="text-xs text-red-500/70 hover:text-red-400 border border-red-900/50 hover:border-red-500/50 rounded px-1.5 py-0.5 transition"
        >
            Delete
        </button>
    );
}
