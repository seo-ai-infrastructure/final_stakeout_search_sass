import Link from 'next/link';
import './marketing.css';

/* ------------------------------------------------------------------ shared bits */

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5" aria-label="Stakeout Search home">
      <svg width="30" height="30" viewBox="0 0 48 48" aria-hidden="true">
        <path d="M24 3.5c-8.9 0-16.2 7.1-16.2 15.9C7.8 31.6 24 44.5 24 44.5s16.2-12.9 16.2-25.1C40.2 10.6 32.9 3.5 24 3.5z" fill="#f5c451" />
        <circle cx="24" cy="19.4" r="7.2" fill="#06080c" />
        <circle cx="24" cy="19.4" r="3" fill="#f5c451" />
      </svg>
      <span className="mk-display text-lg font-semibold tracking-wide">Stakeout Search</span>
    </Link>
  );
}

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

function PhoneCapture() {
  return (
    <div className="relative mx-auto w-[280px] sm:w-[300px]">
      <div className="rounded-[40px] border border-[#2a3442] bg-[#0b0f15] p-2.5 shadow-[0_40px_120px_-30px_rgba(122,167,255,0.35)]">
        <div className="mk-sweep overflow-hidden rounded-[32px] bg-[#f4f6f8] text-[#1f2933]">
          <div className="flex items-center justify-between bg-[#0b0f15] px-4 py-2 text-[11px] text-white">
            <span className="mk-mono flex items-center gap-1.5 font-semibold">
              <span className="mk-rec inline-block h-2 w-2 rounded-full bg-[#ff4d4d]" /> REC 00:13
            </span>
            <span className="mk-mono text-[#9aa7b8]">Android · Maps</span>
          </div>
          <div className="px-3 pb-4 pt-3">
            <div className="flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-[13px] shadow-sm">
              <span className="h-3 w-3 rounded-full border-2 border-[#5f6b7a]" aria-hidden="true" />
              plumber near me
            </div>
            <div className="mt-3 rounded-2xl border border-[#d6e4ff] bg-[#eef4ff] p-3 text-[12px] leading-snug">
              <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-[#2f5bd3]">
                <span aria-hidden="true">✦</span> Ask Maps
              </div>
              For 24-hour service nearby, <b>Harbor Plumbing Co.</b> and{' '}
              <mark className="rounded bg-[#ffe08a] px-1 font-semibold text-[#1f2933]">Your Business</mark> are well reviewed.
            </div>
            <div className="relative mt-3 h-16 overflow-hidden rounded-xl bg-[#dfe7dc]">
              <div className="absolute left-6 top-4 h-6 w-28 rotate-6 rounded bg-[#cfd9cc]" />
              <div className="absolute right-4 top-2 h-12 w-20 -rotate-3 rounded bg-[#d3dccf]" />
              <span className="absolute left-[46%] top-[38%] h-3 w-3 rounded-full bg-[#e2483d] ring-2 ring-white" />
              <span className="absolute left-[64%] top-[20%] h-3 w-3 rounded-full bg-[#f5c451] ring-2 ring-white" />
            </div>
            <ol className="mt-2 space-y-1.5">
              {LISTINGS.map((l, i) => (
                <li
                  key={l.name}
                  className={
                    'flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[12px] ' +
                    (l.you ? 'bg-[#fff6dc] ring-2 ring-[#f5c451]' : 'bg-white')
                  }
                >
                  <span className={'mk-mono w-4 text-center font-semibold ' + (l.you ? 'text-[#a3720b]' : 'text-[#5f6b7a]')}>{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{l.name}</span>
                    <span className="text-[11px] text-[#5f6b7a]">
                      {l.rating} ★ ({l.reviews}) · Plumber
                    </span>
                  </span>
                  {l.you && <span className="rounded-full bg-[#f5c451] px-2 py-0.5 text-[10px] font-bold text-[#1a1300]">YOU</span>}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}

const RECEIPT_ROWS: [string, string, boolean?][] = [
  ['Keyword', 'plumber near me'],
  ['Grid point', '3,3 · 36.214573, −86.536535'],
  ['Captured', '2026-11-06 08:07:12 CST'],
  ['Device', 'Android · Galaxy S23 Ultra'],
  ['Network', 'Residential · Comcast Cable'],
  ['Google located', '37122, Tennessee – From your device', true],
  ['Result', 'Rank #2 · named in Ask Maps', true],
];

function Receipt({ className = '' }: { className?: string }) {
  return (
    <div className={'mk-receipt w-[300px] rounded-b-xl ' + className}>
      <div className="mk-perf" aria-hidden="true" />
      <div className="px-5 pb-5 pt-2">
        <div className="flex items-baseline justify-between border-b border-dashed border-[#2a3442] pb-2">
          <span className="mk-display text-sm font-semibold tracking-[0.18em] text-[#f5c451]">RECEIPT</span>
          <span className="mk-mono text-[11px] text-[#9aa7b8]">#R-7F3K-2Q9M</span>
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
          <span className="text-[11.5px]">Screen recording · 2:47</span>
          <span className="ml-auto text-[11px] text-[#7aa7ff]">▶ Watch</span>
        </div>
        <p className="mk-mono mt-3 break-all text-[10.5px] leading-relaxed text-[#6b7686]">
          SHA-256 9f2c41d0e6b8a37c55e1f0a9d2c4b7e8a41e
        </p>
      </div>
    </div>
  );
}


/* ------------------------------------------------------------------ phone wall */

const WALL = [12, 9, 7, 6, 7, 10, 15, 9, 5, 3, 3, 4, 7, 11, 6, 3, 2, 1, 2, 4, 9, 5, 2, 1, 2, 1, 3, 8, 7, 4, 2, 2, 3, 5, 10, 11, 6, 4, 3, 5, 8, 14, 21, 12, 8, 7, 9, 13, 21];

function rankStyle(r: number) {
  if (r <= 3) return { bg: '#3ddc97', ink: '#04130c' };
  if (r <= 10) return { bg: '#f5c451', ink: '#1a1300' };
  if (r <= 20) return { bg: '#ff8a4c', ink: '#1f0b00' };
  return { bg: '#2a3442', ink: '#9aa7b8' };
}

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
  { row: 'AI answers', typical: 'Rarely tracked', stakeout: 'AI Overviews and Ask Maps answers captured at every point: are you named?' },
  { row: 'Ads', typical: 'Often mixed into the ranks', stakeout: 'Listed separately and never counted as a rank' },
];

const ANATOMY = [
  { n: '01', title: 'The recording', text: 'The whole search on video, from opening the app to the last result. Play it on a sales call.' },
  { n: '02', title: 'The exact spot', text: "Grid point and the GPS the phone used, to six decimal places. Google's own location line confirms it." },
  { n: '03', title: 'The real network', text: 'Residential connection, the internet provider it came from, and the exit city.' },
  { n: '04', title: 'The full results', text: 'Every business that ranked, in order, with ads set aside, read from the screen itself.' },
  { n: '05', title: 'The AI answer', text: 'Whether Ask Maps or the AI Overview named the business, and which sources it trusted.' },
  { n: '06', title: 'The fingerprint', text: 'A SHA-256 hash of the evidence as captured, so anyone can check it has not changed.' },
];

const STEPS = [
  { n: '1', title: 'Drop your grid', text: 'Keyword, business and location. A 3×3 to 11×11 grid of points, spaced from half a mile to five miles.' },
  { n: '2', title: 'Phones search every point', text: 'Each point gets its own Android phone session: GPS moved to the point, residential network, search run and recorded.' },
  { n: '3', title: 'Open the receipts', text: 'Click any point to watch what the phone saw, inspect the results and AI answers, and share it with your client.' },
];

/* ------------------------------------------------------------------ page */

export default function Landing() {
  return (
    <div className="mk min-h-screen overflow-x-hidden">
      <header className="sticky top-0 z-30 border-b border-[#1b2431] bg-[#06080c]/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-3.5 sm:px-8">
          <Logo />
          <nav className="flex items-center gap-1 text-sm sm:gap-2" aria-label="Main">
            <Link href="/demo" className="hidden rounded-lg px-3 py-2 text-[#9aa7b8] hover:text-white sm:block">Live demo</Link>
            <Link href="/agency" className="hidden rounded-lg px-3 py-2 text-[#9aa7b8] hover:text-white md:block">Done for you</Link>
            <Link href="/login" className="rounded-lg px-3 py-2 text-[#eef2f7] hover:bg-[#111823]">Sign in</Link>
            <Link href="/login?mode=register" className="mk-btn-primary rounded-lg px-4 py-2 font-semibold">Get started</Link>
          </nav>
        </div>
      </header>

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
              <Link href="/login?mode=register" className="rounded-xl border border-[#2a3442] bg-[#0c1118] px-6 py-3.5 text-base font-semibold hover:border-[#3a4658]">
                Create your account
              </Link>
            </div>
            <ul className="mt-9 grid max-w-xl grid-cols-1 gap-x-6 gap-y-3 text-sm text-[#c9d3df] sm:grid-cols-2">
              {['Video receipt for every grid point', 'GPS set on the phone itself', 'Residential ISP you choose', 'AI Overviews & Ask Maps tracked'].map((t) => (
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
                title: 'The Map Pack, and Ask Maps',
                points: ['The full results list, top 20, with ads set aside', 'Ask Maps answers: are you named, and next to whom?', 'Every scroll on video'],
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

      {/* ANATOMY OF A RECEIPT */}
      <section className="border-y border-[#1b2431] bg-[#080b10]">
        <div className="mx-auto grid max-w-7xl items-center gap-14 px-5 py-24 sm:px-8 lg:grid-cols-[360px_1fr]">
          <div className="flex justify-center"><Receipt /></div>
          <div>
            <p className="mk-mono text-[12px] uppercase tracking-widest text-[#f5c451]">What&apos;s on a receipt</p>
            <h2 className="mk-display mt-3 text-4xl font-bold leading-tight sm:text-5xl">Everything your client could ask. Answered on one page.</h2>
            <div className="mt-10 grid gap-x-8 gap-y-7 sm:grid-cols-2">
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

      {/* CALLS TO ACTION */}
      <section className="mx-auto max-w-7xl px-5 pb-24 sm:px-8">
        <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          <div className="relative overflow-hidden rounded-3xl border border-[#2a3442] bg-[#0c1118] p-10">
            <div className="mk-glow pointer-events-none absolute inset-0" aria-hidden="true" />
            <div className="relative">
              <h2 className="mk-display text-4xl font-bold leading-tight sm:text-5xl">Stop defending the dashboard. <span className="mk-gold-text">Start showing proof.</span></h2>
              <p className="mt-4 max-w-xl text-lg text-[#9aa7b8]">Explore the live demo map, no account needed, then run your first real grid.</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/demo" className="mk-btn-primary rounded-xl px-6 py-3.5 font-semibold">See the live demo map →</Link>
                <Link href="/login?mode=register" className="rounded-xl border border-[#2a3442] px-6 py-3.5 font-semibold hover:border-[#3a4658]">Create your account</Link>
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

      <footer className="border-t border-[#1b2431]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-8 text-sm text-[#9aa7b8] sm:px-8">
          <Logo />
          <nav className="flex flex-wrap gap-5" aria-label="Footer">
            <Link href="/demo" className="hover:text-white">Live demo</Link>
            <Link href="/agency" className="hover:text-white">Done for you</Link>
            <Link href="/login" className="hover:text-white">Sign in</Link>
            <a href="mailto:sass@stakeoutsearch.com" className="hover:text-white">sass@stakeoutsearch.com</a>
          </nav>
          <p className="w-full text-xs text-[#6b7686]">
            © 2026 Stakeout Search. Not affiliated with Google. Google Maps is a trademark of Google LLC. Example screens and receipt values are illustrative.
          </p>
        </div>
      </footer>
    </div>
  );
}
