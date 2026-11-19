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
type Pic = { name: string; url: string; thumb: string; added: string | null };
type Media = { total: number; cover: Pic | null; logo: Pic | null; recent: Pic[]; added?: string };
/** The social pages Google takes as attributes, pulled out into a row of their own. */
const SOCIAL: [RegExp, string][] = [[/url_facebook$/, 'Facebook'], [/url_instagram$/, 'Instagram'], [/url_linkedin$/, 'LinkedIn'], [/url_youtube$/, 'YouTube'], [/url_tiktok$/, 'TikTok'], [/url_(twitter|x)$/, 'X (Twitter)'], [/url_pinterest$/, 'Pinterest']];
const socialName = (a: Attr) => (a.kind === 'URL' ? SOCIAL.find(([re]) => re.test(a.name))?.[1] ?? null : null);
const BOOKING = ['APPOINTMENT', 'ONLINE_APPOINTMENT'];
/** A link tagged so Analytics can tell bookings that came from the listing. */
function tagged(uri: string, campaign: string): string {
  try {
    const u = new URL(uri.trim());
    u.searchParams.set('utm_source', 'google'); u.searchParams.set('utm_medium', 'organic'); u.searchParams.set('utm_campaign', campaign);
    return u.toString();
  } catch {
    return uri;
  }
}

export default function GbpExtras({ profile, location, website, onLoaded }: { profile: string; location: string; /** The listing's website, offered as a start for a booking link. */ website?: string; /** Told what the listing has, each time it is read. */ onLoaded?: (x: Extras) => void }) {
  const [media, setMedia] = useState<Media | null>(null);
  const [mediaError, setMediaError] = useState('');
  const [photo, setPhoto] = useState({ url: '', category: 'ADDITIONAL' });
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
    setX(r); onLoaded?.(r);
    // Social links and the other attributes share one list on Google but are saved apart here.
    const isSocial = (name: string) => SOCIAL.some(([re]) => re.test(name));
    if (!part) setWant({});
    else if (part === 'attributes' || part === 'social') setWant((w) => Object.fromEntries(Object.entries(w).filter(([k]) => isSocial(k) !== (part === 'social'))));
    if (!part || part === 'services') setRows(rowsOf(r.services.list));
    if (!part || part === 'links') { setUris({}); setLink((l) => ({ ...l, type: r.links.types[0] ?? '', uri: '' })); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    setX(null); setError(''); setDone(null);
    call<Extras>(`/api/admin/gbp/extras?profile=${encodeURIComponent(profile)}&location=${encodeURIComponent(location)}`).then((r) => take(r)).catch((e) => setError(e instanceof Error ? e.message : 'Could not read the listing.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, location]);
  useEffect(() => {
    setMedia(null); setMediaError('');
    call<Media>(`/api/admin/gbp/media?profile=${encodeURIComponent(profile)}&location=${encodeURIComponent(location)}`).then(setMedia).catch((e) => setMediaError(e instanceof Error ? e.message : 'Could not read the photos.'));
  }, [profile, location]);
  const addPhoto = async () => {
    setBusy('photo'); setMediaError(''); setDone(null);
    try {
      const r = await call<Media>('/api/admin/gbp/media', { profile, location, url: photo.url, category: photo.category });
      setMedia(r); setPhoto({ url: '', category: 'ADDITIONAL' });
      setDone({ part: 'photo', lines: [photo.category === 'COVER' ? 'New cover photo' : photo.category === 'LOGO' ? 'New logo' : 'Photo added'] });
    } catch (e) {
      setMediaError(e instanceof Error ? e.message : 'The photo was not added.');
    } finally {
      setBusy('');
    }
  };

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

  const every = x?.attributes.list ?? [];
  const social = every.filter((a) => socialName(a));
  // Social pages have their own row; everything else stays in the attribute list.
  const attrs = every.filter((a) => !socialName(a));
  const changedSocial = social.filter((a) => a.name in want && !sameValue(a.value, want[a.name]));
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
        <h3 className="font-semibold">Structured facts and media</h3>
        <p className="mt-1 text-xs text-slate-500">What Google shows on the listing and draws on for its AI answers. Each part here has its own Save button and goes to Google at once; it is not part of the changes waiting in the bar at the foot of the page.</p>
      </div>
      {error && <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>}

      <details id="gbp-services" className="scroll-mt-20 rounded-lg border border-slate-800 bg-slate-950/40 p-4">
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

      <details id="gbp-social" open className="scroll-mt-20 rounded-lg border border-slate-800 bg-slate-950/40 p-4">
        <summary className="cursor-pointer text-sm font-semibold">Social links <span className="ml-1 font-normal text-slate-500">{social.filter((a) => (a.value as string[]).length > 0).length} of {social.length} set</span></summary>
        {social.length === 0 ? <p className="mt-3 text-sm text-slate-400">Google offers no social links for this listing’s category.</p> : (
          <div className="mt-3 space-y-2">
            <div className="grid gap-2 sm:grid-cols-2">
              {social.map((a) => (
                <label key={a.name} className="block text-xs text-slate-400">{socialName(a)}
                  <input className={input + ' mt-1'} placeholder="https://" value={(valueOf(a) as string[])[0] ?? ''} onChange={(e) => setAttr(a, e.target.value.trim() ? [e.target.value.trim()] : [])} />
                </label>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" disabled={Boolean(busy) || !changedSocial.length} onClick={() => send('social', { kind: 'attributes', want: Object.fromEntries(changedSocial.map((a) => [a.name, want[a.name]])) })} className={save}>{busy === 'social' ? 'Saving…' : 'Save social links'}</button>
              <span className="text-xs text-slate-500">The business’s own pages only. Google shows them on the listing and uses them to tie the business to its profiles.</span>
            </div>
            <Done part="social" />
          </div>
        )}
      </details>

      <details id="gbp-photos" open className="scroll-mt-20 rounded-lg border border-slate-800 bg-slate-950/40 p-4">
        <summary className="cursor-pointer text-sm font-semibold">Photos: cover and logo <span className="ml-1 font-normal text-slate-500">{media ? `${media.total} photo${media.total === 1 ? '' : 's'} on the listing` : ''}</span></summary>
        {mediaError && <p className="mt-3 text-sm text-amber-300">{mediaError}</p>}
        {!media && !mediaError && <p className="mt-3 text-sm text-slate-400">Reading the photos…</p>}
        {media && (
          <div className="mt-3 space-y-3">
            <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
              {([['Cover', media.cover, 'aspect-[16/9]'], ['Logo', media.logo, 'aspect-square max-w-40']] as const).map(([name, p, shape]) => (
                <div key={name}>
                  <p className="text-xs text-slate-400">{name}{p?.added ? <span className="text-slate-600"> · added {new Date(p.added).toLocaleDateString()}</span> : ''}</p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {p ? <img src={p.thumb} alt={name + ' photo'} referrerPolicy="no-referrer" className={'mt-1 w-full rounded-lg border border-slate-800 object-cover ' + shape} /> : <div className={'mt-1 flex w-full items-center justify-center rounded-lg border border-dashed border-amber-400/50 text-xs text-amber-200 ' + shape}>No {name.toLowerCase()} set</div>}
                </div>
              ))}
            </div>
            {media.recent.length > 0 && (
              <div className="flex gap-1.5 overflow-x-auto">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {media.recent.map((p) => <img key={p.name} src={p.thumb} alt="" referrerPolicy="no-referrer" className="h-14 w-14 shrink-0 rounded-md border border-slate-800 object-cover" />)}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <select aria-label="Where the photo goes" className={input.replace('w-full ', '')} value={photo.category} onChange={(e) => setPhoto({ ...photo, category: e.target.value })}>
                {[['ADDITIONAL', 'A photo'], ['COVER', 'The cover (replaces it)'], ['LOGO', 'The logo (replaces it)'], ['EXTERIOR', 'Outside'], ['INTERIOR', 'Inside'], ['AT_WORK', 'At work'], ['TEAMS', 'The team'], ['PRODUCT', 'A product']].map(([v, t]) => <option key={v} value={v}>{t}</option>)}
              </select>
              <input className={input + ' min-w-0 flex-1'} placeholder="https:// public link to the image" value={photo.url} onChange={(e) => setPhoto({ ...photo, url: e.target.value })} />
              <button type="button" disabled={Boolean(busy) || !photo.url.trim()} onClick={addPhoto} className={save}>{busy === 'photo' ? 'Sending…' : 'Add photo'}</button>
            </div>
            <p className="text-xs text-slate-500">Google downloads the image itself from the link, so it must open without a login: at least 250 × 250 pixels and under 5 MB. A new photo can take a few minutes to show, and Google drops one that breaks its rules without saying so.</p>
            <Done part="photo" />
          </div>
        )}
      </details>

      <details id="gbp-attributes" className="scroll-mt-20 rounded-lg border border-slate-800 bg-slate-950/40 p-4">
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

      <details id="gbp-links" className="scroll-mt-20 rounded-lg border border-slate-800 bg-slate-950/40 p-4">
        <summary className="cursor-pointer text-sm font-semibold">Booking and ordering links <span className="ml-1 font-normal text-slate-500">{x.links.list.length || 'none'}</span></summary>
        {x.links.problem ? <p className="mt-3 text-sm text-amber-300">{x.links.problem}</p> : (
          <div className="mt-3 space-y-3">
            {x.links.types.some((t) => BOOKING.includes(t)) && !x.links.list.some((l) => BOOKING.includes(l.type)) && (
              <div className="rounded-lg border border-amber-400/40 bg-amber-400/5 p-3">
                <p className="text-sm font-semibold text-amber-100">No appointment link yet</p>
                <p className="mt-0.5 text-xs text-amber-200/80">It puts a “Book” button on the listing. Point it at the booking or contact page, tagged so Analytics shows the bookings that came from Google.</p>
                <button type="button" onClick={() => setLink({ type: x.links.types.find((t) => BOOKING.includes(t)) ?? link.type, uri: tagged(link.uri.trim() || website || '', 'gbp_appointment'), preferred: true })} className={quiet + ' mt-2'}>Start one from the website, tagged</button>
              </div>
            )}
            {x.links.list.map((l) => (
              <div key={l.name} className="rounded-lg border border-slate-800 p-3">
                <p className="text-xs text-slate-400">{ACTION_TYPES[l.type] ?? l.type}{l.preferred && <span className="ml-2 text-emerald-300">shown first</span>}{!l.editable && <span className="ml-2 rounded-full border border-slate-600 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-400" title="Added by a booking partner (Google marks it as third-party): only they can change or remove it.">third party · locked</span>}{l.editable && <span className="ml-2 rounded-full border border-emerald-500/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-emerald-300">yours</span>}</p>
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
                <button type="button" disabled={!link.uri.trim()} onClick={() => setLink({ ...link, uri: tagged(link.uri, BOOKING.includes(link.type) ? 'gbp_appointment' : 'gbp_' + link.type.toLowerCase()) })} className={quiet} title="Adds utm_source=google, utm_medium=organic and a campaign for this kind of link">Add tracking tag</button>
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
