'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ACTION_TYPES, SERVICE_DESCRIPTION_MAX, SERVICE_NAME_MAX, type ActionLink, type Attr, type AttrValue, type Service } from '@stakeout/core/gbpExtras';

type Extras = {
  attributes: { list: Attr[]; problem: string | null };
  services: { list: Service[]; suggested: { typeId: string; name: string }[]; canEdit: boolean; problem: string | null };
  links: { list: ActionLink[]; types: string[]; problem: string | null };
};
type Row = { key?: string; typeId?: string; name: string; description: string; kind: 'structured' | 'free' };

const card = 'rounded-xl border border-slate-800 bg-slate-900 p-5';
const input = 'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500 disabled:opacity-50';
const save = 'rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-40';
const quiet = 'rounded-lg border border-slate-700 px-3 py-1.5 text-sm hover:border-slate-500 disabled:opacity-40';

async function call<T>(url: string, body?: unknown): Promise<T> {
  const r = await fetch(url, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Request failed.');
  return j as T;
}
const sameValue = (a: AttrValue, b: AttrValue) => (Array.isArray(a) && Array.isArray(b) ? a.length === b.length && a.every((x, i) => x === b[i]) : a === b);
const rowsOf = (list: Service[]): Row[] => list.map((s) => ({ key: s.key, name: s.name, description: s.description, kind: s.kind }));

/** Attributes, services and action links for one listing. Each part saves on its own. */
export default function GbpExtras({ profile, location }: { profile: string; location: string }) {
  const [x, setX] = useState<Extras | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [done, setDone] = useState<{ part: string; lines: string[] } | null>(null);
  const [want, setWant] = useState<Record<string, AttrValue>>({});
  const [find, setFind] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [fresh, setFresh] = useState('');
  const [link, setLink] = useState({ type: '', uri: '', preferred: true });
  const [uris, setUris] = useState<Record<string, string>>({});

  // After a save only the part that was saved starts again from Google: edits waiting in the others are kept.
  const take = useCallback((r: Extras, part?: string) => {
    setX(r);
    if (!part || part === 'attributes') setWant({});
    if (!part || part === 'services') setRows(rowsOf(r.services.list));
    if (!part || part === 'links') { setUris({}); setLink((l) => ({ ...l, type: r.links.types[0] ?? '', uri: '' })); }
  }, []);
  useEffect(() => {
    setX(null); setError(''); setDone(null);
    call<Extras>(`/api/admin/gbp/extras?profile=${encodeURIComponent(profile)}&location=${encodeURIComponent(location)}`).then((r) => take(r)).catch((e) => setError(e instanceof Error ? e.message : 'Could not read the listing.'));
  }, [profile, location, take]);

  const send = async (part: string, body: Record<string, unknown>) => {
    setBusy(part); setError(''); setDone(null);
    try {
      const r = await call<Extras & { changed: string[] }>('/api/admin/gbp/extras', { profile, location, ...body });
      take(r, part); setDone({ part, lines: r.changed });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The edit failed.');
    } finally {
      setBusy('');
    }
  };

  const attrs = x?.attributes.list ?? [];
  const changedAttrs = attrs.filter((a) => a.name in want && !sameValue(a.value, want[a.name]));
  const groups = useMemo(() => {
    const q = find.trim().toLowerCase();
    const out = new Map<string, Attr[]>();
    for (const a of attrs) if (!q || a.label.toLowerCase().includes(q) || a.group.toLowerCase().includes(q)) out.set(a.group, [...(out.get(a.group) ?? []), a]);
    return [...out];
  }, [attrs, find]);
  const valueOf = (a: Attr) => (a.name in want ? want[a.name] : a.value);
  const setAttr = (a: Attr, v: AttrValue) => { setWant((w) => ({ ...w, [a.name]: v })); setDone(null); };

  const live = x?.services.list ?? [];
  const servicesChanged = rows.length !== live.length || rows.some((r, i) => r.key !== live[i]?.key || r.description.trim() !== live[i].description);
  const tooLong = rows.find((r) => r.description.trim().length > SERVICE_DESCRIPTION_MAX);
  const setRow = (i: number, description: string) => { setRows((rs) => rs.map((r, j) => (j === i ? { ...r, description } : r))); setDone(null); };
  const addFresh = () => {
    const name = fresh.trim();
    if (!name || rows.some((r) => r.name.toLowerCase() === name.toLowerCase())) return;
    setRows((rs) => [...rs, { name, description: '', kind: 'free' }]); setFresh(''); setDone(null);
  };
  const suggested = (x?.services.suggested ?? []).filter((s) => !rows.some((r) => r.typeId === s.typeId));

  if (error && !x) return <section className={card}><h3 className="font-semibold">Attributes, services and links</h3><p className="mt-2 text-sm text-rose-300">{error}</p></section>;
  if (!x) return <section className={card}><h3 className="font-semibold">Attributes, services and links</h3><p className="mt-2 text-sm text-slate-400">Reading them from Google…</p></section>;

  const Done = ({ part }: { part: string }) => (done?.part === part ? <p className="mt-2 text-xs text-emerald-300">Sent to Google: {done.lines.join(' · ')}</p> : null);

  return (
    <section className={card + ' space-y-3'}>
      <div>
        <h3 className="font-semibold">Attributes, services and links</h3>
        <p className="mt-1 text-xs text-slate-500">The structured facts Google shows on the listing and draws on for its AI answers. Each part is saved on its own.</p>
      </div>
      {error && <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>}

      <details className="rounded-lg border border-slate-800 bg-slate-950/40 p-4">
        <summary className="cursor-pointer text-sm font-semibold">Services <span className="ml-1 font-normal text-slate-500">{live.length} listed · {live.filter((s) => !s.description).length} without a description</span></summary>
        {x.services.problem ? <p className="mt-3 text-sm text-amber-300">{x.services.problem}</p> : !x.services.canEdit ? <p className="mt-3 text-sm text-slate-400">Google does not offer a service list for this listing’s category.</p> : (
          <div className="mt-3 space-y-3">
            {rows.map((r, i) => (
              <div key={r.key ?? r.typeId ?? 'new' + r.name} className="rounded-lg border border-slate-800 p-3">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm font-medium">{r.name}{!r.key && <span className="ml-2 text-xs text-emerald-300">new</span>}{r.kind === 'free' && <span className="ml-2 text-xs text-slate-500">your own wording</span>}</p>
                  <button type="button" onClick={() => { setRows((rs) => rs.filter((_, j) => j !== i)); setDone(null); }} className="shrink-0 text-xs text-slate-400 hover:text-rose-300">Remove</button>
                </div>
                <textarea className={input + ' mt-2 h-16'} value={r.description} onChange={(e) => setRow(i, e.target.value)} placeholder="What it is, who it is for, what it costs" />
                <p className={'mt-0.5 text-right text-[11px] ' + (r.description.trim().length > SERVICE_DESCRIPTION_MAX ? 'text-rose-300' : 'text-slate-600')}>{r.description.trim().length} / {SERVICE_DESCRIPTION_MAX}</p>
              </div>
            ))}
            {!rows.length && <p className="text-sm text-slate-400">No services listed.</p>}
            {suggested.length > 0 && (
              <div>
                <p className="text-xs text-slate-400">Google’s own services for this listing’s categories that are not listed yet:</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {suggested.slice(0, 40).map((s) => <button key={s.typeId} type="button" onClick={() => { setRows((rs) => [...rs, { typeId: s.typeId, name: s.name, description: '', kind: 'structured' }]); setDone(null); }} className="rounded-full border border-slate-700 px-2.5 py-1 text-xs hover:border-emerald-500">+ {s.name}</button>)}
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <input className={input} value={fresh} maxLength={SERVICE_NAME_MAX} onChange={(e) => setFresh(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addFresh())} placeholder="Add a service in your own words, e.g. Semaglutide" />
              <button type="button" onClick={addFresh} disabled={!fresh.trim()} className={quiet + ' shrink-0'}>Add</button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" disabled={Boolean(busy) || !servicesChanged || Boolean(tooLong)} onClick={() => send('services', { kind: 'services', want: rows.map((r) => ({ key: r.key, typeId: r.typeId, name: r.name, description: r.description })) })} className={save}>{busy === 'services' ? 'Saving…' : 'Save services'}</button>
              {servicesChanged && <button type="button" onClick={() => setRows(rowsOf(live))} className="text-xs text-slate-400 hover:underline">Undo changes</button>}
              {tooLong && <span className="text-xs text-rose-300">{tooLong.name}: the description is too long.</span>}
            </div>
            <Done part="services" />
          </div>
        )}
      </details>

      <details className="rounded-lg border border-slate-800 bg-slate-950/40 p-4">
        <summary className="cursor-pointer text-sm font-semibold">Attributes <span className="ml-1 font-normal text-slate-500">{attrs.filter((a) => (Array.isArray(a.value) ? a.value.length : a.value !== null)).length} of {attrs.length} set</span></summary>
        {x.attributes.problem ? <p className="mt-3 text-sm text-amber-300">{x.attributes.problem}</p> : (
          <div className="mt-3 space-y-4">
            <input className={input} placeholder="Find an attribute, e.g. wheelchair, payment, Instagram" value={find} onChange={(e) => setFind(e.target.value)} />
            {groups.map(([group, list]) => (
              <div key={group}>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{group}</p>
                <div className="mt-1.5 divide-y divide-slate-800/70">
                  {list.map((a) => {
                    const v = valueOf(a), dirty = a.name in want && !sameValue(a.value, want[a.name]);
                    return (
                      <div key={a.name} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 py-2">
                        <span className={'text-sm ' + (dirty ? 'text-emerald-300' : 'text-slate-200')}>{a.label}</span>
                        {a.kind === 'BOOL' && (
                          <span className="flex overflow-hidden rounded-lg border border-slate-700 text-xs">
                            {([[true, 'Yes'], ...(a.canSayNo ? [[false, 'No']] : []), [null, 'Not stated']] as [boolean | null, string][]).map(([val, label]) => (
                              <button key={label} type="button" aria-pressed={v === val} onClick={() => setAttr(a, val)} className={'px-2.5 py-1 ' + (v === val ? (val === true ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-white') : 'text-slate-400 hover:bg-slate-800')}>{label}</button>
                            ))}
                          </span>
                        )}
                        {a.kind === 'URL' && <textarea aria-label={a.label} className={input + ' h-auto basis-full sm:max-w-md sm:basis-auto'} rows={Math.max(1, (v as string[]).length)} value={(v as string[]).join('\n')} placeholder="https://" onChange={(e) => setAttr(a, e.target.value.split('\n').map((s) => s.trim()).filter(Boolean))} />}
                        {a.kind === 'ENUM' && <select aria-label={a.label} className={input.replace('w-full ', '')} value={(v as string[])[0] ?? ''} onChange={(e) => setAttr(a, e.target.value ? [e.target.value] : [])}><option value="">Not stated</option>{a.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>}
                        {a.kind === 'REPEATED_ENUM' && (
                          <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-300">
                            {a.options.map((o) => <label key={o.value} className="flex items-center gap-1.5"><input type="checkbox" className="accent-emerald-500" checked={(v as string[]).includes(o.value)} onChange={(e) => setAttr(a, e.target.checked ? [...(v as string[]), o.value] : (v as string[]).filter((y) => y !== o.value))} />{o.label}</label>)}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            {!groups.length && <p className="text-sm text-slate-400">{attrs.length ? 'No attribute matches that.' : 'Google offers no attributes for this listing.'}</p>}
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" disabled={Boolean(busy) || !changedAttrs.length} onClick={() => send('attributes', { kind: 'attributes', want: Object.fromEntries(changedAttrs.map((a) => [a.name, want[a.name]])) })} className={save}>{busy === 'attributes' ? 'Saving…' : changedAttrs.length ? `Save ${changedAttrs.length} attribute${changedAttrs.length === 1 ? '' : 's'}` : 'Save attributes'}</button>
              {changedAttrs.length > 0 && <button type="button" onClick={() => setWant({})} className="text-xs text-slate-400 hover:underline">Undo changes</button>}
              <span className="text-xs text-slate-500">Only say what is true of the business: customers can report an attribute that is wrong.</span>
            </div>
            <Done part="attributes" />
          </div>
        )}
      </details>

      <details className="rounded-lg border border-slate-800 bg-slate-950/40 p-4">
        <summary className="cursor-pointer text-sm font-semibold">Booking and ordering links <span className="ml-1 font-normal text-slate-500">{x.links.list.length || 'none'}</span></summary>
        {x.links.problem ? <p className="mt-3 text-sm text-amber-300">{x.links.problem}</p> : (
          <div className="mt-3 space-y-3">
            {x.links.list.map((l) => (
              <div key={l.name} className="rounded-lg border border-slate-800 p-3">
                <p className="text-xs text-slate-400">{ACTION_TYPES[l.type] ?? l.type}{l.preferred && <span className="ml-2 text-emerald-300">shown first</span>}{!l.editable && <span className="ml-2 text-slate-500">added by a booking partner: only they can change it</span>}</p>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  <input className={input + ' min-w-0 flex-1'} disabled={!l.editable} value={uris[l.name] ?? l.uri} onChange={(e) => setUris((u) => ({ ...u, [l.name]: e.target.value }))} />
                  {l.editable && <>
                    <button type="button" disabled={Boolean(busy) || (uris[l.name] ?? l.uri) === l.uri} onClick={() => send('links', { kind: 'link-update', name: l.name, uri: uris[l.name], preferred: l.preferred })} className={quiet}>Save link</button>
                    {!l.preferred && <button type="button" disabled={Boolean(busy)} onClick={() => send('links', { kind: 'link-update', name: l.name, uri: uris[l.name] ?? l.uri, preferred: true })} className={quiet}>Show first</button>}
                    <button type="button" disabled={Boolean(busy)} onClick={() => send('links', { kind: 'link-delete', name: l.name })} className="px-2 text-xs text-slate-400 hover:text-rose-300">Remove</button>
                  </>}
                </div>
              </div>
            ))}
            {x.links.types.length === 0 ? <p className="text-sm text-slate-400">Google does not offer booking or ordering links for this listing’s category.</p> : (
              <div className="flex flex-wrap gap-2">
                <select aria-label="What the link does" className={input.replace('w-full ', '')} value={link.type} onChange={(e) => setLink({ ...link, type: e.target.value })}>{x.links.types.map((t) => <option key={t} value={t}>{ACTION_TYPES[t] ?? t}</option>)}</select>
                <input className={input + ' min-w-0 flex-1'} placeholder="https:// booking or ordering page" value={link.uri} onChange={(e) => setLink({ ...link, uri: e.target.value })} />
                <button type="button" disabled={Boolean(busy) || !link.uri.trim()} onClick={() => send('links', { kind: 'link-add', uri: link.uri, type: link.type, preferred: link.preferred })} className={save}>{busy === 'links' ? 'Saving…' : 'Add link'}</button>
              </div>
            )}
            <Done part="links" />
          </div>
        )}
      </details>
    </section>
  );
}
