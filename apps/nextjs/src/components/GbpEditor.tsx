'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import SearchInsights from '@/components/SearchInsights';
import GbpReviews from '@/components/GbpReviews';
import GbpWatch from '@/components/GbpWatch';
import GbpEditTop, { type ExtrasLite } from '@/components/GbpEditTop';
import GbpPosts from '@/components/GbpPosts';
import GbpExtras from '@/components/GbpExtras';
import GbpGaps from '@/components/GbpGaps';
import GbpPlans, { GbpPicker, UpgradeCard, connectGoogle } from '@/components/GbpPlans';
import GbpAgents from '@/components/GbpAgents';
import GbpOverview from '@/components/GbpOverview';
import GbpAllCalendar from '@/components/GbpAllCalendar';
import WebsiteInsights, { Lock, LockedListingCard } from '@/components/WebsiteInsights';
import {
  DAYS, DESCRIPTION_MAX, RED_COOLDOWN_DAYS, addressOf, descriptionWarnings, openingOf, serviceAreasOf, diff, highScrutiny, problemWith, redBlock, siteOf, specialOf, upcomingHolidays, worst,
  type AddressForm, type DayHours, type SpecialDay, type FieldChange, type GbpChange, type GbpLocation, type Tier,
} from '@stakeout/core/gbp';

type Cat = { name: string; displayName?: string };
type Profile = { id: string; name: string; status: string; problem: string | null; customer?: boolean; locations: { id: string; name: string; placeId: string | null; plan: string | null }[] };
type Account = { id: string; profile: string | null; name: string | null; daysLeft?: number | null; minutesLeft?: number | null };
type Tab = 'website' | 'listing' | 'calendar' | 'reviews' | 'changes' | 'plan' | 'agents';
type Edit = { id: string; tier: Tier; changes: FieldChange[]; status: string; error: string | null; checkedAt: string | null; createdAt: string };
type Form = { openingDate: string; address: AddressForm; description: string; websiteUri: string; additionalCategories: Cat[]; additionalPhones: string; regularHours: DayHours[] | null; specialHours: SpecialDay[] | null; pastSpecial: number; title: string; primaryCategory: Cat | null; primaryPhone: string };

const TIER: Record<Tier, { text: string; chip: string }> = {
  green: { text: 'Safe', chip: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' },
  amber: { text: 'May be held for review', chip: 'border-amber-500/40 bg-amber-500/10 text-amber-300' },
  red: { text: 'Identity: verification risk', chip: 'border-rose-500/50 bg-rose-500/10 text-rose-300' },
};
const STATUS: Record<string, string> = { LIVE: 'text-emerald-300', SENT: 'text-amber-300', FAILED: 'text-rose-300' };
const STATUS_TEXT: Record<string, string> = { LIVE: 'Live on Google', SENT: 'Sent, not showing yet', FAILED: 'Failed' };
const input = 'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500 disabled:opacity-50';
const card = 'rounded-xl border border-slate-800 bg-slate-900 p-5';

const GOOGLE_RESULT: Record<string, string> = {
  connected: 'Google connected. Open a listing to see its website in Search Console and Analytics.',
  declined: 'Google sign-in was cancelled.',
  nopermission: 'Google connected, but neither Search Console nor Analytics was allowed. Connect again and leave the boxes ticked.',
  failed: 'Google sign-in did not complete. Try again from a listing’s website panel.',
};
// How connecting a Google Business account went.
const CONNECT_RESULT: Record<string, string> = {
  connected: 'Google account connected. Pick a listing to see how it is doing in search.',
  declined: 'Connecting was cancelled. Nothing was changed.',
  taken: 'That Google account is already connected to another Stakeout account. Email sass@stakeoutsearch.com if that is a surprise.',
  failed: 'The Google account did not connect. Try again, and pick the Google login that manages the Business Profile.',
};

/** Today's date where the admin is, as YYYY-MM-DD. */
const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

const formOf = (l: GbpLocation, week: DayHours[] | null): Form => ({
  description: l.profile?.description ?? '',
  websiteUri: l.websiteUri ?? '',
  additionalCategories: l.categories?.additionalCategories ?? [],
  additionalPhones: (l.phoneNumbers?.additionalPhones ?? []).join(', '),
  regularHours: week,
  specialHours: specialOf(l, today())?.days ?? null,
  pastSpecial: specialOf(l, today())?.past ?? 0,
  title: l.title ?? '',
  primaryCategory: l.categories?.primaryCategory ?? null,
  primaryPhone: l.phoneNumbers?.primaryPhone ?? '',
  openingDate: openingOf(l),
  address: addressOf(l),
});

async function api<T>(url: string, body?: unknown): Promise<T> {
  const r = await fetch(url, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Request failed.');
  return j as T;
}

/** Search Google's category list and pick one; categories are always sent by Google's id. */
function CategoryPicker({ profile, location, region, onPick, disabled }: { profile: string; location: string; region: string; onPick: (c: Cat) => void; disabled?: boolean }) {
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Cat[] | null>(null);
  const [note, setNote] = useState('');
  // Suggestions as the name is typed, a moment after the last key.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setFound(null); setNote(''); return; }
    let live = true;
    const t = setTimeout(async () => {
      setNote('Searching…');
      try {
        const r = await api<{ categories: Cat[] }>(`/api/admin/gbp/categories?profile=${encodeURIComponent(profile)}&location=${encodeURIComponent(location)}&region=${region}&q=${encodeURIComponent(term)}`);
        if (!live) return;
        setFound(r.categories);
        setNote(r.categories.length ? '' : 'No category with that name.');
      } catch (e) {
        if (live) setNote(e instanceof Error ? e.message : 'Search failed.');
      }
    }, 350);
    return () => { live = false; clearTimeout(t); };
  }, [q, profile, location, region]);
  return (
    <div>
      <div className="flex gap-2">
        <input className={input} placeholder="Start typing a category, e.g. plumber" value={q} disabled={disabled} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()} />
      </div>
      {note && <p className="mt-1.5 text-xs text-slate-400">{note}</p>}
      {found && found.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {found.map((c) => (
            <button key={c.name} type="button" onClick={() => { onPick(c); setFound(null); setQ(''); }} className="rounded-full border border-slate-700 px-2.5 py-1 text-xs hover:border-emerald-500 hover:text-emerald-300">+ {c.displayName}</button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function GbpEditor() {
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [ready, setReady] = useState(true);
  const [pick, setPick] = useState<{ profile: string; location: string } | null>(null);
  const [notice, setNotice] = useState('');
  const [live, setLive] = useState<GbpLocation | null>(null);
  const [tab, setTab] = useState<Tab>('listing');
  // Whether the address (or a result coming back from Google or Stripe) already chose the tab.
  const tabChosen = useRef(false);
  // Admins: whether a 1–2 star review is emailed the moment it arrives.
  const [alerts, setAlerts] = useState<{ on: boolean; maxStars: number } | null>(null);
  // Admins reach every listing. A customer reads the accounts they connected and pays per listing to change one.
  const [admin, setAdmin] = useState(true);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [waiting, setWaiting] = useState(0);
  // Within one listing: its numbers, its edits, its posts, its reviews.
  const [view, setView] = useState<'insights' | 'edit' | 'posts' | 'reviews'>('insights');
  const [choosing, setChoosing] = useState(true);
  // Raised when the gaps panel changes the listing, so the panels below read it again.
  const [rev, setRev] = useState(0);
  // Straight after a Google account is connected: the listings found in it, to choose which to pay for.
  const [picking, setPicking] = useState(false);
  // What the listing has by way of services, attributes and links, for the gaps at the top of the editor.
  const [extras, setExtras] = useState<ExtrasLite | null>(null);
  const [edits, setEdits] = useState<Edit[]>([]);
  const [form, setForm] = useState<Form | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [review, setReview] = useState(false);
  const [checks, setChecks] = useState([false, false, false]);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ status: string; waiting: string[] } | null>(null);

  useEffect(() => {
    // The result of a Google sign-in that just came back, shown once and then taken off the address.
    const q = new URLSearchParams(window.location.search);
    const r = q.get('google');
    const go = (t: Tab) => { tabChosen.current = true; setTab(t); };
    if (['website', 'listing', 'calendar', 'changes', 'reviews', 'plan', 'agents'].includes(q.get('tab') ?? '')) go(q.get('tab') as Tab);
    const g = q.get('gbp'), paid = q.get('plan');
    if (r) { setNotice(GOOGLE_RESULT[r] ?? ''); go('website'); }
    if (g) { setNotice(CONNECT_RESULT[g] ?? ''); go('listing'); if (g === 'connected') setPicking(true); }
    if (paid === 'cancelled') setNotice('Checkout was cancelled. Nothing was charged.');
    else if (paid) {
      // Back from Stripe: the listings switch on now (Stripe's own message does the same if this tab is closed first).
      // Back from paying for the AI agents add-on, or for listings.
      const forAgents = q.get('tab') === 'agents';
      go(forAgents ? 'agents' : 'plan');
      api<{ on: boolean }>('/api/billing/gbp', { confirm: paid })
        .then(() => { setNotice(forAgents ? 'Payment received. The AI agents add-on is on: make a key below.' : 'Payment received. Your seats are on.'); readProfiles(); })
        .catch(() => setNotice('Payment is still going through. Your listings switch on as soon as it does; reload in a minute.'));
    }
    if (r || g || paid) window.history.replaceState(null, '', window.location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const readProfiles = useCallback(() =>
    api<{ ready: boolean; admin: boolean; profiles: Profile[]; accounts: Account[] }>('/api/admin/gbp')
      .then((r) => {
        setReady(r.ready); setProfiles(r.profiles); setAdmin(r.admin); setAccounts(r.accounts ?? []);
        // A customer lands on the free part, their website's numbers, unless something already chose a tab.
        if (!r.admin && !tabChosen.current) { tabChosen.current = true; setTab('website'); }
        // The website tab is the customers' own: an admin's website numbers sit inside each listing.
        if (r.admin) setTab((t) => (t === 'website' ? 'listing' : t));
        // How many changes are waiting, for the tab's badge.
        if (r.ready) api<{ open: unknown[] }>('/api/admin/gbp/watch').then((w) => setWaiting(w.open.length)).catch(() => {});
        if (r.ready && r.admin) api<{ on: boolean; maxStars: number }>('/api/admin/gbp/alerts').then(setAlerts).catch(() => {});
      })
      .catch((e) => { setError(e.message); setProfiles([]); }), []);
  useEffect(() => { readProfiles(); }, [readProfiles]);

  const connect = async () => {
    setConnecting(true); setError('');
    try { await connectGoogle(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not open Google.'); setConnecting(false); }
  };
  // From the free tab to a paid listing: the picker when a Google account is connected, otherwise connect one (the picker follows).
  const unlock = () => { if (profiles?.length) setPicking(true); else connect(); };
  // The plan the open listing is on: an admin's listings are always unlocked.
  const openPlan = pick ? profiles?.find((p) => p.id === pick.profile)?.locations.find((l) => l.id === pick.location)?.plan ?? null : null;
  const paidListing = admin || openPlan !== null;
  // Whether this customer has any listing on a paid plan (an admin's are all unlocked).
  const anyPaid = admin || Boolean(profiles?.some((p) => p.locations.some((l) => l.plan !== null)));
  const openName = pick ? profiles?.find((p) => p.id === pick.profile)?.locations.find((l) => l.id === pick.location)?.name ?? 'This listing' : '';
  // The soonest a connection with no paying listing will be removed.
  const daysLeft = accounts.map((a) => a.daysLeft).filter((d): d is number => typeof d === 'number').sort((a, b) => a - b)[0] ?? null;
  const minutesLeft = accounts.map((a) => a.minutesLeft).filter((d): d is number => typeof d === 'number').sort((a, b) => a - b)[0] ?? null;

  const load = useCallback(async (p: { profile: string; location: string }) => {
    setLive(null); setForm(null); setError(''); setReview(false); setUnlocked(false);
    try {
      const r = await api<{ location: GbpLocation; week: DayHours[] | null; edits: Edit[] }>(`/api/admin/gbp/location?profile=${encodeURIComponent(p.profile)}&location=${encodeURIComponent(p.location)}`);
      setLive(r.location); setEdits(r.edits); setForm(formOf(r.location, r.week));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read the profile.');
    }
  }, []);
  // A listing's details come with the paid plan: an unpaid one is not read at all.
  useEffect(() => { if (pick && paidListing) load(pick); }, [pick, load, paidListing]);
  // The listing again, without clearing the page: after a change made from one of its panels.
  const refresh = useCallback(async (p: { profile: string; location: string }) => {
    try {
      const r = await api<{ location: GbpLocation; week: DayHours[] | null; edits: Edit[] }>(`/api/admin/gbp/location?profile=${encodeURIComponent(p.profile)}&location=${encodeURIComponent(p.location)}`);
      setLive(r.location); setEdits(r.edits); setForm(formOf(r.location, r.week));
    } catch { /* the panels show their own errors */ }
  }, []);

  // The change the form asks for; identity fields only count while they are unlocked.
  const change = useMemo<GbpChange>(() => {
    if (!form) return {};
    const c: GbpChange = {
      description: form.description,
      websiteUri: form.websiteUri,
      additionalCategories: form.additionalCategories,
      additionalPhones: form.additionalPhones.split(',').map((x) => x.trim()).filter(Boolean),
    };
    if (form.regularHours) c.regularHours = form.regularHours;
    if (form.specialHours) c.specialHours = form.specialHours;
    c.openingDate = form.openingDate;
    if (unlocked) {
      c.title = form.title;
      c.primaryPhone = form.primaryPhone;
      if (form.primaryCategory) c.primaryCategory = form.primaryCategory;
      if (live?.storefrontAddress) c.address = form.address;
    }
    return c;
  }, [form, unlocked]);

  const changes = useMemo(() => (live ? diff(live, change) : []), [live, change]);
  const problem = live ? problemWith(live, change) : null;
  const tier = worst(changes);
  const lastRed = edits.find((e) => e.tier === 'red' && e.status !== 'FAILED');
  const blocked = redBlock(changes, lastRed ? new Date(lastRed.createdAt) : null, new Date());
  const canSend = changes.length > 0 && !problem && !blocked && (tier !== 'red' || (checks.every(Boolean) && typed === 'VERIFY'));
  const region = String(live?.storefrontAddress?.regionCode ?? 'US');
  const set = <K extends keyof Form>(k: K, v: Form[K]) => { setForm((f) => (f ? { ...f, [k]: v } : f)); setReview(false); setResult(null); };

  // The dates whose holiday hours were set to "custom" by hand, so a custom time equal to the usual one stays custom.
  const [customDates, setCustomDates] = useState<Set<string>>(new Set());
  /** The regular hours of a date's day of the week (its first period), as holiday hours for that date. */
  const usualOn = (date: string): Omit<SpecialDay, 'date'> | null => {
    if (!form?.regularHours || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    const d = form.regularHours[(new Date(date + 'T12:00:00Z').getUTCDay() + 6) % 7];
    return d.closed ? { closed: true, open: '09:00', close: '17:00' } : { closed: false, open: d.allDay ? '00:00' : d.open, close: d.allDay ? '24:00' : d.close };
  };
  const alwaysOpen = Boolean(form?.regularHours?.every((d) => !d.closed && d.allDay));

  const send = async () => {
    if (!pick) return;
    setBusy(true); setError(''); setResult(null);
    try {
      const r = await api<{ status: string; waiting: string[] }>('/api/admin/gbp/update', { ...pick, change, confirm: tier === 'red' ? typed : undefined });
      setResult(r);
      setChecks([false, false, false]); setTyped('');
      await load(pick);
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The edit failed.');
    } finally {
      setBusy(false);
    }
  };

  const recheck = async (id: string) => {
    try {
      const r = await api<{ status: string }>('/api/admin/gbp/recheck', { id });
      setEdits((list) => list.map((e) => (e.id === id ? { ...e, status: r.status, checkedAt: new Date().toISOString() } : e)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not re-check.');
    }
  };

  const addUtm = () => {
    if (!form?.websiteUri) return;
    try {
      const u = new URL(form.websiteUri);
      u.searchParams.set('utm_source', 'google'); u.searchParams.set('utm_medium', 'organic'); u.searchParams.set('utm_campaign', 'gbp_listing');
      set('websiteUri', u.toString());
    } catch { /* not a link yet */ }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-5 py-6 text-slate-200">
      <div>
        <h1 className="text-2xl font-bold">Connected Accounts</h1>
        <p className="mt-1 text-sm text-slate-400">{admin ? 'Each client’s Google Business Profile: how it is doing in search, its edits, posts and reviews.' : 'Your website’s Search Console and Analytics, free. Your Google listing’s numbers, edits, posts, reviews and change watchdog on a Command seat.'}</p>
      </div>

      {!ready && !admin && <div className={card}><p className="font-semibold">Connecting Google accounts is being set up.</p><p className="mt-1 text-sm text-slate-400">Email sass@stakeoutsearch.com and we will tell you the moment it is ready.</p></div>}
      {!ready && admin && (
        <div className={card}>
          <p className="font-semibold">Not set up yet.</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-400">
            <li>Create a Postproxy account and copy its API key.</li>
            <li>Add it on Vercel as <code className="text-slate-200">POSTPROXY_API_KEY</code> (Production), then redeploy.</li>
            <li>In Postproxy, connect the client’s Google Business account (Profiles → Connect account).</li>
          </ol>
        </div>
      )}
      {notice && <p className="rounded-lg border border-sky-500/40 bg-sky-500/10 px-4 py-3 text-sm text-sky-200">{notice}</p>}
      {error && <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</p>}

      {ready && profiles !== null && (profiles.length > 0 || !admin) && (
        <div role="tablist" className="flex gap-1 overflow-x-auto whitespace-nowrap border-b border-slate-800">
          {(admin ? ([['listing', 'Listings'], ['calendar', 'Calendar'], ['reviews', 'Reviews'], ['changes', 'Changes'], ['agents', 'AI agents']] as const) : ([['website', 'Website'], ['listing', 'Business Profile'], ['calendar', 'Calendar'], ['changes', 'Changes'], ['agents', 'AI agents'], ['plan', 'Plan and billing']] as const)).map(([t, label]) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={'-mb-px inline-flex items-center gap-1.5 border-b-2 px-4 py-2 text-sm font-semibold ' + (tab === t ? 'border-emerald-500 text-emerald-300' : 'border-transparent text-slate-400 hover:text-slate-200')}>{t === 'listing' && !anyPaid && <Lock />}{label}{t === 'changes' && waiting > 0 && <span className="ml-1.5 rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[11px] text-amber-300">{waiting}</span>}</button>
          ))}
        </div>
      )}
      {ready && tab === 'website' && !admin && profiles !== null && <WebsiteInsights onUnlock={anyPaid ? undefined : unlock} locked={anyPaid ? undefined : <LockedListingCard connected={profiles.length > 0} onUpgrade={unlock} />} />}
      {ready && tab === 'listing' && !admin && profiles !== null && profiles.length === 0 && (
        <div className={card}>
          <h2 className="flex items-center gap-2 text-lg font-semibold"><Lock /> Google Business Profile</h2>
          <p className="mt-2 text-sm text-slate-400">Your website’s Search Console and Analytics are free. Your Google listing is where a Command seat comes in:</p>
          <ul className="mt-3 grid gap-1.5 text-sm text-slate-300 sm:grid-cols-2">
            <li><span className="text-emerald-400">Insights:</span> calls, direction requests and website clicks from the listing, day by day</li>
            <li><span className="text-emerald-400">Searches:</span> what people typed to find you, and which are rising</li>
            <li><span className="text-emerald-400">Gaps:</span> categories, services and attributes the businesses outranking you have</li>
            <li><span className="text-emerald-400">Posts:</span> a calendar to write and schedule Google posts</li>
            <li><span className="text-emerald-400">Reviews:</span> read and answer them in one place</li>
            <li><span className="text-emerald-400">Watchdog:</span> told the day anything on the listing changes</li>
          </ul>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" onClick={connect} disabled={connecting} className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-40">{connecting ? 'Opening Google…' : 'Connect your Business Profile · $29 a month per location ($22 from 10)'}</button>
          </div>
          <p className="mt-2 text-xs text-slate-500">You connect first so you can pick which listings to put on the plan, then pay. Nothing on Google changes. A connection with no listing put on a plan within the hour is removed; connecting again takes a minute.</p>
        </div>
      )}
      {ready && tab === 'listing' && !admin && profiles !== null && profiles.length > 0 && !anyPaid && daysLeft !== null && (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">Your Business Profile is connected. Put a listing on a Command seat to see its numbers and work on it. {minutesLeft !== null && minutesLeft <= 120 ? (minutesLeft > 0 ? `With no listing on a plan, the connection is removed in about ${minutesLeft} minute${minutesLeft === 1 ? '' : 's'}; connecting again takes a minute.` : 'With no listing on a plan, the connection is about to be removed.') : daysLeft > 0 ? `With no listing on a plan, the connection is removed in ${daysLeft} day${daysLeft === 1 ? '' : 's'}.` : 'With no listing on a plan, the connection is removed today.'}</p>
      )}
      {picking && ready && !admin && profiles !== null && <GbpPicker profiles={profiles} onClose={() => setPicking(false)} onDone={(n) => { setPicking(false); setNotice(n); readProfiles(); }} />}
      {ready && tab === 'agents' && profiles !== null && <GbpAgents admin={admin} />}
      {ready && tab === 'calendar' && profiles !== null && <GbpAllCalendar profiles={profiles} admin={admin} onOpen={(p) => { setPick(p); setChoosing(false); setView('posts'); setTab('listing'); window.scrollTo({ top: 0 }); }} />}
      {ready && tab === 'reviews' && admin && alerts && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-900 px-4 py-3 text-sm">
          <span className="text-slate-300">{alerts.on ? `Instant alerts are on: a review of ${alerts.maxStars} star${alerts.maxStars === 1 ? '' : 's'} or fewer is emailed within the hour it is left.` : `Instant alerts are off. Turn them on to be emailed when a review of ${alerts.maxStars} stars or fewer arrives.`}</span>
          {!alerts.on && <button type="button" onClick={() => api<{ on: boolean; maxStars: number }>('/api/admin/gbp/alerts', {}).then(setAlerts).catch((e) => setError(e instanceof Error ? e.message : 'Could not turn alerts on.'))} className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm hover:border-slate-500">Turn on</button>}
        </div>
      )}
      {ready && tab === 'plan' && !admin && profiles !== null && <GbpPlans profiles={profiles} accounts={accounts} onChanged={readProfiles} />}
      {ready && tab === 'changes' && !admin && profiles !== null && !profiles.some((p) => p.locations.some((l) => l.plan !== null)) && (
        <div className={card}><p className="font-semibold">The change watchdog runs on listings on a Command or Dominator seat.</p><p className="mt-1 text-sm text-slate-400">Every day it reads each listing and tells you when a name, phone, website, hours or category changed without an edit from here, so you can keep it or put it back.</p><button type="button" onClick={() => setTab('plan')} className="mt-3 rounded-lg border border-slate-700 px-3 py-2 text-sm hover:border-slate-500">See plans</button></div>
      )}
      {ready && tab === 'reviews' && admin && profiles !== null && profiles.length > 0 && (
        <GbpReviews profiles={profiles} only={pick} onOpenListing={(p) => { setPick(p); setChoosing(false); setTab('listing'); window.scrollTo({ top: 0 }); }} />
      )}

      {ready && tab === 'changes' && (admin || Boolean(profiles?.some((p) => p.locations.some((l) => l.plan !== null)))) && <GbpWatch onCount={setWaiting} onOpenListing={(p) => { setPick(p); setChoosing(false); setTab('listing'); window.scrollTo({ top: 0 }); }} />}

      {ready && tab === 'listing' && (choosing || !pick) && (admin || profiles === null || profiles.length > 0) && (
        <div className={card}>
          <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-base font-semibold">All listings</h2><span className="text-xs text-slate-500">Google’s totals for the last 30 days · click a listing to open it</span></div>
          {profiles === null ? <p className="mt-2 text-sm text-slate-400">Loading connected accounts…</p> : profiles.length === 0 ? (
            <p className="mt-2 text-sm text-slate-400">{admin ? 'No Google Business account is connected in Postproxy yet. Connect one there (Profiles → Connect account), then reload this page.' : 'No Google account connected yet.'}</p>
          ) : (
            <>
              <GbpOverview profiles={profiles} admin={admin} picked={pick} onOpen={(p) => { setPick(p); setChoosing(false); }} />
              {profiles.filter((p) => p.status !== 'active' || p.problem).map((p) => (
                <p key={p.id} className="mt-2 text-xs text-amber-300">{p.name}: {p.problem ?? (admin ? 'needs reconnecting in Postproxy' : 'needs reconnecting: use Plan and billing → Connect another Google account')}</p>
              ))}
            </>
          )}
        </div>
      )}

      {tab === 'listing' && pick && paidListing && !form && !error && <p className="text-sm text-slate-400">Reading the profile from Google…</p>}
      {tab === 'listing' && pick && !paidListing && profiles !== null && (
        <>
          <div className={card}>
            <h2 className="text-lg font-semibold">{openName} {!choosing && <button type="button" onClick={() => { setChoosing(true); window.scrollTo({ top: 0 }); }} className="ml-2 align-middle text-xs font-normal text-sky-400 hover:underline">Change listing</button>}</h2>
            <p className="mt-0.5 text-xs text-slate-500">On the free plan: its numbers and tools come with a Command seat.</p>
          </div>
          <UpgradeCard profile={pick.profile} location={pick.location} name={openName} what="Everything about this listing" onDone={() => { readProfiles(); setNotice('This listing is on a Command seat.'); }} />
        </>
      )}

      {tab === 'listing' && form && live && pick && (
        <>
          <div className={card}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold">{live.title} {!choosing && <button type="button" onClick={() => { setChoosing(true); window.scrollTo({ top: 0 }); }} className="ml-2 align-middle text-xs font-normal text-sky-400 hover:underline">Change listing</button>}</h2>
              <span className="text-xs text-slate-500">{[live.storefrontAddress?.addressLines?.join(' '), live.storefrontAddress?.locality, live.storefrontAddress?.administrativeArea].filter(Boolean).join(', ') || 'Service-area business'}{typeof live.metadata?.mapsUri === 'string' && <> · <a href={live.metadata.mapsUri} target="_blank" rel="noreferrer" className="text-sky-400 hover:underline">Open on Google Maps</a></>}</span>
            </div>

          </div>

          <div role="tablist" aria-label="This listing" className="flex flex-wrap gap-1.5">
            {([['insights', 'Search insights'], ['edit', 'Edit business'], ['posts', 'Posts'], ['reviews', 'Reviews']] as const).map(([v, label]) => (
              <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)} className={'rounded-lg px-3.5 py-2 text-sm font-semibold ' + (view === v ? 'bg-emerald-500 text-slate-950' : 'border border-slate-700 text-slate-300 hover:border-slate-500')}>{label}{v === 'edit' && changes.length > 0 && <span className="ml-1.5 rounded-full bg-slate-950/30 px-1.5 text-[11px]">{changes.length}</span>}</button>
            ))}
          </div>

          {view === 'insights' && <SearchInsights profile={pick.profile} location={pick.location} businessName={live.title ?? ''} place={[live.storefrontAddress?.locality, live.storefrontAddress?.administrativeArea].filter(Boolean).join(' ')} website={live.websiteUri ?? ''} onOpen={paidListing ? (what) => setView(what) : undefined} />}
          {view !== 'insights' && !paidListing && <UpgradeCard profile={pick.profile} location={pick.location} name={live.title ?? 'this listing'} what={view === 'edit' ? 'Editing' : view === 'posts' ? 'Posting' : 'Reviews'} onDone={() => { readProfiles(); setNotice('This listing is on a Command seat.'); }} />}
          {view === 'posts' && paidListing && <GbpPosts profile={pick.profile} location={pick.location} name={live.title ?? openName} />}
          {view === 'reviews' && paidListing && profiles && <GbpReviews key={pick.location} profiles={profiles} only={pick} oneListing={!admin} onOpenListing={(p) => { setPick(p); setView('insights'); }} />}

          {view === 'edit' && paidListing && (
          <>
          <p className="text-xs text-slate-500">Every edit is built on the live profile, logged with the profile as it was, and checked against Google afterwards. The map pin, service areas and open/closed status are changed on Google itself.</p>
          <GbpEditTop profile={pick.profile} location={pick.location} live={live} extras={extras} todayIso={today()} onRestored={() => load(pick)} />
          <GbpGaps profile={pick.profile} location={pick.location} onApplied={() => { setRev((n) => n + 1); refresh(pick); }} />
          <section className={card + ' space-y-5'}>
            <h3 className="flex items-center gap-2 font-semibold">Everyday edits <span className={'rounded-full border px-2 py-0.5 text-[11px] ' + TIER.green.chip}>{TIER.green.text}</span></h3>

            <div id="gbp-description" className="scroll-mt-20">
              <label className="text-sm font-medium">Description <span className={'ml-1 text-xs ' + (form.description.length > DESCRIPTION_MAX ? 'text-rose-300' : 'text-slate-500')}>{form.description.length} / {DESCRIPTION_MAX}</span></label>
              <textarea className={input + ' mt-1.5 h-32'} value={form.description} onChange={(e) => set('description', e.target.value)} />
              {descriptionWarnings(form.description).length > 0 && form.description !== (live.profile?.description ?? '') && <p className="mt-1 text-xs text-amber-300">This has {descriptionWarnings(form.description).join(' and ')} in it. Google often rejects or strips those from a description.</p>}
            </div>

            <div>
              <label className="text-sm font-medium">Website</label>
              <div className="mt-1.5 flex gap-2">
                <input className={input} value={form.websiteUri} onChange={(e) => set('websiteUri', e.target.value)} placeholder="https://" />
                <button type="button" onClick={addUtm} className="shrink-0 rounded-lg border border-slate-700 px-3 py-2 text-sm hover:border-slate-500">Add tracking tag</button>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {siteOf(form.websiteUri) && siteOf(live.websiteUri) && siteOf(form.websiteUri) !== siteOf(live.websiteUri)
                  ? <span className="text-rose-300">This moves the link to a different website ({siteOf(live.websiteUri)} → {siteOf(form.websiteUri)}): treated as an identity change.</span>
                  : 'Same website with a new page or tracking tag is safe. A different website is an identity change.'}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-sm font-medium" htmlFor="gbp-opening">Opening date</label>
                <input id="gbp-opening" type="date" className={input + ' mt-1.5'} value={form.openingDate} max={String(new Date().getFullYear() + 1) + '-12-31'} onChange={(e) => set('openingDate', e.target.value)} />
                <p className="mt-1 text-xs text-slate-500">{openingOf(live) ? 'The day the business first opened.' : 'Not set. Google shows “X+ years in business” on listings that have one, so give the day the business first opened.'}</p>
              </div>
              <div>
                <p className="text-sm font-medium">Service areas <span className="ml-1 text-xs font-normal text-slate-500">read-only</span></p>
                {serviceAreasOf(live).length ? <p className="mt-1.5 flex flex-wrap gap-1.5">{serviceAreasOf(live).map((a) => <span key={a} className="rounded-full border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs text-slate-300">{a}</span>)}</p> : <p className="mt-1.5 text-sm text-slate-400">None listed.</p>}
                <p className="mt-1 text-xs text-slate-500">{serviceAreasOf(live).length} of the 20 Google allows. Each area is one of Google’s own places, so they are changed on Google for now.</p>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">Additional categories <span className="ml-1 text-xs text-slate-500">{form.additionalCategories.length} / 9</span></label>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {form.additionalCategories.map((c) => (
                  <span key={c.name} className="rounded-full border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs">
                    {c.displayName || c.name}
                    <button type="button" aria-label={'Remove ' + (c.displayName || c.name)} onClick={() => set('additionalCategories', form.additionalCategories.filter((x) => x.name !== c.name))} className="ml-1.5 text-slate-500 hover:text-rose-300">×</button>
                  </span>
                ))}
                {!form.additionalCategories.length && <span className="text-xs text-slate-500">None</span>}
              </div>
              <div className="mt-2"><CategoryPicker profile={pick.profile} location={pick.location} region={region} disabled={form.additionalCategories.length >= 9} onPick={(c) => !form.additionalCategories.some((x) => x.name === c.name) && set('additionalCategories', [...form.additionalCategories, c])} /></div>
            </div>

            <div>
              <label className="text-sm font-medium">Opening hours</label>
              {!form.regularHours ? (
                <p className="mt-1.5 text-sm text-slate-400">This profile has hours that run past midnight. They are left untouched: this editor handles opening periods that end the day they start.</p>
              ) : (
                <div className="mt-1.5 space-y-1.5">
                  {form.regularHours.map((d, i) => {
                    const upd = (patch: Partial<DayHours>) => set('regularHours', form.regularHours!.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                    const more = d.more ?? [];
                    const time = input.replace('w-full ', '') + ' w-32';
                    return (
                      <div key={d.day} className="flex flex-wrap items-start gap-x-3 gap-y-1.5 text-sm">
                        <span className="w-24 pt-2 capitalize text-slate-300">{DAYS[i].toLowerCase()}</span>
                        <label className="flex items-center gap-1.5 pt-2 text-xs text-slate-400"><input type="checkbox" checked={d.closed} onChange={(e) => upd({ closed: e.target.checked })} /> Closed</label>
                        <label className="flex items-center gap-1.5 pt-2 text-xs text-slate-400" title="Sent to Google as midnight to midnight (00:00 to 24:00)"><input type="checkbox" checked={d.allDay} disabled={d.closed} onChange={(e) => upd({ allDay: e.target.checked, ...(e.target.checked ? { more: [] } : {}) })} /> 24 hours</label>
                        <div className="space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <input type="time" aria-label={d.day.toLowerCase() + ' opens'} className={time} value={d.open} disabled={d.closed || d.allDay} onChange={(e) => upd({ open: e.target.value })} />
                            <span className="text-slate-500">to</span>
                            <input type="time" aria-label={d.day.toLowerCase() + ' closes'} className={time} value={d.close === '24:00' ? '23:59' : d.close} disabled={d.closed || d.allDay} onChange={(e) => upd({ close: e.target.value })} />
                            {!d.closed && !d.allDay && more.length < 2 && <button type="button" onClick={() => upd({ more: [...more, { open: d.close < '13:00' ? '13:00' : '18:00', close: d.close < '13:00' ? '17:00' : '21:00' }] })} className="text-xs text-sky-400 hover:underline">+ Split shift</button>}
                          </div>
                          {!d.closed && !d.allDay && more.map((m, k) => (
                            <div key={k} className="flex flex-wrap items-center gap-2">
                              <input type="time" aria-label={d.day.toLowerCase() + ' opens again'} className={time} value={m.open} onChange={(e) => upd({ more: more.map((x, y) => (y === k ? { ...x, open: e.target.value } : x)) })} />
                              <span className="text-slate-500">to</span>
                              <input type="time" aria-label={d.day.toLowerCase() + ' closes again'} className={time} value={m.close === '24:00' ? '23:59' : m.close} onChange={(e) => upd({ more: more.map((x, y) => (y === k ? { ...x, close: e.target.value } : x)) })} />
                              <button type="button" onClick={() => upd({ more: more.filter((_, y) => y !== k) })} className="text-xs text-slate-500 hover:text-rose-300">Remove</button>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  <p className="text-xs text-slate-500">“24 hours” is sent to Google as 00:00 to 24:00. Other kinds of hours (online service, delivery, senior hours) are set on Google for now.</p>
                </div>
              )}
            </div>
            <div id="gbp-holiday" className="scroll-mt-20">
              <label className="text-sm font-medium">Holiday hours <span className="ml-1 text-xs text-slate-500">dates with their own hours</span></label>
              {!form.specialHours ? (
                <p className="mt-1.5 text-sm text-slate-400">This profile has holiday hours that span several days or are split in two. They are left untouched: this editor handles one period a date.</p>
              ) : (
                <>
                  <div className="mt-1.5 space-y-1.5">
                    {form.specialHours.length === 0 && <p className="text-xs text-slate-500">No upcoming dates set.</p>}
                    {form.specialHours.map((d, i) => {
                      const upd = (patch: Partial<SpecialDay>) => set('specialHours', form.specialHours!.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                      const usual = usualOn(d.date);
                      const same = (x: SpecialDay, y: Omit<SpecialDay, 'date'>) => x.closed === y.closed && (x.closed || (x.open === y.open && x.close === y.close));
                      const mode = customDates.has(d.date) ? 'custom' : usual && same(d, usual) && !usual.closed ? 'usual' : d.closed ? 'closed' : 'custom';
                      const pick3 = (m: 'usual' | 'closed' | 'custom') => {
                        setCustomDates((c) => { const n = new Set(c); if (m === 'custom') n.add(d.date); else n.delete(d.date); return n; });
                        upd(m === 'usual' && usual ? usual : m === 'closed' ? { closed: true } : { closed: false });
                      };
                      const time = input.replace('w-full ', '') + ' w-32';
                      return (
                        <div key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
                          <input type="date" className={input.replace('w-full ', '') + ' w-40'} value={d.date} min={today()} onChange={(e) => upd({ date: e.target.value })} aria-label="Date" />
                          <span role="group" aria-label="Hours that day" className="inline-flex overflow-hidden rounded-lg border border-slate-700 text-xs">
                            {([['usual', 'Regular hours'], ['closed', 'Closed'], ['custom', 'Custom hours']] as const).map(([m, text]) => (
                              <button key={m} type="button" aria-pressed={mode === m} disabled={m === 'usual' && (!usual || usual.closed)} title={m === 'usual' ? (usual && !usual.closed ? 'Tells Google the usual hours apply that day, so it does not warn that hours may differ' : 'The business is closed on that day of the week anyway') : undefined} onClick={() => pick3(m)} className={'px-2.5 py-1.5 disabled:opacity-40 ' + (mode === m ? (m === 'closed' ? 'bg-rose-500/30 font-semibold text-rose-100' : 'bg-slate-700 font-semibold text-white') : 'text-slate-400 hover:bg-slate-800')}>{text}</button>
                            ))}
                          </span>
                          {mode === 'custom' && <>
                            <input type="time" className={time} value={d.open} onChange={(e) => upd({ open: e.target.value })} aria-label="Opens" />
                            <span className="text-slate-500">to</span>
                            <input type="time" className={time} value={d.close === '24:00' ? '23:59' : d.close} onChange={(e) => upd({ close: e.target.value })} aria-label="Closes" />
                          </>}
                          {mode === 'usual' && <span className="text-xs text-slate-400">{d.open === '00:00' && d.close === '24:00' ? 'open 24 hours' : `${d.open} to ${d.close}`}</span>}
                          <button type="button" onClick={() => set('specialHours', form.specialHours!.filter((_, j) => j !== i))} className="text-xs text-slate-500 hover:text-rose-300">Remove</button>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {upcomingHolidays(today()).filter((h) => !form.specialHours!.some((d) => d.date === h.date)).map((h) => (
                      <button key={h.date} type="button" onClick={() => set('specialHours', [...form.specialHours!, { date: h.date, ...(alwaysOpen && usualOn(h.date) ? usualOn(h.date)! : { closed: true, open: '09:00', close: '17:00' }) }].sort((a, b) => a.date.localeCompare(b.date)))} className="rounded-full border border-slate-700 px-2.5 py-1 text-xs hover:border-emerald-500 hover:text-emerald-300">+ {h.name} ({h.date.slice(5)})</button>
                    ))}
                    <button type="button" onClick={() => set('specialHours', [...form.specialHours!, { date: '', closed: true, open: '09:00', close: '17:00' }])} className="rounded-full border border-slate-700 px-2.5 py-1 text-xs hover:border-slate-500">+ Another date</button>
                  </div>
                  <p className="mt-1.5 text-xs text-slate-500">{alwaysOpen ? 'This business is open around the clock, so a holiday button adds the date with its regular hours: switch it to Closed only if it really closes.' : 'A holiday button adds the date as closed: switch it to Regular hours or Custom hours if the business opens.'}{form.pastSpecial > 0 && ` Google still holds ${form.pastSpecial} past date${form.pastSpecial === 1 ? '' : 's'} for this profile; they are cleared the next time holiday hours are saved.`}</p>
                </>
              )}
            </div>
          </section>

          <GbpExtras key={rev} profile={pick.profile} location={pick.location} website={live.websiteUri ?? ''} onLoaded={setExtras} />

          <section className={card + ' space-y-3'}>
            <h3 className="flex items-center gap-2 font-semibold">Additional phone numbers <span className={'rounded-full border px-2 py-0.5 text-[11px] ' + TIER.amber.chip}>{TIER.amber.text}</span></h3>
            <input className={input} value={form.additionalPhones} onChange={(e) => set('additionalPhones', e.target.value)} placeholder="Up to two, separated by a comma" />
          </section>

          <section className={card + ' space-y-4 border-rose-500/30'}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="flex items-center gap-2 font-semibold">Identity fields <span className={'rounded-full border px-2 py-0.5 text-[11px] ' + TIER.red.chip}>{TIER.red.text}</span></h3>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={unlocked} onChange={(e) => { setUnlocked(e.target.checked); if (!e.target.checked && live) setForm((f) => (f ? { ...f, title: live.title ?? '', primaryPhone: live.phoneNumbers?.primaryPhone ?? '', primaryCategory: live.categories?.primaryCategory ?? null, address: addressOf(live) } : f)); setReview(false); }} /> Unlock high-risk edits</label>
            </div>
            <p className="text-xs text-slate-400">Changing the name, primary category or primary phone can make Google ask for video verification or suspend the listing. One identity field per save, and one every {RED_COOLDOWN_DAYS} days per profile.</p>
            {highScrutiny(live.categories?.primaryCategory?.displayName) && <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{live.categories?.primaryCategory?.displayName} is a line of business Google checks closely. An identity edit here is more likely to be held, or to hide the listing until a video is sent.</p>}
            <div>
              <label className="text-sm font-medium">Business name</label>
              <input className={input + ' mt-1.5'} value={form.title} disabled={!unlocked} onChange={(e) => set('title', e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">Primary category: <span className="text-slate-300">{form.primaryCategory?.displayName || form.primaryCategory?.name || 'none'}</span></label>
              {unlocked && <div className="mt-1.5"><CategoryPicker profile={pick.profile} location={pick.location} region={region} onPick={(c) => set('primaryCategory', c)} /></div>}
            </div>
            <div>
              <label className="text-sm font-medium">Primary phone</label>
              <input className={input + ' mt-1.5'} value={form.primaryPhone} disabled={!unlocked} onChange={(e) => set('primaryPhone', e.target.value)} />
            </div>
            <div>
              <p className="text-sm font-medium">Address</p>
              {!live.storefrontAddress ? <p className="mt-1.5 text-sm text-slate-400">This listing shows no address (a service-area business). Adding one is done on Google itself.</p> : (
                <div className="mt-1.5 grid gap-2 sm:grid-cols-6">
                  <textarea aria-label="Street address" rows={Math.max(1, form.address.lines.split('\n').length)} className={input + ' h-auto sm:col-span-6'} value={form.address.lines} disabled={!unlocked} onChange={(e) => set('address', { ...form.address, lines: e.target.value })} />
                  <input aria-label="Town" placeholder="Town" className={input + ' sm:col-span-3'} value={form.address.locality} disabled={!unlocked} onChange={(e) => set('address', { ...form.address, locality: e.target.value })} />
                  <input aria-label="State or region" placeholder="State" className={input + ' sm:col-span-1'} value={form.address.region} disabled={!unlocked} onChange={(e) => set('address', { ...form.address, region: e.target.value })} />
                  <input aria-label="Postal code" placeholder="ZIP" className={input + ' sm:col-span-2'} value={form.address.postalCode} disabled={!unlocked} onChange={(e) => set('address', { ...form.address, postalCode: e.target.value })} />
                </div>
              )}
              {live.storefrontAddress && <p className="mt-1 text-xs text-slate-500">An address change is the edit most likely to bring a new verification. The map pin is moved on Google.</p>}
            </div>
          </section>

          <section className={card}>
            <h3 className="font-semibold">Edit history</h3>
            {edits.length === 0 ? <p className="mt-2 text-sm text-slate-400">No edits sent from here yet.</p> : (
              <ul className="mt-3 divide-y divide-slate-800 text-sm">
                {edits.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p>{e.changes.map((c) => c.label).join(', ')} <span className={'ml-1 rounded-full border px-2 py-0.5 text-[11px] ' + TIER[e.tier].chip}>{TIER[e.tier].text}</span></p>
                      <p className="mt-0.5 text-xs text-slate-500">{new Date(e.createdAt).toLocaleString()}{e.error ? ' · ' + e.error : ''}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={'text-xs font-semibold ' + (STATUS[e.status] ?? '')}>{STATUS_TEXT[e.status] ?? e.status}</span>
                      {e.status === 'SENT' && <button type="button" onClick={() => recheck(e.id)} className="rounded-lg border border-slate-700 px-2.5 py-1 text-xs hover:border-slate-500">Re-check</button>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {(changes.length > 0 || result || problem) && (
          <section aria-label="Changes waiting to be sent" className="sticky bottom-3 z-30 space-y-3 rounded-xl border border-emerald-500/50 bg-slate-900/95 p-4 shadow-2xl shadow-black/60 backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-semibold">{changes.length > 0 ? <>{changes.length} unsaved change{changes.length === 1 ? '' : 's'} <span className={'ml-1 rounded-full border px-2 py-0.5 text-[11px] font-normal ' + TIER[tier].chip}>{TIER[tier].text}</span><span className="ml-2 text-xs font-normal text-slate-400">{changes.map((c) => c.label).join(', ')}</span></> : result ? 'Sent' : 'Not ready to send'}</p>
              {changes.length > 0 && !review && <span className="text-xs text-slate-500">Nothing is sent to Google until you review and send.</span>}
            </div>
            {review && changes.length > 0 && (
              <ul className="max-h-[40vh] space-y-2 overflow-y-auto">
                {changes.map((c) => (
                  <li key={c.key} className="rounded-lg border border-slate-800 bg-slate-950 p-3 text-sm">
                    <div className="flex items-center gap-2"><b>{c.label}</b><span className={'rounded-full border px-2 py-0.5 text-[11px] ' + TIER[c.tier].chip}>{TIER[c.tier].text}</span></div>
                    {c.note && <p className="mt-1 text-xs text-amber-300">{c.note}</p>}
                    <p className="mt-1.5 break-words text-xs text-slate-500">Now: {c.from}</p>
                    <p className="mt-0.5 break-words text-xs text-slate-200">New: {c.to}</p>
                  </li>
                ))}
              </ul>
            )}
            {problem && <p className="text-sm text-rose-300">{problem}</p>}
            {blocked && <p className="text-sm text-rose-300">{blocked}</p>}

            {review && tier === 'red' && !blocked && !problem && (
              <div className="space-y-2 rounded-lg border border-rose-500/40 bg-rose-500/5 p-4 text-sm">
                <p className="font-semibold text-rose-200">This edit can trigger Google video verification.</p>
                {[
                  'The owner can record a continuous video of signage, equipment and business documents if Google locks the profile.',
                  'The new value already appears on the business’s website and main directory listings.',
                  'No other identity field on this profile is being changed now or was changed in the last 7 days.',
                ].map((t, i) => (
                  <label key={i} className="flex items-start gap-2 text-slate-300"><input type="checkbox" className="mt-1" checked={checks[i]} onChange={(e) => setChecks((c) => c.map((x, j) => (j === i ? e.target.checked : x)))} /> {t}</label>
                ))}
                <input className={input + ' mt-2 w-48'} placeholder="Type VERIFY" value={typed} onChange={(e) => setTyped(e.target.value)} />
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              {!review ? (
                <button type="button" disabled={!canSend} onClick={() => setReview(true)} className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-40">Review {changes.length || ''} change{changes.length === 1 ? '' : 's'}</button>
              ) : (
                <>
                  <button type="button" disabled={!canSend || busy} onClick={send} className={'rounded-lg px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40 ' + (tier === 'red' ? 'bg-rose-400 hover:bg-rose-300' : 'bg-emerald-500 hover:bg-emerald-400')}>{busy ? 'Sending to Google…' : tier === 'red' ? 'Accept the risk and send to Google' : 'Send to Google'}</button>
                  <button type="button" disabled={busy} onClick={() => setReview(false)} className="text-sm text-slate-400 hover:text-slate-200">Back</button>
                </>
              )}
              <button type="button" disabled={busy} onClick={() => load(pick)} className="text-sm text-slate-400 hover:text-slate-200">Discard and reload</button>
            </div>
            {result && (
              <p className={'text-sm ' + STATUS[result.status]}>
                {result.status === 'LIVE' ? 'Google is showing every change.' : 'Sent. Google is not showing ' + (result.waiting.length ? result.waiting.length + ' of the changes' : 'the changes') + ' yet: it may be holding them for review. Re-check from the history below.'}
              </p>
            )}
          </section>
          )}
          </>
          )}
        </>
      )}
    </div>
  );
}
