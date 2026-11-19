'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { aioRollup, aioTasks, type AioTask, type CitedPage, type PageCheck, type PinState, type Tier } from '@stakeout/core/aioChecklist';
import { pointShares } from '@/lib/buyingPower';
import type { GridScanData } from '@/components/GeoGridDashboard';

type State = { target: string; playbook: string; status: string; originScanId: string | null; verifiedScanId: string | null };
type Check = PageCheck & { note?: string };

const box = 'rounded-2xl border border-slate-800 bg-slate-900/70 p-5';
const TIER: Record<Tier, string> = { CRITICAL: 'border-rose-500/50 bg-rose-500/10 text-rose-300', HIGH: 'border-amber-500/50 bg-amber-500/10 text-amber-300', MEDIUM: 'border-slate-600 bg-slate-800 text-slate-300' };
const TIER_TEXT: Record<Tier, string> = { CRITICAL: 'Critical', HIGH: 'High', MEDIUM: 'Medium' };
const PIN: Record<PinState, { cls: string; text: string }> = {
  you: { cls: 'border-emerald-400 bg-emerald-500/25', text: 'AI answer names or cites the business' },
  others: { cls: 'border-amber-400 bg-amber-500/20', text: 'AI answer, business missing' },
  none: { cls: 'border-slate-600 bg-slate-800/60', text: 'No AI answer' },
  pending: { cls: 'border-dashed border-slate-700 bg-transparent', text: 'Not finished' },
};
const SERVICE: Record<string, string> = { CITATION: 'Have us build this listing', VIDEO: 'Have us publish it', PROFILE: 'Have us update the Google listing' };
const keyOf = (t: { target: string; playbook: string }) => t.playbook + '|' + t.target;
const pct = (n: number) => Math.round(n) + '%';
const short = (url: string) => url.replace(/^https:\/\//, '').replace(/\/$/, '');

function Kpi({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-white">{value}</p>
      <p className="mt-1 text-xs text-slate-400">{note}</p>
    </div>
  );
}

function Copy({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return <button type="button" onClick={() => navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1800); }).catch(() => {})} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-slate-500">{done ? 'Copied' : label}</button>;
}

/**
 * The AI citations tab of a scan report: how often Google answered with AI here, how often it
 * named the business, the pages it drew on, and a checklist of what to do about each, most
 * valuable first. On a shared report the checklist is read-only.
 */
export default function AiCitationsTab({ scan, shared, identifier, onOpenPin }: { scan: GridScanData; shared: boolean; identifier: string; onOpenPin: (pinId: string) => void }) {
  const [checks, setChecks] = useState<Record<string, Check>>({});
  const [states, setStates] = useState<Record<string, State>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [focus, setFocus] = useState<string[] | null>(null);
  const [show, setShow] = useState<'todo' | 'done' | 'dismissed'>('todo');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [allPages, setAllPages] = useState(false);
  const api = '/api/scans/' + encodeURIComponent(identifier) + '/aio' + (shared ? '?share=1' : '');

  useEffect(() => {
    let live = true;
    fetch(api, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (!live || !j) return;
      setChecks(j.checks ?? {});
      setStates(Object.fromEntries(((j.states ?? []) as State[]).map((s) => [keyOf(s), s])));
    }).catch(() => {});
    return () => { live = false; };
  }, [api]);

  const weights = useMemo(() => pointShares(scan.pins), [scan.pins]);
  const r = useMemo(() => aioRollup(scan.pins, scan.targetBusiness, scan.targetDomain, weights, checks), [scan.pins, scan.targetBusiness, scan.targetDomain, weights, checks]);
  const place = useMemo(() => { const c = scan.pins[Math.floor(scan.pins.length / 2)]; return c?.city ? c.city + ', ' + c.stateCode : ''; }, [scan.pins]);
  const tasks = useMemo(() => aioTasks(r, { business: scan.targetBusiness, keyword: scan.keyword, place }), [r, scan.targetBusiness, scan.keyword, place]);

  const post = useCallback(async (body: unknown) => {
    const res = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || 'That did not work.');
    return j;
  }, [api]);
  const setStatus = async (t: AioTask, status: string) => {
    setBusy(keyOf(t)); setError('');
    try { const j = await post({ action: 'status', target: t.target, playbook: t.playbook, status }); setStates((s) => ({ ...s, [keyOf(t)]: j.state })); } catch (e) { setError(e instanceof Error ? e.message : 'Not saved.'); } finally { setBusy(''); }
  };
  // A job taken on from an earlier scan that this scan shows has worked is marked verified, once.
  const worked = (t: AioTask) => t.captured || (t.playbook === 'ANSWER_ON_YOUR_SITE' && r.ownSite.pins > 0);
  useEffect(() => {
    if (shared) return;
    for (const t of tasks) {
      const s = states[keyOf(t)];
      if (s && s.status !== 'DISMISSED' && !s.verifiedScanId && s.originScanId && s.originScanId !== scan.id && worked(t))
        post({ action: 'verify', target: t.target, playbook: t.playbook }).then((j) => setStates((x) => ({ ...x, [keyOf(t)]: j.state }))).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, states, shared, scan.id]);

  const checkable = r.pages.filter((p) => p.pageKnown && ['directory', 'roundup', 'news', 'business'].includes(p.kind) && !checks[p.url]).slice(0, 15);
  const runCheck = async () => {
    setBusy('check'); setError('');
    try { const j = await post({ action: 'check', urls: checkable.map((p) => p.url) }); setChecks(j.checks ?? {}); } catch (e) { setError(e instanceof Error ? e.message : 'The pages were not checked.'); } finally { setBusy(''); }
  };

  if (!r.points) return <div className={box}><p className="text-sm text-slate-300">No point of this scan has finished yet.</p></div>;
  if (!r.answers) return <div className={box}><h2 className="text-sm font-bold text-white">AI citations</h2><p className="mt-1 text-sm text-slate-300">Google showed no AI answer at any of the {r.points} points checked for “{scan.keyword}”, so there is nothing to act on here. The map pack is the whole result for this search.</p></div>;

  const statusOf = (t: AioTask) => states[keyOf(t)]?.status ?? 'OPEN';
  const groups = {
    todo: tasks.filter((t) => !t.captured && ['OPEN', 'IN_PROGRESS'].includes(statusOf(t))),
    done: tasks.filter((t) => t.captured || statusOf(t) === 'DONE'),
    dismissed: tasks.filter((t) => !t.captured && statusOf(t) === 'DISMISSED'),
  };
  const rows = [...new Set(scan.pins.map((p) => p.rowIdx))].sort((a, b) => a - b), cols = [...new Set(scan.pins.map((p) => p.colIdx))].sort((a, b) => a - b);
  const at = new Map(scan.pins.map((p) => [p.rowIdx + ':' + p.colIdx, p]));
  const lit = focus ? new Set(focus) : null;
  const pagesShown = allPages ? r.pages : r.pages.slice(0, 10);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="AI answer shown" value={`${r.answers} of ${r.points}`} note={`Google put an AI answer on the results at ${pct(r.triggerRate)} of the points.`} />
        <Kpi label="Named in the AI answer" value={pct(r.named.share)} note={r.weighted ? `${scan.targetBusiness} was named at ${r.named.pins} of ${r.answers}. By buying power: ${pct(r.named.powerShare)}.` : `${scan.targetBusiness} was named at ${r.named.pins} of ${r.answers} answers.`} />
        <Kpi label="Your website cited" value={scan.targetDomain ? pct(r.ownSite.share) : '–'} note={!scan.targetDomain ? 'The website was not given when this scan was made, so its citations cannot be told apart.' : r.rival ? `${r.ownSite.pins} of ${r.answers} answers. The most cited rival site, ${r.rival.site}: ${pct(r.rival.share)}.` : `${r.ownSite.pins} of ${r.answers} answers.`} />
        <Kpi label="Sources to win" value={String(groups.todo.length)} note={r.uncaptured.pages ? `The top ${r.uncaptured.pages} feed ${pct(r.uncaptured.pinShare)} of the AI answers${r.weighted ? ` (${pct(r.uncaptured.powerShare)} of the buying power)` : ''}.` : 'Nothing left to win here.'} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <div className={box}>
          <h2 className="text-sm font-bold text-white">Where the AI answer appeared</h2>
          <div className="mt-3 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(0, 1fr))` }}>
            {rows.flatMap((row) => cols.map((col) => {
              const p = at.get(row + ':' + col);
              if (!p) return <span key={row + ':' + col} />;
              const s = r.state[p.id] ?? 'pending';
              const dim = lit && !lit.has(p.id);
              return <button key={p.id} type="button" onClick={() => onOpenPin(p.id)} title={`${PIN[s].text}${p.city ? ' · ' + p.city : ''}. Open this point’s evidence.`} aria-label={`Point ${row + 1}, ${col + 1}: ${PIN[s].text}`} className={'aspect-square rounded-md border-2 transition ' + PIN[s].cls + (dim ? ' opacity-20' : '') + (lit && !dim ? ' ring-2 ring-white/70' : '') + ' hover:brightness-125'} />;
            }))}
          </div>
          <ul className="mt-3 space-y-1 text-xs text-slate-400">
            {(['you', 'others', 'none'] as PinState[]).map((s) => <li key={s} className="flex items-center gap-2"><span className={'h-3 w-3 rounded border-2 ' + PIN[s].cls} />{PIN[s].text}</li>)}
          </ul>
          <p className="mt-2 text-[11px] text-slate-500">{lit ? <>Showing the {lit.size} point{lit.size === 1 ? '' : 's'} that cited the chosen source. <button type="button" onClick={() => setFocus(null)} className="text-sky-400 hover:underline">Show all</button></> : 'Click a point to open its recording and screenshots.'}</p>
        </div>

        <div className={box}>
          <h2 className="text-sm font-bold text-white">Who feeds Google’s AI here</h2>
          <p className="mt-1 text-xs text-slate-400">The kinds of page the AI answers cited, by how many of the {r.answers} answers used each.</p>
          <ul className="mt-3 space-y-2.5">
            {r.kinds.map((k) => (
              <li key={k.kind}>
                <div className="flex items-baseline justify-between gap-3 text-sm"><span className="text-slate-200">{k.label}</span><span className="tabular-nums text-slate-400">{k.pins} of {r.answers} · {k.pages} page{k.pages === 1 ? '' : 's'}</span></div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-800" aria-hidden><div className={'h-full rounded-full ' + (k.kind === 'own' ? 'bg-emerald-400' : 'bg-sky-400')} style={{ width: Math.max(3, k.pinShare) + '%' }} /></div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className={box}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-white">What to do about it</h2>
            <p className="mt-1 text-xs text-slate-400">One job per source worth winning, ranked by the buying power of the points that cited it.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span role="group" aria-label="Which jobs" className="inline-flex overflow-hidden rounded-lg border border-slate-700 text-xs">
              {([['todo', 'To do'], ['done', 'Done'], ['dismissed', 'Dismissed']] as const).map(([k, label]) => <button key={k} type="button" aria-pressed={show === k} onClick={() => setShow(k)} className={'px-2.5 py-1.5 ' + (show === k ? 'bg-slate-700 font-semibold text-white' : 'text-slate-400 hover:bg-slate-800')}>{label} · {groups[k].length}</button>)}
            </span>
            {!shared && checkable.length > 0 && <button type="button" onClick={runCheck} disabled={Boolean(busy)} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-slate-500 disabled:opacity-40">{busy === 'check' ? 'Reading the pages…' : `Check ${checkable.length} page${checkable.length === 1 ? '' : 's'} for the business`}</button>}
          </div>
        </div>
        {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}

        <ul className="mt-4 space-y-2.5">
          {groups[show].map((t) => {
            const k = keyOf(t), s = states[k], isOpen = open === k, status = statusOf(t);
            const blocked = t.pages.length === 1 && checks[t.pages[0].url]?.note === 'blocked';
            return (
              <li key={k} className="rounded-xl border border-slate-800 bg-slate-950/50">
                <button type="button" onClick={() => { setOpen(isOpen ? null : k); setFocus(isOpen ? null : t.pins); }} aria-expanded={isOpen} className="flex w-full items-start gap-3 p-4 text-left">
                  <span className={'mt-0.5 shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ' + TIER[t.tier]}>{TIER_TEXT[t.tier]} · {Math.round(t.score)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-slate-100">{t.headline}</span>
                    <span className="mt-1 block text-xs text-slate-400">{t.why}{blocked ? ' The site would not let us read the page, so check it by eye.' : ''}</span>
                  </span>
                  <span className="shrink-0 text-right text-xs">
                    {s?.verifiedScanId ? <span className="rounded-full border border-emerald-500/50 bg-emerald-500/10 px-2 py-0.5 font-semibold text-emerald-300">Verified by a later scan</span> : t.captured ? <span className="text-emerald-300">Already on it</span> : status === 'IN_PROGRESS' ? <span className="text-sky-300">In progress</span> : status === 'DONE' ? <span className="text-emerald-300">Marked done</span> : null}
                    <span className="mt-1 block text-slate-500">{isOpen ? 'Hide' : 'How'}</span>
                  </span>
                </button>
                {isOpen && (
                  <div className="space-y-3 border-t border-slate-800 p-4">
                    <ol className="list-decimal space-y-1.5 pl-5 text-sm text-slate-300">{t.steps.map((step, i) => <li key={i} className="break-words">{step}</li>)}</ol>
                    {t.draft && (
                      <div>
                        <p className="text-xs font-semibold text-slate-400">{t.draftLabel}</p>
                        <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs text-slate-300">{t.draft}</pre>
                      </div>
                    )}
                    <ul className="space-y-1 text-xs text-slate-400">
                      {t.pages.map((p) => <li key={p.url} className="flex flex-wrap items-baseline gap-x-2"><a href={p.url} target="_blank" rel="noreferrer nofollow" className="max-w-full truncate text-sky-400 hover:underline">{short(p.url)}</a><span>cited at {p.pins.length} point{p.pins.length === 1 ? '' : 's'}{p.avgSlot !== null ? ` · source ${p.avgSlot}` : ''}{!p.pageKnown ? ' · the site was cited; the exact page was not recorded' : ''}</span></li>)}
                    </ul>
                    <div className="flex flex-wrap items-center gap-2">
                      {t.draft && <Copy text={t.draft} label={'Copy the ' + (t.draftLabel ?? 'draft').toLowerCase()} />}
                      {!shared && !t.captured && (
                        <>
                          {status === 'OPEN' && <button type="button" disabled={busy === k} onClick={() => setStatus(t, 'IN_PROGRESS')} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-slate-500">Start</button>}
                          {status !== 'DONE' && <button type="button" disabled={busy === k} onClick={() => setStatus(t, 'DONE')} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500">Mark done</button>}
                          {status !== 'OPEN' && <button type="button" disabled={busy === k} onClick={() => setStatus(t, 'OPEN')} className="text-xs text-slate-400 hover:underline">Reopen</button>}
                          {status !== 'DISMISSED' && <button type="button" disabled={busy === k} onClick={() => setStatus(t, 'DISMISSED')} className="text-xs text-slate-400 hover:text-rose-300">Not for us</button>}
                          {t.service && <a href={`mailto:support@stakeoutsearch.com?subject=${encodeURIComponent(SERVICE[t.service] + ': ' + scan.targetBusiness)}&body=${encodeURIComponent(t.headline + '\n' + t.pages.map((p) => p.url).join('\n') + '\n\nScan: ' + scan.id)}`} className="ml-auto text-xs text-sky-400 hover:underline">{SERVICE[t.service]} →</a>}
                        </>
                      )}
                    </div>
                    {!shared && status === 'DONE' && !s?.verifiedScanId && <p className="text-xs text-slate-500">The next scan of this business checks whether it worked, and marks the job verified when it has.</p>}
                  </div>
                )}
              </li>
            );
          })}
          {!groups[show].length && <li className="text-sm text-slate-400">{show === 'todo' ? 'Nothing left to do from this scan.' : show === 'done' ? 'Nothing marked done yet. Pages the business is already on appear here once they are checked.' : 'Nothing dismissed.'}</li>}
        </ul>
      </div>

      <div className={box}>
        <h2 className="text-sm font-bold text-white">Every page the AI answers cited</h2>
        <div className="mt-3 overflow-x-auto rounded-lg border border-slate-800">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900 text-slate-400"><tr><th className="px-3 py-2 font-medium">Page</th><th className="px-3 py-2 font-medium">Kind</th><th className="px-3 py-2 text-right font-medium">Points</th>{r.weighted && <th className="px-3 py-2 text-right font-medium">Buying power</th>}<th className="px-3 py-2 text-right font-medium">Source no.</th><th className="px-3 py-2 font-medium">Business on it?</th><th className="px-3 py-2 text-right font-medium">Score</th></tr></thead>
            <tbody className="divide-y divide-slate-800/70">
              {pagesShown.map((p: CitedPage) => (
                <tr key={p.url} className="hover:bg-slate-800/40" onMouseEnter={() => setFocus(p.pins)} onMouseLeave={() => setFocus(open ? tasks.find((t) => keyOf(t) === open)?.pins ?? null : null)}>
                  <td className="max-w-[22rem] truncate px-3 py-1.5"><a href={p.url} target="_blank" rel="noreferrer nofollow" className="text-slate-200 hover:text-sky-300" title={p.url}>{short(p.url)}</a></td>
                  <td className="px-3 py-1.5 text-slate-400">{p.kind === 'own' ? <span className="text-emerald-300">Yours</span> : r.kinds.find((k) => k.kind === p.kind)?.label}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-slate-200">{p.pins.length} <span className="text-slate-500">({pct(p.pinShare)})</span></td>
                  {r.weighted && <td className="px-3 py-1.5 text-right tabular-nums text-slate-300">{pct(p.powerShare)}</td>}
                  <td className="px-3 py-1.5 text-right tabular-nums text-slate-400">{p.avgSlot ?? '–'}</td>
                  <td className="px-3 py-1.5">{p.kind === 'own' ? '' : p.present === true ? <span className="text-emerald-300">Yes</span> : p.present === false ? <span className="text-amber-300">No{p.competitors ? ` · ${p.competitors} rival${p.competitors === 1 ? '' : 's'} are` : ''}</span> : checks[p.url]?.note === 'blocked' ? <span className="text-slate-500">site refused</span> : checks[p.url]?.note === 'unreachable' ? <span className="text-slate-500">could not be read</span> : <span className="text-slate-600">not checked</span>}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-slate-300">{Math.round(p.score)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {r.pages.length > 10 && <button type="button" onClick={() => setAllPages(!allPages)} className="mt-2 text-xs text-sky-400 hover:underline">{allPages ? 'Show fewer' : `Show all ${r.pages.length}`}</button>}
        <p className="mt-2 text-[11px] text-slate-500">Score, 0 to 100: mostly {r.weighted ? 'the buying power (owner-occupied homes × household income, from the Census) of the points that cited the page' : 'how many points cited the page'}, then how early in the answer it was cited and how many rivals are on it. Points read before November 2026 recorded only the website, not the page.</p>
      </div>
    </div>
  );
}
