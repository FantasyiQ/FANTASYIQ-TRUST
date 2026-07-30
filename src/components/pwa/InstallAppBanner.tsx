'use client';

import { useEffect, useState } from 'react';
import { useInstallPrompt } from './useInstallPrompt';

const DISMISSED_KEY = 'fiq-install-banner-dismissed';

export default function InstallAppBanner() {
    const { isIOS, isIOSSafari, isAndroid, isStandalone, canPromptInstall, promptInstall } = useInstallPrompt();
    const [dismissed, setDismissed] = useState(true); // default hidden until localStorage check runs

    useEffect(() => {
        setDismissed(localStorage.getItem(DISMISSED_KEY) === '1');
    }, []);

    if (isStandalone || dismissed || !(isIOS || isAndroid)) return null;

    function dismiss() {
        localStorage.setItem(DISMISSED_KEY, '1');
        setDismissed(true);
    }

    return (
        <div className="rounded-xl bg-gray-900 border border-[#D4AF37]/30 px-5 py-4 flex items-start justify-between gap-4 flex-wrap">
            <div>
                <p className="text-[#D4AF37] font-semibold text-sm">Install FiQ on your phone</p>
                <p className="text-gray-400 text-xs mt-0.5">
                    {isIOS && !isIOSSafari
                        ? 'You need Safari to install — tap ••• or Share, then "Open in Safari," then Share → "Add to Home Screen."'
                        : isIOS
                            ? 'Tap the Share icon, then "Add to Home Screen" for one-tap access.'
                            : 'Add FiQ to your home screen for one-tap access, no browser bar.'}
                </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
                {isAndroid && canPromptInstall && (
                    <button
                        onClick={promptInstall}
                        className="bg-[#D4AF37] hover:bg-[#BF9D2F] text-gray-950 font-semibold px-4 py-1.5 rounded-lg text-sm transition"
                    >
                        Install
                    </button>
                )}
                <button onClick={dismiss} className="text-gray-500 hover:text-gray-300 text-sm" aria-label="Dismiss">
                    ✕
                </button>
            </div>
        </div>
    );
}
