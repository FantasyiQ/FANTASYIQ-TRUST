'use client';

import { useInstallPrompt } from './useInstallPrompt';

export default function InstallInstructions() {
    const { isAndroid, isStandalone, canPromptInstall, promptInstall } = useInstallPrompt();

    if (isStandalone) {
        return (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                <h2 className="font-semibold text-lg mb-1">Install App</h2>
                <p className="text-gray-400 text-sm">FiQ is already installed on this device.</p>
            </div>
        );
    }

    return (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
            <div>
                <h2 className="font-semibold text-lg">Install App</h2>
                <p className="text-gray-400 text-sm mt-1">
                    Add FiQ to your home screen for one-tap access, no browser bar.
                </p>
            </div>

            {isAndroid && canPromptInstall && (
                <button
                    onClick={promptInstall}
                    className="bg-[#D4AF37] hover:bg-[#BF9D2F] text-gray-950 font-semibold px-4 py-2 rounded-lg text-sm transition"
                >
                    Install Now
                </button>
            )}

            <div className="grid sm:grid-cols-2 gap-4">
                <div className="bg-gray-800/40 rounded-xl p-4">
                    <p className="text-white font-medium text-sm mb-2">iPhone / iPad (Safari)</p>
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
        </div>
    );
}
