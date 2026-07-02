import Link from 'next/link';

/**
 * Yahoo Fantasy attribution — REQUIRED by Yahoo's API terms wherever Yahoo
 * Fantasy Sports API data is displayed. Renders the official Yahoo Fantasy logo
 * (used exactly as provided) plus "Fantasy data provided by Yahoo Fantasy",
 * linking back to Yahoo Fantasy.
 *
 * Branding rules (do not violate):
 *   • Use Yahoo's official word marks/logos ONLY as provided.
 *   • Do NOT recolor, rotate, invert, resize out of proportion, add shadows/
 *     strokes/textures/effects, add other graphics, or combine with other marks.
 *
 * SETUP: drop Yahoo's official logo asset (from your onboarding materials) at
 * /public/yahoo/yahoo-fantasy-logo.png — do not substitute a self-made logo.
 */
export default function YahooAttribution({ className = '' }: { className?: string }) {
    return (
        <Link
            href="https://sports.yahoo.com/fantasy/"
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center gap-2 text-xs text-gray-500 hover:text-gray-300 transition ${className}`}
        >
            {/* Official Yahoo Fantasy logo — rendered as-is, fixed proportions, no effects. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/yahoo/yahoo-fantasy-logo.png" alt="Yahoo Fantasy" className="h-4 w-auto" />
            <span>Fantasy data provided by Yahoo Fantasy</span>
        </Link>
    );
}
