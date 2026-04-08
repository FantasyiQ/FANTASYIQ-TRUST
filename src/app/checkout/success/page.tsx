import { redirect } from 'next/navigation';
import Link from 'next/link';
import { stripe } from '@/lib/stripe';

export default async function CheckoutSuccessPage({
    searchParams,
}: {
    searchParams: Promise<{ session_id?: string }>;
}) {
    const { session_id } = await searchParams;
    if (!session_id) redirect('/pricing');

    const session = await stripe.checkout.sessions.retrieve(session_id);
    if (session.payment_status !== 'paid' && session.status !== 'complete') {
        redirect('/pricing');
    }

    const tier = session.metadata?.tier ?? 'your plan';
    const formattedTier = tier
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());

    return (
        <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center px-6">
            <div className="max-w-md w-full text-center">
                <div className="text-6xl mb-6">🏆</div>
                <h1 className="text-3xl font-bold mb-3">You&apos;re in!</h1>
                <p className="text-gray-400 text-lg mb-2">
                    Welcome to{' '}
                    <span className="text-[#C8A951] font-semibold">{formattedTier}</span>.
                </p>
                <p className="text-gray-500 text-sm mb-10">
                    Your subscription is active. Head to your dashboard to get started.
                </p>

                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <Link
                        href="/dashboard"
                        className="bg-[#C8A951] hover:bg-[#b8992f] text-gray-950 font-bold px-8 py-3 rounded-lg transition"
                    >
                        Go to Dashboard
                    </Link>
                    <Link
                        href="/pricing"
                        className="border border-gray-700 hover:border-gray-500 text-gray-300 font-semibold px-8 py-3 rounded-lg transition"
                    >
                        View Plans
                    </Link>
                </div>
            </div>
        </main>
    );
}
