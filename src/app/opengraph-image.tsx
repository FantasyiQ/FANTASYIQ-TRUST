import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt     = 'FantasyiQ Trust — Your League Dues. Protected.';
export const size    = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
    return new ImageResponse(
        (
            <div
                style={{
                    background: '#030712',
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'sans-serif',
                    position: 'relative',
                }}
            >
                {/* Gold top bar */}
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 6, background: '#D4AF37' }} />

                {/* FiQ wordmark */}
                <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: 8, color: '#D4AF37', marginBottom: 24 }}>
                    FiQ
                </div>

                {/* Main headline */}
                <div style={{ fontSize: 64, fontWeight: 800, color: '#ffffff', textAlign: 'center', lineHeight: 1.1, maxWidth: 900 }}>
                    Your League Dues.
                    <span style={{ color: '#D4AF37' }}> Protected.</span>
                </div>

                {/* Subhead */}
                <div style={{ fontSize: 26, color: '#9ca3af', marginTop: 28, textAlign: 'center', maxWidth: 700 }}>
                    Zero fees. Zero skimming. Total trust.
                </div>

                {/* Domain */}
                <div style={{ position: 'absolute', bottom: 36, fontSize: 18, color: '#4b5563', letterSpacing: 2 }}>
                    fantasyiqtrust.com
                </div>

                {/* Gold bottom bar */}
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 6, background: '#D4AF37' }} />
            </div>
        ),
        { ...size },
    );
}
