import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
    title: '404 — Page Not Found | FantasyiQ',
    robots: { index: false },
};

export default function NotFound() {
    return (
        <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center px-6">
            <div className="text-center space-y-6 max-w-md">
                <p className="text-[#D4AF37] text-sm font-bold tracking-widest uppercase">404</p>
                <h1 className="text-4xl font-bold text-white">Page not found</h1>
                <p className="text-gray-400 text-sm leading-relaxed">
                    We couldn&apos;t find the page you were looking for. It may have been moved or deleted.
                </p>
                <div className="flex items-center justify-center gap-4 pt-2">
                    <Link
                        href="/dashboard"
                        className="bg-[#D4AF37] hover:bg-[#BF9D2F] text-gray-950 font-bold px-6 py-2.5 rounded-lg text-sm transition"
                    >
                        Go to Dashboard
                    </Link>
                    <Link
                        href="/"
                        className="border border-gray-700 hover:border-gray-500 text-gray-300 hover:text-white font-medium px-5 py-2.5 rounded-lg text-sm transition"
                    >
                        Home
                    </Link>
                </div>
            </div>
        </main>
    );
}
