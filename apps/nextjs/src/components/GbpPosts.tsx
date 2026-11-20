'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import GbpPostCalendar from '@/components/GbpPostCalendar';
import OutletStrip, { OutletMark, type Outlet, type Tick } from '@/components/OutletStrip';
import { draftProblem, OUTLET_NAME, OUTLET_TEXT_MAX, outletProblem, type ListingOutlets } from '@stakeout/core/outlets';
import { CTA, emptyDraft, nextWeeklySlot, postProblem, type GbpPost, type PostDraft, type PostFormat } from '@stakeout/core/gbpPosts';

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
  published: { text: 'Published', tone: 'text-emerald-300' },
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
/** A form date (2026-11-28) and time (14:30) as people read them. */
const day = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '');
const clock = (v: string) => (/^\d{2}:\d{2}$/.test(v) ? new Date('2000-01-01T' + v + ':00').toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '');
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
export default function GbpPosts({ profile, location, name = '' }: { profile: string; location: string; name?: string }) {
  const [posts, setPosts] = useState<GbpPost[] | null>(null);
  const [d, setD] = useState<PostDraft>(emptyDraft);
  const [later, setLater] = useState(false);
  const [slot, setSlot] = useState({ day: 1, time: '09:00' });
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [sure, setSure] = useState('');
  // Composer furniture: Google's options opened, the paste-a-link box shown, a file held over the
  // drop box, and which outlet the preview shows.
  const [opts, setOpts] = useState(false);
  const [urlBox, setUrlBox] = useState(false);
  const [over, setOver] = useState(false);
  const [view, setView] = useState<Tick>('google_business');
  const composer = useRef<HTMLDivElement>(null);
  // The listing's other outlets (Facebook, LinkedIn), and which of them this post is switched off for.
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [off, setOff] = useState<Tick[]>([]);
  const gotOutlets = useCallback((list: Outlet[], last: Tick[]) => { setOutlets(list); setOff(last); }, []);

  const load = useCallback(async () => {
    try {
      setPosts((await call<{ posts: GbpPost[] }>(`/api/admin/gbp/posts?profile=${encodeURIComponent(profile)}&location=${encodeURIComponent(location)}`)).posts);
    } catch (e) {
      setPosts([]); setError(e instanceof Error ? e.message : 'Could not read the posts.');
    }
  }, [profile, location]);
  useEffect(() => { setPosts(null); setD(emptyDraft()); setLater(false); setError(''); setNote(''); setOpts(false); setUrlBox(false); load(); }, [load]);
  // A post on its way out is watched: the list is read again every few seconds until every place it
  // went to has answered, so "waiting" turns to "published" without a reload. A scheduled post is
  // watched from the minute before it is due. Watching stops after ten minutes.
  const [, setMinute] = useState(0);
  const anyScheduled = (posts ?? []).some((p) => p.state === 'scheduled');
  useEffect(() => {
    if (!anyScheduled) return;
    const t = setInterval(() => setMinute((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, [anyScheduled]);
  const pendingKey = (posts ?? [])
    .filter((p) => {
      const due = p.at ? new Date(p.at).getTime() - Date.now() : 0;
      if (p.state === 'scheduled') return due < 60_000 && due > -600_000;
      const waits = p.state === 'publishing' || p.google?.state === 'waiting' || (p.also ?? []).some((a) => a.state === 'waiting');
      return waits && due > -600_000;
    })
    .map((p) => p.id)
    .join(',');
  useEffect(() => {
    if (!pendingKey) return;
    const quiet = async () => {
      try {
        const r = await call<{ posts: GbpPost[] }>(`/api/admin/gbp/posts?profile=${encodeURIComponent(profile)}&location=${encodeURIComponent(location)}`);
        setPosts(r.posts);
      } catch { /* the next look tries again */ }
    };
    const t = setInterval(quiet, 6000);
    return () => clearInterval(t);
  }, [pendingKey, profile, location, posts]);
  // The weekly slot is remembered on this device.
  useEffect(() => {
    try { const s = JSON.parse(localStorage.getItem(SLOT_KEY) ?? 'null'); if (s && Number.isInteger(s.day) && typeof s.time === 'string') setSlot({ day: s.day, time: s.time }); } catch { /* none saved */ }
  }, []);
  const saveSlot = (s: { day: number; time: string }) => { setSlot(s); try { localStorage.setItem(SLOT_KEY, JSON.stringify(s)); } catch { /* not remembered */ } };

  const set = <K extends keyof PostDraft>(k: K, v: PostDraft[K]) => { setD((x) => ({ ...x, [k]: v })); setNote(''); };
  const scheduled = useMemo(() => (posts ?? []).filter((p) => p.state === 'scheduled' && p.at).map((p) => p.at as string), [posts]);
  // An outlet takes this post when it is connected, a Page is chosen, and the post suits it. Each
  // starts as it was left on this listing's last post; one that cannot take the post says why and
  // is left out. Google is a tick like the others once another outlet is there to carry the post.
  const ready = outlets.filter((o) => o.connected && o.chosen);
  const google = ready.length === 0 || !off.includes('google_business');
  // The post as it will be sent. The kind of post, its button, and its offer or event details are
  // Google's: with Google unticked it goes out as a plain update. A photo with no words is added
  // to the Google listing as a photo.
  const eff: PostDraft = !google
    ? { ...d, format: 'standard', cta: '', ctaUrl: '' }
    : d.format === 'standard' && !d.body.trim() && d.image
      ? { ...d, format: 'photo' }
      : d.format === 'offer'
        ? { ...d, cta: '', ctaUrl: '', startTime: '', endTime: '' }
        : d;
  // On an empty form nothing is judged yet: the ticks show what a post will go to once written.
  const fresh = !d.body && !d.image && !d.title && !d.startDate;
  const whyNot = (o: Outlet) => outletProblem(fresh ? { ...eff, format: 'standard', body: 'x' } : eff, o.outlet, o.chosen ? { profile: '', placement: o.chosen.id, name: o.chosen.name } : undefined);
  const sending = ready.filter((o) => !off.includes(o.outlet) && !whyNot(o)).map((o) => o.outlet);
  const chosen: ListingOutlets = Object.fromEntries(ready.filter((o) => sending.includes(o.outlet)).map((o) => [o.outlet, { profile: '', placement: o.chosen!.id, name: o.chosen!.name }]));
  const problem = ready.length ? draftProblem(eff, google, chosen) : postProblem(eff);
  // Where this post is going, and the tightest text limit among those places.
  const targets: Tick[] = [...(google ? ['google_business' as const] : []), ...sending];
  const tightest = targets.length ? [...targets].sort((x, y) => OUTLET_TEXT_MAX[x] - OUTLET_TEXT_MAX[y])[0] : 'google_business';
  const textMax = OUTLET_TEXT_MAX[tightest];
  const dated = google && (d.format === 'offer' || d.format === 'event');
  const untouched = fresh;
  const length = d.body.trim().length;
  // Google's options stay open while one of them is in use.
  const hasButton = d.format !== 'offer' && Boolean(d.cta);
  const optsOpen = opts || d.format !== 'standard' || hasButton;
  const seen: Tick = targets.includes(view) ? view : targets[0] ?? 'google_business';
  const seenName = seen === 'google_business' ? name || 'Your Google listing' : ready.find((o) => o.outlet === seen)?.chosen?.name ?? OUTLET_NAME[seen];

  const pickImage = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    // Google's smallest photo: 400×300 beside text, 250×250 on its own. The other outlets have no such floor.
    const [w, h] = !google ? [1, 1] : d.body.trim() ? [400, 300] : [250, 250];
    try { set('image', await prepareImage(file, w, h)); setUrlBox(false); } catch (e) { setError(e instanceof Error ? e.message : 'Photo not added.'); }
  };
  const send = async () => {
    setBusy('send'); setError(''); setNote('');
    try {
      await call('/api/admin/gbp/posts', 'POST', { profile, location, draft: eff, ...(sending.length ? { outlets: sending } : {}), ...(google ? {} : { google: false }) });
      const to = [...(google ? ['Google'] : []), ...sending.map((o) => OUTLET_NAME[o])].join(', ');
      setNote((d.scheduledAt ? 'Scheduled for ' + when(d.scheduledAt) : 'Sent') + ' to ' + to + '. Each one shows below as it publishes.');
      setD(emptyDraft()); setLater(false); setOpts(false);
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
      const r = await call<{ notes?: string[] }>(`/api/admin/gbp/posts?id=${encodeURIComponent(p.id)}&profile=${encodeURIComponent(profile)}${p.state === 'published' ? '&google=1' : ''}`, 'DELETE');
      setSure(''); await load();
      // An outlet that could not take the post down is named, so it can be removed there by hand.
      if (r.notes?.length) setError(r.notes.join(' '));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The post was not removed.');
    } finally {
      setBusy('');
    }
  };

  // A day picked on the calendar: the form below is set to schedule for it, at the usual time.
  const writeFor = (day: string) => {
    let at = new Date(day + 'T' + slot.time + ':00');
    // Today, with the usual time already gone: an hour from now, on the half hour.
    if (at.getTime() < Date.now() + 10 * 60000) { at = new Date(Date.now() + 3600000); at.setMinutes(at.getMinutes() < 30 ? 30 : 60, 0, 0); }
    setLater(true); set('scheduledAt', at.toISOString());
    composer.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    document.getElementById('post-text')?.focus({ preventScroll: true });
  };
  const scheduleOne = async (draft: PostDraft) => {
    await call('/api/admin/gbp/posts', 'POST', { profile, location, draft });
    await load();
  };

  return (
    <section className={card + ' space-y-4'}>
      <h3 className="font-semibold">Posts</h3>
      {posts !== null && <GbpPostCalendar posts={posts} onDay={writeFor} onSchedule={scheduleOne} onCancel={remove} />}

      {/* Facebook and LinkedIn: set NEXT_PUBLIC_OUTLETS=off to hide them. */}
      {process.env.NEXT_PUBLIC_OUTLETS !== 'off' && <OutletStrip profile={profile} location={location} name={name} onChange={gotOutlets} />}

      <div ref={composer} className="scroll-mt-20 border-t border-slate-800 pt-4">
        <p className="text-sm font-medium">Write a post</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
        <div className="min-w-0 space-y-4">
          {ready.length > 0 && (
            <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <legend className="sr-only">Where this post goes</legend>
              <span className="text-xs text-slate-400">Post to</span>
              <label className="inline-flex cursor-pointer items-center gap-1.5 text-slate-200" title={google ? 'Going to the Google listing. Untick to leave Google out of this post.' : 'Tick to send this post to the Google listing too.'}>
                <input type="checkbox" checked={google} onChange={() => setOff((x) => (x.includes('google_business') ? x.filter((y) => y !== 'google_business') : [...x, 'google_business']))} className="h-4 w-4 accent-emerald-500" />
                <OutletMark outlet="google_business" on={google} size={20} /> Google
              </label>
              {ready.map((o) => {
                const why = whyNot(o);
                const on = sending.includes(o.outlet);
                return (
                  <label
                    key={o.outlet}
                    className={'inline-flex items-center gap-1.5 ' + (why ? 'cursor-not-allowed text-slate-500' : 'cursor-pointer text-slate-200')}
                    title={why ?? (on ? `Going to ${o.chosen!.name}. Untick to leave ${OUTLET_NAME[o.outlet]} out of this post.` : `Tick to send this post to ${o.chosen!.name} too.`)}
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-emerald-500"
                      checked={on}
                      disabled={Boolean(why)}
                      onChange={() => setOff((x) => (x.includes(o.outlet) ? x.filter((y) => y !== o.outlet) : [...x, o.outlet]))}
                    />
                    <OutletMark outlet={o.outlet} on={on} size={20} /> {OUTLET_NAME[o.outlet]}
                    {/* Why an outlet is left out is said once there is a post to judge, not on an empty form. */}
                    {why && !untouched && <span className="text-xs text-amber-300/90">· {why}</span>}
                  </label>
                );
              })}
            </fieldset>
          )}

          <div>
            <label className="text-sm font-medium" htmlFor="post-text">
              {dated ? 'Details' : 'Post'}{' '}
              <span className={'ml-1 text-xs ' + (length > textMax ? 'text-rose-300' : 'text-slate-500')}>
                {length.toLocaleString()} / {textMax.toLocaleString()}
                {targets.length > 1 && ` · ${OUTLET_NAME[tightest]}’s limit, the tightest of the ${targets.length}`}
              </span>
            </label>
            <textarea id="post-text" className={input + ' mt-1.5 h-36'} value={d.body} onChange={(e) => set('body', e.target.value)} placeholder="What should customers know?" />
          </div>

          <div>
            <p className="text-sm font-medium">Photo <span className="text-xs text-slate-500">optional</span></p>
            {d.image ? (
              <div className="mt-1.5 flex items-start gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={d.image} alt="The photo for this post" className="h-24 w-32 rounded-lg border border-slate-700 object-cover" />
                <button type="button" onClick={() => set('image', '')} className="text-sm text-slate-400 hover:text-rose-300">Remove photo</button>
              </div>
            ) : (
              <>
                <label
                  onDragOver={(e) => { e.preventDefault(); setOver(true); }}
                  onDragLeave={() => setOver(false)}
                  onDrop={(e) => { e.preventDefault(); setOver(false); pickImage(e.dataTransfer.files?.[0]); }}
                  className={'mt-1.5 flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed px-4 py-5 text-center text-sm ' + (over ? 'border-emerald-500 bg-emerald-500/5 text-emerald-200' : 'border-slate-700 text-slate-300 hover:border-slate-500')}
                >
                  <span>Drop a photo here, or <span className="font-semibold text-emerald-300">choose one</span></span>
                  <span className="mt-1 text-xs text-slate-500">
                    JPG or PNG · one photo a post{google ? ' · at least 400×300 for Google' : ''}
                  </span>
                  <input type="file" accept="image/jpeg,image/png" className="sr-only" onChange={(e) => { pickImage(e.target.files?.[0]); e.target.value = ''; }} />
                </label>
                {urlBox ? (
                  <input autoFocus className={input + ' mt-2'} placeholder="https:// link to a JPG or PNG" onBlur={(e) => { if (e.target.value.trim()) set('image', e.target.value.trim()); else setUrlBox(false); }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
                ) : (
                  <button type="button" onClick={() => setUrlBox(true)} className="mt-1.5 text-xs text-slate-400 hover:text-sky-300">or paste URL</button>
                )}
              </>
            )}
            {google && d.image && !d.body.trim() && <p className="mt-1 text-xs text-slate-500">With no text, this is added to the Google listing as a photo.</p>}
          </div>

          {/* What only Google has: the kind of post, its button, and offer or event details. Gone when Google is unticked. */}
          {google && (
            <div className="rounded-lg border border-slate-800 bg-slate-950/60">
              <button type="button" aria-expanded={optsOpen} onClick={() => setOpts(!optsOpen)} disabled={d.format !== 'standard' || hasButton} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm">
                <OutletMark outlet="google_business" size={18} />
                <span className="text-slate-400">{ready.length ? 'Google options' : 'Post options'}</span>
                <span className="text-slate-200">{FORMATS.find((f) => f[0] === d.format)?.[1] ?? 'Update'} · {d.format === 'offer' ? (d.redeemUrl.trim() ? 'Link to redeem' : 'No link') : CTA.find((c) => c.value === d.cta)?.label ?? 'No button'}</span>
                {d.format === 'standard' && !hasButton && <span className="ml-auto text-xs text-slate-500">{optsOpen ? 'Hide' : 'Change'}</span>}
              </button>
              {optsOpen && (
                <div className="space-y-3 border-t border-slate-800 p-3">
                  <div className="flex flex-wrap gap-1.5">
                    {FORMATS.filter(([f]) => f !== 'photo').map(([f, label, hint]) => (
                      <button key={f} type="button" title={hint} aria-pressed={d.format === f} onClick={() => set('format', f)} className={'rounded-full border px-3 py-1 text-sm ' + (d.format === f ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-300' : 'border-slate-700 text-slate-300 hover:border-slate-500')}>{label}</button>
                    ))}
                  </div>
                  {dated && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        <label className="text-sm font-medium">{d.format === 'event' ? 'Event name' : 'Offer headline'} <span className="ml-1 text-xs text-slate-500">{d.title.length} / 58{d.format === 'offer' ? ' · optional' : ''}</span></label>
                        <input className={input + ' mt-1.5'} value={d.title} onChange={(e) => set('title', e.target.value)} placeholder={d.format === 'event' ? 'Open house' : '10% off roof washing'} />
                      </div>
                      {(['start', 'end'] as const).map((k) => (
                        <div key={k} className="min-w-0">
                          <label className="text-sm font-medium">{k === 'start' ? 'Starts' : 'Ends'}</label>
                          <div className="mt-1.5 flex flex-wrap gap-2">
                            <input type="date" className={small + ' min-w-[9.5rem] flex-1'} value={k === 'start' ? d.startDate : d.endDate} onChange={(e) => set(k === 'start' ? 'startDate' : 'endDate', e.target.value)} aria-label={k === 'start' ? 'Start date' : 'End date'} />
                            {/* An offer runs by the day; only an event has times. */}
                            {d.format === 'event' && <input type="time" className={small + ' min-w-[7.5rem] flex-1'} value={k === 'start' ? d.startTime : d.endTime} onChange={(e) => set(k === 'start' ? 'startTime' : 'endTime', e.target.value)} aria-label={(k === 'start' ? 'Start' : 'End') + ' time (optional)'} />}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {d.format === 'offer' && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div><label className="text-sm font-medium">Coupon code <span className="text-xs text-slate-500">optional</span></label><input className={input + ' mt-1.5'} value={d.coupon} onChange={(e) => set('coupon', e.target.value)} /></div>
                      <div><label className="text-sm font-medium">Link to redeem <span className="text-xs text-slate-500">optional</span></label><input className={input + ' mt-1.5'} value={d.redeemUrl} onChange={(e) => set('redeemUrl', e.target.value)} placeholder="https://" /></div>
                      <div className="sm:col-span-2"><label className="text-sm font-medium">Terms <span className="text-xs text-slate-500">optional</span></label><input className={input + ' mt-1.5'} value={d.terms} onChange={(e) => set('terms', e.target.value)} /></div>
                    </div>
                  )}
                  {/* An offer's link is "Link to redeem": it has no separate button. */}
                  {d.format !== 'offer' && <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
                    <div><label className="text-sm font-medium">Button</label><select className={input + ' mt-1.5'} value={d.cta} onChange={(e) => set('cta', e.target.value)}>{CTA.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select></div>
                    {d.cta && d.cta !== 'CALL' && <div><label className="text-sm font-medium">Button link</label><input className={input + ' mt-1.5'} value={d.ctaUrl} onChange={(e) => set('ctaUrl', e.target.value)} placeholder="https://" /></div>}
                    {d.cta === 'CALL' && <p className="self-end pb-2 text-xs text-slate-500">Calls the number on the listing.</p>}
                  </div>}
                  {sending.length > 0 && <p className="text-xs text-slate-500">These show on Google only. {sending.map((o) => OUTLET_NAME[o]).join(' and ')} get{sending.length === 1 ? 's' : ''} the text and photo.</p>}
                </div>
              )}
            </div>
          )}
        </div>

        {/* How the post will look on one of the places it is going. A sketch, not the network's own rendering. */}
        <aside className="min-w-0 lg:sticky lg:top-20 lg:self-start">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium">Preview</p>
            {targets.length > 1 && (
              <div className="ml-auto flex gap-1" role="tablist" aria-label="Preview for">
                {targets.map((t) => (
                  <button key={t} type="button" role="tab" aria-selected={seen === t} title={OUTLET_NAME[t]} onClick={() => setView(t)} className={'rounded-full p-0.5 ' + (seen === t ? 'ring-2 ring-emerald-500' : 'opacity-60 hover:opacity-100')}>
                    <OutletMark outlet={t} size={22} />
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="mt-1.5 overflow-hidden rounded-lg border border-slate-700 bg-white text-slate-900">
            <div className="flex items-center gap-2 px-3 pt-3">
              <OutletMark outlet={seen} size={32} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{seenName}</p>
                <p className="text-xs text-slate-500">{d.scheduledAt ? when(d.scheduledAt) : 'Just now'} · {OUTLET_NAME[seen]}</p>
              </div>
            </div>
            {untouched ? (
              <p className="px-3 py-6 text-sm text-slate-400">Your post shows here as you write it.</p>
            ) : (
              <>
                {seen === 'google_business' && d.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={d.image} alt="" className="mt-3 aspect-[4/3] w-full object-cover" />
                )}
                <div className="px-3 py-3">
                  {seen === 'google_business' && dated && (
                    <>
                      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{d.format === 'offer' ? 'Offer' : 'Event'}</p>
                      <p className={'text-sm font-semibold ' + (d.title ? '' : 'text-slate-400')}>{d.title || (d.format === 'event' ? 'Event name' : 'Offer headline')}</p>
                      <p className="text-xs text-slate-500">{day(d.startDate) ? (d.format === 'offer' ? 'Valid ' : '') + day(d.startDate) + (eff.startTime ? ', ' + clock(eff.startTime) : '') + (day(d.endDate) ? ' – ' + day(d.endDate) + (eff.endTime ? ', ' + clock(eff.endTime) : '') : '') : 'Start and end dates'}</p>
                    </>
                  )}
                  {d.body.trim() && <p className="mt-1 whitespace-pre-wrap break-words text-sm">{d.body.trim().slice(0, OUTLET_TEXT_MAX[seen])}</p>}
                  {seen === 'google_business' && d.format === 'offer' && (
                    <>
                      {d.coupon.trim() && <p className="mt-2 inline-block rounded border border-dashed border-slate-400 px-2 py-1 text-xs font-semibold">Code: {d.coupon.trim()}</p>}
                      {d.terms.trim() && <p className="mt-1 text-xs text-slate-500">{d.terms.trim()}</p>}
                      {d.redeemUrl.trim() && <p className="mt-2 text-sm font-semibold text-blue-600">Redeem online</p>}
                    </>
                  )}
                  {seen === 'google_business' && eff.cta && <p className="mt-2 text-sm font-semibold text-blue-600">{CTA.find((c) => c.value === eff.cta)?.label}</p>}
                </div>
                {seen !== 'google_business' && d.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={d.image} alt="" className="w-full object-cover" />
                )}
                {/* Facebook turns the button link into a link card when there is no photo. */}
                {seen === 'facebook' && !d.image && google && eff.cta && eff.cta !== 'CALL' && /^https:\/\/\S+$/.test(d.ctaUrl.trim()) && (
                  <p className="truncate border-t border-slate-200 bg-slate-100 px-3 py-2 text-xs text-slate-600">{d.ctaUrl.trim().replace(/^https:\/\//, '').split('/')[0]}</p>
                )}
              </>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-500">A rough look. Each network lays it out its own way.</p>
        </aside>
      </div>

      {/* One bar to finish: when it goes, and the button that sends it. */}
      <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 text-sm">
          <label className="flex items-center gap-2"><input type="radio" name="when" checked={!later} onChange={() => { setLater(false); set('scheduledAt', ''); }} className="accent-emerald-500" />Post now</label>
          <label className="flex items-center gap-2"><input type="radio" name="when" checked={later} onChange={() => { setLater(true); set('scheduledAt', nextWeeklySlot(slot.day, slot.time, scheduled).toISOString()); }} className="accent-emerald-500" />Schedule</label>
          {later && <input type="datetime-local" className={small} value={d.scheduledAt ? localValue(new Date(d.scheduledAt)) : ''} onChange={(e) => set('scheduledAt', e.target.value ? new Date(e.target.value).toISOString() : '')} aria-label="When to post" />}
          <div className="ml-auto flex flex-wrap items-center justify-end gap-3">
            {problem && !untouched && <span className="text-xs text-amber-300">{problem}</span>}
            {note && <span className="text-xs text-emerald-300">{note}</span>}
            <button type="button" onClick={send} disabled={Boolean(busy) || Boolean(problem)} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-40">
              {busy === 'send' ? 'Sending…' : (d.scheduledAt ? 'Schedule' : 'Post') + (ready.length > 0 && targets.length > 0 ? ' to ' + targets.map((t) => OUTLET_NAME[t]).join(' + ') : '')}
            </button>
          </div>
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
      {error && <p className="text-sm text-rose-300">{error}</p>}

      <div className="border-t border-slate-800 pt-4">
        <p className="text-sm font-medium">Scheduled &amp; Published</p>
        {posts === null ? <p className="mt-2 text-xs text-slate-500">Reading posts…</p> : posts.length === 0 ? <p className="mt-2 text-xs text-slate-500">Nothing yet. Posts made on the networks themselves are not listed here.</p> : (
          <ul className="mt-2 divide-y divide-slate-800">
            {posts.map((p) => (
              <li key={p.id} className="flex gap-3 py-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {p.image && <img src={p.image} alt="" className="h-14 w-20 shrink-0 rounded-md border border-slate-800 object-cover" />}
                <div className="min-w-0 flex-1">
                  <p className="text-xs"><span className={STATE[p.state].tone}>{STATE[p.state].text}</span> <span className="text-slate-500">· {FORMATS.find((f) => f[0] === p.format)?.[1] ?? p.format} · {when(p.at)}</span></p>
                  <p className="mt-1 line-clamp-2 break-words text-sm text-slate-300">{p.title ? p.title + (p.body ? ': ' : '') : ''}{p.body || (p.title ? '' : 'Photo')}</p>
                  {p.error && <p className="mt-1 text-xs text-rose-300">{p.error}</p>}
                  {(p.also ?? []).length > 0 && (
                    <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                      {[...(p.google ? [{ outlet: 'google_business' as const, ...p.google }] : []), ...(p.also ?? [])].map((a) => (
                        <span key={a.outlet} className="inline-flex items-center gap-1" title={a.error ?? undefined}>
                          <OutletMark outlet={a.outlet} size={16} on={a.state !== 'failed'} />
                          {a.state === 'published' ? (
                            a.permalink ? <a href={a.permalink} target="_blank" rel="noreferrer" className="text-emerald-300 hover:underline">✓ on {OUTLET_NAME[a.outlet]}</a> : <span className="text-emerald-300">✓ on {OUTLET_NAME[a.outlet]}</span>
                          ) : a.state === 'failed' ? (
                            <span className="text-rose-300">⚠ {OUTLET_NAME[a.outlet]}: {a.error ?? 'failed'}</span>
                          ) : (
                            <span className="text-slate-400">{OUTLET_NAME[a.outlet]}: waiting</span>
                          )}
                        </span>
                      ))}
                    </p>
                  )}
                  <div className="mt-1.5 flex flex-wrap gap-3 text-xs">
                    {p.permalink && <a href={p.permalink} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-sky-300">See it on Google</a>}
                    {sure === p.id
                      ? <><button type="button" onClick={() => remove(p)} disabled={Boolean(busy)} className="text-rose-300 hover:underline">{busy === p.id ? 'Removing…' : p.state === 'published' ? (p.also ?? []).length ? 'Yes, take it down everywhere' : 'Yes, take it off Google' : 'Yes, cancel it'}</button><button type="button" onClick={() => setSure('')} className="text-slate-400 hover:underline">Keep it</button></>
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
