'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { captureError } from '@/lib/sentry';

export default function AdminError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        captureError(error, { boundary: 'admin' });
    }, [error]);

    return (
        <main className="min-h-screen bg-gray-950 text-white pt-24 pb-16 px-6">
            <div className="max-w-md mx-auto text-center space-y-4">
                <p className="text-red-400 font-semibold text-lg">Admin error</p>
                <p className="text-gray-500 text-sm">An unexpected error occurred. Check Sentry for details.</p>
                <div className="flex items-center justify-center gap-4 pt-2">
                    <button
                        onClick={reset}
                        className="px-4 py-2 text-sm font-semibold bg-[#D4AF37] text-gray-950 rounded-lg hover:bg-[#b8912a] transition">
                        Try again
                    </button>
                    <Link href="/admin" className="text-sm text-gray-400 hover:text-white transition">
                        ← Admin
                    </Link>
                </div>
            </div>
        </main>
    );
}
