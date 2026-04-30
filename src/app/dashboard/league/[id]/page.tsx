import { redirect } from 'next/navigation';

export default async function LeagueRootPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    redirect(`/dashboard/league/${id}/overview`);
}
