// Shared types for FiQ ESPN Connector extension

export type MessageType = 'FIQ_REQUEST_ESPN_COOKIES' | 'FIQ_PING';

export interface FiQMessage {
    type: MessageType;
}

export interface CookieResponse {
    ok:      true;
    espn_s2: string;
    swid:    string;
}

export interface ErrorResponse {
    ok:    false;
    error: 'missing_cookies' | 'no_response' | 'extension_not_available';
}

export type ExtensionResponse = CookieResponse | ErrorResponse;
