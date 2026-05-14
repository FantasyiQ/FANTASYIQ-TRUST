import Link from 'next/link';

export default async function UpgradePage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const sp     = await searchParams;
    const reason = sp.reason as string | undefined;

    const isPlanLimit = reason === 'player_plan_limit';

    return (
        <main className="min-h-screen bg-gray-950 text-white pt-24 pb-16 px-6">
            <div className="max-w-lg mx-auto text-center space-y-6">
                <div className="text-5xl">⚡</div>
                <div>
                    {isPlanLimit ? (
                        <>
                            <h1 className="text-2xl font-bold">You&apos;ve reached your league limit</h1>
                            <p className="text-gray-400 text-sm mt-2">
                                Your current player plan is full. Upgrade to connect more leagues and keep your full toolkit.
                            </p>
                        </>
                    ) : (
                        <>
                            <h1 className="text-2xl font-bold">Upgrade your plan</h1>
                            <p className="text-gray-400 text-sm mt-2">
                                Unlock more leagues, advanced trade tools, and premium analytics.
                            </p>
                        </>
                    )}
                </div>

                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 text-left space-y-3">
                    <h2 className="font-semibold text-sm text-gray-300">Player Plan tiers</h2>
                    <ul className="space-y-2 text-sm">
                        <li className="flex items-center justify-between">
                            <span className="text-white font-medium">Pro</span>
                            <span className="text-gray-500">Up to 2 leagues</span>
                        </li>
                        <li className="flex items-center justify-between">
                            <span className="text-white font-medium">All-Pro</span>
                            <span className="text-gray-500">Up to 5 leagues</span>
                        </li>
                        <li className="flex items-center justify-between">
                            <span className="text-white font-medium">Elite</span>
                            <span className="text-gray-500">Unlimited leagues</span>
                        </li>
                    </ul>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <Link
                        href="/pricing?tab=player"
                        className="bg-[#D4AF37] hover:bg-[#BF9D2F] text-gray-950 font-bold px-6 py-3 rounded-xl transition text-sm"
                    >
                        View Player Plans →
                    </Link>
                    <Link
                        href="/dashboard"
                        className="border border-gray-700 hover:border-gray-500 text-gray-300 font-semibold px-6 py-3 rounded-xl transition text-sm"
                    >
                        Back to Dashboard
                    </Link>
                </div>
            </div>
        </main>
    );
}
