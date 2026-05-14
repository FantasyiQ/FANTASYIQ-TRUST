export const dynamic = 'force-dynamic';

import { redirect, notFound } from 'next/navigation';
import { auth }   from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import Link       from 'next/link';
import EditCommissionerForm from './_EditCommissionerForm';

export default async function EditCommissionerPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id }  = await params;
    const session = await auth();

    if (!session?.user) redirect(`/sign-in`);

    const commissioner = await prisma.lFCommissioner.findUnique({ where: { id } });
    if (!commissioner) notFound();
    if (commissioner.ownerId !== session.user.id) {
        redirect(`/leaguefinder/commissioners/${id}/claim`);
    }

    const handles = (commissioner.platformHandles ?? {}) as Record<string, string>;

    return (
        <div className="min-h-screen bg-gray-950 text-white">
            <div className="max-w-lg mx-auto px-4 py-12 space-y-8">

                <nav className="text-xs text-gray-600 flex items-center gap-1.5">
                    <Link href="/leaguefinder" className="hover:text-gray-400 transition">League Finder</Link>
                    <span>/</span>
                    <Link href={`/leaguefinder/commissioners/${id}`} className="hover:text-gray-400 transition">
                        {commissioner.displayName}
                    </Link>
                    <span>/</span>
                    <span className="text-white">Edit</span>
                </nav>

                <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6 space-y-6">
                    <h1 className="text-xl font-bold text-white">Edit Commissioner Profile</h1>

                    <EditCommissionerForm
                        commissionerId={id}
                        initialDisplayName={commissioner.displayName}
                        initialHandles={handles}
                    />
                </div>

                <div className="text-center">
                    <Link
                        href={`/leaguefinder/commissioners/${id}`}
                        className="text-xs text-gray-600 hover:text-gray-400 transition"
                    >
                        ← Back to profile
                    </Link>
                </div>
            </div>
        </div>
    );
}
