import Link from 'next/link';

export default function Footer() {
    return (
        <footer className="border-t border-gray-800 bg-gray-950 mt-16">
            <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-gray-600">
                <span>© {new Date().getFullYear()} FantasyiQ Trust. All rights reserved.</span>
                <nav className="flex flex-wrap items-center gap-5">
                    <Link href="/terms"   className="hover:text-gray-400 transition">Terms of Service</Link>
                    <Link href="/privacy" className="hover:text-gray-400 transition">Privacy Policy</Link>
                    <Link href="/cookies" className="hover:text-gray-400 transition">Cookie Notice</Link>
                </nav>
            </div>
        </footer>
    );
}
