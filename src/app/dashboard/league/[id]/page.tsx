import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';

export default async function LeagueRootPage({
    params,
    searchParams,
}: {
    params: Promise<{ id: string }>;
    searchParams: Promise<Record<string, string | string[]>>;
}) {
    const { id } = await params;
    const sp = await searchParams;
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
        if (Array.isArray(v)) v.forEach(val => qs.append(k, val));
        else qs.set(k, v);
    }
    const query = qs.toString();

    const league = await prisma.league.findUnique({
        where:  { id },
        select: { leagueType: true },
    });

    const isDynasty = league?.leagueType === 'Dynasty';
    const base = isDynasty ? 'overview' : 'fantasyiq';
    redirect(`/dashboard/league/${id}/${base}${query ? `?${query}` : ''}`);
}
