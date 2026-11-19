'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { BODY_MAX, CTA, emptyDraft, nextWeeklySlot, postProblem, type GbpPost, type PostDraft, type PostFormat } from '@stakeout/core/gbpPosts';

const card = 'rounded-xl border border-slate-800 bg-slate-900 p-5';
const input = 'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500 disabled:opacity-50';
const small = input.replace('w-full ', '');
const FORMATS: [PostFormat, string, string][] = [
  ['standard', 'Update', 'News, a tip, a finished job.'],
  ['offer', 'Offer', 'A deal with start and end dates.'],
  ['event', 'Event', 'Something happening on set dates.'],
  ['photo', 'Photo', 'One photo added to the listing.'],
];
const STATE: Record<GbpPost['state'], { text: string; tone: string }> = {
  scheduled: { text: 'Scheduled', tone: 'text-sky-300' },
  publishing: { text: 'Publishing…', tone: 'text-amber-300' },
  published: { text: 'On Google', tone: 'text-emerald-300' },
  failed: { text: 'Failed', tone: 'text-rose-300' },
  draft: { text: 'Draft', tone: 'text-slate-400' },
};
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SLOT_KEY = 'stakeout.gbp.weeklyslot';

async function call<T>(url: string, method = 'GET', body?: unknown): Promise<T> {
  const r = await fetch(url, { method, cache: 'no-store', ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Request failed.');
  return j as T;
}
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');
/** A moment as the value a date-and-time field takes, in the viewer's own time zone. */
const localValue = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

/**
 * A chosen photo, made ready for Google: JPG, at most 1600 px on its long side (well under the
 * 5 MB limit, and small enough to send in one request). Refuses one smaller than Google accepts.
 */
function prepareImage(file: File, minW: number, minH: number): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!/^image\/(jpeg|png)$/.test(file.type)) return reject(new Error('Choose a JPG or PNG photo.'));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      if (img.naturalWidth < minW || img.naturalHeight < minH) return reject(new Error(`That photo is too small: Google needs at least ${minW}×${minH} pixels.`));
      const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
      const ctx = c.getContext('2d');
      if (!ctx) return reject(new Error('This browser could not read the photo.'));
      // White behind a see-through PNG, which JPG cannot keep.
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', 0.86));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file could not be read as a photo.')); };
    img.src = url;
  });
}

/** Posts for one listing: write one, publish it now or schedule it, and see what is out and what is waiting. */
export default function GbpPosts({ profile, location }: { profile: string; location: string }) {
  const [posts, setPosts] = useState<GbpPost[] | null>(null);
  const [d, setD] = useState<PostDraft>(emptyDraft);
  const [later, setLater] = useState(false);
  const [slot, setSlot] = useState({ day: 1, time: '09:00' });
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [sure, setSure] = useState('');

  const load = useCallback(async () => {
    try {
      setPosts((await call<{ posts: GbpPost[] }>(`/api/admin/gbp/posts?profile=${encodeURIComponent(profile)}&location=${encodeURIComponent(location)}`)).posts);
    } catch (e) {
      setPosts([]); setError(e instanceof Error ? e.message : 'Could not read the posts.');
    }
  }, [profile, location]);
  useEffect(() => { setPosts(null); setD(emptyDraft()); setLater(false); setError(''); setNote(''); load(); }, [load]);
  // The weekly slot is remembered on this device.
  useEffect(() => {
    try { const s = JSON.parse(localStorage.getItem(SLOT_KEY) ?? 'null'); if (s && Number.isInteger(s.day) && typeof s.time === 'string') setSlot({ day: s.day, time: s.time }); } catch { /* none saved */ }
  }, []);
  const saveSlot = (s: { day: number; time: string }) => { setSlot(s); try { localStorage.setItem(SLOT_KEY, JSON.stringify(s)); } catch { /* not remembered */ } };

  const set = <K extends keyof PostDraft>(k: K, v: PostDraft[K]) => { setD((x) => ({ ...x, [k]: v })); setNote(''); };
  const scheduled = useMemo(() => (posts ?? []).filter((p) => p.state === 'scheduled' && p.at).map((p) => p.at as string), [posts]);
  const problem = postProblem(d);
  const dated = d.format === 'offer' || d.format === 'event';
  const untouched = !d.body && !d.image && !d.title && !d.startDate;

  const pickImage = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    try { set('image', await prepareImage(file, d.format === 'photo' ? 250 : 400, d.format === 'photo' ? 250 : 300)); } catch (e) { setError(e instanceof Error ? e.message : 'Photo not added.'); }
  };
  const send = async () => {
    setBusy('send'); setError(''); setNote('');
    try {
      await call('/api/admin/gbp/posts', 'POST', { profile, location, draft: d });
      setNote(d.scheduledAt ? 'Scheduled for ' + when(d.scheduledAt) + '.' : 'Sent. It shows as “On Google” below once Google has published it.');
      setD(emptyDraft()); setLater(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The post was not sent.');
    } finally {
      setBusy('');
    }
  };
  const remove = async (p: GbpPost) => {
    setBusy(p.id); setError('');
    try {
      await call(`/api/admin/gbp/posts?id=${encodeURIComponent(p.id)}${p.state === 'published' ? '&google=1' : ''}`, 'DELETE');
      setSure(''); await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The post was not removed.');
    } finally {
      setBusy('');
    }
  };

  return (
    <section className={card + ' space-y-4'}>
      <h3 className="font-semibold">Posts</h3>

      <div className="flex flex-wrap gap-1.5">
        {FORMATS.map(([f, label, hint]) => (
          <button key={f} type="button" title={hint} aria-pressed={d.format === f} onClick={() => set('format', f)} className={'rounded-full border px-3 py-1 text-sm ' + (d.format === f ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-300' : 'border-slate-700 text-slate-300 hover:border-slate-500')}>{label}</button>
        ))}
      </div>

      {dated && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="text-sm font-medium">{d.format === 'event' ? 'Event name' : 'Offer headline'} <span className="ml-1 text-xs text-slate-500">{d.title.length} / 58{d.format === 'offer' ? ' · optional' : ''}</span></label>
            <input className={input + ' mt-1.5'} value={d.title} onChange={(e) => set('title', e.target.value)} placeholder={d.format === 'event' ? 'Open house' : '10% off roof washing'} />
          </div>
          <div>
            <label className="text-sm font-medium">Starts</label>
            <div className="mt-1.5 flex gap-2"><input type="date" className={small} value={d.startDate} onChange={(e) => set('startDate', e.target.value)} /><input type="time" className={small} value={d.startTime} onChange={(e) => set('startTime', e.target.value)} aria-label="Start time (optional)" /></div>
          </div>
          <div>
            <label className="text-sm font-medium">Ends</label>
            <div className="mt-1.5 flex gap-2"><input type="date" className={small} value={d.endDate} onChange={(e) => set('endDate', e.target.value)} /><input type="time" className={small} value={d.endTime} onChange={(e) => set('endTime', e.target.value)} aria-label="End time (optional)" /></div>
          </div>
        </div>
      )}

      {d.format !== 'photo' && (
        <div>
          <label className="text-sm font-medium">{d.format === 'standard' ? 'Post' : 'Details'} <span className={'ml-1 text-xs ' + (d.body.trim().length > BODY_MAX ? 'text-rose-300' : 'text-slate-500')}>{d.body.trim().length} / {BODY_MAX}</span></label>
          <textarea className={input + ' mt-1.5 h-28'} value={d.body} onChange={(e) => set('body', e.target.value)} placeholder="What should customers know?" />
        </div>
      )}

      {d.format === 'offer' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="text-sm font-medium">Coupon code <span className="text-xs text-slate-500">optional</span></label><input className={input + ' mt-1.5'} value={d.coupon} onChange={(e) => set('coupon', e.target.value)} /></div>
          <div><label className="text-sm font-medium">Link to redeem <span className="text-xs text-slate-500">optional</span></label><input className={input + ' mt-1.5'} value={d.redeemUrl} onChange={(e) => set('redeemUrl', e.target.value)} placeholder="https://" /></div>
          <div className="sm:col-span-2"><label className="text-sm font-medium">Terms <span className="text-xs text-slate-500">optional</span></label><input className={input + ' mt-1.5'} value={d.terms} onChange={(e) => set('terms', e.target.value)} /></div>
        </div>
      )}

      <div>
        <label className="text-sm font-medium">Photo {d.format !== 'photo' && <span className="text-xs text-slate-500">optional</span>}</label>
        {d.image ? (
          <div className="mt-1.5 flex items-start gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={d.image} alt="The photo for this post" className="h-24 w-32 rounded-lg border border-slate-700 object-cover" />
            <button type="button" onClick={() => set('image', '')} className="text-sm text-slate-400 hover:text-rose-300">Remove photo</button>
          </div>
        ) : (
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <label className="cursor-pointer rounded-lg border border-slate-700 px-3 py-2 text-sm hover:border-slate-500">Choose a photo<input type="file" accept="image/jpeg,image/png" className="sr-only" onChange={(e) => { pickImage(e.target.files?.[0]); e.target.value = ''; }} /></label>
            <span className="text-xs text-slate-500">or</span>
            <input className={input + ' max-w-sm'} placeholder="https:// link to a JPG or PNG" onBlur={(e) => e.target.value.trim() && set('image', e.target.value.trim())} />
          </div>
        )}
        <p className="mt-1 text-xs text-slate-500">JPG or PNG. Large photos are made smaller before sending. One photo a post; Google does not take video here.</p>
      </div>

      {d.format !== 'photo' && (
        <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
          <div><label className="text-sm font-medium">Button</label><select className={input + ' mt-1.5'} value={d.cta} onChange={(e) => set('cta', e.target.value)}>{CTA.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select></div>
          {d.cta && d.cta !== 'CALL' && <div><label className="text-sm font-medium">Button link</label><input className={input + ' mt-1.5'} value={d.ctaUrl} onChange={(e) => set('ctaUrl', e.target.value)} placeholder="https://" /></div>}
          {d.cta === 'CALL' && <p className="self-end pb-2 text-xs text-slate-500">Calls the number on the listing.</p>}
        </div>
      )}

      <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <label className="flex items-center gap-2"><input type="radio" name="when" checked={!later} onChange={() => { setLater(false); set('scheduledAt', ''); }} className="accent-emerald-500" />Post now</label>
          <label className="flex items-center gap-2"><input type="radio" name="when" checked={later} onChange={() => { setLater(true); set('scheduledAt', nextWeeklySlot(slot.day, slot.time, scheduled).toISOString()); }} className="accent-emerald-500" />Schedule</label>
          {later && <input type="datetime-local" className={small} value={d.scheduledAt ? localValue(new Date(d.scheduledAt)) : ''} onChange={(e) => set('scheduledAt', e.target.value ? new Date(e.target.value).toISOString() : '')} aria-label="When to post" />}
        </div>
        {later && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-400">
            Weekly slot:
            <select className={small + ' py-1 text-xs'} value={slot.day} onChange={(e) => saveSlot({ ...slot, day: Number(e.target.value) })} aria-label="Weekly slot day">{DAYS.map((n, i) => <option key={n} value={i}>{n}</option>)}</select>
            <input type="time" className={small + ' py-1 text-xs'} value={slot.time} onChange={(e) => saveSlot({ ...slot, time: e.target.value || '09:00' })} aria-label="Weekly slot time" />
            <button type="button" onClick={() => set('scheduledAt', nextWeeklySlot(slot.day, slot.time, scheduled).toISOString())} className="rounded-lg border border-slate-700 px-2 py-1 hover:border-slate-500">Use the next open one</button>
            <span>One post a week lands on the same slot: each new post takes the first week without one.</span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={send} disabled={Boolean(busy) || Boolean(problem)} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-40">{busy === 'send' ? 'Sending…' : d.scheduledAt ? 'Schedule post' : 'Post to Google'}</button>
        {problem && !untouched && <span className="text-xs text-amber-300">{problem}</span>}
        {note && <span className="text-xs text-emerald-300">{note}</span>}
      </div>
      {error && <p className="text-sm text-rose-300">{error}</p>}

      <div className="border-t border-slate-800 pt-4">
        <p className="text-sm font-medium">Sent from here</p>
        {posts === null ? <p className="mt-2 text-xs text-slate-500">Reading posts…</p> : posts.length === 0 ? <p className="mt-2 text-xs text-slate-500">Nothing yet. Posts made on Google itself are not listed here.</p> : (
          <ul className="mt-2 divide-y divide-slate-800">
            {posts.map((p) => (
              <li key={p.id} className="flex gap-3 py-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {p.image && <img src={p.image} alt="" className="h-14 w-20 shrink-0 rounded-md border border-slate-800 object-cover" />}
                <div className="min-w-0 flex-1">
                  <p className="text-xs"><span className={STATE[p.state].tone}>{STATE[p.state].text}</span> <span className="text-slate-500">· {FORMATS.find((f) => f[0] === p.format)?.[1] ?? p.format} · {when(p.at)}</span></p>
                  <p className="mt-1 line-clamp-2 break-words text-sm text-slate-300">{p.title ? p.title + (p.body ? ': ' : '') : ''}{p.body || (p.title ? '' : 'Photo')}</p>
                  {p.error && <p className="mt-1 text-xs text-rose-300">{p.error}</p>}
                  <div className="mt-1.5 flex flex-wrap gap-3 text-xs">
                    {p.permalink && <a href={p.permalink} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-sky-300">See it on Google</a>}
                    {sure === p.id
                      ? <><button type="button" onClick={() => remove(p)} disabled={Boolean(busy)} className="text-rose-300 hover:underline">{busy === p.id ? 'Removing…' : p.state === 'published' ? 'Yes, take it off Google' : 'Yes, cancel it'}</button><button type="button" onClick={() => setSure('')} className="text-slate-400 hover:underline">Keep it</button></>
                      : <button type="button" onClick={() => setSure(p.id)} className="text-slate-400 hover:text-rose-300">{p.state === 'scheduled' ? 'Cancel' : 'Remove'}</button>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
