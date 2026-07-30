'use client';

import { useInstallPrompt } from './useInstallPrompt';
import ShareAppButton from './ShareAppButton';

export default function InstallInstructions() {
    const { isIOS, isIOSSafari, isAndroid, isStandalone, canPromptInstall, promptInstall } = useInstallPrompt();

    return (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
            <div>
                <h2 className="font-semibold text-lg">Install App</h2>
                <p className="text-gray-400 text-sm mt-1">
                    {isStandalone
                        ? 'FiQ is already installed on this device. Share it with your league mates:'
                        : 'Add FiQ to your home screen for one-tap access, no browser bar.'}
                </p>
            </div>

            {!isStandalone && isIOS && !isIOSSafari && (
                <div className="rounded-lg bg-yellow-900/20 border border-yellow-700/50 px-4 py-3">
                    <p className="text-yellow-400 text-sm font-medium">You&apos;re not in Safari right now</p>
                    <p className="text-yellow-400/70 text-xs mt-0.5">
                        On iPhone/iPad, installing only works from Safari — Chrome, the Google app, and links opened
                        from Gmail/Search don&apos;t support it. Tap the ••• or Share icon and choose &quot;Open in Safari,&quot;
                        then follow the steps below.
                    </p>
                </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
                {!isStandalone && isAndroid && canPromptInstall && (
                    <button
                        onClick={promptInstall}
                        className="bg-[#D4AF37] hover:bg-[#BF9D2F] text-gray-950 font-semibold px-4 py-2 rounded-lg text-sm transition"
                    >
                        Install Now
                    </button>
                )}
                <ShareAppButton />
            </div>

            {!isStandalone && (
                <div className="grid sm:grid-cols-2 gap-4">
                    <div className="bg-gray-800/40 rounded-xl p-4">
                        <p className="text-white font-medium text-sm mb-2">iPhone / iPad</p>
                        <p className="text-gray-500 text-[11px] mb-2">Must be Safari — Chrome/Google app won&apos;t work.</p>
                        <ol className="text-gray-400 text-xs space-y-1 list-decimal list-inside">
                            <li>Open fantasyiqtrust.com in Safari</li>
                            <li>Tap the Share icon (square with an arrow)</li>
                            <li>Tap &quot;Add to Home Screen&quot;</li>
                            <li>Tap Add</li>
                        </ol>
                    </div>
                    <div className="bg-gray-800/40 rounded-xl p-4">
                        <p className="text-white font-medium text-sm mb-2">Android (Chrome)</p>
                        <ol className="text-gray-400 text-xs space-y-1 list-decimal list-inside">
                            <li>Open fantasyiqtrust.com in Chrome</li>
                            <li>Tap the ⋮ menu (top right)</li>
                            <li>Tap &quot;Add to Home screen&quot; / &quot;Install app&quot;</li>
                            <li>Confirm</li>
                        </ol>
                    </div>
                </div>
            )}
        </div>
    );
}
