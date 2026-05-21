'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { captureError } from '@/lib/sentry';

export default function RootError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        captureError(error, { boundary: 'root' });
    }, [error]);

    return (
        <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center px-6">
            <div className="max-w-md w-full text-center space-y-4">
                <p className="text-red-400 font-semibold text-lg">Something went wrong</p>
                <p className="text-gray-500 text-sm">{error.message || 'An unexpected error occurred.'}</p>
                <div className="flex items-center justify-center gap-4 pt-2">
                    <button
                        onClick={reset}
                        className="px-4 py-2 text-sm font-semibold bg-[#D4AF37] text-gray-950 rounded-lg hover:bg-[#b8912a] transition">
                        Try again
                    </button>
                    <Link href="/" className="text-sm text-gray-400 hover:text-white transition">
                        ← Home
                    </Link>
                </div>
            </div>
        </main>
    );
}
