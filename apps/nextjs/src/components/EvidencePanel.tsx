'use client';
import { useEffect, useMemo, useState } from 'react';
import type { GridPinData, GridScanData } from './GeoGridDashboard';

type Listing = { name: string; rating: string | null; reviews: string | null; meta: string; quote: string | null; ad: boolean; pos: number | null };
type Evidence = {
  pinId: string;
  resultsPage: {
    location: string | null;
    googleLocation: string | null;
    localServicesAds: { title: string | null; listings: Listing[] };
    aiPreview: string | null;
    pack: Listing[];
    peopleAlsoSearch: string[];
    web: { site: string; url: string; title: string; ad: boolean }[];
  } | null;
  localFinder: Listing[];
  aiOverview: { paragraphs: string[]; businesses: Listing[] } | null;
  ranks: { pack: number | null; finder: number | null; ai: number | null };
};
type View = 'video' | 'page' | 'finder' | 'ai';

const norm = (s: string) =>
  s.toLowerCase().replace(/&/g, ' and ').replace(/\b(llc|inc|co|corp|company|ltd)\b\.?/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
const cache = new Map<string, Evidence>();

/** Rank colour: green 1–3, amber 4–10, rose 11+, grey when absent. */
function tone(rank: number | null | undefined) {
  if (rank == null) return 'bg-slate-700 text-slate-200';
  if (rank <= 3) return 'bg-emerald-400 text-slate-950';
  if (rank <= 10) return 'bg-amber-400 text-slate-950';
  return 'bg-rose-400 text-slate-950';
}

export function EvidencePanel({
  scan,
  selected,
  onSelect,
  shareToken,
}: {
  scan: GridScanData;
  selected: string | null;
  onSelect: (id: string) => void;
  shareToken?: string;
}) {
  const pins = useMemo(() => [...scan.pins].sort((a, b) => a.rowIdx - b.rowIdx || a.colIdx - b.colIdx), [scan.pins]);
  const pin = pins.find((p) => p.id === selected) ?? pins.find((p) => p.status === 'COMPLETED') ?? pins[0];
  const [view, setView] = useState<View>('video');
  const [ev, setEv] = useState<Evidence | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');

  useEffect(() => {
    if (!pin || pin.status !== 'COMPLETED') return setEv(null);
    const hit = cache.get(pin.id);
    if (hit) return setEv(hit), setState('idle');
    let live = true;
    setState('loading');
    fetch('/api/evidence/' + pin.id + (shareToken ? '?share=' + encodeURIComponent(shareToken) : ''), { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: Evidence) => {
        cache.set(pin.id, d);
        if (live) setEv(d), setState('idle');
      })
      .catch(() => live && (setEv(null), setState('error')));
    return () => {
      live = false;
    };
  }, [pin?.id, pin?.status, shareToken]);

  if (!pin) return <p className="text-slate-400">No points in this scan yet.</p>;
  const target = norm(scan.targetBusiness);
  const isTarget = (n: string) => norm(n) === target;
  const advertisers = ev
    ? [...new Set([
        ...(ev.resultsPage?.localServicesAds.listings ?? []).map((l) => l.name),
        ...(ev.resultsPage?.pack ?? []).filter((l) => l.ad).map((l) => l.name),
        ...ev.localFinder.filter((l) => l.ad).map((l) => l.name),
        ...(ev.resultsPage?.web ?? []).filter((w) => w.ad).map((w) => w.title.split(' · ')[0]),
      ])]
    : [];
  const adsAbove = (list: Listing[]) => {
    const i = list.findIndex((l) => !l.ad && isTarget(l.name));
    return (i < 0 ? list : list.slice(0, i)).filter((l) => l.ad).length;
  };
  const tabs: [View, string][] = [['video', 'Video'], ['page', 'Results page'], ['finder', 'Local Finder']];
  if (ev?.aiOverview || ev?.resultsPage?.aiPreview) tabs.push(['ai', 'AI Overview']);

  return (
    <div className="grid gap-6 xl:grid-cols-[280px_minmax(340px,380px)_1fr]">
      {/* Grid points */}
      <section aria-label="Grid points" className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
        <h2 className="text-sm font-bold">Grid points</h2>
        <p className="mt-1 text-xs text-slate-400">Pick a point to see exactly what that phone saw.</p>
        <div className="mt-4 grid gap-2" style={{ gridTemplateColumns: `repeat(${scan.gridSize}, minmax(0, 1fr))` }}>
          {pins.map((p) => {
            const on = p.id === pin.id;
            const rank = p.status === 'COMPLETED' ? p.rankFound : null;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onSelect(p.id)}
                aria-pressed={on}
                aria-label={`Row ${p.rowIdx + 1}, column ${p.colIdx + 1}: ${p.status === 'COMPLETED' ? (rank ? 'rank ' + rank : 'not in the list') : p.status.toLowerCase()}`}
                className={`flex min-h-[56px] flex-col items-center justify-center gap-1 rounded-xl border-2 transition-colors ${on ? 'border-emerald-400 bg-slate-800' : 'border-slate-800 bg-slate-950 hover:border-slate-600'}`}
              >
                <span className={`min-w-[36px] rounded-full px-2 py-0.5 text-center text-xs font-extrabold ${p.status === 'COMPLETED' ? tone(rank) : 'bg-slate-800 text-slate-400'}`}>
                  {p.status !== 'COMPLETED' ? (p.status === 'FAILED' ? '×' : '…') : rank ? '#' + rank : '–'}
                </span>
                {scan.gridSize <= 7 && <span className="text-[10px] text-slate-500">R{p.rowIdx + 1}·C{p.colIdx + 1}</span>}
              </button>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap gap-3 text-xs text-slate-400">
          <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-emerald-400" />#1–3</span>
          <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-amber-400" />#4–10</span>
          <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-rose-400" />11+</span>
        </div>
      </section>

      {/* Phone */}
      <section aria-label="What the phone saw" className="flex flex-col items-center gap-3">
        <div role="group" aria-label="Phone view" className="flex flex-wrap justify-center gap-1 rounded-xl border border-slate-800 bg-slate-900 p-1">
          {tabs.map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setView(k)}
              aria-pressed={view === k}
              className={`min-h-[40px] rounded-lg px-3 text-sm font-bold ${view === k ? 'bg-emerald-400 text-slate-950' : 'text-slate-300 hover:text-white'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="w-full max-w-[360px] rounded-[44px] border border-slate-700 bg-slate-900 p-3 shadow-2xl">
          <div className="flex h-5 items-center justify-center"><span className="h-2.5 w-2.5 rounded-full bg-slate-950" /></div>
          <div className="h-[640px] overflow-y-auto rounded-[30px] bg-white text-[#1f2328]">
            {view === 'video' ? (
              pin.videoUrl ? (
                <video key={pin.id} src={pin.videoUrl} controls playsInline preload="metadata" className="h-full w-full bg-black object-contain" />
              ) : (
                <Empty text="No recording for this point." />
              )
            ) : pin.status !== 'COMPLETED' ? (
              <Empty text={`This point is ${pin.status.toLowerCase()}.`} />
            ) : state === 'loading' ? (
              <Empty text="Rebuilding the page from this point’s snapshot…" />
            ) : !ev ? (
              <Empty text="The snapshot for this point isn’t available." />
            ) : view === 'finder' ? (
              <FinderView list={ev.localFinder} isTarget={isTarget} googleLocation={ev.resultsPage?.googleLocation ?? null} />
            ) : view === 'ai' ? (
              <AiView ev={ev} isTarget={isTarget} />
            ) : (
              <PageView ev={ev} isTarget={isTarget} keyword={scan.keyword} />
            )}
          </div>
          <div className="h-4" />
        </div>
        <p className="max-w-[360px] text-center text-xs leading-relaxed text-slate-400">
          {view === 'video'
            ? 'The real screen recording from this point’s phone.'
            : 'Rebuilt from this point’s captured snapshot, in Google’s order. Ads are labelled and never ranked.'}
        </p>
      </section>

      {/* Ranks, ads, receipt */}
      <section aria-label="This point" className="flex flex-col gap-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <h2 className="text-sm font-bold">{scan.targetBusiness} at R{pin.rowIdx + 1}·C{pin.colIdx + 1}</h2>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <Stat label="3-pack" value={ev?.ranks.pack} note={ev?.resultsPage ? adsAbove(ev.resultsPage.pack) + ' ad(s) above' : '—'} />
            <Stat label="Local Finder" value={ev ? ev.ranks.finder : pin.rankFound} note={ev ? adsAbove(ev.localFinder) + ' ad(s) above' : 'organic rank'} />
            <Stat
              label="AI Overview"
              value={ev?.ranks.ai}
              note={ev?.aiOverview || ev?.resultsPage?.aiPreview ? (ev?.ranks.ai ? 'mentioned' : 'not mentioned') : 'none shown'}
              text={ev && !ev.aiOverview && !ev.resultsPage?.aiPreview ? 'None' : undefined}
            />
          </div>
          {advertisers.length > 0 && (
            <>
              <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-400">Advertisers here · never ranked</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {advertisers.map((a) => (
                  <span key={a} className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-1 text-xs text-amber-200">{a}</span>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <h2 className="text-sm font-bold">Receipt</h2>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-slate-400">GPS</dt><dd>{pin.lat.toFixed(5)}, {pin.lng.toFixed(5)}</dd>
            <dt className="text-slate-400">Area</dt><dd>{[pin.city, pin.stateCode, pin.zip].filter(Boolean).join(' ')}</dd>
            {pin.proxyMeta && (<><dt className="text-slate-400">Exit</dt><dd>{[pin.proxyMeta.city, pin.proxyMeta.region].filter(Boolean).join(', ')} · residential</dd></>)}
            {ev?.resultsPage?.googleLocation && (<><dt className="text-slate-400">Google’s location</dt><dd className="text-emerald-300">{ev.resultsPage.googleLocation}</dd></>)}
            <dt className="text-slate-400">Status</dt><dd>{pin.status.toLowerCase()}</dd>
          </dl>
          {!shareToken && (pin.metaJsonUrl || pin.dumpsTarUrl) && (
            <div className="mt-4 flex flex-wrap gap-2">
              {pin.metaJsonUrl && <a className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-emerald-300 hover:border-emerald-400" href={pin.metaJsonUrl}>Receipt JSON</a>}
              {pin.dumpsTarUrl && <a className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-emerald-300 hover:border-emerald-400" href={pin.dumpsTarUrl}>Raw bundle</a>}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, note, text }: { label: string; value: number | null | undefined; note: string; text?: string }) {
  return (
    <div className="rounded-xl bg-slate-950/60 p-3">
      <div className="text-xs text-slate-400">{label}</div>
      <div className={`mt-1 text-2xl font-extrabold ${value ? (value <= 3 ? 'text-emerald-300' : value <= 10 ? 'text-amber-300' : 'text-rose-300') : 'text-slate-300'}`}>
        {text ?? (value ? '#' + value : '–')}
      </div>
      <div className="text-[11px] text-slate-500">{note}</div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="flex h-full items-center justify-center p-8 text-center text-sm text-slate-500">{text}</div>;
}

function Card({ l, isTarget, adLabel = 'Sponsored' }: { l: Listing; isTarget: (n: string) => boolean; adLabel?: string }) {
  const me = !l.ad && isTarget(l.name);
  return (
    <li className={`rounded-xl p-3 ${me ? 'border-2 border-emerald-600 bg-emerald-50' : l.ad ? 'border border-amber-200 bg-amber-50' : 'border border-gray-200 bg-white'}`}>
      <div className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <span className={`inline-flex h-6 min-w-[24px] items-center justify-center rounded-full px-1 text-[11px] font-extrabold ${me ? 'bg-emerald-600 text-white' : l.ad ? 'bg-amber-300 text-amber-950' : 'bg-gray-100 text-gray-600'}`}>
            {l.ad ? 'Ad' : l.pos}
          </span>
          <span className="text-[13.5px] font-bold leading-snug">{l.name}</span>
        </span>
        <span className={`shrink-0 text-[10.5px] font-bold ${l.ad ? 'text-amber-700' : me ? 'text-emerald-700' : 'text-gray-500'}`}>
          {l.ad ? adLabel + ' · not ranked' : me ? 'Your business' : 'Organic'}
        </span>
      </div>
      <div className="mt-1 text-xs text-gray-700">
        {l.rating ? l.rating + ' ★' : ''}
        {l.reviews ? ' (' + l.reviews + ')' : ''}
        {l.meta ? ' · ' + l.meta : ''}
      </div>
      {l.quote && <div className="mt-1 text-[11.5px] italic text-gray-500">“{l.quote}”</div>}
    </li>
  );
}

function PageView({ ev, isTarget, keyword }: { ev: Evidence; isTarget: (n: string) => boolean; keyword: string }) {
  const p = ev.resultsPage;
  if (!p) return <Empty text="No results-page snapshot for this point." />;
  return (
    <div>
      <div className="border-b border-gray-200 px-3 pb-2 pt-3">
        <div className="rounded-full border border-gray-300 px-3 py-2 text-[13px]">{keyword}</div>
        {p.location && <p className="mt-2 text-xs text-gray-600"><strong className="text-gray-800">{p.location}</strong> · Choose area</p>}
      </div>
      <div className="space-y-4 p-3">
        {p.localServicesAds.listings.length > 0 && (
          <section>
            <p className="mb-2 text-xs font-bold text-gray-700">Sponsored · {p.localServicesAds.title}</p>
            <ul className="space-y-2">{p.localServicesAds.listings.map((l, i) => <Card key={'l' + i} l={l} isTarget={isTarget} adLabel="Local Services ad" />)}</ul>
          </section>
        )}
        {p.aiPreview && (
          <section className="rounded-xl bg-violet-50 p-3">
            <p className="text-xs font-bold text-violet-800">AI Overview (as first shown)</p>
            <p className="mt-1 line-clamp-6 whitespace-pre-line text-xs text-gray-700">{p.aiPreview}</p>
          </section>
        )}
        {p.pack.length > 0 && (
          <section>
            <p className="mb-2 text-sm font-extrabold">Businesses</p>
            <ul className="space-y-2">{p.pack.map((l, i) => <Card key={'p' + i} l={l} isTarget={isTarget} />)}</ul>
            <div className="mt-2 rounded-full border border-gray-300 py-2 text-center text-xs font-semibold">More businesses</div>
          </section>
        )}
        {p.peopleAlsoSearch.length > 0 && (
          <section>
            <p className="mb-2 text-xs font-bold text-gray-700">People also search for</p>
            <div className="flex flex-col gap-1.5">{p.peopleAlsoSearch.map((q) => <span key={q} className="rounded-lg bg-gray-100 px-2.5 py-2 text-xs">{q}</span>)}</div>
          </section>
        )}
        {p.web.length > 0 && (
          <section>
            <p className="mb-2 text-xs font-bold text-gray-700">Web results</p>
            <ul className="space-y-2">
              {p.web.map((w, i) => (
                <li key={'w' + i} className={`rounded-xl p-3 ${w.ad ? 'border border-amber-200 bg-amber-50' : 'border border-gray-200'}`}>
                  <div className="text-[11px] text-gray-500">{w.ad ? 'Sponsored · not ranked' : w.site + (w.url ? ' · ' + w.url : '')}</div>
                  <div className="mt-0.5 text-[13px] text-[#1a0dab]">{w.title}</div>
                </li>
              ))}
            </ul>
          </section>
        )}
        {p.googleLocation && <p className="rounded-xl bg-gray-100 p-3 text-[11.5px] text-gray-700">{p.googleLocation}</p>}
      </div>
    </div>
  );
}

function FinderView({ list, isTarget, googleLocation }: { list: Listing[]; isTarget: (n: string) => boolean; googleLocation: string | null }) {
  if (!list.length) return <Empty text="No Local Finder snapshot for this point." />;
  return (
    <div>
      <p className="border-b border-gray-200 px-3 pb-2 pt-3 text-sm font-extrabold">Places</p>
      <ul className="space-y-2 p-3">{list.map((l, i) => <Card key={'f' + i} l={l} isTarget={isTarget} />)}</ul>
      {googleLocation && <p className="mx-3 mb-3 rounded-xl bg-gray-100 p-3 text-[11.5px] text-gray-700">{googleLocation}</p>}
    </div>
  );
}

function AiView({ ev, isTarget }: { ev: Evidence; isTarget: (n: string) => boolean }) {
  const ai = ev.aiOverview;
  return (
    <div className="space-y-3 p-3">
      <p className="text-sm font-extrabold text-violet-800">AI Overview</p>
      {ai ? (
        <>
          {ai.paragraphs.map((t, i) => <p key={i} className="text-[13px] leading-relaxed text-gray-800">{t}</p>)}
          {ai.businesses.length > 0 && <ul className="space-y-2">{ai.businesses.map((l, i) => <Card key={'a' + i} l={l} isTarget={isTarget} />)}</ul>}
        </>
      ) : (
        <p className="whitespace-pre-line text-[13px] leading-relaxed text-gray-800">{ev.resultsPage?.aiPreview}</p>
      )}
    </div>
  );
}

export type { GridPinData };
