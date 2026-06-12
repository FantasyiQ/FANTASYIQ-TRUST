export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import ResetConfirm from './ResetConfirm';

export default async function ResetTestDataPage() {
    const session = await auth();
    if (!session?.user?.id) redirect('/sign-in');

    // Guard: must have DEV_RESET_ENABLED=true in env
    if (process.env.DEV_RESET_ENABLED !== 'true') {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center p-8">
                <div className="bg-gray-950 border border-gray-800 rounded-2xl p-8 max-w-sm text-center space-y-3">
                    <p className="text-3xl">🔒</p>
                    <h1 className="font-semibold text-white">Reset not available</h1>
                    <p className="text-gray-400 text-sm">
                        Set <code className="text-[#D4AF37] bg-black/60 px-1 rounded">DEV_RESET_ENABLED=true</code> in your environment to unlock this route.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-black flex items-center justify-center p-6">
            <ResetConfirm />
        </div>
    );
}
