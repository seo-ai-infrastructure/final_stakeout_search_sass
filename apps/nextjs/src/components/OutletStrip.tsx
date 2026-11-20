'use client';
import { useCallback, useEffect, useState } from 'react';
import { OUTLET_NAME, type ExtraOutlet } from '@stakeout/core/outlets';

export type Outlet = {
  outlet: ExtraOutlet;
  connected: boolean;
  account: string | null;
  avatar: string | null;
  status: string | null;
  expiresAt: string | null;
  chosen: { id: string | null; name: string } | null;
  choices: { id: string | null; name: string; suggested?: boolean }[] | null;
};
export type Tick = ExtraOutlet | 'google_business';

/** Each network's own colour, used on its mark only. */
export const OUTLET_MARK: Record<ExtraOutlet | 'google_business', { text: string; color: string }> = {
  google_business: { text: 'G', color: '#4285F4' },
  facebook: { text: 'f', color: '#1877F2' },
  linkedin: { text: 'in', color: '#0A66C2' },
};

export function OutletMark({ outlet, on = true, size = 28 }: { outlet: ExtraOutlet | 'google_business'; on?: boolean; size?: number }) {
  const m = OUTLET_MARK[outlet];
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full font-bold leading-none text-white"
      style={{ width: size, height: size, fontSize: size * 0.46, backgroundColor: on ? m.color : '#334155', color: on ? '#fff' : '#94a3b8' }}
    >
      {m.text}
    </span>
  );
}

async function call<T>(url: string, method = 'GET', body?: unknown): Promise<T> {
  const r = await fetch(url, { method, cache: 'no-store', ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || 'Request failed.'), { status: r.status });
  return j as T;
}

/**
 * One row of marks for a listing: Google (always on), then Facebook and LinkedIn. A grey mark is
 * not connected: selecting it signs in. A coloured one opens a small panel with the Page that is
 * this business, and "Change" or "Stop posting here". Right after a sign-in that manages several
 * Pages, the panel opens by itself to ask which one this business is.
 *
 * Draws nothing where the feature is not open (the server says so), so it can sit on any listing.
 */
export default function OutletStrip({ profile, location, name = '', onChange }: { profile: string; location: string; name?: string; onChange?: (o: Outlet[], off: Tick[]) => void }) {
  const [outlets, setOutlets] = useState<Outlet[] | null>(null);
  const [open, setOpen] = useState<ExtraOutlet | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [find, setFind] = useState('');
  const base = `profile=${encodeURIComponent(profile)}&location=${encodeURIComponent(location)}`;

  const take = useCallback(
    (list: Outlet[], off: Tick[] = []) => {
      setOutlets(list);
      onChange?.(list, off);
      // A sign-in that manages several Pages and has none chosen for this listing: ask now.
      const ask = list.find((o) => o.connected && !o.chosen && o.choices && o.choices.length > 1);
      if (ask) setOpen((cur) => cur ?? ask.outlet);
    },
    [onChange],
  );
  const load = useCallback(async () => {
    try {
      const r = await call<{ outlets: Outlet[]; off?: Tick[] }>('/api/admin/gbp/outlets?' + base);
      take(r.outlets, r.off ?? []);
    } catch (e) {
      // Not open on this account: the strip simply is not there.
      if ((e as { status?: number }).status === 403) setOutlets([]);
      else setError(e instanceof Error ? e.message : 'Could not read the connected networks.');
    }
  }, [base, take]);
  useEffect(() => { setOutlets(null); setOpen(null); setError(''); setFind(''); load(); }, [load]);

  if (!outlets || outlets.length === 0) return error ? <p className="text-xs text-rose-300">{error}</p> : null;

  const act = async (outlet: ExtraOutlet, action: 'connect' | 'choose' | 'forget', placement?: string | null) => {
    setBusy(outlet + action); setError('');
    try {
      const r = await call<{ url?: string; outlets?: Outlet[]; off?: Tick[] }>('/api/admin/gbp/outlets', 'POST', { profile, location, outlet, action, placement });
      if (r.url) { window.location.href = r.url; return; }
      if (r.outlets) take(r.outlets, r.off ?? []);
      setFind('');
      if (action !== 'connect') setOpen(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work.');
    } finally {
      setBusy('');
    }
  };
  const change = async (outlet: ExtraOutlet) => {
    setBusy(outlet + 'list');
    try { const r = await call<{ outlets: Outlet[]; off?: Tick[] }>('/api/admin/gbp/outlets?' + base + '&choices=' + outlet); take(r.outlets, r.off ?? []); } catch (e) { setError(e instanceof Error ? e.message : 'Could not list the Pages.'); } finally { setBusy(''); }
  };
  const shown = outlets.find((o) => o.outlet === open) ?? null;

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs text-slate-400">Connected accounts</span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 py-0.5 pl-0.5 pr-2.5 text-xs text-slate-200" title="The Google listing">
          <OutletMark outlet="google_business" /> <span className="max-w-[14rem] truncate">{name || 'Google'}</span>
        </span>
        {outlets.map((o) => {
          const ready = o.connected && o.chosen;
          const label = OUTLET_NAME[o.outlet];
          return (
            <button
              key={o.outlet}
              type="button"
              disabled={Boolean(busy)}
              aria-expanded={open === o.outlet}
              onClick={() => (o.connected ? setOpen(open === o.outlet ? null : o.outlet) : act(o.outlet, 'connect'))}
              title={ready ? `${label}: ${o.chosen!.name}` : o.connected ? `${label}: choose which Page is this business` : `Connect ${label}`}
              className={'inline-flex items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2.5 text-xs ' + (ready ? 'border-slate-700 text-slate-200' : o.connected ? 'border-amber-400/60 text-amber-300' : 'border-dashed border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200')}
            >
              <OutletMark outlet={o.outlet} on={Boolean(ready)} />
              <span className="max-w-[14rem] truncate">{busy === o.outlet + 'connect' ? 'Opening…' : ready ? o.chosen!.name : o.connected ? 'Choose a Page' : 'Connect ' + label}</span>
            </button>
          );
        })}
      </div>

      {shown && shown.connected && (
        <div className="mt-3 rounded-lg border border-slate-800 bg-slate-900 p-3 text-sm">
          {shown.chosen && !shown.choices ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="text-slate-200">
                {OUTLET_NAME[shown.outlet]}: <span className="font-semibold text-white">{shown.chosen.name}</span>
                {shown.account && <span className="text-slate-500"> · signed in as {shown.account}</span>}
              </span>
              <button type="button" disabled={Boolean(busy)} onClick={() => change(shown.outlet)} className="text-xs text-slate-400 hover:text-sky-300">{busy === shown.outlet + 'list' ? 'Listing…' : 'Change'}</button>
              <button type="button" disabled={Boolean(busy)} onClick={() => act(shown.outlet, 'forget')} className="text-xs text-slate-400 hover:text-rose-300">Stop posting here</button>
            </div>
          ) : shown.choices && shown.choices.length ? (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-slate-200">Which {shown.outlet === 'facebook' ? 'Facebook Page' : 'LinkedIn page'} is this business?</p>
                {/* A long list gets a box to narrow it. */}
                {shown.choices.length > 8 && (
                  <input
                    value={find}
                    onChange={(e) => setFind(e.target.value)}
                    placeholder={`Search ${shown.choices.length} pages`}
                    aria-label="Search the pages"
                    className="w-56 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 text-sm text-slate-100 outline-none focus:border-emerald-500"
                  />
                )}
              </div>
              {(() => {
                const q = find.trim().toLowerCase();
                const list = shown.choices.filter((c) => !q || c.name.toLowerCase().includes(q));
                if (!list.length) return <p className="mt-2 text-xs text-slate-500">No page with “{find.trim()}” in its name.</p>;
                return (
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {list.map((c) => (
                      <li key={c.id ?? 'self'}>
                        <button
                          type="button"
                          disabled={Boolean(busy)}
                          onClick={() => act(shown.outlet, 'choose', c.id)}
                          className={'rounded-lg border px-3 py-1.5 text-sm ' + (shown.chosen?.id === c.id || c.suggested ? 'border-emerald-500 text-emerald-200' : 'border-slate-700 text-slate-200 hover:border-slate-500')}
                        >
                          {c.name}
                          {c.suggested && <span className="ml-1.5 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-300">Looks like this one</span>}
                          {c.id === null && <span className="ml-1 text-xs text-slate-500">(own profile)</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                );
              })()}
            </>
          ) : (
            <p className="text-slate-400">
              {shown.account ? `Signed in as ${shown.account}, but ` : ''}that sign-in manages no {shown.outlet === 'facebook' ? 'Facebook Page' : 'page'} to post to.
            </p>
          )}
        </div>
      )}
      {error && <p className="mt-2 text-xs text-rose-300">{error}</p>}
    </div>
  );
}
