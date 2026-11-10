'use client';
import { useEffect, useMemo, useState } from 'react';
import type { GridPinData, GridScanData } from './GeoGridDashboard';
import { describeArea, LEVEL_LABEL } from '../lib/censusLayer';
import { opportunityOrder, pointShares } from '../lib/buyingPower';

type Listing = { name: string; rating: string | null; reviews: string | null; meta: string; quote: string | null; ad: boolean; pos: number | null; distance?: string | null };
type Ahead = { name: string; pos: number | null; rating: string | null; reviews: string | null; distance?: string | null };
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
  firstScreen?: Evidence['resultsPage'];
  capture?: Record<string, string> | null;
  events?: { time: string; event: string }[];
  localFinder: Listing[];
  finderShown?: boolean | null;
  aiOverview: { paragraphs: string[]; businesses: Listing[]; related?: Listing[] } | null;
  aiCopy?: {
    intro: string[];
    businesses: { pos: number; name: string; kgmid: string; url: string; rating: string | null; reviews: string | null; category: string | null; lines: string[] }[];
    citations: { n: number; url: string }[];
    verified: boolean;
  } | null;
  maps?: MapsCard[] | null;
  mapsAdsAbove?: number | null;
  ranks: {
    maps?: number | null; pack: number | null; finder: number | null; ai: number | null };
};
type View = 'video' | 'first' | 'page' | 'finder' | 'ai' | 'maps';
type MapsCard = { name: string; ad: boolean; adKind: 'local_services' | 'sponsored' | null; pos: number | null; listPos: number; rating: string | null; reviews: string | null; lines: string[]; quote: string | null; distance: string | null };

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
    // Refused points can keep their evidence (worker v39): open them too, so the reason is visible.
    if (!pin || !(pin.status === 'COMPLETED' || (pin.status === 'FAILED' && pin.dumpsTarUrl))) return setEv(null);
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
  // The point dossier: who is ahead here, and what this point is worth.
  const shares = useMemo(() => pointShares(scan.pins), [scan.pins]);
  const opportunities = useMemo(() => opportunityOrder(scan.pins), [scan.pins]);
  const share = pin ? shares.get(pin.id) : undefined;
  const oppRank = pin ? opportunities.indexOf(pin.id) : -1;
  const census = pin?.census;
  const area = census?.bg?.inc != null && census.bg.rel !== 0
    ? describeArea('bg', census.bg)
    : census?.tract
      ? describeArea('tract', census.tract)
      : null;
  const zipArea = census?.zcta ? describeArea('zcta', census.zcta) : null;
  const organic: Ahead[] = ev?.maps
    ? ev.maps.filter((c) => !c.ad).map((c) => ({ name: c.name, pos: c.pos, rating: c.rating, reviews: c.reviews, distance: c.distance }))
    : (ev?.localFinder ?? []).filter((l) => !l.ad);
  const aiNamed: Ahead[] = ev?.aiCopy?.businesses?.length
    ? ev.aiCopy.businesses.map((b) => ({ name: b.name, pos: b.pos, rating: b.rating, reviews: b.reviews }))
    : (ev?.aiOverview?.businesses ?? []).map((b, i) => ({ name: b.name, pos: b.pos ?? i + 1, rating: b.rating, reviews: b.reviews }));
  const ahead = organic.length
    ? { source: ev?.maps ? 'Maps app results' : 'Local Finder', list: organic }
    : aiNamed.length
      ? { source: 'AI Overview list', list: aiNamed }
      : null;
  const you = ahead?.list.find((l) => isTarget(l.name));
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
  const isMaps = Boolean(ev?.maps) || scan.targetType === 'mobile_maps';
  const tabs: [View, string][] = isMaps
    ? [['video', 'Video'], ['maps', 'Maps results']]
    : [['video', 'Video'], ['page', 'Results page'], ['finder', 'Local Finder']];
  if (!isMaps && ev?.firstScreen) tabs.splice(1, 0, ['first', 'First screen']);
  if (!isMaps && (ev?.aiCopy || ev?.aiOverview || ev?.resultsPage?.aiPreview)) tabs.push(['ai', 'AI Overview']);

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
        {pin.status === 'FAILED' && pin.dumpsTarUrl && (
          <p role="status" className="max-w-[360px] rounded-lg bg-rose-500/15 px-3 py-2 text-xs text-rose-200">Refused point: this evidence was kept so you can see why. It has no rank and was refunded.</p>
        )}
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
            ) : pin.status !== 'COMPLETED' && !(pin.status === 'FAILED' && pin.dumpsTarUrl) ? (
              <Empty text={`This point is ${pin.status.toLowerCase()}.`} />
            ) : state === 'loading' ? (
              <Empty text="Rebuilding the page from this point’s snapshot…" />
            ) : !ev ? (
              <Empty text="The snapshot for this point isn’t available." />
            ) : view === 'maps' ? (
              ev.maps?.length ? (
                <MapsView cards={ev.maps} isTarget={isTarget} keyword={scan.keyword} />
              ) : (
                <Empty text="No Maps results were captured for this point." />
              )
            ) : view === 'first' && ev.firstScreen ? (
              <PageView ev={{ ...ev, resultsPage: ev.firstScreen }} isTarget={isTarget} keyword={scan.keyword} />
            ) : view === 'finder' ? (
              ev.finderShown === false ? (
                <div className="p-5 text-sm leading-relaxed text-gray-700">
                  <p className="font-bold text-gray-900">No Local Finder on this page</p>
                  <p className="mt-1">Google listed the businesses inside its AI Overview instead of showing a map pack, so there was no “More businesses” to open. This point is ranked in that list: see the AI Overview tab.</p>
                </div>
              ) : (
                <FinderView list={ev.localFinder} isTarget={isTarget} googleLocation={ev.resultsPage?.googleLocation ?? null} />
              )
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
            : view === 'first'
              ? 'The page exactly as it first loaded, before any scrolling: what a searcher sees first.'
              : 'Rebuilt from this point’s captured snapshot, in Google’s order. Ads are labelled and never ranked.'}
        </p>
      </section>

      {/* Ranks, ads, receipt */}
      <section aria-label="This point" className="flex flex-col gap-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <h2 className="text-sm font-bold">{scan.targetBusiness} at R{pin.rowIdx + 1}·C{pin.colIdx + 1}</h2>
          <div className="mt-4 grid grid-cols-3 gap-3">
{isMaps ? (
              <>
                <Stat label="Maps rank" value={ev ? (ev.ranks.maps ?? null) : pin.rankFound} note={ev?.maps ? `${ev.mapsAdsAbove ?? 0} ad(s) above` : 'organic rank'} />
                <Stat label="Ads" value={null} text={ev?.maps ? String(ev.maps.filter((c) => c.ad).length) : '—'} note="paid cards in the list" />
                <Stat label="Ask Maps" value={null} text="Soon" note="AI answers in Maps" />
              </>
            ) : (
              <>
                        <Stat label="3-pack" value={ev?.ranks.pack} note={ev?.resultsPage ? adsAbove(ev.resultsPage.pack) + ' ad(s) above' : '—'} />
            <Stat label="Local Finder" value={ev ? ev.ranks.finder : pin.rankFound} note={ev ? adsAbove(ev.localFinder) + ' ad(s) above' : 'organic rank'} />
            <Stat
              label="AI Overview"
              value={ev?.ranks.ai}
              note={ev?.aiCopy || ev?.aiOverview || ev?.resultsPage?.aiPreview ? (ev?.ranks.ai ? 'mentioned' : 'not mentioned') : 'none shown'}
              text={ev && !ev.aiCopy && !ev.aiOverview && !ev.resultsPage?.aiPreview ? 'None' : undefined}
            />
              </>
            )}
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
        {ahead && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <h2 className="text-sm font-bold">Who&apos;s ahead here</h2>
            <p className="mt-1 text-xs text-slate-400">
              {ahead.source} at this point
              {organic.length > 0 ? ', with each business’s distance from the phone as Google showed it' : ''}.
            </p>
            <ol className="mt-3 space-y-2 text-sm">
              {ahead.list.slice(0, 3).map((l) => (
                <AheadRow key={l.name} l={l} you={isTarget(l.name)} showDistance={organic.length > 0} />
              ))}
              {you && (you.pos ?? 99) > 3 && (
                <>
                  <li className="text-center text-xs text-slate-500">…</li>
                  <AheadRow l={you} you showDistance={organic.length > 0} />
                </>
              )}
            </ol>
            {!you && <p className="mt-3 text-xs text-slate-400">{scan.targetBusiness} isn&apos;t in this list here.</p>}
            {organic.length > 0 && organic.slice(0, 3).some((l) => !l.distance) && (
              <p className="mt-3 text-xs text-slate-500">
                No distance means the business hides its address (a service-area business), so Google shows none.
              </p>
            )}
          </div>
        )}
        {(area || zipArea || share !== undefined) && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <h2 className="text-sm font-bold">This point&apos;s neighborhood</h2>
            {share !== undefined && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-slate-950/60 p-3">
                  <p className="text-xs text-slate-400">Share of this grid&apos;s buying power</p>
                  <p className="text-2xl font-bold">{(share * 100).toFixed(1)}%</p>
                  <p className="text-xs text-slate-500">owner-occupied homes × median income of its tract</p>
                </div>
                <div className="rounded-xl bg-slate-950/60 p-3">
                  <p className="text-xs text-slate-400">Opportunity</p>
                  <p className="text-2xl font-bold">
                    {pin.status !== 'COMPLETED' ? '…' : oppRank >= 0 ? `#${oppRank + 1} of ${opportunities.length}` : 'Top 3'}
                  </p>
                  <p className="text-xs text-slate-500">
                    {pin.status !== 'COMPLETED'
                      ? 'once this point is scanned'
                      : oppRank === 0
                        ? 'the most valuable point you are not winning'
                        : oppRank > 0
                          ? 'among points where you are outside the top 3'
                          : 'you are already top 3 here'}
                  </p>
                </div>
              </div>
            )}
            {area && (
              <div className="mt-3 text-sm">
                <p className="text-xs text-slate-400">
                  {area.name} · {LEVEL_LABEL[area.level]}
                </p>
                {area.rows.map((r) => (
                  <p key={r.label}>
                    <span className="text-slate-400">{r.label}:</span> {r.value}
                  </p>
                ))}
              </div>
            )}
            {zipArea && (
              <p className="mt-2 text-sm">
                <span className="text-slate-400">{zipArea.name}:</span> {zipArea.rows[0].value},{' '}
                {zipArea.rows[1].value.split(' (')[0]} homeowners
              </p>
            )}
            <p className="mt-3 text-[11px] text-slate-500">
              U.S. Census Bureau, ACS 2020–2024 5-year estimates for the area around this point, not information about
              individual households or searchers.
            </p>
          </div>
        )}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <h2 className="text-sm font-bold">Receipt</h2>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-slate-400">GPS</dt><dd>{pin.lat.toFixed(5)}, {pin.lng.toFixed(5)}</dd>
            <dt className="text-slate-400">Area</dt><dd>{[pin.city, pin.stateCode, pin.census?.zcta?.id ?? pin.zip].filter(Boolean).join(' ')}</dd>
            {pin.proxyMeta && (<><dt className="text-slate-400">Exit</dt><dd>{[pin.proxyMeta.city, pin.proxyMeta.region].filter(Boolean).join(', ')} · residential</dd></>)}
            {ev?.resultsPage?.googleLocation && (<><dt className="text-slate-400">Google’s location</dt><dd className="text-emerald-300">{ev.resultsPage.googleLocation}</dd></>)}
            <dt className="text-slate-400">Status</dt><dd>{pin.status.toLowerCase()}</dd>
            {ev?.capture && (
              <>
                <dt className="text-slate-400">AI Overview</dt>
                <dd>{(ev.capture.aio ?? '').replaceAll('_', ' ')}{ev.capture.aio_expansion && ev.capture.aio_expansion !== 'not_applicable' ? ' · ' + ev.capture.aio_expansion.replaceAll('_', ' ') : ''}</dd>
                <dt className="text-slate-400">3-pack</dt><dd>{(ev.capture.pack ?? '').replaceAll('_', ' ')}</dd>
                <dt className="text-slate-400">Local Finder</dt>
                <dd>{ev.capture.finder_end === 'control_seen' ? 'whole list captured' : (ev.capture.finder ?? '').replaceAll('_', ' ')}</dd>
              </>
            )}
          </dl>
          {ev?.events && ev.events.length > 0 && (
            <details className="mt-4 rounded-xl bg-slate-950/60 p-3">
              <summary className="cursor-pointer text-sm font-semibold text-slate-200">Run timeline ({ev.events.length} steps)</summary>
              <ol className="mt-2 space-y-1 text-xs text-slate-300">
                {ev.events.map((e, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="shrink-0 font-mono text-slate-500">{e.time.slice(11, 19)}</span>
                    <span>{e.event.replaceAll('_', ' ')}</span>
                  </li>
                ))}
              </ol>
            </details>
          )}
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

/** The Maps app's results list, rebuilt from the point's snapshots in the app's order. */
function MapsView({ cards, isTarget, keyword }: { cards: MapsCard[]; isTarget: (n: string) => boolean; keyword: string }) {
  return (
    <div className="text-gray-900">
      <div className="mx-3 mt-3 flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-[13px] shadow ring-1 ring-gray-200">
        <span className="min-w-0 flex-1 truncate">{keyword}</span>
        <span className="text-gray-400">✕</span>
      </div>
      <p className="mx-4 mb-1 mt-4 text-lg font-bold">Results</p>
      <ol className="divide-y divide-gray-100">
        {cards.map((c) => {
          const you = !c.ad && isTarget(c.name);
          return (
            <li key={c.name} className={'flex gap-3 px-4 py-3 ' + (you ? 'bg-emerald-50 ring-2 ring-inset ring-emerald-400' : '')}>
              <span className={'mt-0.5 grid h-6 min-w-6 place-items-center rounded-full px-1 text-[11px] font-bold ' + (c.ad ? 'bg-gray-100 text-gray-500' : you ? 'bg-emerald-500 text-white' : 'bg-gray-800 text-white')}>
                {c.ad ? 'Ad' : c.pos}
              </span>
              <div className="min-w-0 flex-1 text-[12.5px] leading-snug">
                {c.ad && (
                  <p className="text-[11px] font-bold text-gray-500">
                    Sponsored{c.adKind === 'local_services' ? ' · Google Verified' : ''}
                  </p>
                )}
                <p className="text-[15px] font-semibold text-gray-900">{c.name}</p>
                {c.rating && (
                  <p className="text-gray-600">
                    <span className="font-semibold text-gray-800">{c.rating}</span> <span className="text-amber-500">★</span>
                    {c.reviews ? ` (${c.reviews})` : ''}
                  </p>
                )}
                {c.lines.map((l) => (
                  <p key={l} className="text-gray-600">
                    {l}
                  </p>
                ))}
                {c.quote && <p className="mt-1 italic text-gray-500">“{c.quote}”</p>}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function AheadRow({ l, you, showDistance }: { l: Ahead; you: boolean; showDistance: boolean }) {
  return (
    <li className={'flex items-baseline justify-between gap-3 rounded-lg px-2 py-1 ' + (you ? 'bg-emerald-500/10 text-emerald-200' : '')}>
      <span className="min-w-0">
        <span className="font-bold">#{l.pos ?? '–'}</span> {l.name}
        {you && <span className="ml-1 text-xs">(you)</span>}
        {l.rating && (
          <span className="ml-1 text-xs text-slate-400">
            ★{l.rating}
            {l.reviews ? ` (${l.reviews})` : ''}
          </span>
        )}
      </span>
      {showDistance && <span className="shrink-0 text-xs text-slate-400">{l.distance ?? 'no distance shown'}</span>}
    </li>
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
  const copy = ev.aiCopy;
  if (copy && copy.businesses.length)
    return (
      <div className="space-y-3 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-extrabold text-violet-800">AI Overview</p>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${copy.verified ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
            {copy.verified ? 'Copied from Google · verified' : 'Copy not verified'}
          </span>
        </div>
        {copy.intro.map((t, i) => <p key={'i' + i} className="text-[13px] font-semibold text-gray-800">{t}</p>)}
        <ol className="space-y-2">
          {copy.businesses.map((b) => {
            const me = isTarget(b.name);
            return (
              <li key={b.kgmid} className={`rounded-xl p-3 ${me ? 'border-2 border-emerald-600 bg-emerald-50' : 'border border-gray-200'}`}>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex h-6 min-w-[24px] items-center justify-center rounded-full text-[11px] font-extrabold ${me ? 'bg-emerald-600 text-white' : 'bg-violet-100 text-violet-800'}`}>{b.pos}</span>
                  <a href={b.url} target="_blank" rel="noopener noreferrer" className="text-[13.5px] font-bold text-[#1a0dab] underline-offset-2 hover:underline">{b.name}</a>
                </div>
                <div className="mt-1 text-xs text-gray-700">
                  {b.rating ? b.rating + ' ★' : ''}{b.reviews ? ' (' + b.reviews + ')' : ''}{b.category ? ' · ' + b.category : ''}
                </div>
                {b.lines.map((l, i) => <div key={i} className="mt-1 text-[11.5px] text-gray-600">{l.replace(/\s*\[\d+\] \([^)]*\)/g, '').replace(/ \(https?:[^)]*\)/g, '')}</div>)}
                <div className="mt-1 font-mono text-[10px] text-gray-400">Google ID {b.kgmid}</div>
              </li>
            );
          })}
        </ol>
        {copy.citations.length > 0 && <p className="text-[11px] text-gray-500">{copy.citations.length} cited source{copy.citations.length === 1 ? '' : 's'} in this AI Overview</p>}
      </div>
    );
  return (
    <div className="space-y-3 p-3">
      <p className="text-sm font-extrabold text-violet-800">AI Overview</p>
      {ai ? (
        <>
          {ai.paragraphs.map((t, i) => <p key={i} className="text-[13px] leading-relaxed text-gray-800">{t}</p>)}
          {ai.businesses.length > 0 && <ul className="space-y-2">{ai.businesses.map((l, i) => <Card key={'a' + i} l={l} isTarget={isTarget} />)}</ul>}
          {!!ai.related?.length && (
            <>
              <p className="pt-1 text-xs font-bold uppercase tracking-wide text-gray-500">Related results (not ranked in the AI’s list)</p>
              <ul className="space-y-2 opacity-80">{ai.related.map((l, i) => <Card key={'r' + i} l={l} isTarget={isTarget} />)}</ul>
            </>
          )}
        </>
      ) : (
        <p className="whitespace-pre-line text-[13px] leading-relaxed text-gray-800">{ev.resultsPage?.aiPreview}</p>
      )}
    </div>
  );
}

export type { GridPinData };
