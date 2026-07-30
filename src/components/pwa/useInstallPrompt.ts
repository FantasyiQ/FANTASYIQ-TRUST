'use client';

import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// Shared device/install-state detection for the PWA install banner and the
// Account Settings install section — one source of truth for both.
export function useInstallPrompt() {
    const [isIOS, setIsIOS]             = useState(false);
    const [isIOSSafari, setIsIOSSafari] = useState(false);
    const [isAndroid, setIsAndroid]     = useState(false);
    const [isStandalone, setIsStandalone] = useState(false);
    const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

    useEffect(() => {
        const ua = navigator.userAgent;
        // iPadOS Safari has reported a desktop-Mac user agent by default since
        // iOS 13 (no "iPad" substring at all) — detect it via the touch-point
        // heuristic instead: a real Mac reports maxTouchPoints 0, an iPad
        // masquerading as one reports >1.
        const isIPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
        const iOS = (/iPad|iPhone|iPod/.test(ua) || isIPadOS) && !('MSStream' in window);
        // "Add to Home Screen" only exists in real Safari on iOS — Chrome
        // (CriOS), Firefox (FxiOS), Edge (EdgiOS), Opera (OPiOS), and the
        // Google app/in-app webview (GSA) all render with WebKit but don't
        // expose it, so a Google search result or Gmail link opened on iPhone
        // silently can't install unless the user backs out to Safari first.
        const nonSafariIOSBrowser = /CriOS|FxiOS|EdgiOS|OPiOS|GSA/.test(ua);
        setIsIOS(iOS);
        setIsIOSSafari(iOS && !nonSafariIOSBrowser);
        setIsAndroid(/Android/.test(ua));
        setIsStandalone(
            window.matchMedia('(display-mode: standalone)').matches
            || (navigator as unknown as { standalone?: boolean }).standalone === true,
        );

        const onBeforeInstall = (e: Event) => {
            e.preventDefault();
            setDeferredPrompt(e as BeforeInstallPromptEvent);
        };
        window.addEventListener('beforeinstallprompt', onBeforeInstall);
        return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall);
    }, []);

    async function promptInstall() {
        if (!deferredPrompt) return;
        await deferredPrompt.prompt();
        await deferredPrompt.userChoice;
        setDeferredPrompt(null);
    }

    return { isIOS, isIOSSafari, isAndroid, isStandalone, canPromptInstall: !!deferredPrompt, promptInstall };
}
