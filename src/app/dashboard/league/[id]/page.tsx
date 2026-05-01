import { redirect } from 'next/navigation';

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
    redirect(`/dashboard/league/${id}/overview${query ? `?${query}` : ''}`);
}
