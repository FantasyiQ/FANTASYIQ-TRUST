import { redirect } from 'next/navigation';

export default async function DraftCenterPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    redirect(`/dashboard/league/${id}/draft/strategy`);
}
