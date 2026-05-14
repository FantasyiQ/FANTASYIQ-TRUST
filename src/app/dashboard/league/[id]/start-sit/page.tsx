import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function StartSitRedirectPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    redirect(`/dashboard/league/${id}/fantasyiq/start-sit`);
}
