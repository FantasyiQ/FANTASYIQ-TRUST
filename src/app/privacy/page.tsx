import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
    title: 'Privacy Policy — FantasyiQ Trust',
    description: 'How FantasyiQ Trust collects, uses, and protects your data.',
};

export default function PrivacyPolicyPage() {
    return (
        <div className="min-h-screen bg-black text-white">
            <div className="max-w-3xl mx-auto px-6 py-16 space-y-10">

                {/* Header */}
                <div className="space-y-2 border-b border-gray-800 pb-8">
                    <p className="text-[10px] font-bold tracking-widest text-[#D4AF37] uppercase">Legal</p>
                    <h1 className="text-3xl font-bold text-white">Privacy Policy</h1>
                    <p className="text-gray-500 text-sm">Last updated: June 6, 2026</p>
                </div>

                <LegalSection title="1. Introduction">
                    <p>
                        FantasyiQ Trust (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) operates the FantasyiQ Trust platform, accessible at{' '}
                        <span className="text-[#D4AF37]">www.fantasyiQTrust.com</span> (the &ldquo;Service&rdquo;). This Privacy Policy explains how we collect,
                        use, disclose, and safeguard information when you use our Service. Please read this policy carefully. If you do not
                        agree with its terms, please discontinue use of the Service.
                    </p>
                </LegalSection>

                <LegalSection title="2. Information We Do Not Collect">
                    <p>FantasyiQ Trust is designed with data minimisation as a core principle. <strong className="text-white">We do not collect:</strong></p>
                    <ul>
                        <li>Payment card numbers, bank account details, or billing addresses (handled directly by Stripe)</li>
                        <li>Government-issued identification numbers</li>
                        <li>Physical addresses or precise geolocation data</li>
                        <li>Any sensitive personal information as defined under applicable privacy law</li>
                    </ul>
                </LegalSection>

                <LegalSection title="3. Information We Do Collect">
                    <p>To provide the Service, we process the following limited categories of information:</p>
                    <Subsection title="3.1 Fantasy League Data">
                        <p>
                            When you connect a Sleeper, ESPN, NFL Fantasy, or Yahoo Fantasy league, we receive and store fantasy-football league data transmitted
                            by those platforms via their public APIs. This data includes league IDs, roster IDs, matchup data,
                            weekly projections, player statistics, standings, and scoring settings. This data does not constitute
                            personally identifiable information under most privacy frameworks; however, team names or usernames
                            chosen by you on those platforms may be incidentally included.
                        </p>
                    </Subsection>
                    <Subsection title="3.2 Account Information">
                        <p>
                            If you create a FantasyiQ Trust account, we store your email address, display name, and a securely hashed
                            password (if you register with email and password). If you sign in via Google, we receive and store
                            the name and email address associated with your Google account. We do not store plain-text passwords.
                        </p>
                    </Subsection>
                    <Subsection title="3.3 Platform Authentication Credentials">
                        <p>
                            To enable ongoing sync with certain fantasy platforms, we store platform-specific authentication tokens in
                            our database:
                        </p>
                        <ul>
                            <li>
                                <strong className="text-white">ESPN:</strong> When you connect an ESPN fantasy league using our browser
                                extension, the extension reads your ESPN session cookies (<code className="text-gray-300 bg-gray-800 px-1 rounded">espn_s2</code> and{' '}
                                <code className="text-gray-300 bg-gray-800 px-1 rounded">SWID</code>) from your browser and transmits them
                                to our server over an encrypted connection. These tokens are stored in our database solely to make API
                                calls to ESPN on your behalf and to re-sync your league data. They are never used for any other purpose.
                                You can revoke access at any time by disconnecting your ESPN league from your dashboard.
                            </li>
                            <li>
                                <strong className="text-white">Yahoo:</strong> When you connect a Yahoo Fantasy league via OAuth, we
                                receive and store a Yahoo OAuth access token. This token is stored solely to make API calls to Yahoo
                                Fantasy on your behalf. You can revoke access at any time by disconnecting your Yahoo league from your
                                dashboard or from your Yahoo account&apos;s connected apps settings.
                            </li>
                        </ul>
                    </Subsection>
                    <Subsection title="3.4 Payment and Billing Data">
                        <p>
                            Subscription payments are processed by Stripe, Inc. FantasyiQ Trust does not store your payment card details.
                            We do store subscription status, plan tier, and Stripe customer and subscription identifiers so we can
                            manage your access and send billing-related notifications.
                        </p>
                    </Subsection>
                    <Subsection title="3.5 Player Reliability Score (PRS)">
                        <p>
                            FantasyiQ Trust computes a <strong className="text-white">Player Reliability Score (PRS)</strong> for each
                            account based on observable in-platform signals: season participation, roster retention, league engagement,
                            and commissioner ratings you receive. This score is updated periodically.
                        </p>
                        <p>
                            <strong className="text-white">Your PRS may be publicly visible.</strong> If you or a commissioner registers
                            a league or commissioner profile in the League Finder, your PRS score may be displayed on your public
                            commissioner profile and on league listing cards visible to all visitors. If you do not use the League
                            Finder, your PRS is not publicly exposed.
                        </p>
                    </Subsection>
                    <Subsection title="3.6 Log Data">
                        <p>
                            Our hosting infrastructure automatically records standard server log data (IP address, browser type,
                            referring URL, timestamp) for security and operational purposes. Log data is retained for no more
                            than 30 days. We also use IP addresses for rate limiting (processed via Upstash Redis); these are
                            not linked to individual accounts and are not retained beyond the sliding rate-limit window.
                        </p>
                    </Subsection>
                </LegalSection>

                <LegalSection title="4. Cookies and Session Tokens">
                    <p>We use cookies and similar storage technologies solely for the following purposes:</p>
                    <ul>
                        <li><strong className="text-white">Authentication:</strong> Session cookies keep you signed in across page loads.</li>
                        <li><strong className="text-white">Session Management:</strong> Short-lived tokens enable secure server interactions.</li>
                    </ul>
                    <p className="mt-3">
                        We do <strong className="text-white">not</strong> use advertising cookies, cross-site tracking pixels, or any cookie
                        that builds a profile of your browsing behaviour outside of FantasyiQ Trust. For a full description of the cookies
                        we use, please review our <Link href="/cookies" className="text-[#D4AF37] hover:underline">Cookie Notice</Link>.
                    </p>
                </LegalSection>

                <LegalSection title="5. How We Use Your Information">
                    <p>We use the information described above exclusively to:</p>
                    <ul>
                        <li>Provide, operate, and improve the Service</li>
                        <li>Compute analytics, projections, and intelligence features for your leagues</li>
                        <li>Compute and display your Player Reliability Score (PRS)</li>
                        <li>Authenticate your account and maintain security</li>
                        <li>Send transactional and service emails (dues reminders, payment confirmations, subscription updates)</li>
                        <li>Process subscription payments and manage billing through Stripe</li>
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
                            <strong className="text-white">Service Providers:</strong> We engage a small number of infrastructure
                            providers who process data solely on our behalf, including: Vercel (hosting), Neon (database), Stripe
                            (payment processing), Resend (transactional email delivery), Pusher (real-time notifications),
                            Upstash (rate limiting — processes IP addresses only), and Sentry (error monitoring). Each provider
                            is bound by a data-processing agreement or equivalent contractual obligation.
                        </li>
                        <li>
                            <strong className="text-white">Legal Requirements:</strong> We may disclose data if required by law, court order,
                            or to protect the rights, property, or safety of FantasyiQ Trust, its users, or the public.
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
                        FantasyiQ Trust integrates with third-party platforms to provide its features. Each operates under its own
                        privacy policy, which governs how your data is collected and used by them:
                    </p>
                    <ul>
                        <li><strong className="text-white">Sleeper</strong> — fantasy league data sync</li>
                        <li><strong className="text-white">ESPN</strong> — fantasy league data sync (see §3.3 for credential handling)</li>
                        <li><strong className="text-white">Yahoo Sports</strong> — fantasy league data sync (see §3.3 for credential handling)</li>
                        <li><strong className="text-white">NFL.com</strong> — fantasy league data sync</li>
                        <li><strong className="text-white">Google</strong> — optional sign-in via Google OAuth</li>
                        <li><strong className="text-white">Stripe</strong> — payment processing; Stripe&apos;s privacy policy governs how it handles your payment information</li>
                        <li><strong className="text-white">Resend</strong> — transactional email delivery; your email address is transmitted to Resend solely to send emails you request or that are required for the Service</li>
                        <li><strong className="text-white">Pusher</strong> — real-time in-app notifications</li>
                        <li><strong className="text-white">Upstash</strong> — rate limiting; IP addresses are processed transiently and not retained</li>
                        <li><strong className="text-white">Sentry</strong> — error and performance monitoring; error reports may include anonymised request context</li>
                    </ul>
                    <p className="mt-3">
                        We recommend reviewing those platforms&apos; privacy policies. FantasyiQ Trust is not responsible for the
                        data practices of third-party services.
                    </p>
                </LegalSection>

                <LegalSection title="8. Browser Extension">
                    <p>
                        FantasyiQ Trust publishes the <strong className="text-white">FiQ ESPN Connector</strong> browser extension
                        for Google Chrome, available on the Chrome Web Store. This extension:
                    </p>
                    <ul>
                        <li>Reads only the <code className="text-gray-300 bg-gray-800 px-1 rounded">espn_s2</code> and{' '}
                            <code className="text-gray-300 bg-gray-800 px-1 rounded">SWID</code> cookies set by ESPN on the{' '}
                            <code className="text-gray-300 bg-gray-800 px-1 rounded">espn.com</code> domain</li>
                        <li>Transmits those values to FantasyiQ Trust servers over an encrypted connection when you initiate an ESPN league sync</li>
                        <li>Does <strong className="text-white">not</strong> read any other cookies, browser history, keystrokes, or any other data</li>
                        <li>Does <strong className="text-white">not</strong> run in the background or transmit any data without your explicit action</li>
                    </ul>
                    <p className="mt-3">
                        The extension is open for review in the Chrome Web Store. You may uninstall it at any time from your browser&apos;s
                        extension manager without affecting your FantasyiQ Trust account.
                    </p>
                </LegalSection>

                <LegalSection title="9. Data Retention">
                    <p>
                        We retain fantasy league data and account information for as long as your account remains active or as
                        needed to provide the Service. If you delete your account, we will remove your data within 30 days,
                        except where retention is required by law or for legitimate security purposes.
                    </p>
                    <p>
                        Platform authentication credentials (ESPN session cookies, Yahoo OAuth tokens) are deleted when you
                        disconnect the associated league or delete your account.
                    </p>
                </LegalSection>

                <LegalSection title="10. Your Rights and Data Deletion">
                    <p>Depending on your jurisdiction, you may have the right to:</p>
                    <ul>
                        <li>Access the data we hold about you</li>
                        <li>Request correction of inaccurate data</li>
                        <li>Request deletion of your data</li>
                        <li>Object to or restrict certain processing</li>
                        <li>Data portability</li>
                    </ul>
                    <p className="mt-3">
                        You can exercise many of these rights directly from your account:
                    </p>
                    <ul>
                        <li><strong className="text-white">Export:</strong> Download a copy of your data from <span className="text-[#D4AF37]">Account Settings → Download my data</span>.</li>
                        <li><strong className="text-white">Deletion:</strong> Permanently delete your account and all associated data from <span className="text-[#D4AF37]">Account Settings → Delete my account</span>.</li>
                        <li><strong className="text-white">Correction:</strong> Update your email address from <span className="text-[#D4AF37]">Account Settings → Email</span>.</li>
                    </ul>
                    <p className="mt-3">
                        For any rights not covered by the above self-service tools, or for questions about your data, contact us
                        using the information in Section 14. We will respond within 30 days. We may need to verify your identity
                        before fulfilling a request.
                    </p>
                </LegalSection>

                <LegalSection title="11. Age Restriction">
                    <p>
                        FantasyiQ Trust is intended for users who are <strong className="text-white">at least 18 years of age</strong>.
                        Because the Service involves paid subscriptions, league dues, and financial transactions, use by minors is
                        not permitted. By creating an account, you represent and warrant that you are 18 years of age or older.
                    </p>
                    <p>
                        We do not knowingly collect or process personal data from individuals under 18. If you believe a minor has
                        created an account, please contact us immediately using the information in Section 14 and we will promptly
                        close the account and delete associated data.
                    </p>
                </LegalSection>

                <LegalSection title="12. Security">
                    <p>
                        We implement commercially reasonable technical and organizational measures to protect data against
                        unauthorized access, alteration, disclosure, or destruction. These include encrypted data transmission
                        (TLS), access controls, and regular security reviews. No method of transmission over the internet is
                        completely secure; we cannot guarantee absolute security.
                    </p>
                </LegalSection>

                <LegalSection title="13. Changes to This Policy">
                    <p>
                        We may update this Privacy Policy from time to time. When we do, we will revise the &ldquo;Last updated&rdquo; date
                        at the top of this page. For material changes, we will provide additional notice (such as a notice on
                        the Service). Your continued use of the Service after changes are posted constitutes your acceptance
                        of the revised policy.
                    </p>
                </LegalSection>

                <LegalSection title="14. Contact">
                    <p>
                        If you have questions about this Privacy Policy or wish to exercise your data rights, please contact us at:
                    </p>
                    <div className="mt-3 bg-gray-900 border border-gray-800 rounded-xl px-5 py-4 text-sm text-gray-300 space-y-0.5">
                        <p className="font-semibold text-white">FantasyiQ Trust</p>
                        <p className="text-gray-400">11111 San Jose Blvd, Suite 56</p>
                        <p className="text-gray-400">Jacksonville, FL 32223</p>
                        <p className="text-gray-400 mt-2">Legal@FantasyiQTrust.com</p>
                        <p className="text-gray-400">(904) 925-0087</p>
                    </div>
                </LegalSection>

                {/* Footer nav */}
                <div className="border-t border-gray-800 pt-8 flex flex-wrap gap-4 text-xs text-gray-600">
                    <Link href="/terms"   className="hover:text-gray-400 transition">Terms of Service</Link>
                    <Link href="/cookies" className="hover:text-gray-400 transition">Cookie Notice</Link>
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

function Subsection({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="space-y-1.5">
            <h3 className="text-sm font-semibold text-gray-300">{title}</h3>
            {children}
        </div>
    );
}
