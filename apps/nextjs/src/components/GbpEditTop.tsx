'use client';
import { useCallback, useEffect, useState } from 'react';
import { nextHoliday, type GbpChange, type GbpLocation } from '@stakeout/core/gbp';
import type { ActionLink, Attr, Service } from '@stakeout/core/gbpExtras';

type Drift = { id: string; locationId: string; profileId: string; field: string; label: string; was: string; now: string; foundAt: string; revert?: GbpChange | null };
export type ExtrasLite = { attributes: { list: Attr[] }; services: { list: Service[]; canEdit: boolean }; links: { list: ActionLink[]; types: string[] } };

async function call<T>(url: string, body?: unknown): Promise<T> {
  const r = await fetch(url, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Request failed.');
  return j as T;
}
/** Brings a part of the editor into view, opening it first when it is folded away. */
export function goTo(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  if (el instanceof HTMLDetailsElement) el.open = true;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
const cut = (t: string) => (t.length > 140 ? t.slice(0, 140) + '…' : t);

/**
 * The top of the listing editor: anything on the listing that changed without an edit from here
 * (each can be put back or kept), and the gaps worth closing, each a link to where it is fixed.
 */
export default function GbpEditTop({ profile, location, live, extras, todayIso, onRestored }: { profile: string; location: string; live: GbpLocation; extras: ExtrasLite | null; todayIso: string; onRestored: () => void }) {
  const [drift, setDrift] = useState<Drift[]>([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    call<{ open: Drift[] }>('/api/admin/gbp/watch').then((r) => setDrift(r.open.filter((d) => d.locationId === location))).catch(() => setDrift([]));
  }, [location]);
  useEffect(() => { setDrift([]); setError(''); load(); }, [load]);

  const act = async (key: string, work: () => Promise<unknown>, after?: () => void) => {
    setBusy(key); setError('');
    try { await work(); load(); after?.(); } catch (e) { setError(e instanceof Error ? e.message : 'That did not work.'); } finally { setBusy(''); }
  };
  // Putting a value back is an edit like any other: it goes through the editor's own route and checks.
  const restore = (d: Drift) => act(d.id + 'back', async () => {
    await call('/api/admin/gbp/update', { profile: d.profileId, location: d.locationId, change: d.revert });
    await call('/api/admin/gbp/watch', { action: 'reverted', id: d.id });
  }, onRestored);
  const keep = (d: Drift) => act(d.id + 'keep', () => call('/api/admin/gbp/watch', { action: 'keep', id: d.id }));

  const meta = (live.metadata ?? {}) as { hasGoogleUpdated?: boolean; hasPendingEdits?: boolean };
  const holiday = nextHoliday(live, todayIso);
  const noText = extras ? extras.services.list.filter((s) => !s.description.trim()).length : 0;
  const unset = extras ? extras.attributes.list.filter((a) => (Array.isArray(a.value) ? a.value.length === 0 : a.value === null)).length : 0;
  const canBook = extras ? extras.links.types.includes('APPOINTMENT') || extras.links.types.includes('ONLINE_APPOINTMENT') : false;
  const booked = extras ? extras.links.list.some((l) => l.type === 'APPOINTMENT' || l.type === 'ONLINE_APPOINTMENT') : true;
  const pills: { text: string; to: string }[] = [
    ...(holiday && !holiday.set ? [{ text: `Holiday hours missing (${holiday.name} ${holiday.days === 0 ? 'today' : `in ${holiday.days}d`})`, to: 'gbp-holiday' }] : []),
    ...(extras && extras.services.canEdit && extras.services.list.length === 0 ? [{ text: 'No services listed', to: 'gbp-services' }] : []),
    ...(noText > 0 ? [{ text: `${noText} service${noText === 1 ? '' : 's'} missing a description`, to: 'gbp-services' }] : []),
    ...(unset > 0 ? [{ text: `${unset} unset attribute${unset === 1 ? '' : 's'}`, to: 'gbp-attributes' }] : []),
    ...(canBook && !booked ? [{ text: 'No appointment link', to: 'gbp-links' }] : []),
    ...(!String(live.profile?.description ?? '').trim() ? [{ text: 'No description', to: 'gbp-description' }] : []),
  ];
  if (!drift.length && !meta.hasGoogleUpdated && !meta.hasPendingEdits && !pills.length && extras) return <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-2.5 text-sm text-emerald-200">Nothing on this listing changed behind your back, and the usual gaps are closed.</p>;

  return (
    <div className="space-y-3">
      {(drift.length > 0 || meta.hasGoogleUpdated) && (
        <div className="rounded-xl border border-amber-500/50 bg-amber-500/10 p-4">
          <p className="text-sm font-semibold text-amber-100">{drift.length > 0 ? `${drift.length} thing${drift.length === 1 ? '' : 's'} on this listing changed without an edit from here` : 'Google has changed something on this listing'}</p>
          <p className="mt-0.5 text-xs text-amber-200/80">Google’s own updates, a “suggest an edit” from the public, or another manager. {drift.length === 0 && 'The daily check has not picked out which field yet: it will show here once it has, or open the listing on Google to review the update.'}</p>
          {error && <p className="mt-2 text-xs text-rose-300">{error}</p>}
          <ul className="mt-3 space-y-2">
            {drift.map((d) => (
              <li key={d.id} className="rounded-lg border border-amber-500/30 bg-slate-950/60 p-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-100">{d.label} <span className="ml-1 text-xs font-normal text-slate-500">found {new Date(d.foundAt).toLocaleDateString()}</span></p>
                    <p className="mt-1 break-words text-xs text-slate-400"><span className="text-slate-500">Ours:</span> {cut(d.was)}</p>
                    <p className="mt-0.5 break-words text-xs text-amber-200"><span className="text-slate-500">Now on Google:</span> {cut(d.now)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {d.revert ? <button type="button" disabled={Boolean(busy)} onClick={() => restore(d)} className="rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-amber-300 disabled:opacity-40">{busy === d.id + 'back' ? 'Restoring…' : 'Restore our version'}</button> : <span className="text-xs text-slate-500" title="An identity field, the address or the open status: put it back on Google itself, or from the Changes tab.">Not restorable in one click</span>}
                    <button type="button" disabled={Boolean(busy)} onClick={() => keep(d)} className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-200 hover:border-slate-400 disabled:opacity-40">{busy === d.id + 'keep' ? 'Keeping…' : 'Keep Google’s'}</button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {meta.hasPendingEdits && <p className="rounded-lg border border-sky-500/40 bg-sky-500/10 px-4 py-2.5 text-sm text-sky-100">Google is holding an edit to this listing for review. Until it decides, what is sent from here may not show.</p>}
      {pills.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">To close</span>
          {pills.map((p) => <button key={p.text} type="button" onClick={() => goTo(p.to)} className="rounded-full border border-amber-400/50 bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-100 hover:bg-amber-400/20">{p.text} →</button>)}
        </div>
      )}
    </div>
  );
}
