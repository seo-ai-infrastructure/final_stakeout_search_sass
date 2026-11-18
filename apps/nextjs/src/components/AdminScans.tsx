'use client';
import Link from 'next/link';
import { Fragment, useMemo, useState } from 'react';
import { usePolling } from '@/lib/usePolling';

type Failed = { id: string; row: number; col: number; city: string; error: string; refunded: boolean; at: string; phone: string | null; phoneModel: string | null };
type Scan = {
  id: string; account: string; keyword: string; targetBusiness: string; targetType: string; city: string; stateCode: string; gridSize: number;
  status: string; totalPins: number; completedPins: number; failedPins: number; solv: number | null; creditsCharged: number; creditsRefunded: number;
  createdAt: string; dispatchedAt: string | null; completedAt: string | null; failed: Failed[];
};

/** The short code at the front of a failure ("RPA_SURFACE_ERROR no_scroll: ..." -> "RPA_SURFACE_ERROR no_scroll"). */
function failureCode(error: string): string {
  const head = error.split(':')[0].trim();
  if (/^[A-Z0-9_]+( [a-z_]+)?$/.test(head)) return head;
  const first = error.trim().split(/\s+/)[0] ?? '';
  return /^[A-Z0-9_]{4,}$/.test(first) ? first : error.slice(0, 40) || 'Unknown';
}
/** What a failure code means, in plain words. Codes not listed are shown as they are. */
const MEANING: Record<string, string> = {
  CANCELLED: 'Stopped by a person; refunded',
  NO_BOOTSTRAPPED_MATCHING_PHONE: 'No set-up phone matched the scan',
  NO_COMPATIBLE_DEVICE: 'No phone could take the point',
  ADB_COMMAND_FAILED: 'The phone could not be reached',
  UNRECOGNIZED_RESULT_LAYOUT: 'Google showed a page layout we do not read yet',
  R2_UPLOAD_TIMEOUT: 'The evidence upload timed out',
  LOCATION_UNVERIFIED: 'The phone did not confirm the point location',
  'RPA_SURFACE_ERROR no_scroll': 'The template never scrolled the page',
  'RPA_SURFACE_ERROR location_not_refreshed': 'The template did not tap Update location',
  'RPA_SURFACE_ERROR finder_not_opened': 'The full list of businesses never opened',
  WRONG_QUERY: 'The page was for a different search (the keyword was never searched)',
};
/** Failures a person caused on purpose: not a quality problem. */
const deliberate = (error: string) => /^(CANCELLED|Paused)/.test(error);

const statusColor = (s: string) => (s === 'COMPLETED' ? 'text-emerald-300' : s === 'RUNNING' || s === 'QUEUED' ? 'text-sky-300' : s === 'PARTIAL' ? 'text-amber-300' : 'text-rose-300');
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const minutes = (a: string, b: string) => Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000));

export default function AdminScans() {
  const [scans, setScans] = useState<Scan[]>([]),
    [days, setDays] = useState(7),
    [only, setOnly] = useState<'all' | 'problems' | 'open'>('all'),
    [query, setQuery] = useState(''),
    [open, setOpen] = useState<string | null>(null),
    [error, setError] = useState(''),
    [loaded, setLoaded] = useState(false);
  usePolling(
    () =>
      fetch('/api/admin/scans?days=' + days, { cache: 'no-store' })
        .then(async (r) => {
          const d = await r.json();
          if (!r.ok) throw new Error(d.error || 'Could not load scans.');
          setScans(d.scans);
          setError('');
          setLoaded(true);
        })
        .catch((e) => setError((e as Error).message)),
    30000,
    [days],
  );

  const real = (s: Scan) => s.failed.filter((f) => !deliberate(f.error));
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return scans.filter(
      (s) =>
        (only === 'all' || (only === 'open' ? s.status === 'RUNNING' || s.status === 'QUEUED' : real(s).length > 0)) &&
        (!q || [s.account, s.targetBusiness, s.keyword, s.city].some((x) => x.toLowerCase().includes(q))),
    );
  }, [scans, only, query]);
  // Every real failure in the window, grouped by code, most frequent first.
  const reasons = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of scans) for (const f of real(s)) m.set(failureCode(f.error), (m.get(failureCode(f.error)) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]);
  }, [scans]);
  const points = scans.reduce((n, s) => n + s.completedPins + real(s).length, 0);
  const bad = scans.reduce((n, s) => n + real(s).length, 0);

  return (
    <div className="mx-auto max-w-screen-2xl space-y-5 p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">All scans</h1>
          <p className="text-sm text-slate-400">Every account&apos;s scans, for quality control. Open one to see its report and recordings.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Account, business, keyword, city" aria-label="Search scans" className="w-64 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5" />
          <select value={only} onChange={(e) => setOnly(e.target.value as typeof only)} aria-label="Which scans" className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5">
            <option value="all">All scans</option>
            <option value="problems">With failed points</option>
            <option value="open">Running now</option>
          </select>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="How far back" className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5">
            <option value={1}>Last 24 hours</option>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
          </select>
        </div>
      </div>
      {error && <p role="alert" className="text-rose-300">{error}</p>}

      <div className="grid gap-3 md:grid-cols-[repeat(3,minmax(0,1fr))_2fr]">
        <Stat label="Scans" value={scans.length.toLocaleString()} />
        <Stat label="Points finished" value={points.toLocaleString()} />
        <Stat label="Points failed" value={bad.toLocaleString()} sub={points ? ((bad / points) * 100).toFixed(1) + '% of points' : undefined} tone={bad ? 'bad' : undefined} />
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Why points failed</p>
          {reasons.length === 0 ? (
            <p className="mt-2 text-sm text-slate-300">{loaded ? 'No failures in this period.' : 'Loading…'}</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {reasons.slice(0, 6).map(([code, n]) => (
                <li key={code} className="flex justify-between gap-4">
                  <span className="min-w-0 truncate" title={code}>{MEANING[code] ?? code}</span>
                  <span className="shrink-0 font-semibold text-rose-300">{n}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-slate-400">
            <tr>
              {['Started', 'Account', 'Business', 'Keyword', 'Where', 'Status', 'Points', 'Failed', 'Took', ''].map((h) => (
                <th key={h} className="px-3 py-2 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((s) => {
              const r = real(s), stopped = s.failed.length - r.length;
              return (
                <Fragment key={s.id}>
                  <tr className="border-t border-slate-800 align-top">
                    <td className="whitespace-nowrap px-3 py-2 text-slate-300">{when(s.createdAt)}</td>
                    <td className="max-w-[200px] truncate px-3 py-2" title={s.account}>{s.account}</td>
                    <td className="max-w-[200px] truncate px-3 py-2" title={s.targetBusiness}>{s.targetBusiness}</td>
                    <td className="max-w-[220px] truncate px-3 py-2" title={s.keyword}>{s.keyword}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-300">{s.city}, {s.stateCode}</td>
                    <td className={'whitespace-nowrap px-3 py-2 font-semibold ' + statusColor(s.status)}>{s.status.charAt(0) + s.status.slice(1).toLowerCase()}</td>
                    <td className="whitespace-nowrap px-3 py-2">{s.completedPins}/{s.totalPins}</td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {r.length > 0 ? (
                        <button type="button" onClick={() => setOpen(open === s.id ? null : s.id)} aria-expanded={open === s.id} className="font-semibold text-rose-300 underline decoration-dotted">
                          {r.length} failed
                        </button>
                      ) : (
                        <span className="text-slate-500">0</span>
                      )}
                      {stopped > 0 && <span className="ml-2 text-xs text-slate-500">{stopped} stopped</span>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-300">{s.completedAt ? minutes(s.dispatchedAt ?? s.createdAt, s.completedAt) + ' min' : ''}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      <Link href={'/scans/' + s.id} className="font-semibold text-emerald-400 hover:underline">Open</Link>
                    </td>
                  </tr>
                  {open === s.id && (
                    <tr className="border-t border-slate-800 bg-slate-950/60">
                      <td colSpan={10} className="px-3 py-3">
                        <table className="w-full text-xs">
                          <thead className="text-slate-400">
                            <tr>
                              {['Point', 'City', 'Phone', 'When', 'What went wrong', 'Refunded'].map((h) => (
                                <th key={h} className="px-2 py-1 text-left font-medium">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {r.map((f) => (
                              <tr key={f.id} className="border-t border-slate-800/70 align-top">
                                <td className="whitespace-nowrap px-2 py-1">Row {f.row + 1}, col {f.col + 1}</td>
                                <td className="whitespace-nowrap px-2 py-1">{f.city}</td>
                                <td className="whitespace-nowrap px-2 py-1">{f.phone ? `${f.phone}${f.phoneModel ? ' · ' + f.phoneModel : ''}` : 'None assigned'}</td>
                                <td className="whitespace-nowrap px-2 py-1">{when(f.at)}</td>
                                <td className="px-2 py-1">
                                  <span className="text-slate-200">{MEANING[failureCode(f.error)] ?? failureCode(f.error)}</span>
                                  <span className="block break-all font-mono text-[11px] text-slate-500">{f.error}</span>
                                </td>
                                <td className="whitespace-nowrap px-2 py-1">{f.refunded ? 'Yes' : 'No'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {loaded && shown.length === 0 && (
              <tr><td colSpan={10} className="px-3 py-6 text-center text-slate-400">No scans match.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">Refreshes every 30 seconds. Shows up to 300 scans. Points stopped by a person are counted separately from failures.</p>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'bad' }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className={'mt-1 text-2xl font-bold ' + (tone === 'bad' ? 'text-rose-300' : '')}>{value}</p>
      {sub && <p className="text-xs text-slate-400">{sub}</p>}
    </div>
  );
}
