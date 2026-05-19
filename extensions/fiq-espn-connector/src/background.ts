// FiQ ESPN Connector — background service worker (Manifest V3)
// Receives messages from fantasyiq-trust.vercel.app, reads ESPN cookies,
// and returns them to the requesting page. Never stores credentials.

import type { FiQMessage, ExtensionResponse } from './types';

// Respond to external messages from the FiQ web app
chrome.runtime.onMessageExternal.addListener(
    (
        message: FiQMessage,
        _sender: chrome.runtime.MessageSender,
        sendResponse: (response: ExtensionResponse) => void,
    ) => {
        if (message.type === 'FIQ_PING') {
            sendResponse({ ok: true, espn_s2: '', swid: '' });
            return true;
        }

        if (message.type === 'FIQ_REQUEST_ESPN_COOKIES') {
            handleCookieRequest().then(sendResponse);
            return true; // keep message channel open for async response
        }
    },
);

async function handleCookieRequest(): Promise<ExtensionResponse> {
    const ESPN_URL = 'https://www.espn.com';

    const [espnS2Cookie, swidCookie] = await Promise.all([
        chrome.cookies.get({ url: ESPN_URL, name: 'espn_s2' }),
        chrome.cookies.get({ url: ESPN_URL, name: 'SWID' }),
    ]);

    if (!espnS2Cookie?.value || !swidCookie?.value) {
        return { ok: false, error: 'missing_cookies' };
    }

    return {
        ok:      true,
        espn_s2: espnS2Cookie.value,
        swid:    swidCookie.value,
    };
}
