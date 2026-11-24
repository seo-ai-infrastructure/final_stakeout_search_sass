import Link from 'next/link';
import { SiteHeader, SiteFooter } from './SiteChrome';
import './marketing.css';

export const LEGAL_UPDATED = 'November 22, 2026';
const ENTITY = 'Marketing Divine LLC';
const PRIVACY = 'privacy@stakeoutsearch.com';
const SUPPORT = 'support@stakeoutsearch.com';
const SITE = 'https://www.stakeoutsearch.com';

type Section = { id: string; title: string; body: React.ReactNode; highlight?: string };

const privacyMail = <a href={'mailto:' + PRIVACY}>{PRIVACY}</a>;
const supportMail = <a href={'mailto:' + SUPPORT}>{SUPPORT}</a>;
const box = 'rounded-xl border border-[#1b2431] bg-[#0c1118] p-5';
const Code = ({ children }: { children: React.ReactNode }) => <code className="mk-mono rounded bg-white/10 px-1.5 py-0.5 text-[13px] text-white">{children}</code>;

function Page({ badge, title, lead, sections, updated = LEGAL_UPDATED }: { badge: string; title: string; lead: string; sections: Section[]; updated?: string }) {
  return (
    <div className="mk min-h-screen">
      <SiteHeader />
      <section className="border-b border-[#1b2431] bg-[#080b10]">
        <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8 sm:py-20">
          <p className="mk-mono inline-block rounded-full border border-[#f5c451]/40 bg-[#f5c451]/10 px-3 py-1 text-[12px] uppercase tracking-widest text-[#f5c451]">{badge}</p>
          <h1 className="mk-display mt-4 text-4xl font-bold sm:text-5xl">{title}</h1>
          <p className="mt-4 max-w-3xl text-lg leading-relaxed text-[#9aa7b8]">{lead}</p>
          <p className="mk-mono mt-6 flex flex-wrap gap-x-6 gap-y-1 text-[12px] text-[#9aa7b8]">
            <span><b className="text-[#eef2f7]">Effective date:</b> {updated}</span>
            <span><b className="text-[#eef2f7]">Last updated:</b> {updated}</span>
            <span><b className="text-[#eef2f7]">Entity:</b> {ENTITY} d/b/a Stakeout Search</span>
          </p>
        </div>
      </section>
      <main className="mx-auto max-w-7xl px-5 py-12 sm:px-8 lg:grid lg:grid-cols-[260px_1fr] lg:gap-12 lg:py-16">
        <aside className="hidden lg:block">
          <nav aria-label="On this page" className={'sticky top-24 ' + box}>
            <p className="mk-mono mb-3 text-[12px] uppercase tracking-widest text-[#9aa7b8]">On this page</p>
            <ul className="space-y-2 text-sm">
              {sections.map((s, i) => (
                <li key={s.id}><a href={'#' + s.id} className={s.highlight ? 'font-semibold text-[#f5c451] hover:underline' : 'text-[#c9d3df] hover:text-white'}>{i + 1}. {s.title}</a></li>
              ))}
            </ul>
          </nav>
        </aside>
        <article className="max-w-3xl">
          {sections.map((s, i) => (
            <section key={s.id} id={s.id} className={'scroll-mt-24 ' + (i ? 'mt-12 border-t border-[#1b2431] pt-10' : '')}>
              <div className={s.highlight ? 'rounded-2xl border-2 border-[#f5c451]/50 bg-[#f5c451]/[0.04] p-6 sm:p-8' : ''}>
                {s.highlight && <p className="mk-mono mb-3 text-[12px] uppercase tracking-widest text-[#f5c451]">{s.highlight}</p>}
                <h2 className="mk-display text-2xl font-semibold">{i + 1}. {s.title}</h2>
                <div className="mt-4 space-y-4 leading-relaxed text-[#c9d3df] [&_a]:text-[#7aa7ff] [&_a:hover]:underline [&_b]:text-[#eef2f7] [&_h3]:font-semibold [&_h3]:text-[#eef2f7] [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-2.5">{s.body}</div>
              </div>
            </section>
          ))}
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}

function ContactCard({ heading, text, rows }: { heading: string; text: string; rows: [string, React.ReactNode][] }) {
  return (
    <div className={box}>
      <h3>{heading}</h3>
      <p className="mt-2 text-sm">{text}</p>
      <dl className="mk-mono mt-4 space-y-1.5 text-sm">
        {rows.map(([k, v]) => <div key={k}><dt className="inline font-semibold text-[#eef2f7]">{k}: </dt><dd className="inline">{v}</dd></div>)}
      </dl>
    </div>
  );
}

export function PrivacyPolicy() {
  return (
    <Page
      updated="November 23, 2026"
      badge="Legal & data governance"
      title="Privacy Policy"
      lead="How Stakeout Search collects, encrypts, processes and protects account information, search telemetry, white-label reports and authorized Google API integrations."
      sections={[
        {
          id: 'scope',
          title: 'Scope & Overview',
          body: (
            <>
              <p>This Privacy Policy describes how <b>{ENTITY}</b>, doing business as <b>Stakeout Search</b> (“Stakeout Search,” “we,” “us,” or “our”), collects, uses, stores and discloses information when you visit <a href={SITE}>{SITE}</a>, create an account, run local search and map grid telemetry scans, connect third-party analytics or business profile accounts, purchase add-on fulfillment services, or view shared campaign reports (collectively, the “Services”).</p>
              <p>By accessing or using the Services, you acknowledge that you have read and understood this Privacy Policy. If you use Stakeout Search on behalf of an agency, company or client organization, you represent that you have authority to bind that organization and to provide any business data submitted to the platform.</p>
            </>
          ),
        },
        {
          id: 'data-collected',
          title: 'Information We Collect',
          body: (
            <>
              <p>We collect only the information necessary to operate, secure and deliver our search telemetry, reporting and local marketing workflows:</p>
              <div className={box}>
                <h3>A. Account & billing information</h3>
                <p className="mt-2 text-sm">When you register for an account, purchase phone sessions or seats, or apply for an agency sprint, we collect your name, business email address, company or agency name, white-label branding assets you provide (such as an agency logo) and transaction identifiers. Payment card details are processed directly by our PCI-DSS Level 1 compliant payment processor (Stripe) and are never stored on Stakeout Search servers.</p>
              </div>
              <div className={box}>
                <h3>B. Campaign, business location & public search data</h3>
                <p className="mt-2 text-sm">When you configure a scan or an optional citation or profile campaign, you provide target search keywords, public business names, addresses, service areas, phone numbers, categories, website URLs and media assets. During scans, Stakeout Search records publicly observable search engine results pages, local map pack rankings, AI Overview answers and citations, SHA-256 verification hashes and screen-recorded visual receipts, overlaid with publicly available U.S. Census Bureau demographic aggregates.</p>
              </div>
              <div className={box}>
                <h3>C. Connected third-party & Google account data (optional)</h3>
                <p className="mt-2 text-sm">If you explicitly choose to link Google Analytics 4, Google Search Console or Google Business Profile accounts, we collect OAuth 2.0 authorization tokens, your connected Google account email address, and the specific performance metrics or profile fields you authorize (detailed in Section 3 below).</p>
              </div>
              <div className={box}>
                <h3>D. Technical usage & security logs</h3>
                <p className="mt-2 text-sm">We automatically log basic request metadata including IP addresses, browser user-agent strings, timestamps, session identifiers and rate-limit counters, and keep audit logs of profile changes made through the platform, to prevent unauthorized access, fraud and abuse.</p>
              </div>
            </>
          ),
        },
        {
          id: 'google-api-disclosure',
          title: 'Google API Services User Data & Limited Use Disclosure',
          highlight: 'Official compliance statement',
          body: (
            <>
              <p className="rounded-lg border border-[#1b2431] bg-[#06080c] p-4 font-medium text-white">Stakeout Search’s use and transfer to any other app of information received from Google APIs will adhere to the <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">Google API Services User Data Policy</a>, including the Limited Use requirements.</p>
              <p className="text-sm">When you voluntarily click <b>“Connect Google”</b> inside Stakeout Search, we request access only to the narrowest scopes required to power user-facing analytics and keyword discovery features in your dashboard:</p>
              <ul className="text-sm">
                <li><Code>openid</Code> & <Code>userinfo.email</Code>: used solely to identify which Google account you connected.</li>
                <li><Code>https://www.googleapis.com/auth/analytics.readonly</Code> (Google Analytics Data & Admin APIs): read-only access used to populate a property selector and to display website sessions and key events alongside your Stakeout Search reports. We cannot modify or delete your Google Analytics configuration.</li>
                <li><Code>https://www.googleapis.com/auth/webmasters.readonly</Code> (Google Search Console API): read-only access used to list your verified website properties and display search query impressions, clicks and average positions, so you can benchmark organic visibility and select geo-grid tracking keywords.</li>
                <li><b>Google Business Profile management (optional):</b> where a Google Business Profile is connected directly or through an authorized publishing integration, access is strictly limited to reading location details and performance insights, and executing specific profile updates initiated and approved by authorized users.</li>
              </ul>
              <p className="text-sm">Search Console and Analytics figures are fetched when you open the page and are not stored in our database.</p>
              <h3 className="mk-mono text-sm uppercase tracking-widest">Strict Limited Use protections</h3>
              <ul className="text-sm">
                <li><b>No advertising or data brokerage:</b> we never sell, rent, license or transfer Google user data to data brokers, ad networks or third parties for targeted advertising or creditworthiness evaluation.</li>
                <li><b>No generalized AI / ML model training:</b> data retrieved from Google APIs is <b>never</b> used to train, fine-tune or improve generalized artificial intelligence or machine learning models.</li>
                <li><b>No unauthorized human viewing:</b> Stakeout Search personnel do not read raw Google user data unless we first obtain your affirmative agreement to troubleshoot a specific support request, or where strictly required for security abuse investigation or legal compliance.</li>
                <li><b>Encrypted storage & instant revocation:</b> OAuth refresh tokens are encrypted at rest using <b>AES-256-GCM</b>. You may disconnect your Google account and purge stored tokens with the “Disconnect” link in your dashboard, or revoke access directly at <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">https://myaccount.google.com/permissions</a>.</li>
              </ul>
            </>
          ),
        },
        {
          id: 'how-we-use',
          title: 'How We Use Information',
          body: (
            <>
              <p>We process collected information strictly to deliver and improve our B2B software and agency services:</p>
              <ul>
                <li>Executing localized mobile search and map grid scans, recording video verification receipts, and computing Share of Local Voice (SoLV) and Buying-Power visibility metrics.</li>
                <li>Aggregating publicly cited URLs in search results and AI Overviews into actionable SEO checklists.</li>
                <li>Fulfilling optional one-time or recurring orders you place, such as manual business directory citation submissions or profile updates.</li>
                <li>Processing payments, managing phone-session balances, issuing automatic refunds for failed coordinates, and sending transactional receipts or alerts.</li>
                <li>Enforcing access controls, profile-edit cooldown guardrails, rate limits and platform security.</li>
              </ul>
            </>
          ),
        },
        {
          id: 'share-links',
          title: 'Public Share Links & White-Label Reports',
          body: (
            <>
              <p>Stakeout Search lets you generate unique, unguessable share URLs (formatted as <Code>stakeoutsearch.com/share/[token]</Code>) so clients and stakeholders can inspect geo-grid maps, video receipts and performance summaries without logging in.</p>
              <p>Anyone in possession of an active share URL can view the report metrics, white-label branding and business ranking data displayed on that page. Sensitive credentials, such as OAuth tokens and billing details, are never included in public share links. Deleting a scan from your dashboard ends its share link; you can also ask us to disable a link at {supportMail}.</p>
            </>
          ),
        },
        {
          id: 'subprocessors',
          title: 'Data Sharing, Subprocessors & Third-Party Fulfillment',
          body: (
            <>
              <p>We do <b>not</b> sell your personal information. We share data only with infrastructure subprocessors and fulfillment partners necessary to run Stakeout Search:</p>
              <div className="overflow-x-auto rounded-xl border border-[#1b2431]">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="bg-[#0c1118] text-[#eef2f7]"><tr><th className="px-4 py-3 font-semibold">Category</th><th className="px-4 py-3 font-semibold">Purpose</th><th className="px-4 py-3 font-semibold">Providers</th></tr></thead>
                  <tbody className="divide-y divide-[#1b2431]">
                    {[
                      ['Cloud hosting & databases', 'Application hosting, Postgres storage, job queues and media storage for scan videos.', 'Vercel, Railway, Neon (PostgreSQL), Cloudflare (R2), Upstash'],
                      ['Payment processing', 'Checkout, receipts and fraud prevention.', 'Stripe'],
                      ['Devices & networks', 'The cloud phones and network connections scans run on. They receive the search being run and its location, not your account details.', 'Cloud phone and residential / mobile network providers'],
                      ['Optional fulfillment & publishing', 'Used only when you order manual directory citations or connect Google Business Profile management.', 'Authorized white-label citation submitters and an OAuth publishing API'],
                      ['Transactional email', 'Account verification, password resets, scan notices and receipts.', 'Resend'],
                      ['Google', 'When you connect a Google account (Section 3).', 'Google LLC'],
                    ].map(([a, b, c]) => <tr key={a}><td className="px-4 py-3 align-top font-medium text-[#eef2f7]">{a}</td><td className="px-4 py-3 align-top">{b}</td><td className="px-4 py-3 align-top">{c}</td></tr>)}
                  </tbody>
                </table>
              </div>
              <p className="text-sm text-[#9aa7b8]">We may also disclose information if required to do so by law, valid subpoena, court order or governmental request, or in connection with a merger, acquisition or sale of company assets (subject to continued adherence to this Privacy Policy).</p>
            </>
          ),
        },
        {
          id: 'security',
          title: 'Encryption & Data Security',
          body: (
            <>
              <p>We implement technical and organizational safeguards designed to protect your data:</p>
              <ul>
                <li><b>Transport & storage encryption:</b> all web and API traffic is encrypted in transit via HTTPS/TLS. Third-party OAuth tokens are encrypted at the application layer using <b>AES-256-GCM</b> with authenticated tags, in addition to underlying disk encryption. Passwords are stored only as salted hashes.</li>
                <li><b>Telemetry integrity:</b> search verification recordings and artifacts are fingerprinted using SHA-256 hashes for tamper-evident auditability.</li>
                <li><b>Access control:</b> your scans and reports are available only to your signed-in account and to anyone you give a share link. Administrative tools are restricted to Stakeout Search staff.</li>
              </ul>
              <p className="text-sm text-[#9aa7b8]">No internet transmission or cloud storage system can be guaranteed immune to attack. We monitor our infrastructure and will notify affected customers of any confirmed unauthorized breach as required by applicable law.</p>
            </>
          ),
        },
        {
          id: 'retention',
          title: 'Data Retention, Deletion & Token Revocation',
          body: (
            <>
              <p>We retain account, scan history and report artifacts for as long as your Stakeout Search account remains active, so you can compare ranking trends over time. You can delete a scan and its recordings from your dashboard at any time.</p>
              <ul>
                <li><b>Disconnecting integrations:</b> when you disconnect a Google integration inside Stakeout Search, your stored OAuth tokens are deleted from our database immediately.</li>
                <li><b>Account deletion:</b> you may request complete deletion of your account and associated personal data at any time by emailing {privacyMail}. Database records and stored media associated with your account are purged within 30 days, except for minimal billing records required for tax, accounting and chargeback compliance.</li>
              </ul>
            </>
          ),
        },
        {
          id: 'privacy-rights',
          title: 'Your Privacy Rights (U.S. State Laws & EEA/UK GDPR)',
          body: (
            <>
              <p>Depending on your jurisdiction, including residents of Florida, California (CCPA/CPRA), Virginia, Colorado, Texas, the European Economic Area (GDPR) or the United Kingdom, you may exercise the following rights regarding your personal information:</p>
              <ul>
                <li><b>Right to access & portability:</b> request a copy of the personal data we hold about you in a structured, machine-readable format.</li>
                <li><b>Right to correction:</b> request correction of inaccurate account or contact details.</li>
                <li><b>Right to deletion:</b> request erasure of your personal data and connected API tokens.</li>
                <li><b>Right to opt out of sale / targeted sharing:</b> Stakeout Search does <b>not</b> sell personal information or share personal data for cross-context behavioral advertising.</li>
                <li><b>Non-discrimination:</b> we will never penalize or degrade service quality for exercising your privacy rights.</li>
              </ul>
              <p className="text-sm text-[#9aa7b8]">To submit a verifiable privacy request, email {privacyMail} from the email address associated with your Stakeout Search account. We respond to verified requests within 30 days.</p>
            </>
          ),
        },
        {
          id: 'cookies',
          title: 'Cookies, Session Storage & Ad Measurement',
          body: (
            <>
              <p>Stakeout Search uses strictly necessary HTTP-only cookies and browser storage to keep you signed in, to validate OAuth <Code>state</Code> parameters against cross-site request forgery, and to remember interface preferences (such as which Analytics property belongs to a website).</p>
              <p>We advertise on Google. On our public marketing pages, and on the page that confirms a purchase, we load Google’s advertising tag (Google Ads conversion measurement). It sets first-party cookies that record which Google ad, if any, brought you to our site, so we can count the sign-ups and purchases our ads lead to. With a purchase we send Google only its amount and an order reference: never your name, email address, reports or Google account data. We have turned off Google’s ad personalization signals for this tag, so your visits are not used to build advertising audiences. The tag does not load in the signed-in app, on shared report links or on account links. Google describes how it uses this information at <a href="https://policies.google.com/technologies/partner-sites" target="_blank" rel="noopener noreferrer">policies.google.com/technologies/partner-sites</a>, and you can block these cookies in your browser without affecting your use of Stakeout Search.</p>
            </>
          ),
        },
        {
          id: 'children',
          title: 'Children’s Privacy',
          body: <p>Stakeout Search is a B2B software platform intended strictly for business professionals and adults aged 18 and older. We do not knowingly collect personal information from children. If we learn that information from a minor has been inadvertently submitted, we will delete it promptly.</p>,
        },
        {
          id: 'changes-contact',
          title: 'Changes to This Policy & Contact Information',
          body: (
            <>
              <p>We may update this Privacy Policy periodically as we introduce new platform capabilities or comply with evolving regulatory requirements. Whenever we make material changes, we will update the “Last updated” date at the top of this page and notify active account holders by email before the change takes effect. See also our <Link href="/terms">Terms of Service</Link>.</p>
              <ContactCard
                heading="Contact our privacy team"
                text="For questions about this Privacy Policy, subprocessor inquiries, data deletion requests or Google API compliance matters, contact:"
                rows={[['Company', ENTITY + ' (d/b/a Stakeout Search)'], ['Location', 'Lakeland, Florida, United States'], ['Privacy email', privacyMail], ['Support email', supportMail], ['Website', <a key="w" href={SITE}>{SITE}</a>]]}
              />
            </>
          ),
        },
      ]}
    />
  );
}

export function TermsOfService({ plans = false, plansFrom = null }: { plans?: boolean; plansFrom?: string | null } = {}) {
  return (
    <Page
      updated={plans && plansFrom ? plansFrom : LEGAL_UPDATED}
      badge="Master SaaS & service agreement"
      title="Terms of Service"
      lead="The legal terms governing your access to Stakeout Search software, phone sessions and seats, white-label telemetry reports, third-party integrations and optional fulfillment services."
      sections={[
        {
          id: 'agreement',
          title: 'Acceptance of Terms & B2B Eligibility',
          body: (
            <>
              <p>These Terms of Service (“Terms”) constitute a legally binding agreement between you (individually or on behalf of the company, agency or legal entity you represent, “Customer” or “you”) and <b>{ENTITY}</b>, a Florida limited liability company doing business as <b>Stakeout Search</b> (“Stakeout Search,” “we,” “us,” or “our”), governing your access to and use of <a href={SITE}>{SITE}</a>, our web applications, telemetry artifacts and optional marketing fulfillment services (collectively, the “Services”).</p>
              <p>Stakeout Search is offered strictly as a business-to-business (B2B) commercial platform. By registering an account, purchasing phone sessions or seats, or accessing any report, you represent and warrant that you are at least 18 years old, acting in a commercial or professional capacity, and authorized to bind your organization to these Terms and our <Link href="/privacy">Privacy Policy</Link>.</p>
            </>
          ),
        },
        {
          id: 'services',
          title: 'Description of Services & Non-Affiliation',
          body: (
            <>
              <p>Stakeout Search provides localized mobile search results, map grid and AI Overview telemetry software, capturing point-in-time observations from real Android phone sessions routed over residential or mobile carrier networks, paired with video recordings, SHA-256 verification receipts, demographic overlays, analytics reporting and optional profile or directory management workflows.</p>
              <p className={box + ' text-sm'}><b>Independent platform notice:</b> Stakeout Search is an independent software provider and is not affiliated with, sponsored by or endorsed by Google LLC, Apple Inc., or any directory publisher. Google™, Google Maps™, Google Business Profile™, Google Analytics™, Google Search Console™ and Android™ are trademarks of Google LLC.</p>
            </>
          ),
        },
        {
          id: 'accounts',
          title: 'Accounts & Agency Authorization',
          body: (
            <ul>
              <li><b>Account security:</b> you are responsible for maintaining the confidentiality of your login credentials and for all actions taken through your account.</li>
              <li><b>Agency & client authority:</b> if you use Stakeout Search to manage, connect, edit or build citations for third-party client businesses, you represent and warrant that you have obtained express permission from each client to connect their analytics or business profile accounts and to submit their Name, Address, Phone (NAP) and media assets.</li>
              <li><b>Service-area business addresses:</b> you are solely responsible for accurately telling us whether a street address should be hidden when submitting home-based or service-area business details for directory or profile workflows.</li>
            </ul>
          ),
        },
        {
          id: 'credits-billing',
          title: 'Phone Sessions, Seats, Billing & Refunds',
          body: (
            <>
              <div className={box}>
                <h3>A. Phone sessions & automatic failed-point refunds</h3>
                <p className="mt-2 text-sm">A phone session is one real phone run at one grid point. Every scan uses one phone session per grid point, per keyword, whether it is scheduled or run with Scan Now, which runs ahead of scheduled scans. The cost is shown before launch. If an individual point fails location verification, network routing or screen capture integrity checks, Stakeout Search automatically refunds that point’s phone session to your balance.</p>
              </div>
              {plans ? (
                <>
                  <div className={box}>
                    <h3>B. Plans and the listing add-on (monthly subscriptions)</h3>
                    <p className="mt-2 text-sm">Scout, Agency, Scale and Agency Max are plans billed per account, monthly or yearly, through our payment processor (Stripe), at the prices shown on the pricing page{plansFrom ? `, from ${plansFrom}` : ''}. Plans renew automatically each month, or each year on yearly billing, until cancelled. Each month of a plan adds its phone sessions and brief credits to your account, on yearly billing too. The listing add-on is billed per Google listing on top of a plan and adds that listing’s tools, AI agent access, 50 phone sessions and 1 brief credit a month. Unused plan sessions roll over as each plan states on the pricing page (none on Scout billed monthly; one month on Scout billed yearly and on Agency; two months on Scale and Agency Max, up to two months’ worth), brief credits for one month wherever sessions roll over, and then they lapse; they also lapse when a subscription ends. The first 15 accounts to start Agency, Scale or Agency Max get 25% more of that plan’s phone sessions each month while they stay on one of those plans. Moving to a bigger plan charges the difference for the rest of the billing period at once; a smaller plan, or removing an add-on, takes effect at once, without a refund on monthly billing and with the unused part credited to the next renewal on yearly billing. You can cancel at any time from the billing portal, and the subscription then ends with the period already paid for. Accounts holding Scout, Command or Dominator seats bought before the plans keep them on the terms they were sold under. Billing questions: {supportMail}.</p>
                  </div>
                  <div className={box}>
                    <h3>C. One-time purchases, brief credits and briefs</h3>
                    <p className="mt-2 text-sm">The Live 5G Proof Pack (one per account), Boosts (for plan holders running low in a month) and brief-credit packs are one-time purchases; the sessions and brief credits they add never expire while your account is open. Compiling a revenue brief, or updating one you compiled, uses one brief credit: last month’s unused plan credits first, then this month’s, then bought ones. A compiled brief is kept for as long as your account is open and never recalculates when opened; reopening it, sharing it or changing its modeled inputs uses nothing. Its numbers are those of the day it was compiled or last updated. Purchases made before the plans (first audits, prospect audits, phone-session packs) keep the terms they were sold under.</p>
                  </div>
                </>
              ) : (
                <>
                <div className={box}>
                  <h3>B. Seats (monthly subscriptions)</h3>
                  <p className="mt-2 text-sm">Scout, Command and Dominator seats are monthly subscriptions billed per client through our payment processor (Stripe), at the graduated prices shown on the pricing page: each bracket’s price applies only to the clients inside it. Seats renew automatically each month until cancelled. Each paid month adds the seats’ phone sessions to your balance; seats added during a month are charged for the rest of that month at once and add their phone sessions in the same proportion. Unused seat sessions roll over for one month and then lapse, and when a subscription ends its unused seat sessions lapse. Removing a seat takes effect without a refund; a Google listing taken off a seat keeps its tools until the end of the month already paid for. You can cancel at any time from the billing portal, and the subscription then ends with the month already paid for. Billing questions: {supportMail}.</p>
                </div>
                <div className={box}>
                  <h3>C. One-time purchases</h3>
                  <p className="mt-2 text-sm">The first 5×5 audit is one per account and one per card; its price comes off the first month of your first seat, and it is run again once, free, about seven days later. Prospect audits and promotional phone sessions (such as the Black Friday bonus) are valid for 90 days from purchase or grant, after which any of them left unused lapse. Top-up sessions never expire while your account is open. Sessions bought in packs or plans before seats were introduced keep the terms they were sold under. The white-label setup is a one-time fee, waived from 10 client seats.</p>
                </div>
                </>
              )}
              <div className={box}>
                <h3>D. Refund & chargeback policy</h3>
                <p className="mt-2 text-sm">Because Stakeout Search incurs immediate device, network, storage and manual labor costs upon execution, <b>payments for completed scans, purchased phone sessions, seats for a month already started and in-progress manual fulfillment orders are non-refundable</b> except where required by law. Initiating an improper payment chargeback without first contacting support to resolve a billing error will result in immediate account suspension and revocation of public share links.</p>
              </div>
            </>
          ),
        },
        {
          id: 'google-integrations',
          title: 'Third-Party Integrations & Business Profile Edit Risks',
          highlight: 'Important operational risk allocation',
          body: (
            <>
              <p className="text-sm">Stakeout Search allows you to optionally connect Google Analytics 4 and Google Search Console to view performance metrics, and to have Google Business Profile (GBP) updates submitted on your instruction.</p>
              <ul className="text-sm">
                <li><b>Compliance with publisher guidelines:</b> you are solely responsible for ensuring that all business titles, categories, addresses, service areas, hours and descriptions submitted through Stakeout Search strictly comply with Google’s Business Profile guidelines and applicable advertising and consumer protection laws.</li>
                <li><b>Video re-verification & suspension, assumption of risk:</b> third-party platforms such as Google use automated anti-spam filters that may place edits into moderation, reject changes, require live video verification or suspend listings, particularly when modifying high-scrutiny fields such as Business Name, Primary Category, Street Address, Primary Phone or Map Coordinates. Even where Stakeout Search displays warnings or guardrails, <b>you assume full responsibility for every edit submitted on your instruction</b>, and Stakeout Search shall have no liability for any profile suspension, verification lock or ranking change.</li>
                <li><b>Third-party API availability:</b> features relying on third-party APIs or publishing gateways depend on the continued availability and rate limits of those external platforms, and may be modified or discontinued if an upstream provider alters its API terms.</li>
              </ul>
            </>
          ),
        },
        {
          id: 'addons',
          title: 'Optional Citation Builds & Managed Add-On Services',
          body: (
            <>
              <p>When you purchase optional execution add-ons from Stakeout Search, such as one-time manual directory citation packages, NAP cleanup, Done-For-You Rescue Sprints or localized promotional campaigns, the following additional terms apply:</p>
              <ul>
                <li><b>Turnaround estimates & directory moderation:</b> estimated delivery windows represent target submission schedules. Third-party business directories control their own editorial review, indexing speed and listing retention policies; if an individual directory rejects or removes a listing, we may substitute an equivalent directory at no extra charge.</li>
                <li><b>Frozen intake accuracy:</b> once an order moves into active fulfillment, the business NAP details you approved are locked. Changing a business’s address or phone number mid-build requires a separate update order.</li>
                <li><b>Credential handoff:</b> upon completion of paid manual citation packages, directory login credentials generated for your campaign are provided to you for your ongoing ownership and management.</li>
              </ul>
            </>
          ),
        },
        {
          id: 'acceptable-use',
          title: 'Acceptable Use & Platform Restrictions',
          body: (
            <>
              <p>You agree not to, and not to permit any third party to:</p>
              <ul>
                <li>Reverse-engineer, decompile, scrape or attempt to extract the source code, device orchestration architecture or network infrastructure of Stakeout Search.</li>
                <li>Use Stakeout Search to impersonate businesses you do not own or represent, submit fraudulent or defamatory directory or profile listings, or violate third-party intellectual property rights.</li>
                <li>Upload malware, interfere with job queues, bypass rate limits or edit cooldowns, or probe platform security controls without written authorization.</li>
                <li>Resell or sublicense raw Stakeout Search platform access outside of authorized agency white-label reporting features.</li>
              </ul>
            </>
          ),
        },
        {
          id: 'whitelabel',
          title: 'White-Label Branding & Public Share Links',
          body: <p>Reports can carry your agency’s branding, and you can generate unauthenticated share URLs (<Code>stakeoutsearch.com/share/[token]</Code>) to present scan reports to clients and prospects. You warrant that you hold valid rights to all brand assets you provide, and you acknowledge that anyone with a share URL can view the ranking metrics and recordings linked to it until the scan is deleted or the link is disabled.</p>,
        },
        {
          id: 'ip',
          title: 'Intellectual Property Rights',
          body: (
            <>
              <p><b>Stakeout Search IP:</b> {ENTITY} retains all right, title and interest in and to the Stakeout Search platform, software code, visual design, trademarks, algorithms (including Buying-Power SoLV) and underlying telemetry systems. Subject to timely payment, we grant you a limited, revocable, non-exclusive, non-transferable license to access the Services and share generated reports with your business stakeholders and clients.</p>
              <p><b>Customer data:</b> you retain all ownership rights in your business data, client lists, logos and connected analytics records. You grant us a limited license to host, process and display Customer Data solely as required to deliver the Services in accordance with our <Link href="/privacy">Privacy Policy</Link>.</p>
            </>
          ),
        },
        {
          id: 'disclaimers',
          title: 'Warranty Disclaimers & No Ranking Guarantees',
          body: (
            <>
              <p className={box + ' mk-mono text-xs uppercase leading-relaxed tracking-wide text-[#9aa7b8]'}>The Services, telemetry reports, AI Overview checklists and optional add-on deliverables are provided on an “as is” and “as available” basis without warranties of any kind, whether express, implied or statutory, including implied warranties of merchantability, fitness for a particular purpose and non-infringement.</p>
              <p className="text-sm">Search engine algorithms, local map packs and generative AI answers change continuously based on searcher device state, time of day, proximity, ad auctions and proprietary third-party ranking updates outside our control. While Stakeout Search records verifiable point-in-time mobile search observations, <b>we do not guarantee any specific search ranking position, AI Overview citation, lead volume, phone call increase or revenue outcome.</b></p>
            </>
          ),
        },
        {
          id: 'liability',
          title: 'Limitation of Liability & Indemnification',
          body: (
            <div className="space-y-4 text-sm">
              <p>TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL {ENTITY.toUpperCase()}, ITS MEMBERS, OFFICERS, EMPLOYEES OR SUBPROCESSORS BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY OR PUNITIVE DAMAGES, INCLUDING LOST PROFITS, LOST CLIENT RETAINERS, LOSS OF SEARCH RANKINGS OR THIRD-PARTY BUSINESS PROFILE SUSPENSIONS, ARISING OUT OF OR RELATED TO THESE TERMS OR THE SERVICES, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.</p>
              <p>OUR TOTAL CUMULATIVE LIABILITY FOR ALL CLAIMS ARISING OUT OF OR RELATING TO THESE TERMS IN ANY TWELVE-MONTH PERIOD SHALL NOT EXCEED THE GREATER OF (A) THE TOTAL FEES ACTUALLY PAID BY YOU TO STAKEOUT SEARCH IN THE THREE (3) MONTHS IMMEDIATELY PRECEDING THE EVENT GIVING RISE TO THE CLAIM, OR (B) ONE HUNDRED U.S. DOLLARS ($100.00).</p>
              <p><b>Indemnification:</b> you agree to defend, indemnify and hold harmless {ENTITY} from and against any third-party claims, damages, liabilities and reasonable attorneys’ fees arising from (i) your violation of these Terms, (ii) unauthorized submission or modification of a third party’s business profile or data, or (iii) content, logos or representations you publish through white-label reports or connected integrations.</p>
            </div>
          ),
        },
        {
          id: 'disputes',
          title: 'Governing Law, Informal Resolution & Binding Arbitration',
          body: (
            <>
              <p>These Terms and any dispute arising out of or relating to Stakeout Search shall be governed by and construed in accordance with the laws of the <b>State of Florida</b>, without regard to conflict-of-law principles.</p>
              <p>Before initiating formal proceedings, both parties agree to attempt good-faith informal resolution for thirty (30) days following written notice sent to {supportMail}. Any dispute not resolved informally shall be settled exclusively by confidential, binding individual arbitration administered by the American Arbitration Association (AAA) under its Commercial Arbitration Rules, seated in <b>Polk County, Florida</b> (or conducted remotely by video conference upon mutual election), except that either party may seek injunctive relief in state or federal courts located in Polk County or the Middle District of Florida to protect intellectual property rights.</p>
              <p className="text-sm text-[#9aa7b8]"><b>Class action waiver:</b> all claims must be brought in the parties’ individual commercial capacities, and not as a plaintiff or class member in any purported class, collective or representative proceeding.</p>
            </>
          ),
        },
        {
          id: 'contact',
          title: 'Modifications & Contact Information',
          body: (
            <>
              <p>We may revise these Terms from time to time to reflect new features, pricing or legal requirements. Material updates will be posted at <Code>stakeoutsearch.com/terms</Code> with an updated “Last updated” date, and continued use of the Services after the effective date constitutes acceptance of the revised Terms.</p>
              <ContactCard
                heading="Legal & support notices"
                text="Questions regarding these Terms, billing inquiries or agency agreements can be directed to:"
                rows={[['Company', ENTITY + ' (d/b/a Stakeout Search)'], ['Jurisdiction', 'Lakeland, Polk County, Florida, United States'], ['Support & billing', supportMail], ['Privacy & legal', privacyMail], ['Website', <a key="w" href={SITE}>{SITE}</a>]]}
              />
            </>
          ),
        },
      ]}
    />
  );
}
