'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import './pocket.css';

const PocketMap = dynamic(() => import('./PocketMap'), { ssr: false, loading: () => <div className="pk-map pk-map-wait">Loading the map…</div> });

type Plan = { key: string; name: string; cents: number; sessions: number };
type State = {
  stage: 'unpaid' | 'starting' | 'waiting' | 'searching' | 'done' | 'refunded';
  ref: string;
  email: string;
  refundWhy: string | null;
  keyword: string;
  business: string | null;
  place: string | null;
  lat: number;
  lng: number;
  paidAt: string | null;
  searchingSince: string | null;
  result: { rank: number | null; top: string[]; aiOverview: boolean; namedInAiOverview: boolean; googleLocation: string | null; carrier: string; video: string | null; report: string | null; finishedAt: string | null } | null;
  upgrade: { signedIn: boolean; hasPassword: boolean; onPlan: boolean; plans: Plan[]; offCents: number };
};

const SUPPORT = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'support@stakeoutsearch.com';
const usd = (cents: number) => '$' + (cents / 100).toLocaleString('en-US', { maximumFractionDigits: cents % 100 ? 2 : 0 });
const same = (a: string, b: string) => { const k = (s: string) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim(); return k(a) === k(b) || k(a).includes(k(b)) || k(b).includes(k(a)); };
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }) : '');

/** What the phone is doing now, in the order it happens. */
function steps(s: State, now: number): { label: string; state: 'done' | 'now' | 'next' }[] {
  const searching = s.stage === 'searching' && s.searchingSince ? (now - new Date(s.searchingSince).getTime()) / 1000 : -1;
  const at = s.stage === 'starting' ? 0 : s.stage === 'waiting' ? 1 : searching < 35 ? 2 : 3;
  return ['Payment confirmed', 'Assigning a real Android phone and a 5G line', 'Locking the phone’s GPS to your coordinates', 'Recording the live mobile search'].map((label, i) => ({ label, state: i < at ? 'done' : i === at ? 'now' : 'next' }));
}

/**
 * A pocket test's page: while the phone runs, what it is doing and how to run the same search on
 * your own phone without Wi-Fi or search history skewing it; then the video and the results, the
 * 21-pin map of what a plan unlocks, and how to ask for the $1 back.
 */
export default function PocketResult({ token, paid }: { token: string; paid: string | null }) {
  const [s, setS] = useState<State | null>(null);
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [starting, setStarting] = useState('');
  const [planError, setPlanError] = useState('');
  const confirmed = useRef(false);

  const load = useCallback(async () => {
    const r = await fetch('/api/pocket/' + token, { cache: 'no-store' });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'This pocket test is not available.');
    setS(d as State);
  }, [token]);

  // Back from Stripe: the payment is checked and the search starts; then the page keeps itself up to date.
  useEffect(() => {
    let stop = false;
    (async () => {
      try {
        if (paid && !confirmed.current) {
          confirmed.current = true;
          const r = await fetch('/api/pocket/' + token, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: paid }) });
          const d = await r.json().catch(() => ({}));
          if (r.ok && !stop) setS(d as State);
          window.history.replaceState(null, '', '/pocket-test/' + token);
          if (r.ok) return;
        }
        await load();
      } catch (e) {
        if (!stop) setError(e instanceof Error ? e.message : 'This pocket test is not available.');
      }
    })();
    return () => { stop = true; };
  }, [token, paid, load]);
  const live = s && ['starting', 'waiting', 'searching'].includes(s.stage);
  useEffect(() => {
    if (!live) return;
    const poll = setInterval(() => { void load().catch(() => {}); }, 5000);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearInterval(poll); clearInterval(tick); };
  }, [live, load]);

  async function startPlan(plan: Plan) {
    setStarting(plan.key); setPlanError('');
    try {
      const r = await fetch('/api/pocket/' + token, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan: plan.key }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'The plan could not be started. Try again.');
      window.location.assign(d.url || '/profiles?tab=plan');
    } catch (e) {
      setPlanError(e instanceof Error ? e.message : 'The plan could not be started. Try again.');
      setStarting('');
    }
  }

  if (error) return <div className="pk-page"><p className="pk-error" role="alert">{error}</p><p><a className="pk-link" href="/pocket-test">Start a new pocket test</a></p></div>;
  if (!s) return <div className="pk-page"><p className="pk-muted">Loading your pocket test…</p></div>;

  if (s.stage === 'unpaid')
    return (
      <div className="pk-page">
        <h1>This pocket test has not been paid for</h1>
        <p className="pk-muted">Nothing ran, and nothing was charged. Start again and finish Stripe’s $1 checkout to run it.</p>
        <p><a className="pk-run pk-run-link" href="/pocket-test">Start a pocket test</a></p>
      </div>
    );

  if (s.stage === 'refunded')
    return (
      <div className="pk-page">
        <h1>Your $1 has been refunded</h1>
        <p className="pk-muted">{s.refundWhy === 'closed' ? 'This email’s account is closed, so the test did not run.' : `Our phone could not complete the search for “${s.keyword}” even after trying again, so we sent your $1 back to the card you paid with. Refunds usually show within 5 to 10 business days.`}</p>
        <p className="pk-muted">Reference: {s.ref}</p>
        {s.refundWhy !== 'closed' && <p><a className="pk-run pk-run-link" href="/pocket-test">Try another pocket test</a></p>}
      </div>
    );

  if (s.stage !== 'done' || !s.result) {
    const waited = s.paidAt ? Math.max(0, Math.round((now - new Date(s.paidAt).getTime()) / 1000)) : 0;
    return (
      <div className="pk-page">
        <p className="pk-kicker">Pocket test {s.ref}</p>
        <h1>Our phone is searching “{s.keyword}”{s.place ? ` ${/^near /i.test(s.place) ? s.place.replace(/^N/, 'n') : 'at ' + s.place}` : ''}</h1>
        <p className="pk-muted">It takes about five minutes from payment to video. This page updates by itself, and we emailed the link to {s.email}, so you can leave and come back. {waited >= 60 ? `Running for ${Math.floor(waited / 60)} min ${waited % 60}s.` : ''}</p>
        <ol className="pk-steps">
          {steps(s, now).map((x) => <li key={x.label} className={'pk-step-' + x.state}><span aria-hidden="true" />{x.label}<span className="pk-sr">{x.state === 'done' ? ' (done)' : x.state === 'now' ? ' (in progress)' : ''}</span></li>)}
        </ol>
        <section className="pk-coach" aria-labelledby="pk-coach-title">
          <h2 id="pk-coach-title">Do this on your phone now, while ours captures your block</h2>
          <ol>
            <li><strong>Turn off Wi-Fi</strong> so you are on real 5G or LTE. Office and home Wi-Fi reach Google through an internet provider’s hub that can be miles away, which shifts local results.</li>
            <li><strong>Open a fresh private or Incognito tab.</strong> A signed-in Google account leans rankings toward the listings you tap every day.</li>
            <li><strong>Search “{s.keyword}”</strong> and keep the screen open to compare with our video.</li>
          </ol>
        </section>
      </div>
    );
  }

  const r = s.result;
  const refund = `mailto:${SUPPORT}?subject=${encodeURIComponent(`$1 Pocket Test Refund / QA Check - Scan #${s.ref}`)}&body=${encodeURIComponent(`Scan ID: ${s.ref}\nKeyword: ${s.keyword}\nCoordinates: ${s.lat}, ${s.lng}\nScan Timestamp (UTC): ${r.finishedAt ?? ''}\nAccount Email: ${s.email}\n\nPlease attach your uncropped mobile phone screenshot (showing the top time + cellular/Wi-Fi status bar) below so we can compare receipts and issue your $1 refund:\n`)}`;
  const u = s.upgrade;
  return (
    <div className="pk-page pk-page-wide">
      <p className="pk-kicker">Pocket test {s.ref}</p>
      <h1>{!s.business ? `Here is what our phone saw for “${s.keyword}”` : r.rank ? `Our phone found ${s.business} at #${r.rank} for “${s.keyword}”` : `Our phone did not find ${s.business} in the map results for “${s.keyword}”`}</h1>
      <p className="pk-muted">Compare it with the search on your own phone. This is the recording, not a reconstruction.</p>

      <section className="pk-proof" aria-label="The recorded search">
        <div className="pk-video">
          {r.video ? <video controls playsInline preload="metadata" src={r.video} aria-label={`Recording of the phone searching ${s.keyword}`} /> : <p className="pk-muted">The video is still being stored. Reload in a minute.</p>}
        </div>
        <div className="pk-serp">
          <h2>What the phone saw</h2>
          {r.top.length ? (
            <ol className="pk-ranks">
              {r.top.map((name, i) => { const you = Boolean(s.business) && same(name, s.business!); return <li key={i + name} className={you ? 'pk-you' : undefined}><span>{i + 1}</span>{name}{you && <em>you</em>}</li>; })}
            </ol>
          ) : <p className="pk-muted">Google showed no map results for this search here.</p>}
          <p className="pk-aio">{!r.aiOverview ? 'Google showed no AI Overview for this search here.' : !s.business ? 'Google showed an AI Overview for this search here.' : r.namedInAiOverview ? 'Google showed an AI Overview, and it named your business.' : 'Google showed an AI Overview. It did not name your business.'}</p>
          <dl className="pk-meta">
            <div><dt>Recorded</dt><dd>{when(r.finishedAt)}</dd></div>
            <div><dt>Coordinates</dt><dd>{s.lat.toFixed(5)}, {s.lng.toFixed(5)}</dd></div>
            <div><dt>Device</dt><dd>Real Android phone, Chrome, {r.carrier}</dd></div>
            {r.googleLocation && <div><dt>Google’s location line</dt><dd>{r.googleLocation}</dd></div>}
          </dl>
          {r.report && <a className="pk-link" href={r.report} target="_blank" rel="noopener">Open the full report for this point</a>}
        </div>
      </section>

      <section className="pk-blind" aria-labelledby="pk-blind-title">
        <div className="pk-blind-text">
          <h2 id="pk-blind-title">Our phone sees what your phone sees right where you’re sitting. Now see where you disappear 1 mile down the street.</h2>
          <p className="pk-muted">That was one pin. A grid runs twenty more around it, a mile apart, each on a real phone with its own video. {u.onPlan ? '' : `Your ${usd(u.offCents)} comes off your first month.`}</p>
          {u.onPlan ? (
            <p><a className="pk-run pk-run-link" href="/new-scan">Run the full grid</a></p>
          ) : (
            <>
              <div className="pk-plans">
                {u.plans.map((p) => u.signedIn
                  ? <button key={p.key} type="button" className="pk-plan" disabled={Boolean(starting)} onClick={() => void startPlan(p)}><strong>{starting === p.key ? 'Opening checkout…' : `Start ${p.name}`}</strong><span>{usd(p.cents)}/month · {p.sessions.toLocaleString('en-US')} phone sessions · {usd(p.cents - u.offCents)} today</span></button>
                  : <a key={p.key} className="pk-plan" href={'/login?next=' + encodeURIComponent('/profiles?tab=plan')}><strong>Start {p.name}</strong><span>{usd(p.cents)}/month · {p.sessions.toLocaleString('en-US')} phone sessions · sign in as {s.email}</span></a>)}
              </div>
              {planError && <p className="pk-error" role="alert">{planError}</p>}
              <p className="pk-fine">{u.signedIn ? 'Opens Stripe’s page with your $1 already taken off. You confirm there before anything is charged.' : 'Your $1 comes off at checkout once you are signed in with that email.'} <a className="pk-link" href="/pricing#plans">See Scale and Agency Max</a></p>
              <p className="pk-second">Not ready for a plan? <a className="pk-link" href={u.signedIn ? '/new-scan?buy=closer' : '/login?mode=register&next=' + encodeURIComponent('/new-scan?buy=closer')}>Unlock one full neighborhood grid with the $19 Live 5G Proof Pack</a>, no subscription.</p>
            </>
          )}
        </div>
        <PocketMap lat={s.lat} lng={s.lng} locked label={r.rank ? '#' + r.rank : s.business ? '–' : '✓'} />
      </section>

      {u.signedIn && !u.hasPassword && <p className="pk-fine">You are signed in on this browser. We emailed {s.email} a link to choose a password so you can sign in anywhere.</p>}

      <aside className="pk-refund" aria-labelledby="pk-refund-title">
        <h2 id="pk-refund-title">Results not even close to your phone?</h2>
        <p>Make sure Wi-Fi was off and you searched in a private tab. Still way off? Send us an uncropped screenshot of your phone screen, showing the status bar and time at the top, taken within 10 minutes of this scan, and we’ll refund your $1.</p>
        <a className="pk-link" href={refund}>Email your phone screenshot for a $1 refund and QA check</a>
      </aside>
    </div>
  );
}
