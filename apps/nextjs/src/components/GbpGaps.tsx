'use client';
import { useCallback, useEffect, useState } from 'react';
import type { Gap, Gaps } from '@stakeout/core/gbpGaps';

type Data = {
  gaps: Gaps;
  scan: { id: string; keyword: string; at: string } | null;
  top: { name: string; points: number }[];
  rivals: { name: string; categories: number; attributes: number; photos: number | null; rating: number | null; reviews: number | null }[];
  missing: string[];
  lookup: { ready: boolean; problem: string | null; lookedUp: number };
  current: { additionalCategories: { name: string; displayName?: string }[] };
  problems: string[];
};
type Part = 'categories' | 'attributes' | 'services';

const card = 'rounded-xl border border-slate-800 bg-slate-900 p-5';
async function call<T>(url: string, body?: unknown): Promise<T> {
  const r = await fetch(url, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Request failed.');
  return j as T;
}

function Backed({ g, of }: { g: Gap; of: number }) {
  if (!of) return null;
  return g.rivals.length ? <span title={g.rivals.join(', ')} className="ml-2 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300">{g.rivals.length} of {of} top rivals</span> : null;
}

/**
 * What this listing is missing against its top rivals on the latest scan and against everything
 * Google offers its categories, with one button that adds what is ticked. Nothing is ticked to
 * begin with: only what is true of the business belongs on its listing. `onApplied` lets the page
 * re-read the listing afterwards.
 */
export default function GbpGaps({ profile, location, onApplied }: { profile: string; location: string; onApplied: () => void }) {
  const [d, setD] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [picked, setPicked] = useState<Record<Part, string[]>>({ categories: [], attributes: [], services: [] });
  const [done, setDone] = useState<string[] | null>(null);
  const [more, setMore] = useState<Record<string, boolean>>({});
  const base = `/api/admin/gbp/gaps?profile=${encodeURIComponent(profile)}&location=${encodeURIComponent(location)}`;

  const load = useCallback(async (lookup: boolean) => {
    setError('');
    try { setD(await call<Data>(base + (lookup ? '&lookup=1' : ''))); } catch (e) { setError(e instanceof Error ? e.message : 'Could not work out the gaps.'); }
  }, [base]);
  useEffect(() => { setD(null); setDone(null); setPicked({ categories: [], attributes: [], services: [] }); load(false); }, [load]);

  const toggle = (part: Part, id: string) => { setDone(null); setPicked((p) => ({ ...p, [part]: p[part].includes(id) ? p[part].filter((x) => x !== id) : [...p[part], id] })); };
  const count = picked.categories.length + picked.attributes.length + picked.services.length;

  const lookUp = async () => { setBusy('lookup'); await load(true); setBusy(''); };
  // Each kind goes through the editor's own route for it, with that route's checks: categories
  // first (a new category brings new services and attributes with it), then services, then attributes.
  const apply = async () => {
    if (!d) return;
    setBusy('apply'); setError(''); setDone(null);
    const said: string[] = [];
    try {
      if (picked.categories.length) {
        const add = d.gaps.categories.filter((c) => picked.categories.includes(c.id)).map((c) => ({ name: c.id, displayName: c.label }));
        await call('/api/admin/gbp/update', { profile, location, change: { additionalCategories: [...d.current.additionalCategories, ...add] } });
        said.push(`${add.length} categor${add.length === 1 ? 'y' : 'ies'} added`);
      }
      if (picked.services.length) {
        const x = await call<{ services: { list: { key: string; description: string }[] } }>(`/api/admin/gbp/extras?profile=${encodeURIComponent(profile)}&location=${encodeURIComponent(location)}`);
        const add = d.gaps.services.filter((s) => picked.services.includes(s.id)).map((s) => ({ typeId: s.id, name: s.label, description: '' }));
        await call('/api/admin/gbp/extras', { profile, location, kind: 'services', want: [...x.services.list.map((s) => ({ key: s.key, description: s.description })), ...add] });
        said.push(`${add.length} service${add.length === 1 ? '' : 's'} added`);
      }
      if (picked.attributes.length) {
        await call('/api/admin/gbp/extras', { profile, location, kind: 'attributes', want: Object.fromEntries(picked.attributes.map((id) => [id, true])) });
        said.push(`${picked.attributes.length} attribute${picked.attributes.length === 1 ? '' : 's'} set to yes`);
      }
      setPicked({ categories: [], attributes: [], services: [] });
      setDone(said);
      onApplied();
      await load(false);
    } catch (e) {
      // What went through before the failure is kept and said, so nothing is applied twice.
      setError((said.length ? said.join(', ') + '. Then: ' : '') + (e instanceof Error ? e.message : 'The edit failed.'));
      onApplied();
      await load(false);
      setPicked({ categories: [], attributes: [], services: [] });
    } finally {
      setBusy('');
    }
  };

  if (error && !d) return <section className={card}><h3 className="font-semibold">Gaps against your top rivals</h3><p className="mt-2 text-sm text-rose-300">{error}</p></section>;
  if (!d) return <section className={card}><h3 className="font-semibold">Gaps against your top rivals</h3><p className="mt-2 text-sm text-slate-400">Comparing the listing…</p></section>;

  const of = d.rivals.length;
  const total = d.gaps.categories.length + d.gaps.attributes.length + d.gaps.services.length + d.gaps.links.length;
  const List = ({ part, items, cap = 8 }: { part: Part; items: Gap[]; cap?: number }) => {
    const shown = more[part] ? items : items.slice(0, cap);
    return (
      <>
        <ul className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
          {shown.map((g) => {
            const full = part === 'categories' && !picked.categories.includes(g.id) && picked.categories.length >= d.gaps.categoryRoom;
            return (
              <li key={g.id}>
                <label className={'flex items-start gap-2 py-1 text-sm ' + (full ? 'opacity-40' : 'cursor-pointer')}>
                  <input type="checkbox" className="mt-0.5 accent-emerald-500" checked={picked[part].includes(g.id)} disabled={Boolean(busy) || full} onChange={() => toggle(part, g.id)} />
                  <span className="min-w-0"><span className="text-slate-200">{g.label}</span>{g.group && <span className="ml-2 text-xs text-slate-500">{g.group}</span>}<Backed g={g} of={of} /></span>
                </label>
              </li>
            );
          })}
        </ul>
        {items.length > cap && <button type="button" onClick={() => setMore((m) => ({ ...m, [part]: !m[part] }))} className="mt-1 text-xs text-sky-400 hover:underline">{more[part] ? 'Show fewer' : `Show all ${items.length}`}</button>}
      </>
    );
  };

  return (
    <section className={card + ' space-y-4'}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">Gaps against your top rivals</h3>
          <p className="mt-1 text-xs text-slate-500">
            {!d.scan ? 'No finished scan of this business yet, so there are no rivals to compare with. Listed below is what Google offers this listing that it has not filled in.' : (
              <>From the scan for “{d.scan.keyword}” on {new Date(d.scan.at).toLocaleDateString()}: {d.top.map((t) => `${t.name} (top 3 at ${t.points} point${t.points === 1 ? '' : 's'})`).join(', ') || 'no rivals ranked in the top three'}.</>
            )}
          </p>
        </div>
        {d.scan && d.top.length > 0 && d.lookup.ready && (of < d.top.length) && <button type="button" onClick={lookUp} disabled={Boolean(busy)} className="shrink-0 rounded-lg border border-slate-700 px-3 py-2 text-sm hover:border-slate-500 disabled:opacity-40">{busy === 'lookup' ? 'Reading their listings…' : `Read ${d.top.length - of} rival listing${d.top.length - of === 1 ? '' : 's'}`}</button>}
      </div>

      {d.scan && d.top.length > 0 && !d.lookup.ready && <p className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-400">Rival listings are not being read yet: add <code className="text-slate-200">DATAFORSEO_LOGIN</code> and <code className="text-slate-200">DATAFORSEO_PASSWORD</code> on Vercel and redeploy. Until then this shows what Google offers the listing, without saying which rivals have it, and suggests no categories.</p>}
      {d.lookup.problem && <p className="text-xs text-amber-300">{d.lookup.problem}</p>}
      {of > 0 && d.missing.length > 0 && <p className="text-xs text-slate-500">No matching listing was found for {d.missing.join(', ')}.</p>}
      {of > 0 && (
        <ul className="flex flex-wrap gap-2 text-xs text-slate-400">
          {d.rivals.map((r) => <li key={r.name} className="rounded-lg border border-slate-800 bg-slate-950/60 px-2.5 py-1.5"><span className="text-slate-200">{r.name}</span> · {r.categories} categor{r.categories === 1 ? 'y' : 'ies'} · {r.attributes} attributes{r.reviews !== null ? ` · ${r.rating ?? '–'}★ from ${r.reviews.toLocaleString('en-US')}` : ''}{r.photos !== null ? ` · ${r.photos} photos` : ''}</li>)}
        </ul>
      )}
      {d.problems.map((p) => <p key={p} className="text-xs text-amber-300">{p}</p>)}
      {error && <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>}
      {done && <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">Sent to Google: {done.join(', ')}.</p>}

      {total === 0 && <p className="text-sm text-slate-400">Nothing missing: every service, attribute and link Google offers this listing is filled in{of ? ', and it has every category its top rivals use' : ''}.</p>}

      {d.gaps.categories.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold">Additional categories your rivals use <span className="ml-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-normal text-amber-300">May be held for review</span></h4>
          <p className="mt-1 text-xs text-amber-200/80">Only tick categories for services the business really performs. Room for {d.gaps.categoryRoom} more (Google allows nine). The primary category is never changed here.</p>
          <List part="categories" items={d.gaps.categories} cap={12} />
        </div>
      )}
      {d.gaps.services.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold">Services Google offers these categories <span className="ml-1 font-normal text-slate-500">{d.gaps.services.length} not on the listing</span></h4>
          <p className="mt-1 text-xs text-slate-500">Rivals’ own service lists are not public, so these are not marked by rival. Add descriptions afterwards under Services.</p>
          <List part="services" items={d.gaps.services} />
        </div>
      )}
      {d.gaps.attributes.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold">Attributes not answered <span className="ml-1 font-normal text-slate-500">{d.gaps.attributes.length}</span></h4>
          <p className="mt-1 text-xs text-slate-500">Ticking one sets it to “yes”. To say “no”, use Attributes below.</p>
          <List part="attributes" items={d.gaps.attributes} />
        </div>
      )}
      {d.gaps.links.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold">Booking and ordering links not set</h4>
          <ul className="mt-2 space-y-1 text-sm text-slate-300">{d.gaps.links.map((g) => <li key={g.id}>{g.label}<Backed g={g} of={of} /></li>)}</ul>
          <p className="mt-1 text-xs text-slate-500">A link needs its address, so add these under “Booking and ordering links” below.</p>
        </div>
      )}

      {(d.gaps.categories.length > 0 || d.gaps.services.length > 0 || d.gaps.attributes.length > 0) && (
        <div className="flex flex-wrap items-center gap-3 border-t border-slate-800 pt-4">
          <button type="button" onClick={apply} disabled={Boolean(busy) || !count} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-40">{busy === 'apply' ? 'Sending to Google…' : count ? `Add ${count} to the listing` : 'Tick what is true of the business'}</button>
          {count > 0 && <button type="button" onClick={() => setPicked({ categories: [], attributes: [], services: [] })} disabled={Boolean(busy)} className="text-xs text-slate-400 hover:underline">Clear</button>}
          <span className="text-xs text-slate-500">Each kind is built on the listing as Google has it at that moment.</span>
        </div>
      )}
    </section>
  );
}
