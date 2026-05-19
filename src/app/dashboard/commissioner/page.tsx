import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { computeActivationStage, STAGE_ORDER, STAGE_LABELS } from '@/lib/commissioner-activation';

const FEATURES = [
    {
        href:        '/dashboard/commissioner/dues',
        icon:        '💰',
        title:       'League Dues & Payout Tracker',
        description: 'Track every dollar in and out. Know exactly who\'s paid, who owes, and where the money goes.',
    },
    {
        href:        '/dashboard/commissioner/settings',
        icon:        '⚙️',
        title:       'League Settings Manager',
        description: 'Review and compare your league settings across all synced leagues in one place.',
    },
    {
        href:        '/dashboard/commissioner/calendar',
        icon:        '📅',
        title:       'Season Calendar',
        description: 'Key dates, trade deadlines, and playoff schedules — all in one view.',
    },
    {
        href:        '/dashboard/commissioner/announcements',
        icon:        '📣',
        title:       'Commissioner Announcements',
        description: 'Store your rulebook, bylaws, and league documents. Draft and send announcements to keep your managers in the loop.',
    },
] as const;

export default async function CommissionerHubPage() {
    const session = await auth();
    if (!session?.user?.id) redirect('/sign-in');

    const { stage, completedStages, nextStep } = await computeActivationStage(session.user.id);

    // Show activation banner unless fully activated
    const showBanner = stage !== 'renewed' && stage !== 'tools_active';
    const totalSteps = STAGE_ORDER.length;
    const doneSteps  = completedStages.length;
    const pct        = Math.round((doneSteps / totalSteps) * 100);

    return (
        <main className="min-h-screen bg-gray-950 text-white pt-24 pb-16 px-6">
            <div className="max-w-5xl mx-auto space-y-8">

                {/* Header */}
                <div>
                    <Link href="/dashboard" className="text-gray-500 hover:text-gray-300 text-sm transition">
                        ← Back to Dashboard
                    </Link>
                    <h1 className="text-3xl font-bold mt-3">Commissioner Hub</h1>
                    <p className="text-gray-400 mt-1">Manage your league like a pro.</p>
                </div>

                {/* Activation progress banner */}
                {showBanner && nextStep && (
                    <div className="bg-gray-900 border border-[#D4AF37]/30 rounded-2xl p-6 space-y-4">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <p className="text-xs font-semibold text-[#D4AF37] uppercase tracking-wider mb-1">
                                    Setup Progress — {doneSteps} of {totalSteps} steps
                                </p>
                                <p className="text-white font-semibold">{nextStep.title}</p>
                            </div>
                            <Link
                                href={nextStep.href}
                                className="shrink-0 bg-[#D4AF37] hover:bg-[#c49b2d] text-black text-sm font-bold px-4 py-2 rounded-lg transition"
                            >
                                {nextStep.cta}
                            </Link>
                        </div>

                        {/* Progress bar */}
                        <div className="space-y-2">
                            <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-[#D4AF37] rounded-full transition-all duration-500"
                                    style={{ width: `${pct}%` }}
                                />
                            </div>
                            <div className="flex gap-1 flex-wrap">
                                {STAGE_ORDER.map(s => {
                                    const done = completedStages.includes(s);
                                    const current = s === stage;
                                    return (
                                        <span
                                            key={s}
                                            className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${
                                                done
                                                    ? 'bg-[#D4AF37]/10 border-[#D4AF37]/40 text-[#D4AF37]'
                                                    : current
                                                    ? 'bg-gray-800 border-gray-600 text-white'
                                                    : 'bg-gray-900 border-gray-800 text-gray-600'
                                            }`}
                                        >
                                            {STAGE_LABELS[s]}
                                        </span>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}

                {/* Feature cards */}
                <div className="grid sm:grid-cols-2 gap-4">
                    {FEATURES.map((f) => (
                        <Link
                            key={f.href}
                            href={f.href}
                            className="group block bg-gray-900 border border-gray-800 hover:border-[#D4AF37]/50 rounded-2xl p-6 transition"
                        >
                            <div className="text-3xl mb-3">{f.icon}</div>
                            <h2 className="text-lg font-bold text-white group-hover:text-[#D4AF37] transition mb-2">
                                {f.title}
                            </h2>
                            <p className="text-gray-500 text-sm leading-relaxed">{f.description}</p>
                            <div className="mt-4 flex items-center gap-1 text-[#D4AF37] text-sm font-semibold opacity-0 group-hover:opacity-100 transition">
                                Open <span>→</span>
                            </div>
                        </Link>
                    ))}
                </div>

            </div>
        </main>
    );
}
