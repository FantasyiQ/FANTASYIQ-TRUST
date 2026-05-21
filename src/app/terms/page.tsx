import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
    title: 'Terms of Service — FantasyiQ',
    description: 'Terms governing your use of the FantasyiQ platform.',
};

export default function TermsOfServicePage() {
    return (
        <div className="min-h-screen bg-black text-white">
            <div className="max-w-3xl mx-auto px-6 py-16 space-y-10">

                {/* Header */}
                <div className="space-y-2 border-b border-gray-800 pb-8">
                    <p className="text-[10px] font-bold tracking-widest text-[#D4AF37] uppercase">Legal</p>
                    <h1 className="text-3xl font-bold text-white">Terms of Service</h1>
                    <p className="text-gray-500 text-sm">Last updated: May 21, 2026</p>
                </div>

                <LegalSection title="1. Acceptance of Terms">
                    <p>
                        By accessing or using FantasyiQ (&ldquo;the Service,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) at{' '}
                        <span className="text-[#D4AF37]">fantasyiq.app</span>, you agree to be bound by these Terms of Service
                        (&ldquo;Terms&rdquo;). If you do not agree to all of these Terms, do not use the Service. These Terms constitute a
                        legally binding agreement between you and FantasyiQ.
                    </p>
                </LegalSection>

                <LegalSection title="2. Nature of the Service">
                    <p>
                        FantasyiQ is an <strong className="text-white">entertainment-only</strong> fantasy-football analytics platform.
                        The Service provides projection models, lineup optimisation tools, waiver wire intelligence, trade insights,
                        start/sit recommendations, and other analytical features to assist you in managing your fantasy-football teams.
                    </p>
                    <p>
                        <strong className="text-white">FantasyiQ does not guarantee the accuracy, completeness, or fitness for any
                        purpose of any projection, recommendation, or analytical output.</strong> All features are provided for
                        informational and entertainment purposes only. Fantasy sports involve inherent uncertainty; no analytical
                        tool can predict outcomes with certainty.
                    </p>
                    <p>
                        FantasyiQ is not affiliated with, endorsed by, or in partnership with the National Football League (NFL),
                        Sleeper, ESPN, or any other fantasy sports platform.
                    </p>
                </LegalSection>

                <LegalSection title="3. No Responsibility for Fantasy Outcomes">
                    <p>
                        FantasyiQ expressly disclaims any responsibility for:
                    </p>
                    <ul>
                        <li>Your fantasy-football results, standings, or winnings (or losses)</li>
                        <li>Decisions you make based on projections, recommendations, or analytics provided by the Service</li>
                        <li>Disputes arising within your fantasy leagues or between league members</li>
                        <li>Scoring errors, rule changes, or administrative decisions made by your fantasy platform or league commissioner</li>
                        <li>Player injuries, game cancellations, or any real-world sporting event that affects fantasy outcomes</li>
                    </ul>
                    <p className="mt-2">
                        You acknowledge that fantasy sports results depend on factors entirely outside FantasyiQ&apos;s control and that
                        you use all analytical outputs at your own risk.
                    </p>
                </LegalSection>

                <LegalSection title="4. No Responsibility for Platform Outages">
                    <p>
                        The Service depends on third-party APIs (including Sleeper and ESPN) and infrastructure providers. FantasyiQ
                        is not liable for any service interruption, data unavailability, inaccuracy, or degradation caused by:
                    </p>
                    <ul>
                        <li>Outages, rate limits, or API changes by Sleeper, ESPN, or any third-party data provider</li>
                        <li>Hosting or infrastructure failures beyond our reasonable control</li>
                        <li>Scheduled or unscheduled maintenance</li>
                        <li>Cyberattacks, force majeure events, or other circumstances outside our control</li>
                    </ul>
                </LegalSection>

                <LegalSection title="5. Third-Party Platform Compliance">
                    <p>
                        When you connect a Sleeper or ESPN league to FantasyiQ, you represent and warrant that:
                    </p>
                    <ul>
                        <li>You are authorised to access that league&apos;s data on the applicable platform</li>
                        <li>Your use of FantasyiQ does not violate the Terms of Service of Sleeper, ESPN, or any other fantasy platform you connect</li>
                        <li>You will not use FantasyiQ to access or process data for leagues you do not own or are not authorised to manage</li>
                    </ul>
                    <p className="mt-2">
                        You are solely responsible for ensuring your use of the Service complies with all applicable third-party terms.
                        FantasyiQ is not liable for any suspension, ban, or penalty imposed by a third-party platform arising from
                        your use of the Service.
                    </p>
                </LegalSection>

                <LegalSection title="6. Intellectual Property">
                    <p>
                        All intellectual property in the Service — including but not limited to the FantasyiQ brand, name, logo,
                        user interface design, source code, analytical models, algorithms, and written content — is owned exclusively
                        by FantasyiQ and is protected by applicable copyright, trademark, and intellectual property law.
                    </p>
                    <p>
                        You are granted a limited, non-exclusive, non-transferable, revocable licence to access and use the Service
                        for your personal, non-commercial purposes, subject to these Terms. No other rights are granted.
                    </p>
                </LegalSection>

                <LegalSection title="7. Prohibited Conduct">
                    <p>You agree that you will not:</p>
                    <ul>
                        <li>Reverse-engineer, decompile, disassemble, or attempt to derive the source code or underlying models of the Service</li>
                        <li>Scrape, crawl, or systematically extract data from the Service by automated means without prior written consent</li>
                        <li>Use the Service to build a competing product or service</li>
                        <li>Circumvent, disable, or interfere with any security or access-control feature of the Service</li>
                        <li>Transmit any malware, viruses, or malicious code through the Service</li>
                        <li>Impersonate another person or entity, or falsely claim affiliation with any person or organisation</li>
                        <li>Use the Service in any manner that violates applicable law or regulation</li>
                        <li>Sublicense, sell, resell, transfer, or otherwise commercially exploit the Service without our express written consent</li>
                    </ul>
                </LegalSection>

                <LegalSection title="8. Disclaimer of Warranties">
                    <p>
                        THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo; WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED,
                        INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE,
                        NON-INFRINGEMENT, OR THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR FREE OF HARMFUL COMPONENTS.
                        YOUR USE OF THE SERVICE IS AT YOUR SOLE RISK.
                    </p>
                </LegalSection>

                <LegalSection title="9. Limitation of Liability">
                    <p>
                        TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW, FANTASYIQ AND ITS OFFICERS, DIRECTORS, EMPLOYEES,
                        AGENTS, AND LICENSORS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, PUNITIVE,
                        OR EXEMPLARY DAMAGES, INCLUDING WITHOUT LIMITATION DAMAGES FOR LOSS OF PROFITS, REVENUE, DATA, GOODWILL,
                        OR OTHER INTANGIBLE LOSSES, ARISING OUT OF OR RELATED TO YOUR USE OF OR INABILITY TO USE THE SERVICE,
                        EVEN IF FANTASYIQ HAS BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
                    </p>
                    <p>
                        IN NO EVENT SHALL FANTASYIQ&apos;S TOTAL AGGREGATE LIABILITY TO YOU FOR ALL CLAIMS ARISING OUT OF OR RELATED
                        TO THESE TERMS OR YOUR USE OF THE SERVICE EXCEED THE GREATER OF (A) THE AMOUNT YOU PAID TO FANTASYIQ IN
                        THE TWELVE MONTHS PRECEDING THE CLAIM OR (B) ONE HUNDRED DOLLARS (USD $100.00).
                    </p>
                    <p>
                        SOME JURISDICTIONS DO NOT ALLOW THE EXCLUSION OR LIMITATION OF CERTAIN WARRANTIES OR DAMAGES. IN THOSE
                        JURISDICTIONS, THE LIMITATIONS ABOVE APPLY ONLY TO THE EXTENT PERMITTED BY LAW.
                    </p>
                </LegalSection>

                <LegalSection title="10. Indemnification">
                    <p>
                        You agree to indemnify, defend, and hold harmless FantasyiQ and its affiliates, officers, directors,
                        employees, and agents from and against any claims, liabilities, damages, losses, and expenses (including
                        reasonable legal fees) arising out of or related to: (a) your use of the Service; (b) your violation of
                        these Terms; (c) your violation of any rights of another party; or (d) your violation of any applicable law.
                    </p>
                </LegalSection>

                <LegalSection title="11. Termination">
                    <p>
                        FantasyiQ reserves the right to suspend or terminate your access to the Service at any time, with or without
                        cause and with or without notice, if we believe you have violated these Terms or if we determine that continued
                        access poses a risk to the Service, other users, or FantasyiQ.
                    </p>
                    <p>
                        You may terminate your account at any time by contacting us or by using the account deletion feature in your
                        account settings. Upon termination, your right to use the Service ceases immediately. Sections 6, 7, 8, 9,
                        10, 13, and 14 of these Terms survive termination.
                    </p>
                </LegalSection>

                <LegalSection title="12. Subscriptions, Billing, and Refunds">
                    <p>
                        Certain features of the Service are available only through a paid subscription (&ldquo;Plan&rdquo;). By subscribing
                        to a Plan, you authorise FantasyiQ to charge your payment method on a recurring basis at the then-current
                        rate until you cancel.
                    </p>
                    <p><strong className="text-white">Billing cycle.</strong> Subscriptions are billed in advance on a monthly or
                        annual basis, depending on the plan you select. Your billing date is set at the time of purchase and recurs
                        on the same date each period.</p>
                    <p><strong className="text-white">Cancellation.</strong> You may cancel your subscription at any time through
                        the Stripe billing portal accessible from your account settings. Cancellation takes effect at the end of
                        the current billing period. You will retain full access to paid features until that date.</p>
                    <p><strong className="text-white">No refunds.</strong> All subscription fees are non-refundable. We do not
                        issue refunds or credits for partial billing periods, unused time, or any portion of a subscription period
                        following cancellation. This applies to both monthly and annual plans.</p>
                    <p><strong className="text-white">Failed payments.</strong> If a payment fails, we will notify you by email
                        and your subscription may be suspended until payment is received. We may retry failed charges in accordance
                        with Stripe&apos;s standard retry schedule.</p>
                    <p><strong className="text-white">Price changes.</strong> We reserve the right to change subscription pricing
                        at any time. We will provide at least 30 days&apos; advance notice of any price increase. Continued use of the
                        Service after the effective date of a price change constitutes your acceptance of the new pricing.</p>
                    <p><strong className="text-white">Taxes.</strong> Prices are exclusive of applicable taxes. You are responsible
                        for any sales, use, value-added, or similar taxes imposed by your jurisdiction.</p>
                </LegalSection>

                <LegalSection title="13. Governing Law and Dispute Resolution">
                    <p>
                        These Terms are governed by and construed in accordance with the laws of the State of Delaware, United States,
                        without regard to its conflict-of-law principles. Any dispute arising out of or related to these Terms or your
                        use of the Service shall be subject to the exclusive jurisdiction of the state and federal courts located in
                        Delaware, and you consent to personal jurisdiction in those courts.
                    </p>
                    <p>
                        Notwithstanding the foregoing, FantasyiQ may seek injunctive or other equitable relief in any court of
                        competent jurisdiction to protect its intellectual property rights.
                    </p>
                </LegalSection>

                <LegalSection title="14. Changes to These Terms">
                    <p>
                        We may modify these Terms at any time by posting the revised Terms on the Service and updating the
                        &ldquo;Last updated&rdquo; date. For material changes, we will provide additional notice. Your continued use of the
                        Service after the effective date of any revision constitutes your acceptance of the updated Terms.
                        If you do not agree to the revised Terms, you must stop using the Service.
                    </p>
                </LegalSection>

                <LegalSection title="15. Miscellaneous">
                    <p>
                        These Terms, together with our <Link href="/privacy" className="text-[#D4AF37] hover:underline">Privacy Policy</Link> and{' '}
                        <Link href="/cookies" className="text-[#D4AF37] hover:underline">Cookie Notice</Link>, constitute the entire agreement
                        between you and FantasyiQ with respect to the Service and supersede all prior agreements. If any provision
                        of these Terms is found to be unenforceable, that provision will be modified to the minimum extent necessary
                        to make it enforceable, and the remaining provisions will remain in full force. Our failure to enforce any
                        right or provision is not a waiver of that right or provision.
                    </p>
                </LegalSection>

                <LegalSection title="16. Contact">
                    <p>If you have questions about these Terms, please contact us at:</p>
                    <div className="mt-3 bg-gray-900 border border-gray-800 rounded-xl px-5 py-4 text-sm text-gray-300">
                        <p className="font-semibold text-white">FantasyiQ</p>
                        <p className="text-gray-400 mt-1">legal@fantasyiq.app</p>
                    </div>
                </LegalSection>

                {/* Footer nav */}
                <div className="border-t border-gray-800 pt-8 flex flex-wrap gap-4 text-xs text-gray-600">
                    <Link href="/privacy" className="hover:text-gray-400 transition">Privacy Policy</Link>
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
