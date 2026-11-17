'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { kindLabel, STAGE_LABEL, STAGES, type RefusedRun, type Stage } from '@stakeout/core/runLog';

type Summary = { total: number; byKind: { kind: string; n: number }[]; byPhone: { phone: string; n: number }[]; byTemplate: { template: string; n: number }[] };
type Timing = {
  attempts: number;
  succeeded: number;
  failedSearches: number;
  failedSetups: number;
  lostMinutesSearches: number;
  lostMinutesSetups: number;
  median: Record<Stage | 'total' | 'phoneHeld', number | null>;
};
type Runs = {
  at: string;
  refused: RefusedRun[];
  /** The worker's own summary (null until a worker with this update has reported). */
  summary: { timing2h: Timing; timing6h: Timing; refused1h: Summary; refused24h: Summary } | null;
  duoplus: DuoplusLine | null;
};
type DuoplusLine = { windowMinutes: number; perMinute: number; avgWaitMs: number; maxWaitMs: number; top: { endpoint: string; perMinute: number }[] };

const card = 'rounded-2xl border border-slate-800 bg-slate-900/60 p-5';
const chip = 'rounded-full border px-2.5 py-1 text-xs';
const secs = (s: number | null) => (s === null ? '—' : s >= 90 ? `${Math.floor(s / 60)} min ${Math.round(s % 60)} s` : `${Math.round(s)} s`);
const ago = (iso: string) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.floor(m / 60)} h ${m % 60} min ago` : new Date(iso).toLocaleString();
};

/**
 * The admin page's view of the search pipeline: where each search's time goes (from the worker's
 * own timings), how long DuoPlus requests wait in line, and every rejected search with its video.
 */
export function AdminRuns() {
  const [runs, setRuns] = useState<Runs | null>(null);
  const [span, setSpan] = useState<'2h' | '6h'>('2h');
  const [kind, setKind] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [shown, setShown] = useState(25);

  const load = useCallback(async () => {
    const r = await fetch('/api/admin/runs', { cache: 'no-store' }).catch(() => null);
    if (r?.ok) setRuns(await r.json());
  }, []);
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 60000);
    return () => clearInterval(t);
  }, [load]);

  const list = useMemo(
    () => (runs?.refused ?? []).filter((r) => (!kind || r.kind === kind) && (!phone || r.phone === phone)),
    [runs, kind, phone],
  );
  if (!runs) return null;
  const duoplus = runs.duoplus;
  const empty: Timing = { attempts: 0, succeeded: 0, failedSearches: 0, failedSetups: 0, lostMinutesSearches: 0, lostMinutesSetups: 0, median: {} as Timing['median'] };
  const t = (span === '2h' ? runs.summary?.timing2h : runs.summary?.timing6h) ?? empty;
  const refused1h = runs.summary?.refused1h.total ?? null;
  const refused24h = runs.summary?.refused24h ?? null;
  const longest = Math.max(1, ...STAGES.map((s) => t.median[s] ?? 0));

  return (
    <>
      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-white">Where the time goes in a search</h2>
          <div className="flex gap-1" role="group" aria-label="Period">
            {(['2h', '6h'] as const).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={span === s}
                onClick={() => setSpan(s)}
                className={chip + (span === s ? ' border-sky-400/70 bg-sky-500/15 text-sky-100' : ' border-slate-700 text-slate-400 hover:text-slate-200')}
              >
                {s === '2h' ? 'Last 2 hours' : 'Last 6 hours'}
              </button>
            ))}
          </div>
        </div>
        {t.attempts === 0 ? (
          <p className="mt-3 text-sm text-slate-400">No timed searches yet: timings are recorded for every search from this update on.</p>
        ) : (
          <>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {(
                [
                  ['Phone busy per point', secs(t.median.phoneHeld ?? null), `median of ${t.succeeded} finished points; the phone is free after this`],
                  ['Whole point', secs(t.median.total ?? null), 'lease to saved result, including checks after the phone is free'],
                  [
                    'Rejected searches',
                    String(t.failedSearches),
                    t.failedSearches ? `${t.lostMinutesSearches} phone-minutes spent on them` : 'none in this period',
                  ],
                  [
                    'DuoPlus requests',
                    duoplus ? `${duoplus.perMinute}/min` : '—',
                    duoplus
                      ? `waiting ${(duoplus.avgWaitMs / 1000).toFixed(1)} s on average for the 1-a-second limit (longest ${(duoplus.maxWaitMs / 1000).toFixed(0)} s), last ${duoplus.windowMinutes} min`
                      : 'reported by the worker from this update on',
                  ],
                ] as [string, string, string][]
              ).map(([label, value, hint]) => (
                <div key={label} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <p className="text-xs text-slate-400">{label}</p>
                  <p className="mt-1 text-lg font-bold text-white">{value}</p>
                  <p className="text-xs text-slate-500">{hint}</p>
                </div>
              ))}
            </div>
            <ul className="mt-4 space-y-1.5" aria-label="Median seconds per stage">
              {STAGES.map((s) => {
                const v = t.median[s] ?? null;
                return (
                  <li key={s} className="grid grid-cols-[7.5rem_minmax(0,1fr)_4.5rem] items-center gap-3 text-xs" title={`${STAGE_LABEL[s]}: median ${secs(v)}`}>
                    <span className="text-slate-300">{STAGE_LABEL[s]}</span>
                    <span className="h-2.5 rounded-sm bg-slate-800/70">
                      {v !== null && v > 0 && <span className="block h-2.5 rounded-r bg-sky-400/80" style={{ width: `${Math.max(1.5, (v / longest) * 100)}%` }} />}
                    </span>
                    <span className="text-right tabular-nums text-slate-200">{secs(v)}</span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-xs text-slate-500">
              Medians of the points that finished. DuoPlus start is the time between asking DuoPlus to run the template and DuoPlus reporting it running.
              {t.failedSetups ? ` ${t.failedSetups} attempts stopped before searching (proxy or phone setup), ${t.lostMinutesSetups} phone-minutes.` : ''}
              {duoplus?.top.length ? ' Most DuoPlus requests: ' + duoplus.top.map((x) => `${x.endpoint} ${x.perMinute}/min`).join(' · ') + '.' : ''}
            </p>
          </>
        )}
      </section>

      <section className={card}>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-sm font-bold text-white">Rejected searches</h2>
          <p className="text-xs text-slate-400">
            {refused1h === null || !refused24h ? 'Each one was retried or refunded automatically' : `${refused1h} in the last hour · ${refused24h.total} in 24 hours · each was retried or refunded automatically`}
          </p>
        </div>
        {runs.refused.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">None recorded yet. Every search that runs and is rejected is listed here from this update on, with its video.</p>
        ) : (
          <>
            <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter by reason">
              <button type="button" aria-pressed={!kind} onClick={() => setKind(null)} className={chip + (!kind ? ' border-sky-400/70 bg-sky-500/15 text-sky-100' : ' border-slate-700 text-slate-400 hover:text-slate-200')}>
                All reasons
              </button>
              {(refused24h?.byKind ?? []).slice(0, 8).map((k) => (
                <button
                  key={k.kind}
                  type="button"
                  aria-pressed={kind === k.kind}
                  onClick={() => setKind(kind === k.kind ? null : k.kind)}
                  className={chip + (kind === k.kind ? ' border-sky-400/70 bg-sky-500/15 text-sky-100' : ' border-slate-700 text-slate-300 hover:text-white')}
                >
                  {kindLabel(k.kind)} <span className="tabular-nums text-slate-400">{k.n}</span>
                </button>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Filter by phone">
              <button type="button" aria-pressed={!phone} onClick={() => setPhone(null)} className={chip + (!phone ? ' border-sky-400/70 bg-sky-500/15 text-sky-100' : ' border-slate-700 text-slate-400 hover:text-slate-200')}>
                All phones
              </button>
              {(refused24h?.byPhone ?? []).slice(0, 17).map((p) => (
                <button
                  key={p.phone}
                  type="button"
                  aria-pressed={phone === p.phone}
                  onClick={() => setPhone(phone === p.phone ? null : p.phone)}
                  className={chip + ' font-mono' + (phone === p.phone ? ' border-sky-400/70 bg-sky-500/15 text-sky-100' : ' border-slate-700 text-slate-300 hover:text-white')}
                >
                  {p.phone} <span className="tabular-nums text-slate-400">{p.n}</span>
                </button>
              ))}
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="text-xs text-slate-400">
                  <tr>
                    <th className="py-2 pr-3 font-medium">When</th>
                    <th className="py-2 pr-3 font-medium">Phone</th>
                    <th className="py-2 pr-3 font-medium">Point</th>
                    <th className="py-2 pr-3 font-medium">Why</th>
                    <th className="py-2 pr-3 font-medium">Template</th>
                    <th className="py-2 pr-3 font-medium">Location</th>
                    <th className="py-2 font-medium">Evidence</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {list.slice(0, shown).map((r, i) => (
                    <tr key={r.at + r.pinId + i} className="align-top">
                      <td className="whitespace-nowrap py-2 pr-3 text-slate-300" title={new Date(r.at).toLocaleString()}>
                        {ago(r.at)}
                        {r.attempt > 1 && <span className="block text-xs text-slate-500">attempt {r.attempt}</span>}
                      </td>
                      <td className="py-2 pr-3 font-mono text-xs text-slate-200">{r.phone}</td>
                      <td className="py-2 pr-3">
                        <Link href={'/scans/' + r.scanId} className="text-slate-100 hover:underline">
                          {r.keyword}
                        </Link>
                        <span className="block text-xs text-slate-500">point {r.point}{r.seconds !== null ? ` · ${secs(r.seconds)}` : ''}</span>
                      </td>
                      <td className="py-2 pr-3" title={r.message}>
                        <span className="text-slate-100">{kindLabel(r.kind)}</span>
                        <span className="block max-w-[22rem] truncate font-mono text-[11px] text-slate-500">{r.message}</span>
                      </td>
                      <td className="py-2 pr-3 text-xs text-slate-300">{r.template ? 'v' + r.template : '—'}</td>
                      <td className="py-2 pr-3 text-xs text-slate-300">{r.locationPath ? r.locationPath.replaceAll(',', ' → ') : '—'}</td>
                      <td className="whitespace-nowrap py-2 text-xs">
                        {r.video ? (
                          <a href={'/api/admin/runs?file=' + encodeURIComponent(r.video)} target="_blank" rel="noreferrer" className="text-sky-300 hover:underline">
                            Watch
                          </a>
                        ) : (
                          <span className="text-slate-500">no video</span>
                        )}
                        {r.bundle && (
                          <a href={'/api/admin/runs?file=' + encodeURIComponent(r.bundle)} className="ml-3 text-slate-300 hover:underline">
                            Bundle
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {list.length > shown && (
              <button type="button" onClick={() => setShown(shown + 50)} className="mt-3 text-xs text-sky-300 hover:underline">
                Show more ({list.length - shown} older)
              </button>
            )}
          </>
        )}
      </section>
    </>
  );
}
