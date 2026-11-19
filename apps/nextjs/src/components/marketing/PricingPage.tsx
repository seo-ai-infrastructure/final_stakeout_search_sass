import Link from 'next/link';
import { OFFERED_GRID_SIZES } from '@stakeout/core/gridSizes';
import { SiteHeader, SiteFooter, SIGNUPS_OPEN } from './SiteChrome';
import { ONBOARDING, PACKS, PLANS, PREPAID, PROMO, WHITE_LABEL, perCredit, promoLive, usd } from '@/lib/pricing';
import './marketing.css';

const BRANDING = 'mailto:sass@stakeoutsearch.com?subject=White%20label%20setup';
const ACCESS = 'mailto:sass@stakeoutsearch.com?subject=Access%20to%20Stakeout%20Search';

const INCLUDED = [
  `${ONBOARDING.credits.toLocaleString('en-US')} credits to start scanning`,
  'An onboarding call',
  'Your businesses and service areas set up for you',
  'A first visibility audit, with recordings you can show your client',
];

const CREDIT_RULES: [string, string][] = [
  ['One grid point, in Chrome or the Google Maps app', '1 credit'],
  ['AI Overview tracking (Chrome)', 'included'],
  ['A point that fails', 'credited back automatically'],
  ['Re-running a failed point', 'one click, same price'],
];

// The sizes on offer right now.
const GRIDS: [string, number][] = OFFERED_GRID_SIZES.map((n) => [`${n} × ${n}`, n * n]);

const FAQ: [string, string][] = [
  ['How is this different from other grid trackers?', 'Most trackers ask Google for results from a server and show you a number. We send a real Android phone to each pin, run the search in Chrome or the Google Maps app, and record the screen. You get the ranking and the video that proves it.'],
  ['My client says they see something different on their phone. Now what?', 'Open that pin and play the recording. It shows the search being typed, the location Google itself reported for the phone, and the results as they appeared. That is the conversation other tools leave you to argue from memory.'],
  ['What does a credit buy?', 'One pin: a real phone moved to that spot, the search run and recorded, and a receipt with the results, the location Google used and a fingerprint of the evidence. AI Overview tracking is included.'],
  ['Do credits expire?', 'No. Credits you buy stay on your account until you use them, on packs and plans alike.'],
  ['What happens if a pin fails?', 'Its credit goes straight back to your balance, and you can run it again with one click.'],
  ['Do I have to pay for onboarding?', `No. Start with a pack from ${usd(PACKS[0].cents)} and run a scan today. Onboarding (${usd(ONBOARDING.cents)}, with ${ONBOARDING.credits.toLocaleString('en-US')} credits) is there if you want us to set you up and run your first audit with you.`],
  ['Why do packs cost more per credit than plans?', `A pack is for trying it, or for a one-off job. Once you scan every week, a plan costs about half as much per credit: ${usd(Math.round(perCredit(PLANS[0]) * 100))} on ${PLANS[0].name} against ${usd(Math.round(perCredit(PACKS[1]) * 100))} on the ${PACKS[1].name}.`],
  ['Is there a contract?', 'No. Plans are bought a month at a time from your account, and you can change plan or stop whenever you like.'],
  ['Can I put my own brand on reports?', `Yes. Every scan has a share link your client can open without an account. For a one-time ${usd(WHITE_LABEL.cents)} setup, all your reporting carries your logo on your own domain, share links included.`],
];

/** The way in: create an account while sign-ups are open, otherwise ask for an invitation by email. */
function AccessButton({ className, label = 'Run your first scan' }: { className: string; label?: string }) {
  return SIGNUPS_OPEN ? (
    <Link href="/login?mode=register" className={className}>{label}</Link>
  ) : (
    <a href={ACCESS} className={className}>Request access</a>
  );
}

/** What agencies complain about in grid trackers, and what we do about each. */
const ANSWERS: [string, string, string][] = [
  ['“The tracker says #1. My client says that’s not what they see.”', 'Show them the video.', 'Every pin is a real phone at that spot, screen-recorded from the search to the last result, with the location Google itself reported. The argument ends when you press play.'],
  ['“My credits vanish at the end of the month.”', 'Yours never expire.', 'Buy credits once and use them when the work comes in. A pin that fails is credited back automatically.'],
  ['“I can’t hand this report to a client.”', 'A report built to be shown.', `One link, no login: the map, the competitors, the AI Overview and the recording behind every pin. White label is a one-time ${usd(WHITE_LABEL.cents)} setup: your logo, your domain, share links included.`],
];

/** How we differ from the usual grid tracker, row by row. */
const VERSUS: [string, string, string][] = [
  ['How each pin is searched', 'A request sent from a server', 'A real Android phone, in Chrome or the Maps app'],
  ['Where it searches', 'Often Maps only', 'Google Search and the Maps app: you choose'],
  ['Proof you can show a client', 'A number on a map', 'A screen recording and a receipt for every pin'],
  ['Where Google placed the searcher', 'Assumed', 'Google’s own location line, captured on screen'],
  ['Paid ads in the results', 'Can be counted as rankings', 'Labelled as ads, kept apart from your rank'],
  ['A link your client can open', 'Often a higher-priced tier', 'On every pack and plan, no login'],
  ['AI Overview tracking', 'Extra, or not offered', 'Included with every Chrome pin'],
  ['Unused credits', 'Often expire each month', 'Never expire'],
  ['A pin that fails', 'Varies', 'Credited back automatically'],
];

/**
 * What a 5 × 5 scan with AI tracking draws from a balance, line by line. The left side follows the published
 * credit rules of a leading credit-based grid tracker (one credit per pin, per platform; a flat fee per AI
 * analysis report), checked 18 November 2026. Re-check those rules before changing a number.
 */
const THEIR_RECEIPT: [string, string][] = [
  ['Maps rank, 25 pins', '25'],
  ['AI Overview scan, the same 25 pins again', '+25'],
  ['AI analysis report for the scan', '+25'],
];
const OUR_RECEIPT: [string, string][] = [
  ['Rank on a real phone, 25 pins', '25'],
  ['AI Overview at every pin', 'included'],
  ['Ads above your listing, counted and named', 'included'],
  ['Screen recording and receipt for every pin', 'included'],
  ['Checklist from the pages Google’s AI cited', 'included'],
];

const TRUST = ['No setup fee', 'Credits never expire', 'Failed pins credited back', 'No contract'];

export default function PricingPage() {
  // The offer leaves the page when it ends (the page is rebuilt every hour).
  const live = promoLive();
  return (
    <div className="mk min-h-screen overflow-x-hidden">
      {live && (
        <p className="bg-[#f5c451] px-4 py-2.5 text-center text-sm font-semibold text-[#06080c]">
          {PROMO.name}: no setup fee, and 3 months of any plan for up to {usd(Math.max(...PREPAID.map((x) => x.saves)))} less. Ends {PROMO.endsText}.
        </p>
      )}
      <SiteHeader />

      <section className="relative">
        <div className="mk-glow pointer-events-none absolute inset-0" aria-hidden="true" />
        <div className="relative mx-auto max-w-7xl px-5 pb-14 pt-16 text-center sm:px-8 sm:pt-24">
          <p className="mk-mono text-[12px] uppercase tracking-widest text-[#f5c451]">Pricing</p>
          <h1 className="mk-display mx-auto mt-3 max-w-5xl text-5xl font-bold leading-[1.05] sm:text-7xl">
            “That’s not what I see on my phone.” <span className="mk-gold-text">Show them the video.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-[#9aa7b8]">
            Other grid trackers give you a number. We send a real phone to every pin, run the search in Google Search or the Maps app, and record it, so every ranking comes with proof your client can watch.
          </p>
          <p className="mk-display mt-8 text-2xl font-bold text-[#eef2f7]">1 credit = 1 pin. Start for {usd(PACKS[0].cents)}.</p>
          <AccessButton className="mk-btn-primary mt-6 inline-block rounded-xl px-8 py-4 text-lg font-semibold" />
          <ul className="mx-auto mt-6 flex max-w-3xl flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-[#c9d3df]">
            {TRUST.map((t) => (
              <li key={t} className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-[#3ddc97]" />
                {t}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-20 sm:px-8">
        <p className="mk-mono text-center text-[12px] uppercase tracking-widest text-[#f5c451]">Step 1 · try it today</p>
        <h2 className="mk-display mx-auto mt-3 max-w-3xl text-center text-4xl font-bold leading-tight sm:text-5xl">Start with a pack.</h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-[#9aa7b8]">Paid once. No plan, no setup fee, no call. Your first recording is minutes away.</p>
        <div className="mt-12 grid items-stretch gap-6 lg:grid-cols-3">
          {PACKS.map((p) => (
            <div key={p.key} className={'relative flex flex-col rounded-2xl border bg-[#0c1118] p-8 ' + (p.featured ? 'border-2 border-[#f5c451] lg:-my-3 lg:py-11' : 'border-[#1b2431]')}>
              {p.featured && <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#f5c451] px-4 py-1 text-xs font-bold text-[#06080c]">Most popular</span>}
              <h3 className="mk-display text-2xl font-bold">{p.name}</h3>
              <p className="mt-1 text-sm text-[#9aa7b8]">{p.fits}</p>
              <p className="mt-5">
                <span className="mk-display text-6xl font-bold text-[#eef2f7]">{usd(p.cents)}</span>
                <span className="text-[#9aa7b8]"> once</span>
              </p>
              <p className="mt-3 text-xl font-semibold text-[#eef2f7]">{p.credits.toLocaleString('en-US')} credits</p>
              <p className="mk-mono mt-1 text-sm text-[#9aa7b8]">{usd(Math.round(perCredit(p) * 100))} per credit</p>
              <ul className="mt-6 flex-1 space-y-2 text-sm text-[#c9d3df]">
                <li>1 credit = 1 pin</li>
                <li>Screen recording and receipt for every pin</li>
                <li>Google Search or the Maps app</li>
                <li>A share link your client can open</li>
                <li>AI Overview tracking included</li>
                <li>Credits never expire</li>
                <li>Failed pins credited back</li>
              </ul>
              <AccessButton label={'Get ' + p.credits + ' credits'} className={'mt-8 block rounded-xl px-6 py-3.5 text-center font-semibold ' + (p.featured ? 'mk-btn-primary' : 'border border-[#2a3442] text-[#eef2f7] hover:bg-[#111823]')} />
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-[#1b2431] bg-[#080b10]">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
          <p className="mk-mono text-center text-[12px] uppercase tracking-widest text-[#7aa7ff]">Why agencies switch</p>
          <h2 className="mk-display mx-auto mt-3 max-w-3xl text-center text-4xl font-bold leading-tight sm:text-5xl">The three complaints we kept hearing.</h2>
          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {ANSWERS.map(([pain, answer, how]) => (
              <div key={answer} className="rounded-2xl border border-[#1b2431] bg-[#0c1118] p-8">
                <p className="text-[15px] italic leading-relaxed text-[#9aa7b8]">{pain}</p>
                <h3 className="mk-display mt-5 text-2xl font-bold text-[#3ddc97]">{answer}</h3>
                <p className="mt-3 leading-relaxed text-[#c9d3df]">{how}</p>
              </div>
            ))}
          </div>
          <div className="mx-auto mt-14 max-w-4xl overflow-hidden rounded-2xl border border-[#1b2431] bg-[#0c1118]">
            <table className="w-full text-left text-sm sm:text-base">
              <thead>
                <tr className="text-[#9aa7b8]">
                  <th className="px-5 py-4 font-medium" />
                  <th className="px-5 py-4 font-medium">Most grid trackers</th>
                  <th className="px-5 py-4 font-semibold text-[#f5c451]">Stakeout</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1b2431]">
                {VERSUS.map(([k, them, us]) => (
                  <tr key={k}>
                    <td className="px-5 py-4 text-[#9aa7b8]">{k}</td>
                    <td className="px-5 py-4 text-[#c9d3df]">{them}</td>
                    <td className="px-5 py-4 font-semibold text-[#eef2f7]">{us}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
        <p className="mk-mono text-center text-[12px] uppercase tracking-widest text-[#f5c451]">Step 2 · when you scan every week</p>
        <h2 className="mk-display mx-auto mt-3 max-w-3xl text-center text-4xl font-bold leading-tight sm:text-5xl">Then cut your price per pin in half.</h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-[#9aa7b8]">Monthly plans, no contract. Change or stop whenever you like.</p>
        <div className="mt-12 grid items-stretch gap-6 lg:grid-cols-3">
          {PLANS.map((p) => {
            const offer = PREPAID.find((x) => x.plan === p.key);
            return (
              <div key={p.key} className={'relative flex flex-col rounded-2xl border bg-[#0c1118] p-8 ' + (p.featured ? 'border-2 border-[#3ddc97] lg:-my-3 lg:py-11' : 'border-[#1b2431]')}>
                {p.featured && <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#3ddc97] px-4 py-1 text-xs font-bold text-[#06080c]">Most agencies</span>}
                <h3 className="mk-display text-2xl font-bold">{p.name}</h3>
                <p className="mt-1 text-sm text-[#9aa7b8]">{p.fits}</p>
                <p className="mt-5">
                  <span className="mk-display text-6xl font-bold text-[#eef2f7]">{usd(p.cents)}</span>
                  <span className="text-[#9aa7b8]"> / month</span>
                </p>
                <p className="mt-3 text-xl font-semibold text-[#eef2f7]">{p.credits.toLocaleString('en-US')} credits</p>
                <p className="mk-mono mt-1 text-sm text-[#3ddc97]">{usd(Math.round(perCredit(p) * 100))} per credit</p>
                <ul className="mt-6 flex-1 space-y-2 text-sm text-[#c9d3df]">
                  <li>1 credit = 1 pin</li>
                  <li>Everything in the packs</li>
                  <li>White label: {usd(WHITE_LABEL.cents)} one-time setup</li>
                </ul>
                {live && offer && (
                  <p className="mt-6 rounded-xl border border-[#f5c451]/40 bg-[#f5c451]/10 px-4 py-3 text-sm text-[#f5c451]">
                    <b>{PROMO.name}:</b> 3 months for {usd(offer.cents)}. Save {usd(offer.saves)}. Ends {PROMO.endsText}.
                  </p>
                )}
                <AccessButton label={'Choose ' + p.name} className={'mt-6 block rounded-xl px-6 py-3.5 text-center font-semibold ' + (p.featured ? 'mk-btn-primary' : 'border border-[#2a3442] text-[#eef2f7] hover:bg-[#111823]')} />
              </div>
            );
          })}
        </div>
      </section>

      <section className="border-y border-[#1b2431] bg-[#080b10]">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 py-20 sm:px-8 lg:grid-cols-2">
          <div>
            <p className="mk-mono text-[12px] uppercase tracking-widest text-[#f5c451]">How credits work</p>
            <h2 className="mk-display mt-3 text-4xl font-bold leading-tight">One pin, one credit.</h2>
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
            <p className="mk-mono text-[12px] uppercase tracking-widest text-[#7aa7ff]">How much does a scan cost?</p>
            <h2 className="mk-display mt-3 text-4xl font-bold leading-tight">Count the pins.</h2>
            <p className="mt-3 text-[#9aa7b8]">A 3 × 3 grid has 9 pins, so it costs 9 credits.</p>
            <table className="mt-6 w-full overflow-hidden rounded-2xl border border-[#1b2431] bg-[#0c1118] text-left">
              <thead className="text-sm text-[#9aa7b8]">
                <tr>
                  <th className="px-5 py-4 font-medium">Grid</th>
                  <th className="px-5 py-4 font-medium">Credits</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1b2431]">
                {GRIDS.map(([name, n]) => (
                  <tr key={name}>
                    <td className="px-5 py-4 font-semibold text-[#eef2f7]">{name}</td>
                    <td className="mk-mono px-5 py-4 text-[#c9d3df]">{n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
        <p className="mk-mono text-center text-[12px] uppercase tracking-widest text-[#f5c451]">Read the receipt, not the credit count</p>
        <h2 className="mk-display mx-auto mt-3 max-w-4xl text-center text-4xl font-bold leading-tight sm:text-5xl">
          A Big Credit Number Is Not a Big Number of Scans. <span className="mk-gold-text">Here Is the Same 5 × 5, Itemised.</span>
        </h2>
        <p className="mx-auto mt-4 max-w-3xl text-center text-lg leading-relaxed text-[#c9d3df]">
          Credit-based trackers sell thousands of credits at a fraction of a cent each. Then the scan you wanted draws credits once for the map, again for each AI platform, and again for the analysis. Our credit costs more. It is also the only charge.
        </p>
        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-[#1b2431] bg-[#0b0f15] p-7">
            <p className="mk-mono text-[12px] uppercase tracking-widest text-[#9aa7b8]">A leading credit-based grid tracker</p>
            <h3 className="mk-display mt-2 text-2xl font-semibold">One 5 × 5 scan, with AI</h3>
            <dl className="mt-5 divide-y divide-[#1b2431]">
              {THEIR_RECEIPT.map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-4 py-3.5">
                  <dt className="text-[#c9d3df]">{k}</dt>
                  <dd className="mk-mono shrink-0 font-semibold text-[#eef2f7]">{v}</dd>
                </div>
              ))}
              <div className="flex items-baseline justify-between gap-4 py-4">
                <dt className="font-semibold text-white">Credits drawn</dt>
                <dd className="mk-display shrink-0 text-4xl font-bold text-[#ff6b6b]">75</dd>
              </div>
            </dl>
            <ul className="mt-4 space-y-2 text-sm text-[#9aa7b8]">
              <li>Three times the “one credit per pin” on the pricing page.</li>
              <li>Each further AI platform scans the whole grid again.</li>
              <li>On monthly plans, credits you don’t use are gone at the end of the month.</li>
              <li>Review reports and listing alerts are billed separately.</li>
            </ul>
          </div>
          <div className="rounded-2xl border border-[#f5c451]/40 bg-[#f5c451]/[0.06] p-7">
            <p className="mk-mono text-[12px] uppercase tracking-widest text-[#f5c451]">Stakeout Search</p>
            <h3 className="mk-display mt-2 text-2xl font-semibold">The same 5 × 5 scan</h3>
            <dl className="mt-5 divide-y divide-[#f5c451]/15">
              {OUR_RECEIPT.map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-4 py-3.5">
                  <dt className="text-[#c9d3df]">{k}</dt>
                  <dd className={'mk-mono shrink-0 font-semibold ' + (v === 'included' ? 'text-[#3ddc97]' : 'text-[#eef2f7]')}>{v}</dd>
                </div>
              ))}
              <div className="flex items-baseline justify-between gap-4 py-4">
                <dt className="font-semibold text-white">Credits drawn</dt>
                <dd className="mk-display shrink-0 text-4xl font-bold text-[#f5c451]">25</dd>
              </div>
            </dl>
            <ul className="mt-4 space-y-2 text-sm text-[#c9d3df]">
              <li>One credit per pin. Nothing else is metered.</li>
              <li>Credits never expire, on packs and plans alike.</li>
              <li>A pin that fails is credited back automatically.</li>
            </ul>
          </div>
        </div>
        <p className="mx-auto mt-8 max-w-4xl rounded-2xl border border-[#2a3442] bg-[#0c1118] p-6 text-center text-lg leading-relaxed text-[#c9d3df]">
          <b className="text-white">We know how this looks on a comparison chart.</b> Their credit is cheaper than ours, and we will not pretend otherwise. Ours sends a real phone to the pin and hands you the recording. We would rather show you the whole bill up front than win on a number that isn’t the bill.
        </p>
        <p className="mx-auto mt-4 max-w-3xl text-center text-xs text-[#6b7686]">
          The left-hand figures follow the published credit rules of a leading credit-based grid tracker (one credit per pin, per platform, and a flat 25 credits per AI analysis report), checked on 18 November 2026. Other trackers meter differently; read the credit rules before you buy.
        </p>
      </section>

      <section className="mx-auto max-w-5xl px-5 pt-16 sm:px-8">
        <div className="flex flex-col items-start justify-between gap-6 rounded-2xl border border-[#f5c451]/40 bg-[#0c1118] p-8 sm:flex-row sm:items-center">
          <div>
            <p className="mk-mono text-[12px] uppercase tracking-widest text-[#f5c451]">White label · for agencies</p>
            <h2 className="mk-display mt-2 text-3xl font-bold">Your logo. Your domain. Your reports.</h2>
            <p className="mt-2 max-w-xl text-[#9aa7b8]">All your reporting under your brand, on your own domain, including the share links you send to clients. Set up once, on packs or plans.</p>
          </div>
          <div className="shrink-0 text-left sm:text-right">
            <p className="mk-display text-4xl font-bold text-[#eef2f7]">{usd(WHITE_LABEL.cents)}</p>
            <p className="text-sm text-[#9aa7b8]">one-time setup</p>
            <a href={BRANDING} className="mt-2 inline-block text-sm font-semibold text-[#7aa7ff] hover:underline">Set up white label</a>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 py-16 sm:px-8">
        <div className="flex flex-col items-start justify-between gap-6 rounded-2xl border border-[#1b2431] bg-[#0c1118] p-8 sm:flex-row sm:items-center">
          <div>
            <p className="mk-mono text-[12px] uppercase tracking-widest text-[#9aa7b8]">Optional · done for you</p>
            <h2 className="mk-display mt-2 text-3xl font-bold">Want us to set it all up?</h2>
            <p className="mt-2 max-w-xl text-[#9aa7b8]">{INCLUDED.join(' · ')}.</p>
          </div>
          <div className="shrink-0 text-left sm:text-right">
            <p className="mk-display text-4xl font-bold text-[#eef2f7]">{usd(ONBOARDING.cents)}</p>
            <p className="text-sm text-[#9aa7b8]">one time</p>
            <a href={ACCESS} className="mt-2 inline-block text-sm font-semibold text-[#7aa7ff] hover:underline">Ask about onboarding</a>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-5 pb-20 sm:px-8">
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
      </section>

      <section className="border-t border-[#1b2431] bg-[#080b10]">
        <div className="mx-auto max-w-4xl px-5 py-20 text-center sm:px-8">
          <h2 className="mk-display text-4xl font-bold leading-tight sm:text-5xl">
            See your first pin on video <span className="mk-gold-text">for {usd(PACKS[0].cents)}.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-[#9aa7b8]">
            {live ? `No setup fee. ${PROMO.name} plan pricing ends ${PROMO.endsText}.` : 'No setup fee, no contract, and credits that never expire.'}
          </p>
          <AccessButton className="mk-btn-primary mt-8 inline-block rounded-xl px-8 py-4 text-lg font-semibold" />
          <p className="mt-4 text-sm text-[#9aa7b8]">
            Or <Link href="/demo" className="text-[#7aa7ff] hover:underline">explore the live demo map</Link> first.
          </p>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
