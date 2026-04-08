import { redirect } from 'next/navigation';
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

    return (
        <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center px-6">
            <div className="max-w-md w-full text-center">
                <div className="text-6xl mb-6">🏆</div>
                <h1 className="text-3xl font-bold mb-3">Welcome to FantasyIQ Trust!</h1>
                <p className="text-gray-400 text-lg mb-8">
                    Setting up your account…
                </p>
                {/* Spinner */}
                <div className="flex justify-center mb-8">
                    <div className="w-8 h-8 border-2 border-[#C8A951] border-t-transparent rounded-full animate-spin" />
                </div>
                <p className="text-gray-600 text-sm mb-4">Redirecting you to your dashboard…</p>
                <a
                    href="/dashboard"
                    className="text-[#C8A951] hover:underline text-sm font-medium"
                >
                    Click here if not redirected
                </a>
            </div>

            {/* Auto-redirect — full page load so navbar gets fresh session data */}
            <script
                dangerouslySetInnerHTML={{
                    __html: `window.location.href = '/dashboard';`,
                }}
            />
        </main>
    );
}
