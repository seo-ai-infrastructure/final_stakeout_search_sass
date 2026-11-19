'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { REPLY_MAX_BYTES, filterReviews, replyBytes, replyProblem, reviewSummary, type Review, type ReviewFilter } from '@stakeout/core/gbpReviews';

type Profile = { id: string; name: string; locations: { id: string; name: string }[] };
type Page = { reviews: Review[]; total: number; page: number; more: boolean };
type Loaded = { reviews: Review[]; total: number; page: number; more: boolean; problem: string | null };

const card = 'rounded-xl border border-slate-800 bg-slate-900 p-5';
const input = 'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500 disabled:opacity-50';
const FILTERS: [ReviewFilter, string][] = [['unanswered', 'Needs a reply'], ['low', '3 stars or fewer'], ['all', 'All']];
const REPLY_STATE: Record<string, { text: string; tone: string }> = {
  published: { text: 'On Google', tone: 'text-emerald-300' },
  synced: { text: 'On Google', tone: 'text-emerald-300' },
  pending: { text: 'Sending to Google…', tone: 'text-amber-300' },
  failed: { text: 'Google did not take it', tone: 'text-rose-300' },
  failed_waiting_for_retry: { text: 'Failed, being retried', tone: 'text-amber-300' },
};

async function call<T>(url: string, method = 'GET', body?: unknown): Promise<T> {
  const r = await fetch(url, { method, cache: 'no-store', ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Request failed.');
  return j as T;
}
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '');

function Stars({ n }: { n: number | null }) {
  if (n === null) return <span className="text-xs text-slate-500">No rating</span>;
  return (
    <span aria-label={n + ' out of 5 stars'} className="whitespace-nowrap text-sm tracking-tight">
      <span className={n <= 3 ? 'text-rose-400' : 'text-amber-400'}>{'★'.repeat(n)}</span>
      <span className="text-slate-700">{'★'.repeat(5 - n)}</span>
    </span>
  );
}

/** One review with its reply, and the box to answer it. */
function ReviewCard({ profile, review, listing, onChange, onOpenListing }: { profile: string; review: Review; listing: string; onChange: (r: Review) => void; onOpenListing: () => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [sure, setSure] = useState(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const state = review.reply ? REPLY_STATE[review.reply.status] ?? { text: review.reply.status, tone: 'text-slate-400' } : null;
  const problem = text.trim() ? replyProblem(text) : null;

  // A reply is accepted at once and published in the background: look again until Google has answered.
  const follow = useCallback((tries: number) => {
    if (tries <= 0) return;
    setTimeout(async () => {
      if (!alive.current) return;
      const r = await call<{ review: Review | null }>('/api/admin/gbp/reviews', 'PATCH', { profile, review: review.id }).catch(() => null);
      if (!alive.current || !r?.review) return;
      onChange(r.review);
      if (r.review.reply?.status === 'pending') follow(tries - 1);
    }, 5000);
  }, [profile, review.id, onChange]);

  const send = async () => {
    setBusy('Sending…'); setError('');
    try {
      const r = await call<{ review: Review | null }>('/api/admin/gbp/reviews', 'POST', { profile, review: review.id, body: text });
      // If the service did not hand the review back, show the reply as on its way.
      onChange(r.review ?? { ...review, reply: { id: '', text: text.trim(), status: 'pending', error: null, postedAt: new Date().toISOString() } });
      setOpen(false); setText('');
      follow(6);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The reply was not sent.');
    } finally {
      setBusy('');
    }
  };
  const remove = async () => {
    if (!review.reply?.id) return;
    setBusy('Removing…'); setError('');
    try {
      await call('/api/admin/gbp/reviews?profile=' + encodeURIComponent(profile) + '&reply=' + encodeURIComponent(review.reply.id), 'DELETE');
      onChange({ ...review, reply: null });
      setSure(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The reply was not removed.');
    } finally {
      setBusy('');
    }
  };

  return (
    <li className="p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="flex min-w-0 items-baseline gap-2">
          <Stars n={review.stars} />
          <span className="truncate text-sm font-semibold text-slate-100">{review.author}</span>
          <span className="shrink-0 text-xs text-slate-500">{when(review.postedAt)}</span>
        </div>
        <button type="button" onClick={onOpenListing} className="max-w-full truncate text-xs text-sky-400 hover:underline" title="Open this listing">{listing}</button>
      </div>
      {review.text ? <p className="mt-2 whitespace-pre-line break-words text-sm text-slate-300">{review.text}</p> : <p className="mt-2 text-sm italic text-slate-500">Rating only, no words.</p>}

      {review.reply && (
        <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/60 p-3">
          <p className="text-xs"><span className="font-semibold text-slate-300">Your reply</span> · <span className={state!.tone}>{state!.text}</span>{review.reply.postedAt && <span className="text-slate-500"> · {when(review.reply.postedAt)}</span>}</p>
          <p className="mt-1.5 whitespace-pre-line break-words text-sm text-slate-300">{review.reply.text}</p>
          {review.reply.error && <p className="mt-1.5 text-xs text-rose-300">{review.reply.error}</p>}
        </div>
      )}

      {open ? (
        <div className="mt-3">
          <textarea className={input + ' h-28'} autoFocus value={text} disabled={Boolean(busy)} onChange={(e) => setText(e.target.value)} placeholder={'Reply to ' + review.author + ' as the business'} />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" onClick={send} disabled={Boolean(busy) || !text.trim() || Boolean(problem)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-40">{busy || (review.reply ? 'Replace reply' : 'Send reply')}</button>
            <button type="button" onClick={() => { setOpen(false); setError(''); }} disabled={Boolean(busy)} className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm hover:border-slate-500">Cancel</button>
            <span className={'ml-auto text-xs ' + (problem ? 'text-rose-300' : 'text-slate-500')}>{problem ?? replyBytes(text) + ' / ' + REPLY_MAX_BYTES}</span>
          </div>
          <p className="mt-1.5 text-xs text-slate-500">Replies are public and shown under the business’s name. {review.reply ? 'A review has one reply: this replaces the one above.' : ''}</p>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
          <button type="button" onClick={() => { setOpen(true); setText(review.reply?.text ?? ''); }} className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm hover:border-slate-500">{review.reply ? 'Edit reply' : 'Reply'}</button>
          {review.reply?.id && (sure
            ? <><button type="button" onClick={remove} disabled={Boolean(busy)} className="text-rose-300 hover:underline">{busy || 'Yes, remove my reply'}</button><button type="button" onClick={() => setSure(false)} className="text-slate-400 hover:underline">Keep it</button></>
            : <button type="button" onClick={() => setSure(true)} className="text-slate-400 hover:text-rose-300">Remove reply</button>)}
          {review.permalink && <a href={review.permalink} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-sky-300">See it on Google</a>}
        </div>
      )}
      {error && <p className="mt-2 text-xs text-rose-300">{error}</p>}
    </li>
  );
}

/**
 * The review inbox: every connected account's Google reviews, newest first, with what still
 * needs an answer on top. `only` narrows it to the listing that is open.
 */
export default function GbpReviews({ profiles, only, onOpenListing }: { profiles: Profile[]; only: { profile: string; location: string } | null; onOpenListing: (p: { profile: string; location: string }) => void }) {
  const [filter, setFilter] = useState<ReviewFilter>('unanswered');
  const [narrow, setNarrow] = useState(Boolean(only));
  const [loaded, setLoaded] = useState<Record<string, Loaded>>({});
  const [loading, setLoading] = useState(false);
  const scope = narrow && only ? only : null;
  const names = useMemo(() => new Map(profiles.flatMap((p) => p.locations.map((l) => [l.id, l.name] as const))), [profiles]);
  const asked = useRef(0);
  // Reviews answered in this sitting stay in view under any filter, so the reply can be seen landing.
  const [touched, setTouched] = useState<Set<string>>(new Set());

  const fetchPage = useCallback(async (profile: string, page: number, location: string | undefined): Promise<Loaded & { page: number }> => {
    try {
      const r = await call<Page>('/api/admin/gbp/reviews?profile=' + encodeURIComponent(profile) + '&page=' + page + (location ? '&location=' + encodeURIComponent(location) : ''));
      return { ...r, problem: null };
    } catch (e) {
      return { reviews: [], total: 0, page, more: false, problem: e instanceof Error ? e.message : 'Could not read the reviews.' };
    }
  }, []);

  // A new scope starts from the first page; an answer to an older request is dropped.
  useEffect(() => {
    const mine = ++asked.current;
    const list = scope ? profiles.filter((p) => p.id === scope.profile) : profiles;
    setLoaded({}); setLoading(true); setTouched(new Set());
    Promise.all(list.map(async (p) => [p.id, await fetchPage(p.id, 1, scope?.location)] as const)).then((rows) => {
      if (mine !== asked.current) return;
      setLoaded(Object.fromEntries(rows)); setLoading(false);
    });
  }, [profiles, scope?.profile, scope?.location, fetchPage]); // eslint-disable-line react-hooks/exhaustive-deps

  const more = async () => {
    const mine = asked.current;
    setLoading(true);
    const next = await Promise.all(Object.entries(loaded).filter(([, l]) => l.more).map(async ([id, l]) => [id, l, await fetchPage(id, l.page + 1, scope?.location)] as const));
    if (mine !== asked.current) return;
    setLoaded((cur) => {
      const out = { ...cur };
      for (const [id, was, got] of next) {
        if (got.problem) { out[id] = { ...was, problem: got.problem }; continue; }
        const have = new Set(was.reviews.map((r) => r.id));
        out[id] = { ...got, reviews: [...was.reviews, ...got.reviews.filter((r) => !have.has(r.id))] };
      }
      return out;
    });
    setLoading(false);
  };

  const all = useMemo(
    () => Object.entries(loaded).flatMap(([profile, l]) => l.reviews.map((review) => ({ profile, review }))).sort((a, b) => String(b.review.postedAt ?? '').localeCompare(String(a.review.postedAt ?? ''))),
    [loaded],
  );
  const shown = useMemo(() => { const keep = new Set(filterReviews(all.map((x) => x.review), filter).map((r) => r.id)); return all.filter((x) => keep.has(x.review.id) || touched.has(x.review.id)); }, [all, filter, touched]);
  const sum = reviewSummary(all.map((x) => x.review));
  const total = Object.values(loaded).reduce((n, l) => n + l.total, 0);
  const canMore = Object.values(loaded).some((l) => l.more);
  const problems = Object.entries(loaded).filter(([, l]) => l.problem);
  const replace = (profile: string, r: Review) => { setTouched((t) => (t.has(r.id) ? t : new Set(t).add(r.id))); setLoaded((cur) => (cur[profile] ? { ...cur, [profile]: { ...cur[profile], reviews: cur[profile].reviews.map((x) => (x.id === r.id ? r : x)) } } : cur)); };

  return (
    <div className="space-y-5">
      <div className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map(([f, label]) => (
              <button key={f} type="button" onClick={() => setFilter(f)} aria-pressed={filter === f} className={'rounded-full border px-3 py-1 text-sm ' + (filter === f ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-300' : 'border-slate-700 text-slate-300 hover:border-slate-500')}>
                {label}{f === 'unanswered' && sum.unanswered > 0 ? ' · ' + sum.unanswered : ''}
              </button>
            ))}
          </div>
          {only && (
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={narrow} onChange={(e) => setNarrow(e.target.checked)} className="accent-emerald-500" />
              Only {names.get(only.location) ?? 'the open listing'}
            </label>
          )}
        </div>
        <p className="mt-3 text-xs text-slate-500">
          {loading && !all.length ? 'Reading reviews…' : (
            <>
              {all.length < total ? `The newest ${all.length} of ${total} reviews are loaded` : `${total} review${total === 1 ? '' : 's'}`}
              {sum.average !== null && <> · average {sum.average.toFixed(1)} stars{all.length < total ? ' among them' : ''}</>}
              {sum.unanswered > 0 && <> · {sum.unanswered} without a reply{sum.lowUnanswered > 0 && <span className="text-rose-300"> ({sum.lowUnanswered} at 3 stars or fewer)</span>}</>}
              . Reviews arrive from Google twice a day, so one left in the last few hours may not be here yet.
            </>
          )}
        </p>
        {problems.map(([id, l]) => <p key={id} className="mt-2 text-xs text-amber-300">{profiles.find((p) => p.id === id)?.name ?? id}: {l.problem}</p>)}
      </div>

      {!loading && all.length > 0 && shown.length === 0 && (
        <p className={card + ' text-sm text-slate-400'}>
          {filter === 'unanswered' ? 'Every review loaded so far has a reply.' : 'No reviews at 3 stars or fewer among the ones loaded.'}{canMore ? ' Load older reviews to look further back.' : ''}
        </p>
      )}
      {!loading && all.length === 0 && !problems.length && <p className={card + ' text-sm text-slate-400'}>No reviews yet{scope ? ' for this listing' : ''}.</p>}

      {shown.length > 0 && (
        <ul className="divide-y divide-slate-800 rounded-xl border border-slate-800 bg-slate-900">
          {shown.map(({ profile, review }) => (
            <ReviewCard key={profile + review.id} profile={profile} review={review} listing={names.get(review.location) ?? 'Listing …' + review.location.slice(-5)} onChange={(r) => replace(profile, r)} onOpenListing={() => onOpenListing({ profile, location: review.location })} />
          ))}
        </ul>
      )}
      {canMore && <button type="button" onClick={more} disabled={loading} className="rounded-lg border border-slate-700 px-4 py-2 text-sm hover:border-slate-500 disabled:opacity-40">{loading ? 'Loading…' : 'Load older reviews'}</button>}
    </div>
  );
}
