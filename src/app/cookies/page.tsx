import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
    title: 'Cookie Notice — FantasyiQ Trust',
    description: 'How FantasyiQ Trust uses cookies and similar technologies.',
};

export default function CookieNoticePage() {
    return (
        <div className="min-h-screen bg-black text-white">
            <div className="max-w-3xl mx-auto px-6 py-16 space-y-10">

                {/* Header */}
                <div className="space-y-2 border-b border-gray-800 pb-8">
                    <p className="text-[10px] font-bold tracking-widest text-[#D4AF37] uppercase">Legal</p>
                    <h1 className="text-3xl font-bold text-white">Cookie Notice</h1>
                    <p className="text-gray-500 text-sm">Last updated: May 21, 2026</p>
                </div>

                <LegalSection title="1. What Are Cookies">
                    <p>
                        Cookies are small text files that a website stores on your device when you visit. They are widely used to
                        make websites work efficiently, remember your preferences, and provide basic reporting information to site
                        operators. Similar technologies — such as local storage and session storage — serve comparable purposes and
                        are covered by this notice.
                    </p>
                </LegalSection>

                <LegalSection title="2. How FantasyiQ Trust Uses Cookies">
                    <p>
                        FantasyiQ Trust uses cookies and similar storage technologies exclusively for the purposes described below.
                        We do <strong className="text-white">not</strong> use advertising cookies, cross-site tracking pixels,
                        or any technology that builds a profile of your browsing behaviour outside of FantasyiQ Trust.
                    </p>

                    <div className="mt-4 space-y-4">
                        <CookieRow
                            name="Authentication"
                            type="Strictly Necessary"
                            duration="Session / up to 30 days"
                            purpose="Keeps you signed in to your FantasyiQ Trust account across page loads. Without this cookie you would be signed out on every navigation."
                        />
                        <CookieRow
                            name="Session Management"
                            type="Strictly Necessary"
                            duration="Session"
                            purpose="Short-lived tokens that enable secure interactions between your browser and our servers. These expire when you close your browser or after a short idle period."
                        />
                        <CookieRow
                            name="Analytics"
                            type="Analytics"
                            duration="Up to 2 years"
                            purpose="Aggregate, anonymised data about pages visited, feature interactions, and session duration — collected via privacy-respecting analytics tooling (such as Vercel Analytics). This data cannot reasonably be used to identify you individually and is used solely to understand how the Service is used and to improve it."
                        />
                    </div>
                </LegalSection>

                <LegalSection title="3. Cookies We Do Not Use">
                    <p>FantasyiQ Trust does not use and will never use:</p>
                    <ul>
                        <li>Advertising or retargeting cookies</li>
                        <li>Cross-site tracking pixels or web beacons placed by third-party ad networks</li>
                        <li>Social-media tracking cookies</li>
                        <li>Fingerprinting scripts or other persistent cross-site identifiers</li>
                    </ul>
                </LegalSection>

                <LegalSection title="4. Third-Party Cookies">
                    <p>
                        FantasyiQ Trust does not knowingly load third-party advertising or analytics scripts that set their own cookies
                        on your device. Any analytics tooling we use is configured to operate in a privacy-preserving, first-party
                        context. We do not control cookies set directly by Sleeper, ESPN, NFL Fantasy, Yahoo Fantasy, or other third-party platforms you
                        access independently; please refer to those platforms&apos; own cookie notices for details.
                    </p>
                </LegalSection>

                <LegalSection title="5. Consent">
                    <p>
                        By continuing to use FantasyiQ Trust after this notice has been made available to you, you consent to the
                        placement of the cookies described in Section 2. Because all cookies we use are either strictly necessary
                        for the Service to function or are privacy-respecting analytics with no cross-site tracking, we do not
                        display a cookie-consent banner. If you do not consent to these cookies, please discontinue use of the
                        Service.
                    </p>
                </LegalSection>

                <LegalSection title="6. Managing and Disabling Cookies">
                    <p>
                        You can control cookies through your browser settings. Most browsers allow you to:
                    </p>
                    <ul>
                        <li>View cookies currently stored on your device</li>
                        <li>Delete individual cookies or all cookies for a given site</li>
                        <li>Block all cookies or cookies from specific sites</li>
                        <li>Set preferences for first-party vs. third-party cookies</li>
                    </ul>
                    <p className="mt-3">
                        Please note that disabling strictly necessary cookies (authentication and session management) will prevent
                        you from signing in to FantasyiQ Trust and using most features of the Service. Disabling analytics cookies will
                        not affect your ability to use the Service.
                    </p>
                    <p>
                        Browser-specific instructions for managing cookies can be found in your browser&apos;s help documentation.
                        Common browsers include{' '}
                        <span className="text-gray-300">Chrome</span>,{' '}
                        <span className="text-gray-300">Firefox</span>,{' '}
                        <span className="text-gray-300">Safari</span>, and{' '}
                        <span className="text-gray-300">Edge</span>.
                    </p>
                </LegalSection>

                <LegalSection title="7. Changes to This Notice">
                    <p>
                        We may update this Cookie Notice from time to time to reflect changes in the cookies we use or applicable
                        law. When we do, we will revise the &ldquo;Last updated&rdquo; date at the top of this page. Your continued use of the
                        Service after any update constitutes your acceptance of the revised notice.
                    </p>
                </LegalSection>

                <LegalSection title="8. Contact">
                    <p>
                        If you have questions about our use of cookies or this notice, please contact us at:
                    </p>
                    <div className="mt-3 bg-gray-900 border border-gray-800 rounded-xl px-5 py-4 text-sm text-gray-300">
                        <p className="font-semibold text-white">FantasyiQ Trust</p>
                        <p className="text-gray-400 mt-1">Legal@FantasyiQTrust.com</p>
                    </div>
                    <p className="mt-4">
                        For broader privacy questions, please review our{' '}
                        <Link href="/privacy" className="text-[#D4AF37] hover:underline">Privacy Policy</Link>.
                    </p>
                </LegalSection>

                {/* Footer nav */}
                <div className="border-t border-gray-800 pt-8 flex flex-wrap gap-4 text-xs text-gray-600">
                    <Link href="/terms"   className="hover:text-gray-400 transition">Terms of Service</Link>
                    <Link href="/privacy" className="hover:text-gray-400 transition">Privacy Policy</Link>
                    <Link href="/"        className="hover:text-gray-400 transition">← Back to FantasyiQ Trust</Link>
                </div>

            </div>
        </div>
    );
}

function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="space-y-3">
            <h2 className="text-lg font-bold text-white">{title}</h2>
            <div className="text-gray-400 text-sm leading-relaxed space-y-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5">
                {children}
            </div>
        </section>
    );
}

function CookieRow({
    name,
    type,
    duration,
    purpose,
}: {
    name: string;
    type: string;
    duration: string;
    purpose: string;
}) {
    return (
        <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4 space-y-2">
            <div className="flex flex-wrap items-center gap-3">
                <span className="font-semibold text-white text-sm">{name}</span>
                <span className="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded bg-gray-800 text-[#D4AF37]">
                    {type}
                </span>
                <span className="text-xs text-gray-500">{duration}</span>
            </div>
            <p className="text-gray-400 text-xs leading-relaxed">{purpose}</p>
        </div>
    );
}
