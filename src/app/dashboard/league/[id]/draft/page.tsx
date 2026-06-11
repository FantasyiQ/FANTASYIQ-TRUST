import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import Link from 'next/link';

export default async function DraftCenterPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;

    const session = await auth();
    if (!session?.user?.id) redirect('/sign-in');

    const league = await prisma.league.findUnique({
        where:  { id },
        select: { id: true, userId: true, leagueName: true, leagueType: true },
    });

    if (!league || league.userId !== session.user.id) redirect('/dashboard');

    const base = `/dashboard/league/${id}/draft`;

    const tools = [
        {
            href:        `${base}/strategy`,
            icon:        '📋',
            title:       'Draft Board',
            description: 'Rookie rankings, dynasty pick values, and team trajectory — calibrated to your roster settings and league format.',
            badge:       null,
        },
        {
            href:        `${base}/assistant`,
            icon:        '⚡',
            title:       'Live Draft',
            description: 'Real-time draft assistant. See who\'s available, who fits your roster, and who to target next as picks come in.',
            badge:       'Dynasty only',
        },
        {
            href:        `${base}/report`,
            icon:        '📊',
            title:       'Draft Report Card',
            description: 'Grade your draft after it wraps. See value over replacement, positional fit, and how your picks stack up against the room.',
            badge:       'Dynasty only',
        },
        {
            href:        `${base}/mock`,
            icon:        '🎯',
            title:       'Mock Draft',
            description: 'Practice draft scenarios against AI opponents calibrated to your league — scoring format, roster needs, and positional weights included.',
            badge:       null,
        },
    ];

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Draft War Room</h1>
                    <p className="text-gray-500 text-sm mt-0.5">{league.leagueName}</p>
                </div>
                <div className="shrink-0 text-right">
                    <div className="text-[10px] font-bold tracking-widest text-[#D4AF37]">FantasyiQ</div>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {tools.map(tool => (
                    tool.href ? (
                        <Link
                            key={tool.title}
                            href={tool.href}
                            className="group bg-gray-900 border border-gray-800 hover:border-[#D4AF37]/40 rounded-2xl p-6 space-y-3 transition-all duration-200"
                        >
                            <div className="flex items-start justify-between gap-3">
                                <span className="text-3xl">{tool.icon}</span>
                                {tool.badge && (
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-800 border border-gray-700 text-gray-500 shrink-0">
                                        {tool.badge}
                                    </span>
                                )}
                            </div>
                            <div>
                                <p className="font-bold text-white group-hover:text-[#D4AF37] transition-colors">{tool.title}</p>
                                <p className="text-gray-400 text-sm mt-1 leading-relaxed">{tool.description}</p>
                            </div>
                            <p className="text-[#D4AF37] text-xs font-semibold">Open →</p>
                        </Link>
                    ) : (
                        <div
                            key={tool.title}
                            className="bg-gray-900/50 border border-gray-800/50 rounded-2xl p-6 space-y-3 opacity-60"
                        >
                            <div className="flex items-start justify-between gap-3">
                                <span className="text-3xl">{tool.icon}</span>
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#D4AF37]/10 border border-[#D4AF37]/30 text-[#D4AF37] shrink-0">
                                    {tool.badge}
                                </span>
                            </div>
                            <div>
                                <p className="font-bold text-white">{tool.title}</p>
                                <p className="text-gray-400 text-sm mt-1 leading-relaxed">{tool.description}</p>
                            </div>
                        </div>
                    )
                ))}
            </div>
        </div>
    );
}
