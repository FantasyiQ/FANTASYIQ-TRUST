'use client';

import Link from 'next/link';

export default function LeagueError({ error }: { error: Error }) {
    return (
        <main className="min-h-screen bg-gray-950 text-white pt-24 pb-16 px-6">
            <div className="max-w-2xl mx-auto text-center space-y-4">
                <p className="text-red-400 font-semibold">Failed to load league</p>
                <p className="text-gray-500 text-sm">{error.message}</p>
                <Link href="/dashboard" className="inline-block text-[#C8A951] hover:underline text-sm">
                    ← Back to Dashboard
                </Link>
            </div>
        </main>
    );
}
