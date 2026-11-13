import Link from 'next/link';
import { ONBOARDING, PLANS, usd } from '@/lib/pricing';
import { SiteHeader, SiteFooter, JoinLink } from './SiteChrome';
import { WALL, AI_NAMED, rankStyle } from './demoData';
import ReceiptPrinter from './ReceiptPrinter';
import './marketing.css';

/* ------------------------------------------------------------------ shared bits */

function Check({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={'h-5 w-5 flex-none ' + className} aria-hidden="true">
      <circle cx="10" cy="10" r="9" fill="currentColor" opacity="0.15" />
      <path d="M6 10.4l2.6 2.6L14.2 7.4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Cross() {
  return (
    <svg viewBox="0 0 20 20" className="h-5 w-5 flex-none text-[#6b7686]" aria-hidden="true">
      <circle cx="10" cy="10" r="9" fill="currentColor" opacity="0.15" />
      <path d="M7 7l6 6M13 7l-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/* ------------------------------------------------------------------ hero visual */

const LISTINGS = [
  { name: 'Harbor Plumbing Co.', rating: '4.9', reviews: '412' },
  { name: 'Your Business', rating: '4.8', reviews: '318', you: true },
  { name: 'Northside Drain & Sewer', rating: '4.6', reviews: '95' },
  { name: 'Ace Rooter Service', rating: '4.4', reviews: '1,021' },
];

/** The hero phone: a real recording from a real scan, not a mock-up (point 1,3 of a 5×5 grid, Mt. Juliet, TN). */
function PhoneCapture() {
  return (
    <figure className="relative mx-auto w-[280px] sm:w-[300px]">
      <div className="rounded-[40px] border border-[#2a3442] bg-[#0b0f15] p-2.5 shadow-[0_40px_120px_-30px_rgba(122,167,255,0.35)]">
        <div className="overflow-hidden rounded-[32px] bg-black">
          <div className="flex items-center justify-between bg-[#0b0f15] px-4 py-2 text-[11px] text-white">
            <span className="mk-mono flex items-center gap-1.5 font-semibold">
              <span className="mk-rec inline-block h-2 w-2 rounded-full bg-[#ff4d4d]" /> REC · real session
            </span>
            <span className="mk-mono text-[#9aa7b8]">Android · Chrome</span>
          </div>
          <video
            className="block aspect-[9/16] w-full bg-black object-cover"
            src="/media/real-run-mt-juliet.mp4"
            poster="/media/real-run-mt-juliet-poster.jpg"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            aria-label="Screen recording of a real search for exterior painting contractors near me, at grid point 1,3 in Mt. Juliet, Tennessee"
          />
        </div>
      </div>
      <figcaption className="mt-3 text-center text-[11.5px] leading-snug text-[#9aa7b8]">
        Real recording, not a mock-up: &ldquo;exterior painting contractors near me&rdquo;, point 1,3 of a 5×5 grid in Mt. Juliet, TN, 9 Nov 2026 at 3:47 PM CST.
      </figcaption>
    </figure>
  );
}

/** A real receipt: the run in the hero recording (9 Nov 2026, Mt. Juliet, TN). */
const RECEIPT_ROWS: [string, string, boolean?][] = [
  ['Keyword', 'exterior painting contractors near me'],
  ['Grid point', '1,3 · 36.228862, −86.525138'],
  ['Captured', '2026-11-09 15:47 CST'],
  ['Device', 'Android phone · Chrome'],
  ['Network', 'Residential connection'],
  ['Google located', 'Mt. Juliet, Tennessee – From your device', true],
  ['Result', '#2 in the map pack and Local Finder', true],
];

function Receipt({ className = '' }: { className?: string }) {
  return (
    <div className={'mk-receipt w-[300px] rounded-b-xl ' + className}>
      <div className="mk-perf" aria-hidden="true" />
      <div className="px-5 pb-5 pt-2">
        <div className="flex items-baseline justify-between border-b border-dashed border-[#2a3442] pb-2">
          <span className="mk-display text-sm font-semibold tracking-[0.18em] text-[#f5c451]">RECEIPT</span>
          <span className="mk-mono text-[11px] text-[#9aa7b8]">#cmw9rplww000b</span>
        </div>
        <dl className="mt-3 space-y-1.5 text-[11.5px]">
          {RECEIPT_ROWS.map(([k, v, ok]) => (
            <div key={k} className="flex justify-between gap-3">
              <dt className="text-[#9aa7b8]">{k}</dt>
              <dd className={'mk-mono text-right ' + (ok ? 'text-[#3ddc97]' : 'text-[#eef2f7]')}>{v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-[#2a3442] bg-[#0b0f15] px-3 py-2">
          <span className="mk-rec inline-block h-2 w-2 rounded-full bg-[#ff4d4d]" aria-hidden="true" />
          <span className="text-[11.5px]">Screen recording · 0:37</span>
          <a href="/media/real-run-mt-juliet.mp4" className="ml-auto text-[11px] text-[#7aa7ff] hover:underline">▶ Watch</a>
        </div>
        <p className="mk-mono mt-3 break-all text-[10.5px] leading-relaxed text-[#6b7686]">
          SHA-256 7de5f245cf107de8f10a4ef5d7ebeb985358cfb4662a623a8841c046f5b4bf70
        </p>
      </div>
    </div>
  );
}


/* ------------------------------------------------------------------ phone wall */

function PhoneWall() {
  return (
    <figure className="rounded-3xl border border-[#1b2431] bg-[#0b0f15] p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-[12px]">
        <span className="mk-mono text-[#c9d3df]">“plumber near me” · 7×7 · 1 mi apart</span>
        <span className="flex items-center gap-3 text-[#9aa7b8]">
          {[['#3ddc97', 'Top 3'], ['#f5c451', '4–10'], ['#ff8a4c', '11–20'], ['#2a3442', '20+']].map(([c, l]) => (
            <span key={l} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: c }} />{l}</span>
          ))}
        </span>
      </div>
      <div className="grid grid-cols-7 gap-1.5 sm:gap-2" role="img" aria-label="A 7 by 7 grid of phone sessions, strongest in the centre; each square is one recorded search">
        {WALL.map((r, i) => {
          const { bg, ink } = rankStyle(r);
          return (
            <div key={i} className={'relative flex aspect-[3/4] flex-col items-center justify-center rounded-lg border border-[#1b2431] bg-[#0f141c] ' + (i === 24 ? 'mk-ping ring-2 ring-[#f5c451]' : '')}>
              <span className="mk-display rounded-md px-1.5 text-[13px] font-bold sm:text-base" style={{ background: bg, color: ink }}>{r > 20 ? '20+' : r}</span>
              <span className="mt-1 text-[9px] text-[#6b7686] sm:text-[10px]" aria-hidden="true">▶</span>
            </div>
          );
        })}
      </div>
      <figcaption className="mt-4 text-[12px] text-[#6b7686]">Illustrative grid. In a live report every square opens its screen recording and receipt.</figcaption>
    </figure>
  );
}

/* ------------------------------------------------------------------ sections */

const COMPARE: { row: string; typical: string; stakeout: string }[] = [
  { row: 'Where the search runs', typical: 'A server or an API request', stakeout: 'A real Android phone session, in the real Google Maps app or Chrome' },
  { row: 'Location', typical: 'Coordinates passed into a query', stakeout: "The phone's GPS is moved to each grid point, and Google's own location line is captured as proof" },
  { row: 'Network', typical: 'Data-center or random IPs', stakeout: 'A residential connection, from the ISP you choose, one or a mix' },
  { row: 'Proof', typical: 'A colored dot on a map', stakeout: 'A full screen recording, the screen data and a SHA-256 fingerprint for every point' },
  { row: 'AI answers', typical: 'Rarely tracked', stakeout: 'AI Overviews captured at every point, with the sources they cited: are you named? (Ask Maps coming soon)' },
  { row: 'Ads', typical: 'Often mixed into the ranks', stakeout: 'Listed separately and never counted as a rank' },
];

const ANATOMY = [
  { n: '01', title: 'The recording', text: 'The whole search on video, from opening the app to the last result. Play it on a sales call.' },
  { n: '02', title: 'The exact spot', text: "Grid point and the GPS the phone used, to six decimal places. Google's own location line confirms it." },
  { n: '03', title: 'The real network', text: 'Residential connection, the internet provider it came from, and the exit city.' },
  { n: '04', title: 'The full results', text: 'Every business that ranked, in order, with ads set aside, read from the screen itself.' },
  { n: '05', title: 'The AI answer', text: 'Whether the AI Overview named the business, and which sources it cited. Ask Maps answers are coming soon.' },
  { n: '06', title: 'The fingerprint', text: 'A SHA-256 hash of the evidence as captured, so anyone can check it has not changed.' },
];

const STEPS = [
  { n: '1', title: 'Drop your grid', text: 'Keyword, business and location. A 3×3, 5×5 or 9×9 grid of points, spaced from half a mile to five miles.' },
  { n: '2', title: 'Phones search every point', text: 'Each point gets its own Android phone session: GPS moved to the point, residential network, search run and recorded.' },
  { n: '3', title: 'Open the receipts', text: 'Click any point to watch what the phone saw, inspect the results and AI answers, and share it with your client.' },
];

/* ------------------------------------------------------------------ value section 1: AI answers */

function AiAnswers() {
  const named = AI_NAMED.filter(Boolean).length;
  return (
    <section className="relative border-y border-[#1b2431] bg-[#080b10]">
      <div className="mx-auto grid max-w-7xl items-center gap-14 px-5 py-24 sm:px-8 lg:grid-cols-[1fr_1.1fr]">
        <div>
          <p className="mk-mono text-[12px] uppercase tracking-widest text-[#7aa7ff]">AI Overviews · Ask Maps coming soon</p>
          <h2 className="mk-display mt-3 text-4xl font-bold leading-tight sm:text-6xl">
            The AI Answer Is the <span className="mk-gold-text">New #1 Spot.</span>
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-[#c9d3df]">
            Google now shows an AI answer above the results for many searches. You can rank #2 and still be invisible if the answer above you names someone else.
          </p>
          <ul className="mt-7 space-y-4">
            {[
              ['Who the AI recommends, at every point', 'The full AI Overview answer is saved in each receipt, not reduced to a yes or no. Ask Maps answers are coming soon.'],
              ['Named, or left out?', `See the points where the answer includes you, and where it sends people to a competitor instead.`],
              ['What the AI trusted', 'The sources an AI Overview cited, so you know which reviews, directories and pages to work on.'],
            ].map(([t, d]) => (
              <li key={t} className="flex gap-3">
                <Check className="mt-0.5 text-[#7aa7ff]" />
                <span><b className="block text-white">{t}</b><span className="text-[#9aa7b8]">{d}</span></span>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative">
          <div className="grid gap-4 sm:grid-cols-[1fr_210px]">
            <div className="space-y-3">
              <div className="rounded-2xl border border-[#d6e4ff]/20 bg-[#0f1624] p-4">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-[#9dbcff]">✦ Ask Maps preview · point 2,6</span>
                  <span className="rounded-full bg-[#ff6b6b]/15 px-2 py-0.5 font-semibold text-[#ff9b9b]">Not named</span>
                </div>
                <p className="mt-2 text-[13px] leading-relaxed text-[#c9d3df]">
                  For a fast, reliable plumber nearby, <b className="text-white">Harbor Plumbing Co.</b> and <b className="text-white">Northside Drain &amp; Sewer</b> get strong reviews for emergency calls.
                </p>
              </div>
              <div className="rounded-2xl border border-[#3ddc97]/30 bg-[#0d1a16] p-4">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-[#9dbcff]">✦ Ask Maps preview · point 4,4</span>
                  <span className="rounded-full bg-[#3ddc97]/15 px-2 py-0.5 font-semibold text-[#3ddc97]">Named first</span>
                </div>
                <p className="mt-2 text-[13px] leading-relaxed text-[#c9d3df]">
                  <mark className="rounded bg-[#f5c451] px-1 font-semibold text-[#1a1300]">Your Business</mark> is highly rated for same-day repairs, and Harbor Plumbing Co. is another option.
                </p>
              </div>
              <div className="rounded-2xl border border-[#2a3442] bg-[#0c1118] p-4">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-[#9dbcff]">✦ AI Overview · point 6,3</span>
                  <span className="text-[#9aa7b8]">3 sources cited</span>
                </div>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {['A review site', 'A local directory', 'Your website'].map((s, i) => (
                    <span key={s} className={'rounded-full border px-2.5 py-1 text-[11px] ' + (i === 2 ? 'border-[#f5c451]/50 text-[#ffdf8e]' : 'border-[#2a3442] text-[#c9d3df]')}>{s}</span>
                  ))}
                </div>
              </div>
            </div>
            <figure className="rounded-2xl border border-[#1b2431] bg-[#0b0f15] p-4">
              <div className="grid grid-cols-7 gap-1" role="img" aria-label={`Named in the AI answer at ${named} of 49 points`}>
                {AI_NAMED.map((v, i) => (
                  <span key={i} className={'aspect-square rounded-full ' + (v ? 'bg-[#f5c451] shadow-[0_0_10px_rgba(245,196,81,0.6)]' : 'bg-[#1b2431]')} />
                ))}
              </div>
              <figcaption className="mt-4">
                <span className="mk-display block text-4xl font-bold text-[#f5c451]">{named}<span className="text-xl text-[#9aa7b8]"> / 49</span></span>
                <span className="text-[12px] leading-snug text-[#9aa7b8]">points where the AI answer named you</span>
              </figcaption>
            </figure>
          </div>
          <p className="mt-3 text-[12px] text-[#6b7686]">Illustrative answers and grid. Ask Maps capture is coming soon.</p>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ value section 2: competitor territory */

const RIVALS: Record<string, { name: string; color: string }> = {
  Y: { name: 'Your Business', color: '#f5c451' },
  H: { name: 'Harbor Plumbing Co.', color: '#7aa7ff' },
  N: { name: 'Northside Drain & Sewer', color: '#b48cff' },
  A: { name: 'Ace Rooter Service', color: '#3fc7c7' },
};
// Who holds #1 at each point of the 7×7 grid.
const TERRITORY = ['HHHNNNN', 'HHYYNYN', 'HYYYYNN', 'AYYNYYN', 'AAYHYHN', 'AAAYHHH', 'YAAHHHH'].join('').split('');

function Territory() {
  const count = (k: string) => TERRITORY.filter((t) => t === k).length;
  const rows = Object.entries(RIVALS)
    .map(([k, r]) => ({ k, ...r, wins: count(k) }))
    .sort((a, b) => b.wins - a.wins);
  return (
    <section className="mx-auto grid max-w-7xl items-center gap-14 px-5 py-24 sm:px-8 lg:grid-cols-[1.1fr_1fr]">
      <div className="grid gap-4 sm:grid-cols-[1fr_1fr]">
        <figure className="rounded-2xl border border-[#1b2431] bg-[#0b0f15] p-4">
          <p className="mk-mono mb-3 text-[11px] uppercase tracking-widest text-[#9aa7b8]">Who holds #1, point by point</p>
          <div className="grid grid-cols-7 gap-1" role="img" aria-label="A territory map showing which business ranks first at each of 49 grid points">
            {TERRITORY.map((t, i) => (
              <span key={i} className="aspect-square rounded-[5px]" style={{ background: RIVALS[t].color, opacity: t === 'Y' ? 1 : 0.85 }} />
            ))}
          </div>
          <figcaption className="mt-3 text-[11px] text-[#6b7686]">Illustrative territory map.</figcaption>
        </figure>
        <div className="rounded-2xl border border-[#1b2431] bg-[#0b0f15] p-4">
          <p className="mk-mono mb-3 text-[11px] uppercase tracking-widest text-[#9aa7b8]">#1 spots on this grid</p>
          <ol className="space-y-2.5">
            {rows.map((r, i) => (
              <li key={r.k} className={'rounded-xl px-3 py-2.5 ' + (r.k === 'Y' ? 'bg-[#f5c451]/10 ring-1 ring-[#f5c451]/50' : 'bg-[#0f141c]')}>
                <div className="flex items-center gap-2 text-[13px]">
                  <span className="mk-mono w-4 text-[#6b7686]">{i + 1}</span>
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: r.color }} />
                  <span className={'min-w-0 flex-1 truncate ' + (r.k === 'Y' ? 'font-semibold text-white' : 'text-[#c9d3df]')}>{r.name}</span>
                  <span className="mk-mono font-semibold text-white">{r.wins}</span>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-[#1b2431]">
                  <div className="h-1.5 rounded-full" style={{ width: `${(r.wins / 49) * 100}%`, background: r.color }} />
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
      <div>
        <p className="mk-mono text-[12px] uppercase tracking-widest text-[#f5c451]">Up to 490 competitor positions per 7×7 scan</p>
        <h2 className="mk-display mt-3 text-4xl font-bold leading-tight sm:text-6xl">
          Know Who&apos;s Beating You, <span className="mk-gold-text">Street by Street.</span>
        </h2>
        <p className="mt-5 text-lg leading-relaxed text-[#c9d3df]">
          Every point saves the whole top 10, not just your rank. So one scan shows you every competitor, where each one wins, and the exact streets where you lose, with the video to prove it.
        </p>
        <ul className="mt-7 space-y-4">
          {[
            ['Find the streets you\u2019re losing, and who to', 'Your territory against theirs, point by point.'],
            ['Spot a new competitor the week they arrive', 'Run the same grid again and see who moved in, and where.'],
            ['Walk into the pitch with their rival on video', 'Show a prospect the business beating them, on their own street, recorded.'],
          ].map(([t, d]) => (
            <li key={t} className="flex gap-3">
              <Check className="mt-0.5 text-[#f5c451]" />
              <span><b className="block text-white">{t}</b><span className="text-[#9aa7b8]">{d}</span></span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ value section 3: the itemized receipt */

const ITEMS: [string, string][] = [
  ['Real Android phone sessions', '49'],
  ['Screen recordings, about 2 hours in total', '49'],
  ['GPS-set locations, one per grid point', '49'],
  ['Residential connections, ISP named', '49'],
  ['Ranked listings captured (up to 10 per point)', '490'],
  ['AI Overviews checked', '49'],
  ['SHA-256 evidence fingerprints', '49'],
  ['Client share link, no login needed', '1'],
];

function ValueStack() {
  return (
    <section className="border-y border-[#1b2431] bg-[#080b10]">
      <div className="mx-auto max-w-7xl px-5 py-24 sm:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <p className="mk-mono text-[12px] uppercase tracking-widest text-[#f5c451]">What one 7×7 scan puts in your hands</p>
          <h2 className="mk-display mt-3 text-4xl font-bold leading-tight sm:text-6xl">Your Scan, <span className="mk-gold-text">Itemized.</span></h2>
          <p className="mt-5 text-lg text-[#9aa7b8]">A rank tracker sells you 49 colored dots. Here&apos;s what&apos;s behind ours.</p>
        </div>

        <div className="mt-14 grid items-start gap-8 lg:grid-cols-[1.15fr_1fr]">
          <div className="mk-receipt mx-auto w-full max-w-[560px] rounded-b-2xl">
            <div className="mk-perf" aria-hidden="true" />
            <div className="px-6 pb-7 pt-3 sm:px-9">
              <div className="flex items-baseline justify-between border-b border-dashed border-[#2a3442] pb-3">
                <span className="mk-display text-lg font-semibold tracking-[0.2em] text-[#f5c451]">STAKEOUT · 7×7 SCAN</span>
                <span className="mk-mono text-[11px] text-[#9aa7b8]">“plumber near me”</span>
              </div>
              <ul className="mk-mono mt-4 space-y-3 text-[13px] sm:text-[14px]">
                {ITEMS.map(([label, qty]) => (
                  <li key={label} className="flex items-baseline gap-2">
                    <span className="text-[#eef2f7]">{label}</span>
                    <span className="flex-1 translate-y-[-3px] border-b border-dotted border-[#2a3442]" aria-hidden="true" />
                    <span className="font-semibold text-[#f5c451]">×{qty}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-6 border-t border-dashed border-[#2a3442] pt-4">
                <div className="mk-mono flex justify-between text-[13px] text-[#9aa7b8]"><span>Time to run</span><span className="text-white">minutes, not days</span></div>
                <div className="mk-mono mt-2 flex justify-between text-[13px] text-[#9aa7b8]"><span>Your driving</span><span className="text-white">0 miles</span></div>
                <div className="mk-mono mt-2 flex justify-between text-[13px] text-[#9aa7b8]"><span>Failed points</span><span className="text-[#3ddc97]">credited back automatically</span></div>
              </div>
              <p className="mk-mono mt-6 text-center text-[11px] tracking-widest text-[#6b7686]">*** EVERY DATA POINT COMES WITH A RECEIPT ***</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-[#2a3442] bg-[#0c1118] p-7">
              <p className="mk-mono text-[12px] uppercase tracking-widest text-[#ff8a4c]">The manual way</p>
              <h3 className="mk-display mt-2 text-3xl font-semibold">One person. One phone. One very long day.</h3>
              <dl className="mt-6 grid grid-cols-2 gap-3">
                {[
                  ['~50 mi', 'of driving between 49 points a mile apart'],
                  ['~7 hrs', 'driving, parking, searching, recording'],
                  ['490', 'listings to write down by hand, at most'],
                  ['0', 'fingerprints proving nothing was edited'],
                ].map(([n, l]) => (
                  <div key={l} className="rounded-xl border border-[#1b2431] bg-[#0f141c] px-4 py-3.5">
                    <dt className="mk-display text-3xl font-bold text-white">{n}</dt>
                    <dd className="mt-1 text-[12px] leading-snug text-[#9aa7b8]">{l}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-5 text-sm leading-relaxed text-[#9aa7b8]">And you&apos;d still have one phone, one network and one moment in time, repeated every time a client asks how it&apos;s going.</p>
            </div>
            <div className="rounded-2xl border border-[#f5c451]/40 bg-[#f5c451]/[0.06] p-7">
              <p className="mk-mono text-[12px] uppercase tracking-widest text-[#f5c451]">The Stakeout way</p>
              <p className="mt-2 text-lg leading-relaxed text-[#eef2f7]">Type a keyword, pick a grid, and every point gets its own real phone session, many running at once. Open the receipts with your coffee.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ page */

/* ------------------------------------------------------------------ real proof */

const PROOF_FRAMES: [string, string, string][] = [
  ['/media/real-proof-location.jpg', 'Google placed the phone', 'Google’s own location line: “Mt. Juliet, TN”, from the phone’s GPS, not a guess from its IP.'],
  ['/media/real-proof-ranks.jpg', 'The ranks, as Google showed them', 'The sponsored card above (never counted), then #1 Steve And Son, #2 McIntyre Painting at 2.0 mi, #3 Mount Juliet Painting.'],
  ['/media/real-proof-finder.jpg', 'The Local Finder behind it', 'Tapping “More businesses” opens the full list: every business at this point, read from the screen in order.'],
];

/** Frames from the hero recording: what a receipt is made of. */
function RealProof() {
  return (
    <section className="mx-auto max-w-7xl px-5 pb-24 sm:px-8">
      <p className="mk-mono text-center text-[12px] uppercase tracking-widest text-[#3ddc97]">Not a mock-up · frames from the recording above</p>
      <h2 className="mk-display mx-auto mt-3 max-w-4xl text-center text-4xl font-bold leading-tight sm:text-5xl">
        One point, <span className="mk-gold-text">three pieces of proof.</span>
      </h2>
      <div className="mt-12 grid gap-6 md:grid-cols-3">
        {PROOF_FRAMES.map(([src, title, text]) => (
          <figure key={src} className="overflow-hidden rounded-2xl border border-[#1b2431] bg-[#0c1118]">
            <img src={src} alt={title} loading="lazy" className="block h-72 w-full object-cover object-top" />
            <figcaption className="p-5">
              <p className="font-semibold">{title}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-[#9aa7b8]">{text}</p>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ buying power */

const MONEY_POINTS: [string, string][] = [
  ['Buying-Power SoLV', 'Your share of the top 3 weighted by owner-occupied homes × median income, next to the standard score: visible to 31% of searches can mean 46% of the money.'],
  ['Neighborhood data at every point', 'U.S. Census ACS 2020–2024 for every block group, tract and ZIP: household income, homeowners, home value, year built.'],
  ['Who owns the valuable ground', 'Each competitor’s share of the grid’s buying power where they hold the top 3.'],
  ['Your winning radius', 'How far from your business you hold the top 3, from Google’s own distances.'],
  ['Paid pressure', 'Who advertises at your points, and how many ads sit above you.'],
  ['What AI cites', 'The websites Google’s AI Overviews linked to across your grid, so you know which listings to fix first.'],
];

/** The real 3D report: rank against buying power. */
function WhereTheMoneyIs() {
  return (
    <section className="border-y border-[#1b2431] bg-[#080b10]">
      <div className="mx-auto grid max-w-7xl items-center gap-14 px-5 py-24 sm:px-8 lg:grid-cols-[1.25fr_1fr]">
        <figure>
          <img src="/media/real-report-3d.jpg" alt="A real Stakeout report in 3D: each grid point is a column, its height the point’s share of the grid’s buying power and its colour the rank there" loading="lazy" className="w-full rounded-2xl border border-[#1b2431]" />
          <figcaption className="mt-3 text-[12px] leading-relaxed text-[#6b7686]">
            A real report (Mt. Juliet, TN, 5×5). Column height: the point’s share of the grid’s buying power. Colour: the rank there. The grey × is a point that failed; one click re-ran it, and failed points are credited back automatically.
          </figcaption>
        </figure>
        <div>
          <p className="mk-mono text-[12px] uppercase tracking-widest text-[#f5c451]">Ranks meet the U.S. Census</p>
          <h2 className="mk-display mt-3 text-4xl font-bold leading-tight sm:text-6xl">
            Rank where the <span className="mk-gold-text">money</span> is.
          </h2>
          <p className="mt-5 leading-relaxed text-[#9aa7b8]">
            A #1 in a neighborhood of renters isn’t worth a #1 among homeowners. Every report maps your ranks onto the neighborhoods around them, in 2D or 3D.
          </p>
          <ul className="mt-8 space-y-4">
            {MONEY_POINTS.map(([t, d]) => (
              <li key={t} className="flex gap-3">
                <Check className="mt-1 shrink-0 text-[#3ddc97]" />
                <span>
                  <span className="font-semibold">{t}.</span> <span className="text-[#9aa7b8]">{d}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ pricing and FAQ */

const PRICE_ROWS: [string, string][] = [
  ['Every grid point, Chrome or Google Maps app', '1 credit'],
  ['AI Overview tracking (Chrome)', 'included'],
  ['A point that fails', 'credited back automatically'],
  ['Re-running a failed point', '1 click, same price'],
];

const FAQ: [string, string][] = [
  ['Are these really phones?', 'Yes. Every point is its own Android session in the real Chrome or Google Maps app, recorded from the search to the last result.'],
  ['How do you know Google used the right location?', 'The phone’s GPS is moved to each grid point, and in Chrome the location is refreshed and proven by Google’s own location line, saved on every receipt. A point where Google used anything else is refused, not counted.'],
  ['What happens when a point fails?', 'Its credits come back automatically, and you can re-run it from the report in one click.'],
  ['What do my clients see?', 'A share link to the report, no login: the grid, every recording, the receipts and the neighborhood data.'],
  ['Do you track Ask Maps?', 'Not yet: it’s coming soon. Google Maps app scans already track the results list, with ads set aside. AI Overviews are tracked in Chrome today.'],
];

function Pricing() {
  return (
    <section className="mx-auto max-w-7xl px-5 py-24 sm:px-8">
      <div className="grid gap-12 lg:grid-cols-2">
        <div>
          <p className="mk-mono text-[12px] uppercase tracking-widest text-[#f5c451]">Pricing</p>
          <h2 className="mk-display mt-3 text-4xl font-bold leading-tight sm:text-5xl">
            One credit per point. <span className="mk-gold-text">That’s it.</span>
          </h2>
          <dl className="mt-8 divide-y divide-[#1b2431] rounded-2xl border border-[#1b2431] bg-[#0c1118]">
            {PRICE_ROWS.map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-4 px-5 py-4">
                <dt className="text-[#c9d3df]">{k}</dt>
                <dd className="mk-mono shrink-0 font-semibold text-[#eef2f7]">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-sm leading-relaxed text-[#9aa7b8]">
            Onboarding is {usd(ONBOARDING.cents)} once, with {ONBOARDING.credits.toLocaleString('en-US')} credits. Monthly plans start at {usd(PLANS[0].cents)} for {PLANS[0].credits} credits. A 3×3 grid is 9 credits and a 5×5 is 25, with AI Overview tracking included.{' '}
            <Link href="/pricing" className="font-semibold text-[#7aa7ff] hover:underline">See pricing</Link>
          </p>
        </div>
        <div>
          <p className="mk-mono text-[12px] uppercase tracking-widest text-[#7aa7ff]">Questions</p>
          <div className="mt-6 space-y-3">
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
        </div>
      </div>
    </section>
  );
}

export default function Landing() {
  return (
    <div className="mk min-h-screen overflow-x-hidden">
      <SiteHeader />

      {/* HERO */}
      <section className="relative">
        <div className="mk-glow pointer-events-none absolute inset-0" aria-hidden="true" />
        <div className="mk-grid-bg pointer-events-none absolute inset-0 opacity-60" aria-hidden="true" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-5 pb-20 pt-14 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:pb-28 lg:pt-20">
          <div>
            <p className="mk-mono inline-flex items-center gap-2 rounded-full border border-[#2a3442] bg-[#0c1118] px-3.5 py-1.5 text-[12px] text-[#9aa7b8]">
              <span className="mk-rec inline-block h-2 w-2 rounded-full bg-[#ff4d4d]" aria-hidden="true" />
              REC · real Android phone sessions · Google Maps & Chrome
            </p>
            <h1 className="mk-display mt-6 text-[44px] font-bold leading-[1.02] sm:text-6xl lg:text-[76px]">
              Every Data Point Comes with a <span className="mk-gold-text">Receipt!</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg font-medium leading-relaxed text-[#eef2f7] sm:text-xl">
              The <span className="text-[#f5c451]">ONLY</span> local SEO tool on the market measuring <span className="underline decoration-[#f5c451] decoration-2 underline-offset-4">REAL</span> results for real people on real mobile devices.
            </p>
            <p className="mt-4 max-w-xl leading-relaxed text-[#9aa7b8]">
              At every point of your grid, a real Android phone moves its GPS to that spot, searches on a residential connection, and records the whole search. You get the rank, plus the video, the screen data and a fingerprint that proves it.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/demo" className="mk-btn-primary rounded-xl px-6 py-3.5 text-base font-semibold">See the live demo map →</Link>
              <JoinLink className="rounded-xl border border-[#2a3442] bg-[#0c1118] px-6 py-3.5 text-base font-semibold hover:border-[#3a4658]" />
            </div>
            <ul className="mt-9 grid max-w-xl grid-cols-1 gap-x-6 gap-y-3 text-sm text-[#c9d3df] sm:grid-cols-2">
              {['Video receipt for every grid point', 'GPS set on the phone itself', 'Residential ISP you choose', 'AI Overviews tracked · Ask Maps soon'].map((t) => (
                <li key={t} className="flex items-center gap-2.5"><Check className="text-[#3ddc97]" />{t}</li>
              ))}
            </ul>
          </div>

          <div className="relative flex justify-center lg:justify-end">
            <div className="relative">
              <PhoneCapture />
              <Receipt className="absolute -left-[300px] top-[250px] hidden rotate-[-5deg] xl:block" />
            </div>
          </div>
        </div>
        <div className="mx-auto -mt-6 mb-10 flex max-w-7xl justify-center px-5 xl:hidden">
          <Receipt className="rotate-[-2deg]" />
        </div>
      </section>


      <RealProof />

      {/* A PHONE AT EVERY POINT */}
      <section className="mx-auto max-w-7xl px-5 pb-24 sm:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-[1fr_1.15fr]">
          <div>
            <p className="mk-mono text-[12px] uppercase tracking-widest text-[#f5c451]">One grid. 49 phones. 49 recordings.</p>
            <h2 className="mk-display mt-3 text-4xl font-bold leading-tight sm:text-5xl">See Through Your <span className="mk-gold-text">Customers&apos; Eyes.</span></h2>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-[#9aa7b8]">
              Other trackers color a dot. Stakeout runs a separate phone session at each point of your grid and keeps the recording. In a live report, click any square to watch exactly what a searcher there would have seen.
            </p>
            <dl className="mt-8 grid max-w-xl grid-cols-3 gap-4">
              {[['49', 'phone sessions'], ['49', 'screen recordings'], ['49', 'fingerprinted receipts']].map(([n, l]) => (
                <div key={l} className="rounded-xl border border-[#1b2431] bg-[#0c1118] px-4 py-4">
                  <dt className="sr-only">{l}</dt>
                  <dd className="mk-display text-3xl font-bold text-[#f5c451]">{n}</dd>
                  <dd className="text-sm text-[#9aa7b8]">{l}</dd>
                </div>
              ))}
            </dl>
          </div>
          <PhoneWall />
        </div>
      </section>

      {/* SEE GOOGLE THROUGH YOUR CUSTOMERS' EYES */}
      <section className="border-y border-[#1b2431] bg-[#080b10]">
        <div className="mx-auto max-w-7xl px-5 py-24 sm:px-8">
          <h2 className="mk-display mx-auto max-w-5xl text-center text-5xl font-bold leading-[1.04] sm:text-6xl lg:text-7xl">
            See Google Through Your <span className="mk-gold-text">Customers&apos; Eyes.</span>
          </h2>
          <p className="mx-auto mt-6 max-w-3xl text-center text-lg leading-relaxed text-[#9aa7b8]">
            Your customers don&apos;t search from a data center. They search on a phone, standing in a neighborhood, on Comcast or TDS or AT&amp;T. That is the Google Stakeout measures, and records.
          </p>
          <div className="mt-14 grid gap-5 md:grid-cols-2">
            {[
              {
                tag: 'Google Maps app',
                title: 'The Maps results list',
                points: ['The results list, top 10, with Sponsored and Google Verified ads set aside', 'Every scroll on video, every screen read', 'Ask Maps answers: coming soon'],
              },
              {
                tag: 'Chrome on Android',
                title: 'The local pack, and AI Overviews',
                points: ['Precise device location accepted, then proven by Google’s own location line', 'AI Overview text and the sources it cited', 'The full business list behind “More businesses”'],
              },
            ].map((c) => (
              <article key={c.tag} className="rounded-2xl border border-[#1b2431] bg-[#0c1118] p-7">
                <p className="mk-mono text-[12px] uppercase tracking-widest text-[#7aa7ff]">{c.tag}</p>
                <h3 className="mk-display mt-2 text-2xl font-semibold">{c.title}</h3>
                <ul className="mt-5 space-y-3 text-[#c9d3df]">
                  {c.points.map((p) => (
                    <li key={p} className="flex gap-2.5"><Check className="mt-0.5 text-[#f5c451]" />{p}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* COMPARISON */}
      <section className="mx-auto max-w-7xl px-5 py-24 sm:px-8">
        <p className="mk-mono text-center text-[12px] uppercase tracking-widest text-[#f5c451]">Why it&apos;s different</p>
        <h2 className="mk-display mx-auto mt-3 max-w-4xl text-center text-4xl font-bold leading-tight sm:text-5xl">
          A colored dot is a claim. A receipt is proof.
        </h2>
        <div className="mt-12 overflow-x-auto rounded-2xl border border-[#1b2431]">
          <table className="w-full min-w-[720px] border-collapse text-left">
            <thead>
              <tr className="bg-[#0c1118] text-sm">
                <th scope="col" className="w-[22%] px-6 py-4 font-medium text-[#9aa7b8]" />
                <th scope="col" className="w-[30%] px-6 py-4 font-medium text-[#9aa7b8]">Typical rank tracker</th>
                <th scope="col" className="px-6 py-4 font-semibold text-[#f5c451]">Stakeout Search</th>
              </tr>
            </thead>
            <tbody>
              {COMPARE.map((r) => (
                <tr key={r.row} className="border-t border-[#1b2431]">
                  <th scope="row" className="px-6 py-5 align-top font-semibold">{r.row}</th>
                  <td className="px-6 py-5 align-top text-[#9aa7b8]"><span className="flex gap-2.5"><Cross />{r.typical}</span></td>
                  <td className="bg-[#f5c451]/[0.04] px-6 py-5 align-top"><span className="flex gap-2.5"><Check className="text-[#3ddc97]" />{r.stakeout}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <AiAnswers />

      <Territory />
      <WhereTheMoneyIs />

      {/* THE TAGLINE: EVERY DATA POINT COMES WITH A RECEIPT */}
      <section className="relative overflow-hidden border-y border-[#1b2431]">
        <div className="mk-glow pointer-events-none absolute inset-0" aria-hidden="true" />
        <div className="mk-grid-bg pointer-events-none absolute inset-0 opacity-40" aria-hidden="true" />
        <div className="relative mx-auto max-w-7xl px-5 py-24 sm:px-8">
          <div className="mx-auto max-w-5xl text-center">
            <p className="mk-mono text-[12px] uppercase tracking-widest text-[#f5c451]">Not a slogan. A feature.</p>
            <h2 className="mk-display mt-4 text-[48px] font-bold leading-[0.98] sm:text-7xl lg:text-[104px]">
              Every Data Point<br />Comes with a <span className="mk-gold-text">Receipt.</span>
            </h2>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-[#9aa7b8]">
              Other tools give you a number. We give you the number, and everything behind it. Go on: tap any point and pull its receipt.
            </p>
          </div>
          <div className="mt-16">
            <ReceiptPrinter />
          </div>
        </div>
      </section>

      {/* ANATOMY OF A RECEIPT */}
      <section className="border-y border-[#1b2431] bg-[#080b10]">
        <div className="mx-auto max-w-7xl px-5 py-24 sm:px-8">
          <div>
            <p className="mk-mono text-[12px] uppercase tracking-widest text-[#f5c451]">What&apos;s on a receipt</p>
            <h2 className="mk-display mt-3 text-4xl font-bold leading-tight sm:text-5xl">Everything your client could ask. Answered on one page.</h2>
            <div className="mt-10 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
              {ANATOMY.map((a) => (
                <div key={a.n}>
                  <p className="mk-mono text-sm text-[#7aa7ff]">{a.n}</p>
                  <h3 className="mt-1 text-lg font-semibold">{a.title}</h3>
                  <p className="mt-1.5 leading-relaxed text-[#9aa7b8]">{a.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS + ISP */}
      <section className="mx-auto max-w-7xl px-5 py-24 sm:px-8">
        <h2 className="mk-display text-center text-4xl font-bold sm:text-5xl">How a scan runs</h2>
        <ol className="mt-12 grid gap-5 md:grid-cols-3">
          {STEPS.map((s) => (
            <li key={s.n} className="rounded-2xl border border-[#1b2431] bg-[#0c1118] p-7">
              <span className="mk-display flex h-10 w-10 items-center justify-center rounded-full bg-[#f5c451] text-lg font-bold text-[#1a1300]">{s.n}</span>
              <h3 className="mt-5 text-xl font-semibold">{s.title}</h3>
              <p className="mt-2 leading-relaxed text-[#9aa7b8]">{s.text}</p>
            </li>
          ))}
        </ol>

        <div className="mt-8 grid items-center gap-8 rounded-2xl border border-[#2a3442] bg-gradient-to-br from-[#0f1520] to-[#0b0f15] p-8 md:grid-cols-[1fr_auto]">
          <div>
            <p className="mk-mono text-[12px] uppercase tracking-widest text-[#7aa7ff]">Only on real connections</p>
            <h3 className="mk-display mt-2 text-3xl font-semibold">Pick the internet provider your customers use.</h3>
            <p className="mt-3 max-w-2xl leading-relaxed text-[#9aa7b8]">
              Run a grid on one ISP, or spread it across several. Each point keeps its ISP on every run, so this month compares like for like with last month, and every receipt names the provider it ran on.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 md:max-w-[260px] md:justify-end" aria-label="Example ISPs in one market">
            {['Comcast Cable', 'TDS Telecom', 'Any ISP', 'Mix of ISPs'].map((t, i) => (
              <span key={t} className={'rounded-full border px-4 py-2 text-sm ' + (i < 2 ? 'border-[#f5c451]/50 bg-[#f5c451]/10 text-[#ffdf8e]' : 'border-[#2a3442] text-[#c9d3df]')}>{t}</span>
            ))}
          </div>
        </div>
      </section>

      <ValueStack />

      {/* CALLS TO ACTION */}
      <Pricing />

      <section className="mx-auto max-w-7xl px-5 pb-24 sm:px-8">
        <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          <div className="relative overflow-hidden rounded-3xl border border-[#2a3442] bg-[#0c1118] p-10">
            <div className="mk-glow pointer-events-none absolute inset-0" aria-hidden="true" />
            <div className="relative">
              <h2 className="mk-display text-4xl font-bold leading-tight sm:text-5xl">Stop defending the dashboard. <span className="mk-gold-text">Start showing proof.</span></h2>
              <p className="mt-4 max-w-xl text-lg text-[#9aa7b8]">Explore the live demo map, no account needed, then run your first real grid.</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/demo" className="mk-btn-primary rounded-xl px-6 py-3.5 font-semibold">See the live demo map →</Link>
                <JoinLink className="rounded-xl border border-[#2a3442] px-6 py-3.5 font-semibold hover:border-[#3a4658]" />
              </div>
            </div>
          </div>
          <div className="rounded-3xl border border-[#2a3442] bg-gradient-to-b from-[#16130a] to-[#0c1118] p-10">
            <p className="mk-mono text-[12px] uppercase tracking-widest text-[#f5c451]">For agencies</p>
            <h3 className="mk-display mt-2 text-3xl font-semibold">Want it done for you?</h3>
            <p className="mt-3 leading-relaxed text-[#9aa7b8]">Bring the account where you&apos;ve tried everything. We find the visibility gap, do the recovery work and deliver white-label proof.</p>
            <Link href="/agency" className="mt-7 inline-block rounded-xl border border-[#f5c451]/50 px-6 py-3.5 font-semibold text-[#ffdf8e] hover:bg-[#f5c451]/10">Agency Rescue Sprints →</Link>
          </div>
        </div>
      </section>

      <SiteFooter note="The hero recording, its frames, the receipt beside it and the 3D report are real (Mt. Juliet, TN, 9 Nov 2026). The grids, the territory map, the interactive receipt printer and the AI answer examples are illustrative." />
    </div>
  );
}
