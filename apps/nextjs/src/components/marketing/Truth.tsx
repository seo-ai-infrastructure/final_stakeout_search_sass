import Link from 'next/link';
import { SiteHeader, SiteFooter, JoinLink } from './SiteChrome';
import SmoothingDemo from './SmoothingDemo';
import './marketing.css';

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="mk-mono text-[12px] uppercase tracking-widest text-[#f5c451]">{children}</p>;
}

function TrickNumber({ n }: { n: string }) {
  return <span className="mk-display mr-3 inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#f5c451]/50 text-base font-bold text-[#f5c451]">{n}</span>;
}

/* Snapping: 49 squares that are really 4 searches, one per named place. */
const ZONES = [
  'AAABBBB',
  'AAABBBB',
  'AAAABBB',
  'CCAADDD',
  'CCCCDDD',
  'CCCCDDD',
  'CCCDDDD',
];
const ZONE_RANK: Record<string, number> = { A: 3, B: 9, C: 6, D: 14 };
const ZONE_TINT: Record<string, string> = { A: '#3ddc97', B: '#f5c451', C: '#9bd34a', D: '#ff8a4c' };

function SnapGrid() {
  return (
    <figure className="rounded-3xl border border-[#1b2431] bg-[#0b0f15] p-5">
      <div className="grid grid-cols-7 gap-1.5" role="img" aria-label="A 7 by 7 grid where blocks of squares share an identical result, because each block is one search for a named place">
        {ZONES.join('').split('').map((z, i) => (
          <div key={i} className="flex aspect-square items-center justify-center rounded-md" style={{ background: ZONE_TINT[z] }}>
            <span className="mk-display text-sm font-bold text-[#06080c]">{ZONE_RANK[z]}</span>
          </div>
        ))}
      </div>
      <figcaption className="mt-4 flex flex-wrap items-center justify-between gap-2 text-[12px] text-[#9aa7b8]">
        <span>49 squares on the report</span>
        <span className="mk-mono text-[#f5c451]">4 actual searches</span>
      </figcaption>
    </figure>
  );
}

const PRICES = [
  { label: 'A data-center search result, bulk price', value: 0.0006, text: '$0.0006' },
  { label: 'A data-center search result, instant', value: 0.002, text: '$0.002' },
  { label: 'What grid tools charge per point, low end', value: 0.003, text: '$0.003' },
  { label: 'What grid tools charge per point, high end', value: 0.05, text: '$0.05' },
];

function PriceBars() {
  const max = Math.log10(0.05 / 0.0004);
  return (
    <div className="space-y-4">
      {PRICES.map((p, i) => {
        const w = (Math.log10(p.value / 0.0004) / max) * 100;
        const retail = i >= 2;
        return (
          <div key={p.label}>
            <div className="mb-1.5 flex justify-between gap-4 text-sm">
              <span className="text-[#c9d3df]">{p.label}</span>
              <span className={'mk-mono font-semibold ' + (retail ? 'text-[#f5c451]' : 'text-[#7aa7ff]')}>{p.text}</span>
            </div>
            <div className="h-3 rounded-full bg-[#111823]">
              <div className="h-3 rounded-full" style={{ width: `${w}%`, background: retail ? 'linear-gradient(90deg,#f5c451,#ff8a4c)' : '#7aa7ff' }} />
            </div>
          </div>
        );
      })}
      <p className="text-[12px] text-[#6b7686]">Log scale, per grid point, US dollars.</p>
    </div>
  );
}

const QUESTIONS = [
  { q: 'Where does the search actually run?', good: 'On a real phone, in the real Google Maps app or browser.', bad: 'On a server, or through a search-data API.' },
  { q: 'How is the location set?', good: "The phone's GPS is moved to the exact point, and you can see Google's own location line.", bad: 'A city name, a coordinate with a wide radius, or a map position written into a web address.' },
  { q: 'What network does it search on?', good: 'A residential connection, from an internet provider people in that area actually use.', bad: 'Data-center IPs, or "we don\u2019t share that".' },
  { q: 'Can I see what the searcher saw?', good: 'A recording of the screen, with the time it was captured.', bad: 'A colored dot, and nothing behind it.' },
  { q: 'Are the colors between the points measured?', good: 'Only the points carry data, and failed points are marked as failed.', bad: 'A smooth heat map with no failed points, ever.' },
];

export default function Truth() {
  return (
    <div className="mk min-h-screen overflow-x-hidden">
      <SiteHeader />

      {/* HERO */}
      <section className="relative">
        <div className="mk-glow pointer-events-none absolute inset-0" aria-hidden="true" />
        <div className="mk-grid-bg pointer-events-none absolute inset-0 opacity-50" aria-hidden="true" />
        <div className="relative mx-auto max-w-5xl px-5 pb-16 pt-16 text-center sm:px-8 lg:pt-24">
          <Eyebrow>The dirty secret of local rank grids</Eyebrow>
          <h1 className="mk-display mt-5 text-[52px] font-bold leading-[1.0] sm:text-7xl lg:text-[96px]">
            Real Data Is <span className="mk-gold-text">Messy.</span>
          </h1>
          <p className="mx-auto mt-7 max-w-3xl text-lg leading-relaxed text-[#c9d3df] sm:text-xl">
            Real searches change street by street, and a block can flip a rank from 2 to 17. So when a grid comes back as a perfect green bullseye, the right question isn&apos;t <i>&ldquo;how did we do?&rdquo;</i> It&apos;s <b className="text-white">&ldquo;how was this made?&rdquo;</b>
          </p>
          <p className="mx-auto mt-4 max-w-2xl text-[#9aa7b8]">Here are four ways a grid can look better than the searches behind it, and five questions that expose every one of them.</p>
        </div>
      </section>

      {/* 1. SMOOTHING */}
      <section className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[1fr_1.1fr]">
        <div>
          <Eyebrow>Trick 1</Eyebrow>
          <h2 className="mk-display mt-3 text-4xl font-bold leading-tight sm:text-5xl"><TrickNumber n="1" />Smoothing</h2>
          <p className="mt-5 text-lg leading-relaxed text-[#c9d3df]">
            A grid only measures its points. A heat map paints everything in between, blending neighbours into a smooth, reassuring gradient. Stretch the color scale to fit, and the best patch turns green whatever its real rank. Real coverage has holes and spikes; a blur makes them disappear.
          </p>
          <p className="mt-4 leading-relaxed text-[#9aa7b8]">
            Worse, a point that failed can be filled in from the points around it, and nothing on the map tells you. Flip the switch: it&apos;s the same 49 searches either way.
          </p>
          <div className="mt-6 rounded-2xl border border-[#1b2431] bg-[#0c1118] p-5">
            <p className="text-sm font-semibold text-white">How to check</p>
            <p className="mt-1.5 text-sm leading-relaxed text-[#9aa7b8]">Ask for the number at every point, and for the list of points that failed. A report that never has a failed point is a report that hides them.</p>
          </div>
        </div>
        <SmoothingDemo />
      </section>

      {/* 2. URL LOCATION */}
      <section className="border-y border-[#1b2431] bg-[#080b10]">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-20 sm:px-8 lg:grid-cols-2">
          <div>
            <Eyebrow>Trick 2</Eyebrow>
            <h2 className="mk-display mt-3 text-4xl font-bold leading-tight sm:text-5xl"><TrickNumber n="2" />A location typed into a URL</h2>
            <p className="mt-5 text-lg leading-relaxed text-[#c9d3df]">
              Google accepts a location parameter in the address of a search. Add it, and Google treats the search as coming from that place. Nobody moves. There&apos;s no phone, no GPS and no neighbourhood: just a server writing a different web address 49 times.
            </p>
            <p className="mt-4 leading-relaxed text-[#9aa7b8]">It&apos;s cheap, it&apos;s fast, and it isn&apos;t how your customers search. They&apos;re on a phone, in the Maps app, where the location comes from the device itself.</p>
            <div className="mt-6 rounded-2xl border border-[#1b2431] bg-[#0c1118] p-5">
              <p className="text-sm font-semibold text-white">How to check</p>
              <p className="mt-1.5 text-sm leading-relaxed text-[#9aa7b8]">Ask how the location is set. &ldquo;We set it in the request&rdquo; means a parameter. On a real device, Google itself confirms the location; on Stakeout&apos;s receipts you can read it, e.g. <span className="mk-mono text-[#3ddc97]">&ldquo;37122, Tennessee – From your device&rdquo;</span>.</p>
            </div>
          </div>
          <div className="space-y-4">
            <div className="rounded-2xl border border-[#2a3442] bg-[#0c1118] p-5">
              <p className="mk-mono text-[11px] uppercase tracking-widest text-[#ff6b6b]">How a server &ldquo;searches from&rdquo; 49 places</p>
              <p className="mk-mono mt-3 break-all text-[13px] leading-relaxed text-[#c9d3df]">
                google.com/search?q=plumber+near+me<span className="rounded bg-[#ff6b6b]/15 px-1 text-[#ff9b9b]">&amp;uule=w+CAIQICIb…</span>
              </p>
              <p className="mt-3 text-sm text-[#9aa7b8]">One encoded string per grid point. Swap it, resend, repeat.</p>
            </div>
            <div className="rounded-2xl border border-[#f5c451]/40 bg-[#f5c451]/[0.05] p-5">
              <p className="mk-mono text-[11px] uppercase tracking-widest text-[#f5c451]">How Stakeout searches from 49 places</p>
              <p className="mt-3 text-[15px] leading-relaxed text-[#eef2f7]">49 real Android phone sessions. Each phone&apos;s GPS is moved to its point, on a residential connection, and the whole search is recorded.</p>
            </div>
          </div>
        </div>
      </section>

      {/* 3. SNAPPING & FUZZING */}
      <section className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[1.1fr_1fr]">
        <SnapGrid />
        <div>
          <Eyebrow>Trick 3</Eyebrow>
          <h2 className="mk-display mt-3 text-4xl font-bold leading-tight sm:text-5xl"><TrickNumber n="3" />Snapping and fuzzy proximity</h2>
          <p className="mt-5 text-lg leading-relaxed text-[#c9d3df]">
            The simplest location parameter is a <b className="text-white">place name</b>, like a city or ZIP. Feed a grid through it and every point inside the same named place snaps back to the same search. Forty-nine squares, a handful of real lookups, copied across the map.
          </p>
          <p className="mt-4 leading-relaxed text-[#9aa7b8]">
            The coordinate version isn&apos;t automatically better. A coordinate request carries a <b className="text-white">radius setting</b>, and a wide radius doesn&apos;t mean a street corner. It means &ldquo;somewhere around here&rdquo;. Ask what radius your tool sends.
          </p>
          <div className="mt-6 rounded-2xl border border-[#1b2431] bg-[#0c1118] p-5">
            <p className="text-sm font-semibold text-white">How to check</p>
            <p className="mt-1.5 text-sm leading-relaxed text-[#9aa7b8]">Open the full result list at two neighbouring points. If whole blocks of squares return the identical list, in the identical order, every time, they were probably one search.</p>
          </div>
        </div>
      </section>

      {/* 4. THE MONEY */}
      <section className="border-y border-[#1b2431] bg-[#080b10]">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-20 sm:px-8 lg:grid-cols-2">
          <div>
            <Eyebrow>Trick 4</Eyebrow>
            <h2 className="mk-display mt-3 text-4xl font-bold leading-tight sm:text-5xl"><TrickNumber n="4" />Fractions of a cent, <span className="mk-gold-text">marked up</span></h2>
            <p className="mt-5 text-lg leading-relaxed text-[#c9d3df]">
              When a grid point comes from a data-center search, the data costs a fraction of a cent. Search-data companies publish their prices: <b className="text-white">$0.0006 to $0.002</b> for a page of Google Maps results.
            </p>
            <p className="mt-4 text-lg leading-relaxed text-[#c9d3df]">
              Grid tools publish theirs too: <b className="text-white">$0.003 to $0.05</b> per point. That&apos;s a markup of roughly <b className="text-[#f5c451]">400% to more than 2,000%</b> on the data, and higher still against bulk data prices.
            </p>
            <p className="mt-4 leading-relaxed text-[#9aa7b8]">
              Nothing wrong with a business making money. But you deserve to know what you&apos;re paying for: a re-sold web request, or a real search. A real phone session costs <b className="text-white">15 to 50 times</b> more to run than a data-center request. That&apos;s the price of a receipt.
            </p>
          </div>
          <div className="rounded-3xl border border-[#1b2431] bg-[#0b0f15] p-7">
            <PriceBars />
            <div className="mt-6 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-[#1b2431] bg-[#0c1118] px-4 py-3">
                <p className="mk-display text-3xl font-bold text-[#f5c451]">5×</p>
                <p className="text-[12px] text-[#9aa7b8]">$0.003 per point ÷ $0.0006 data</p>
              </div>
              <div className="rounded-xl border border-[#1b2431] bg-[#0c1118] px-4 py-3">
                <p className="mk-display text-3xl font-bold text-[#f5c451]">25×</p>
                <p className="text-[12px] text-[#9aa7b8]">$0.05 per point ÷ $0.002 data</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* QUESTIONS */}
      <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
        <div className="text-center">
          <Eyebrow>Before you pay for another grid</Eyebrow>
          <h2 className="mk-display mt-3 text-4xl font-bold sm:text-5xl">Five questions to ask any rank tracker</h2>
          <p className="mx-auto mt-4 max-w-2xl text-[#9aa7b8]">Send these to your current tool, ours included. The answers tell you whether you&apos;re looking at measurements or a drawing.</p>
        </div>
        <ol className="mt-12 space-y-4">
          {QUESTIONS.map((x, i) => (
            <li key={x.q} className="grid gap-4 rounded-2xl border border-[#1b2431] bg-[#0c1118] p-6 md:grid-cols-[1.1fr_1fr_1fr]">
              <p className="flex items-start gap-3 text-lg font-semibold"><span className="mk-mono text-[#7aa7ff]">0{i + 1}</span>{x.q}</p>
              <p className="text-sm leading-relaxed text-[#c9d3df]"><span className="mb-1 block text-[11px] font-semibold uppercase tracking-widest text-[#3ddc97]">A real answer</span>{x.good}</p>
              <p className="text-sm leading-relaxed text-[#9aa7b8]"><span className="mb-1 block text-[11px] font-semibold uppercase tracking-widest text-[#ff8a4c]">A red flag</span>{x.bad}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-5 pb-24 sm:px-8">
        <div className="relative overflow-hidden rounded-3xl border border-[#2a3442] bg-[#0c1118] p-10 text-center sm:p-14">
          <div className="mk-glow pointer-events-none absolute inset-0" aria-hidden="true" />
          <div className="relative">
            <h2 className="mk-display text-4xl font-bold leading-tight sm:text-6xl">Every Data Point Comes with a <span className="mk-gold-text">Receipt.</span></h2>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-[#9aa7b8]">Real phones. Real GPS. Real residential networks. A recording behind every square, including the ones that failed.</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link href="/demo" className="mk-btn-primary rounded-xl px-6 py-3.5 font-semibold">See the live demo map →</Link>
              <JoinLink className="rounded-xl border border-[#2a3442] px-6 py-3.5 font-semibold hover:border-[#3a4658]" />
            </div>
          </div>
        </div>
      </section>

      <SiteFooter note="This page explains techniques available to any rank tracker and how to check for them; it does not describe any particular company. Prices are from public price lists, checked November 2026. Example grids are illustrative." />
    </div>
  );
}
