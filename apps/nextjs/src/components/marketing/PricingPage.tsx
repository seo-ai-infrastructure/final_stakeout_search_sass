import Link from 'next/link';
import { SiteHeader, SiteFooter } from './SiteChrome';
import { EXTRA, ONBOARDING, PLANS, perCredit, scans5x5, usd } from '@/lib/pricing';
import './marketing.css';

const ACCESS = 'mailto:sass@stakeoutsearch.com?subject=Founding%20access%20to%20Stakeout%20Search';

const INCLUDED = [
  `${ONBOARDING.credits.toLocaleString('en-US')} credits to start scanning`,
  'An onboarding call',
  'Your businesses and service areas set up for you',
  'A first visibility audit, with recordings you can show your client',
];

const CREDIT_RULES: [string, string][] = [
  ['One grid point, in Chrome or the Google Maps app', '1 credit'],
  ['With AI Overview tracking (Chrome)', '2 credits'],
  ['A point that fails', 'credited back automatically'],
  ['Re-running a failed point', 'one click, same price'],
];

const GRIDS: [string, number][] = [['3 × 3', 9], ['5 × 5', 25], ['7 × 7', 49]];

const FAQ: [string, string][] = [
  ['Why is there an onboarding fee?', `Every search runs on a real phone, and we only have so many, so we take a small number of customers and set each one up properly. The fee covers that setup and a first audit, and comes with ${ONBOARDING.credits.toLocaleString('en-US')} credits.`],
  ['Is there a contract?', 'No. Plans are bought a month at a time from your account, and you can change plan or stop whenever you like.'],
  ['What if I need more than my plan?', `Add ${EXTRA.credits} credits for ${usd(EXTRA.cents)} at any time, or move up a plan, which costs less per credit.`],
  ['What does a credit buy?', 'One grid point: a real phone moved to that spot, the search run and recorded, and a receipt with the results, the location Google used and a fingerprint of the evidence.'],
  ['How do I get an account?', 'New accounts are by invitation for now. Email us and we will set yours up and book your onboarding call.'],
];

export default function PricingPage() {
  return (
    <div className="mk min-h-screen overflow-x-hidden">
      <SiteHeader />

      <section className="relative">
        <div className="mk-glow pointer-events-none absolute inset-0" aria-hidden="true" />
        <div className="relative mx-auto max-w-7xl px-5 pb-12 pt-16 text-center sm:px-8 sm:pt-24">
          <p className="mk-mono text-[12px] uppercase tracking-widest text-[#f5c451]">Pricing</p>
          <h1 className="mk-display mx-auto mt-3 max-w-4xl text-5xl font-bold leading-[1.05] sm:text-7xl">
            Pay for proof, <span className="mk-gold-text">by the point.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-[#9aa7b8]">
            One credit is one grid point searched on a real phone, with its recording and receipt. Start with onboarding, then choose a monthly plan.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-20 sm:px-8">
        <div className="grid items-center gap-10 rounded-3xl border border-[#f5c451]/40 bg-[#0c1118] p-8 sm:p-12 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <p className="mk-mono text-[12px] uppercase tracking-widest text-[#f5c451]">Step 1 · once</p>
            <h2 className="mk-display mt-3 text-4xl font-bold leading-tight sm:text-5xl">Founding onboarding</h2>
            <p className="mt-4 leading-relaxed text-[#9aa7b8]">
              We set you up, run your first audit with you, and hand you a report you can put in front of a client the same week.
            </p>
            <ul className="mt-6 space-y-3">
              {INCLUDED.map((t) => (
                <li key={t} className="flex gap-3 text-[#eef2f7]">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#3ddc97]" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-[#1b2431] bg-[#080b10] p-8 text-center">
            <p className="mk-display text-7xl font-bold text-[#eef2f7]">{usd(ONBOARDING.cents)}</p>
            <p className="mt-2 text-[#9aa7b8]">one time</p>
            <p className="mt-5 text-sm leading-relaxed text-[#c9d3df]">
              Founding rate for our first {ONBOARDING.foundingPlaces} customers. The regular price is {usd(ONBOARDING.regularCents)}.
            </p>
            <a href={ACCESS} className="mk-btn-primary mt-7 inline-block rounded-xl px-7 py-3.5 font-semibold">
              Request founding access
            </a>
            <p className="mt-4 text-sm text-[#9aa7b8]">
              Already invited? <Link href="/login" className="text-[#7aa7ff] hover:underline">Sign in</Link>
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-20 sm:px-8">
        <p className="mk-mono text-center text-[12px] uppercase tracking-widest text-[#f5c451]">Step 2 · each month</p>
        <h2 className="mk-display mx-auto mt-3 max-w-3xl text-center text-4xl font-bold leading-tight sm:text-5xl">Then pick a plan.</h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-[#9aa7b8]">No contract. Buy a plan each month from your account, and change it whenever your workload does.</p>
        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {PLANS.map((p) => {
            const s = scans5x5(p.credits);
            return (
              <div key={p.key} className={'flex flex-col rounded-2xl border bg-[#0c1118] p-8 ' + (p.featured ? 'border-[#3ddc97]' : 'border-[#1b2431]')}>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="mk-display text-2xl font-bold">{p.name}</h3>
                  {p.featured && <span className="rounded-full bg-[#3ddc97] px-3 py-1 text-xs font-bold text-[#06080c]">Most agencies</span>}
                </div>
                <p className="mt-5">
                  <span className="mk-display text-5xl font-bold text-[#eef2f7]">{usd(p.cents)}</span>
                  <span className="text-[#9aa7b8]"> / month</span>
                </p>
                <p className="mt-2 text-lg font-semibold text-[#eef2f7]">{p.credits.toLocaleString('en-US')} credits</p>
                <p className="mk-mono mt-1 text-sm text-[#9aa7b8]">{usd(Math.round(perCredit(p) * 100))} per credit</p>
                <ul className="mt-6 space-y-2 text-sm text-[#c9d3df]">
                  <li>{s.plain} scans at 5 × 5</li>
                  <li>or {s.withAi} with AI Overview tracking</li>
                  <li className="text-[#9aa7b8]">{p.fits}</li>
                </ul>
              </div>
            );
          })}
        </div>
        <p className="mt-6 text-center text-sm text-[#9aa7b8]">
          Need more in a month? Add {EXTRA.credits} credits for {usd(EXTRA.cents)} ({usd(Math.round(perCredit(EXTRA) * 100))} each).
        </p>
      </section>

      <section className="border-y border-[#1b2431] bg-[#080b10]">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 py-20 sm:px-8 lg:grid-cols-2">
          <div>
            <p className="mk-mono text-[12px] uppercase tracking-widest text-[#f5c451]">How credits work</p>
            <h2 className="mk-display mt-3 text-4xl font-bold leading-tight">One credit per point.</h2>
            <dl className="mt-8 divide-y divide-[#1b2431] rounded-2xl border border-[#1b2431] bg-[#0c1118]">
              {CREDIT_RULES.map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-4 px-5 py-4">
                  <dt className="text-[#c9d3df]">{k}</dt>
                  <dd className="mk-mono shrink-0 font-semibold text-[#eef2f7]">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div>
            <p className="mk-mono text-[12px] uppercase tracking-widest text-[#7aa7ff]">What a scan costs</p>
            <h2 className="mk-display mt-3 text-4xl font-bold leading-tight">By grid size.</h2>
            <table className="mt-8 w-full overflow-hidden rounded-2xl border border-[#1b2431] bg-[#0c1118] text-left">
              <thead className="text-sm text-[#9aa7b8]">
                <tr>
                  <th className="px-5 py-4 font-medium">Grid</th>
                  <th className="px-5 py-4 font-medium">Credits</th>
                  <th className="px-5 py-4 font-medium">With AI tracking</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1b2431]">
                {GRIDS.map(([name, n]) => (
                  <tr key={name}>
                    <td className="px-5 py-4 font-semibold text-[#eef2f7]">{name}</td>
                    <td className="mk-mono px-5 py-4 text-[#c9d3df]">{n}</td>
                    <td className="mk-mono px-5 py-4 text-[#c9d3df]">{n * 2}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-5 py-20 sm:px-8">
        <h2 className="mk-display text-center text-4xl font-bold leading-tight">Questions</h2>
        <div className="mt-8 space-y-3">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group rounded-2xl border border-[#1b2431] bg-[#0c1118] px-5 py-4">
              <summary className="cursor-pointer list-none font-semibold marker:hidden">
                {q}
                <span className="float-right text-[#6b7686] transition group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-[#9aa7b8]">{a}</p>
            </details>
          ))}
        </div>
        <div className="mt-12 text-center">
          <a href={ACCESS} className="mk-btn-primary inline-block rounded-xl px-7 py-3.5 font-semibold">Request founding access</a>
          <p className="mt-4 text-sm text-[#9aa7b8]">
            Or <Link href="/demo" className="text-[#7aa7ff] hover:underline">explore the live demo map</Link> first.
          </p>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
