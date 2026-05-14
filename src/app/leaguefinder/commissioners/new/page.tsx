export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { auth }     from '@/lib/auth';
import { prisma }   from '@/lib/prisma';
import Link         from 'next/link';
import RegisterCommissionerForm from './_RegisterCommissionerForm';

export default async function RegisterCommissionerPage() {
    const session = await auth();
    if (!session?.user) redirect('/sign-in?callbackUrl=/leaguefinder/commissioners/new');

    // Check if user already owns a commissioner profile
    const existing = await prisma.lFCommissioner.findUnique({
        where: { ownerId: session.user.id },
    });

    if (existing) {
        redirect(`/leaguefinder/commissioners/${existing.id}/edit`);
    }

    return (
        <div className="min-h-screen bg-gray-950 text-white">
            <div className="max-w-lg mx-auto px-4 py-12 space-y-8">

                <nav className="text-xs text-gray-600 flex items-center gap-1.5">
                    <Link href="/leaguefinder" className="hover:text-gray-400 transition">League Finder</Link>
                    <span>/</span>
                    <span className="text-white">Register as Commissioner</span>
                </nav>

                <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6 space-y-6">
                    <div>
                        <h1 className="text-xl font-bold text-white">Register as Commissioner</h1>
                        <p className="text-gray-500 text-sm mt-1">
                            Create your commissioner profile so players can find your leagues and leave reviews.
                        </p>
                    </div>

                    <div className="space-y-2">
                        {[
                            '📋  List your leagues for discovery',
                            '💬  Respond to reviews publicly',
                            '🏅  Earn badges as you build your reputation',
                            '📊  Manage join requests and waitlists',
                        ].map(item => (
                            <div key={item} className="text-sm text-gray-400">{item}</div>
                        ))}
                    </div>

                    <RegisterCommissionerForm />
                </div>
            </div>
        </div>
    );
}
