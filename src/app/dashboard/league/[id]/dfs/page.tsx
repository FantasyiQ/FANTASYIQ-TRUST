import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function DFSRedirectPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    redirect(`/dashboard/league/${id}/fantasyiq/dfs`);
}
