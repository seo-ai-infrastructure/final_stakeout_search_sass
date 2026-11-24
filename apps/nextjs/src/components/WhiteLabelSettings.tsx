'use client';
import { useEffect, useState } from 'react';
import { ACCOUNT_PLANS } from '@stakeout/core/gbpPlans';

type State = {
  plan: string | null;
  allowed: boolean;
  owner: boolean;
  brand: { name: string; accent: string | null; logo: string | null; domain: string | null; showing: boolean } | null;
  cname: string;
  autoDomains: boolean;
  domainNote?: string;
};

const card = 'rounded-xl border border-slate-800 bg-slate-900 p-5';
const field = 'min-h-[40px] w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 placeholder:text-slate-600 focus:border-emerald-400 focus:outline-none';
const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

async function call<T>(method: 'GET' | 'POST' | 'DELETE', body?: unknown): Promise<T> {
  const r = await fetch('/api/brand', { method, cache: 'no-store', ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || 'That did not work.');
  return d as T;
}

/** White label on the Plan and billing page: set up by the owner on Agency and up, shown locked on Scout. */
export default function WhiteLabelSettings() {
  const [s, setS] = useState<State | null>(null);
  const [name, setName] = useState('');
  const [accent, setAccent] = useState('#ff5a1f');
  const [domain, setDomain] = useState('');
  const [logo, setLogo] = useState<{ type: string; base64: string; preview: string } | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const show = (d: State) => { setS(d); setName(d.brand?.name ?? ''); setAccent(d.brand?.accent ?? '#ff5a1f'); setDomain(d.brand?.domain ?? ''); };
  useEffect(() => { call<State>('GET').then(show).catch((e) => setError(e.message)); }, []);
  if (!s) return error ? <div className={card}><p role="alert" className="text-sm text-rose-300">{error}</p></div> : null;

  if (!s.allowed)
    return (
      <div className={card}>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold">White-label reports</h2>
          <span className="rounded-full border border-slate-700 px-2.5 py-0.5 text-xs text-slate-400">Agency and up</span>
        </div>
        <p className="mt-2 text-sm text-slate-400">Your name, logo and brand color on every shared report, brief and offline copy, with no Stakeout badge, and your own domain for the links if you like. It comes with Agency ({'$' + ACCOUNT_PLANS.P_AGENCY.tiers[0].cents / 100} a month), Scale and Agency Max.</p>
        <a href="#plans" className="mt-3 inline-block rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400">Move up to Agency</a>
      </div>
    );

  const pick = (f: File | undefined) => {
    setError('');
    if (!f) return;
    if (!LOGO_TYPES.includes(f.type)) { setError('The logo must be a PNG, JPEG or WebP image.'); return; }
    if (f.size > 300 * 1024) { setError('The logo must be under 300 KB.'); return; }
    const r = new FileReader();
    r.onload = () => { const url = String(r.result); setLogo({ type: f.type, base64: url.slice(url.indexOf(',') + 1), preview: url }); };
    r.readAsDataURL(f);
  };
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    setBusy('save'); setError(''); setNote('');
    call<State>('POST', { name, accent, domain: domain.trim(), ...(logo ? { logo: { type: logo.type, base64: logo.base64 } } : {}) })
      .then((d) => { show(d); setLogo(null); setNote(d.domainNote || 'Saved: your shared reports carry your brand now.'); })
      .catch((err) => setError(err.message))
      .finally(() => setBusy(''));
  };
  const remove = () => {
    if (!window.confirm('Take your brand off your reports? They go back to showing Stakeout Search.')) return;
    setBusy('remove'); setError(''); setNote('');
    call<State>('DELETE').then((d) => { show(d); setNote('Your reports show Stakeout Search again.'); }).catch((err) => setError(err.message)).finally(() => setBusy(''));
  };
  const shownLogo = logo?.preview ?? s.brand?.logo ?? null;
  return (
    <div className={card}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold">White-label reports</h2>
        {s.brand && <span className={'rounded-full px-2.5 py-0.5 text-xs ' + (s.brand.showing ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-200')}>{s.brand.showing ? 'On' : 'Off on this plan'}</span>}
      </div>
      <p className="mt-2 text-sm text-slate-400">Shared reports, briefs and their offline copies carry this name, logo and color, with no Stakeout badge.</p>
      {!s.owner ? (
        <p className="mt-3 text-sm text-slate-300">{s.brand ? `Reports show “${s.brand.name}”${s.brand.domain ? ` on ${s.brand.domain}` : ''}.` : 'No brand set up yet.'} The account owner changes it.</p>
      ) : (
        <form onSubmit={save} className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="block text-sm">
            <span className="text-slate-300">Name on reports</span>
            <input className={field + ' mt-1'} required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="Your agency" />
          </label>
          <label className="block text-sm">
            <span className="text-slate-300">Brand color</span>
            <span className="mt-1 flex gap-2">
              <input type="color" aria-label="Pick a color" value={accent} onChange={(e) => setAccent(e.target.value)} className="h-10 w-12 cursor-pointer rounded-lg border border-slate-700 bg-slate-950" />
              <input className={field} value={accent} onChange={(e) => setAccent(e.target.value)} pattern="#[0-9a-fA-F]{6}" aria-label="Color as a hex code" />
            </span>
          </label>
          <div className="text-sm">
            <span className="text-slate-300">Logo</span>
            <div className="mt-1 flex items-center gap-3">
              {shownLogo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={shownLogo} alt="Your logo" className="h-12 w-auto max-w-[160px] rounded-md bg-white object-contain p-1" />
              ) : <span className="text-xs text-slate-500">No logo yet</span>}
              <label className="cursor-pointer rounded-lg border border-slate-700 px-3 py-2 text-sm hover:border-slate-500">
                {shownLogo ? 'Change' : 'Upload'}
                <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
              </label>
            </div>
            <p className="mt-1 text-xs text-slate-500">PNG, JPEG or WebP, under 300 KB. It sits on white, so a dark logo shows best.</p>
          </div>
          <label className="block text-sm">
            <span className="text-slate-300">Your domain for report links <span className="text-slate-500">(optional)</span></span>
            <input className={field + ' mt-1'} value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="reports.youragency.com" autoComplete="off" />
            <span className="mt-1 block text-xs text-slate-500">Add a CNAME record for it pointing to {s.cname}. {s.autoDomains ? 'Links work on it as soon as the DNS change reaches us.' : 'We switch it on at our end within a business day.'} Without one, links use our address with your brand.</span>
          </label>
          <div className="flex flex-wrap items-center gap-2 md:col-span-2">
            <button type="submit" disabled={busy === 'save' || !name.trim()} className="min-h-[40px] rounded-lg bg-emerald-500 px-4 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-40">{busy === 'save' ? 'Saving…' : s.brand ? 'Save changes' : 'Turn on white label'}</button>
            {s.brand && <button type="button" onClick={remove} disabled={busy === 'remove'} className="min-h-[40px] rounded-lg border border-slate-700 px-4 text-sm text-slate-300 hover:border-rose-400 hover:text-rose-200 disabled:opacity-40">{busy === 'remove' ? 'Working…' : 'Use Stakeout branding'}</button>}
          </div>
        </form>
      )}
      {note && <p className="mt-3 text-sm text-emerald-300">{note}</p>}
      {error && <p role="alert" className="mt-3 text-sm text-rose-300">{error}</p>}
    </div>
  );
}
