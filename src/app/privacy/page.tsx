import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
    title: 'Privacy Policy — FantasyiQ',
    description: 'How FantasyiQ collects, uses, and protects your data.',
};

export default function PrivacyPolicyPage() {
    return (
        <div className="min-h-screen bg-black text-white">
            <div className="max-w-3xl mx-auto px-6 py-16 space-y-10">

                {/* Header */}
                <div className="space-y-2 border-b border-gray-800 pb-8">
                    <p className="text-[10px] font-bold tracking-widest text-[#D4AF37] uppercase">Legal</p>
                    <h1 className="text-3xl font-bold text-white">Privacy Policy</h1>
                    <p className="text-gray-500 text-sm">Last updated: May 8, 2026</p>
                </div>

                <LegalSection title="1. Introduction">
                    <p>
                        FantasyiQ (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) operates the FantasyiQ platform, accessible at{' '}
                        <span className="text-[#D4AF37]">fantasyiq.app</span> (the &ldquo;Service&rdquo;). This Privacy Policy explains how we collect,
                        use, disclose, and safeguard information when you use our Service. Please read this policy carefully. If you do not
                        agree with its terms, please discontinue use of the Service.
                    </p>
                </LegalSection>

                <LegalSection title="2. Information We Do Not Collect">
                    <p>FantasyiQ is designed with data minimisation as a core principle. <strong className="text-white">We do not collect:</strong></p>
                    <ul>
                        <li>Email addresses or contact information</li>
                        <li>Passwords or authentication credentials for third-party platforms</li>
                        <li>Payment card numbers, bank account details, or billing addresses</li>
                        <li>Government-issued identification numbers</li>
                        <li>Physical addresses or precise geolocation data</li>
                        <li>Any sensitive personal information as defined under applicable privacy law</li>
                    </ul>
                </LegalSection>

                <LegalSection title="3. Information We Do Collect">
                    <p>To provide the Service, we process the following limited categories of information:</p>
                    <Subsection title="3.1 Fantasy League Data">
                        <p>
                            When you connect a Sleeper or ESPN league, we receive and store fantasy-football league data transmitted
                            by those platforms via their public APIs. This data includes league IDs, roster IDs, matchup data,
                            weekly projections, player statistics, standings, and scoring settings. This data does not constitute
                            personally identifiable information under most privacy frameworks; however, team names or usernames
                            chosen by you on those platforms may be incidentally included.
                        </p>
                    </Subsection>
                    <Subsection title="3.2 Account Identifiers">
                        <p>
                            If you create a FantasyiQ account, we store an internal account identifier, your display name as you
                            provide it, and a securely hashed authentication token. We do not store plain-text passwords.
                        </p>
                    </Subsection>
                    <Subsection title="3.3 Usage and Analytics Data">
                        <p>
                            We collect anonymised usage data (pages visited, feature interactions, session duration) via
                            privacy-respecting analytics tools. This data is aggregated and cannot reasonably be used to
                            identify you individually.
                        </p>
                    </Subsection>
                    <Subsection title="3.4 Log Data">
                        <p>
                            Our hosting infrastructure automatically records standard server log data (IP address, browser type,
                            referring URL, timestamp) for security and operational purposes. Log data is retained for no more
                            than 30 days and is not linked to individual accounts.
                        </p>
                    </Subsection>
                </LegalSection>

                <LegalSection title="4. Cookies and Session Tokens">
                    <p>We use cookies and similar storage technologies solely for the following purposes:</p>
                    <ul>
                        <li><strong className="text-white">Authentication:</strong> Session cookies keep you signed in across page loads.</li>
                        <li><strong className="text-white">Session Management:</strong> Short-lived tokens enable secure server interactions.</li>
                        <li><strong className="text-white">Analytics:</strong> First-party or privacy-preserving analytics scripts measure aggregate usage patterns.</li>
                    </ul>
                    <p className="mt-3">
                        We do <strong className="text-white">not</strong> use advertising cookies, cross-site tracking pixels, or any cookie
                        that builds a profile of your browsing behaviour outside of FantasyiQ. For a full description of the cookies
                        we use, please review our <Link href="/cookies" className="text-[#D4AF37] hover:underline">Cookie Notice</Link>.
                    </p>
                </LegalSection>

                <LegalSection title="5. How We Use Your Information">
                    <p>We use the information described above exclusively to:</p>
                    <ul>
                        <li>Provide, operate, and improve the Service</li>
                        <li>Compute analytics, projections, and intelligence features for your leagues</li>
                        <li>Authenticate your account and maintain security</li>
                        <li>Diagnose technical issues and ensure platform stability</li>
                        <li>Comply with applicable legal obligations</li>
                    </ul>
                    <p className="mt-3">We do not use your data for advertising, profiling, or any purpose unrelated to operating the Service.</p>
                </LegalSection>

                <LegalSection title="6. Sharing and Disclosure">
                    <p>
                        <strong className="text-white">We do not sell, rent, or trade your data.</strong> We do not share your data with
                        third parties for their own marketing purposes. We may disclose data only in the following limited circumstances:
                    </p>
                    <ul>
                        <li>
                            <strong className="text-white">Service Providers:</strong> We engage a small number of infrastructure providers
                            (e.g., database hosting, analytics) who process data solely on our behalf under strict data-processing agreements.
                        </li>
                        <li>
                            <strong className="text-white">Legal Requirements:</strong> We may disclose data if required by law, court order,
                            or to protect the rights, property, or safety of FantasyiQ, its users, or the public.
                        </li>
                        <li>
                            <strong className="text-white">Business Transfer:</strong> In the event of a merger, acquisition, or sale of
                            assets, user data may be transferred as part of that transaction. We will provide notice before your data
                            becomes subject to a materially different privacy policy.
                        </li>
                    </ul>
                </LegalSection>

                <LegalSection title="7. Third-Party Platforms">
                    <p>
                        FantasyiQ integrates with Sleeper and ESPN to retrieve your fantasy league data. Each of these platforms
                        operates under its own privacy policy, which governs how your data is collected and used by them:
                    </p>
                    <ul>
                        <li><strong className="text-white">Sleeper:</strong> <span className="text-gray-400">sleeper.com/privacy</span></li>
                        <li><strong className="text-white">ESPN:</strong> <span className="text-gray-400">espn.com/espn/editorial/story/_/id/privacy</span></li>
                    </ul>
                    <p className="mt-3">
                        We recommend reviewing those policies before connecting a league. FantasyiQ is not responsible for the
                        data practices of third-party platforms.
                    </p>
                </LegalSection>

                <LegalSection title="8. Data Retention">
                    <p>
                        We retain fantasy league data and account information for as long as your account remains active or as
                        needed to provide the Service. If you delete your account, we will remove your data within 30 days,
                        except where retention is required by law or for legitimate security purposes.
                    </p>
                </LegalSection>

                <LegalSection title="9. Your Rights and Data Deletion">
                    <p>Depending on your jurisdiction, you may have the right to:</p>
                    <ul>
                        <li>Access the data we hold about you</li>
                        <li>Request correction of inaccurate data</li>
                        <li>Request deletion of your data</li>
                        <li>Object to or restrict certain processing</li>
                        <li>Data portability</li>
                    </ul>
                    <p className="mt-3">
                        To exercise any of these rights, contact us using the information in Section 13. We will respond within
                        30 days. We may need to verify your identity before fulfilling a request.
                    </p>
                </LegalSection>

                <LegalSection title="10. Age Restriction">
                    <p>
                        FantasyiQ is intended for users who are at least 13 years of age. We do not knowingly collect or process
                        data from children under 13. If you believe a child under 13 has provided us with data, please contact us
                        immediately and we will take steps to delete that information.
                    </p>
                </LegalSection>

                <LegalSection title="11. Security">
                    <p>
                        We implement commercially reasonable technical and organisational measures to protect data against
                        unauthorised access, alteration, disclosure, or destruction. These include encrypted data transmission
                        (TLS), access controls, and regular security reviews. No method of transmission over the internet is
                        completely secure; we cannot guarantee absolute security.
                    </p>
                </LegalSection>

                <LegalSection title="12. Changes to This Policy">
                    <p>
                        We may update this Privacy Policy from time to time. When we do, we will revise the &ldquo;Last updated&rdquo; date
                        at the top of this page. For material changes, we will provide additional notice (such as a notice on
                        the Service). Your continued use of the Service after changes are posted constitutes your acceptance
                        of the revised policy.
                    </p>
                </LegalSection>

                <LegalSection title="13. Contact">
                    <p>
                        If you have questions about this Privacy Policy or wish to exercise your data rights, please contact us at:
                    </p>
                    <div className="mt-3 bg-gray-900 border border-gray-800 rounded-xl px-5 py-4 text-sm text-gray-300">
                        <p className="font-semibold text-white">FantasyiQ</p>
                        <p className="text-gray-400 mt-1">privacy@fantasyiq.app</p>
                    </div>
                </LegalSection>

                {/* Footer nav */}
                <div className="border-t border-gray-800 pt-8 flex flex-wrap gap-4 text-xs text-gray-600">
                    <Link href="/terms"   className="hover:text-gray-400 transition">Terms of Service</Link>
                    <Link href="/cookies" className="hover:text-gray-400 transition">Cookie Notice</Link>
                    <Link href="/"        className="hover:text-gray-400 transition">← Back to FantasyiQ</Link>
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

function Subsection({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="space-y-1.5">
            <h3 className="text-sm font-semibold text-gray-300">{title}</h3>
            {children}
        </div>
    );
}
