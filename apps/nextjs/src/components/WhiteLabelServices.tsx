'use client';
import { useEffect, useState } from 'react';

/**
 * White-Label Services: an agency picks a client, sees what its listing and latest scan say, and
 * orders a citation build or a local traffic campaign with the form already filled in. Below,
 * every paid order with its status and proof report. Admins only for now. Nothing here appears on
 * scan reports, share links or embeds.
 */

type ServiceType = 'citation_sync' | 'traffic_boost';
type Service = { type: ServiceType; name: string; cents: number; monthly: boolean; resale: string; blurb?: string; includes?: { title: string; note: string }[] };
type Client = { id: string; name: string; profile: string | null; location: string | null; placeId: string | null; source: 'listing' | 'scans' };
type Listing = { name: string; address: string; phone: string; website: string; category: string; hours: string; logo: string | null; mapsUrl: string | null };
type Scan = { id: string; keyword: string; gridSize: number; at: string; outerPins: number; weakOuterPinsCount: number; weakZipCodes: string[]; trackedKeywords: string[]; aioCitedDomains: string[] };
type Ctx = { client: Client; listing: Listing | null; listingProblem: string | null; scan: Scan | null };
type Order = { id: string; createdAt: string; client: string; service: string; serviceName: string; status: string; cents: number; monthly: boolean; deliverableUrl: string | null; buyer: string | null; intake: string[] | null };
type Data = { ready: boolean; services: Service[]; clients: Client[]; orders: Order[]; admin: boolean };

const usd = (c: number) => '$' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 });
const STATUS: Record<string, { label: string; tone: string }> = {
  intake_submitted: { label: 'Intake submitted', tone: 'border-sky-500/40 bg-sky-500/10 text-sky-200' },
  live: { label: 'Live', tone: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200' },
  completed: { label: 'Completed', tone: 'border-slate-500/40 bg-slate-500/10 text-slate-200' },
  paused: { label: 'Paused', tone: 'border-amber-500/40 bg-amber-500/10 text-amber-200' },
};
const MARGIN: Record<ServiceType, (s: Service) => string> = {
  citation_sync: (s) => `Wholesale: ${usd(s.cents)} once · Typical Agency Resale: ${s.resale}`,
  traffic_boost: (s) => `Wholesale: ${usd(s.cents)}/mo (Media Included) · Typical Agency Resale: ${s.resale}`,
};
const dateOf = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

async function json<T>(r: Response): Promise<T> {
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((d as { error?: string }).error || 'Something went wrong.');
  return d as T;
}

function Tick() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-[3px] shrink-0 text-emerald-300">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

function Lock() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-slate-600 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-300">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="5" y="11" width="14" height="10" rx="2" />
        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      </svg>
      Admin only
    </span>
  );
}

export default function WhiteLabelServices() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [clientId, setClientId] = useState('');
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [ctxError, setCtxError] = useState('');
  const [loadingCtx, setLoadingCtx] = useState(false);
  const [ordering, setOrdering] = useState<Service | null>(null);

  const load = () =>
    fetch('/api/services', { cache: 'no-store' })
      .then((r) => json<Data>(r))
      .then(setData)
      .catch((e) => setError((e as Error).message));
  useEffect(() => {
    load();
    // Back from Stripe: the paid order is recorded, and the address tidied.
    const q = new URLSearchParams(window.location.search);
    const paid = q.get('service_paid');
    if (!paid) return;
    window.history.replaceState(null, '', '/services');
    if (paid === 'cancelled') {
      setNotice('Checkout cancelled: nothing was charged.');
      return;
    }
    fetch('/api/services/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session: paid }) })
      .then((r) => json<{ client: string }>(r))
      .then((d) => {
        setNotice(`Order received for ${d.client}. It is set up by hand; its status and proof report show below.`);
        load();
      })
      .catch((e) => setNotice((e as Error).message));
  }, []);

  useEffect(() => {
    setCtx(null);
    setCtxError('');
    if (!clientId) return;
    let live = true;
    setLoadingCtx(true);
    fetch('/api/services/context?client=' + encodeURIComponent(clientId), { cache: 'no-store' })
      .then((r) => json<Ctx>(r))
      .then((d) => live && setCtx(d))
      .catch((e) => live && setCtxError((e as Error).message))
      .finally(() => live && setLoadingCtx(false));
    return () => {
      live = false;
    };
  }, [clientId]);

  if (error) return <div className="mx-auto max-w-6xl p-5"><p role="alert" className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-4 text-rose-100">{error}</p></div>;
  if (!data) return <div className="mx-auto max-w-6xl p-5 text-slate-400">Loading…</div>;
  const listings = data.clients.filter((c) => c.source === 'listing');
  const scanned = data.clients.filter((c) => c.source === 'scans');

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">White-Label Services</h1>
        <Lock />
      </div>
      <p className="max-w-3xl text-sm text-slate-400">
        Order work for a client at wholesale and resell it under your brand. Nothing on this page shows on scan reports, share links or embeds.
      </p>
      {notice && <p role="status" className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-100">{notice}</p>}
      {!data.ready && <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">Stripe is not set up, so orders cannot be paid yet.</p>}

      <section aria-labelledby="client-pick" className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <label id="client-pick" htmlFor="client" className="block text-sm font-semibold">Client</label>
        <select id="client" value={clientId} onChange={(e) => setClientId(e.target.value)} className="mt-2 min-h-[44px] w-full max-w-xl rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm">
          <option value="">Pick a client…</option>
          {listings.length > 0 && (
            <optgroup label="Google listings">
              {listings.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </optgroup>
          )}
          {scanned.length > 0 && (
            <optgroup label="From your scans (no listing connected)">
              {scanned.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </optgroup>
          )}
        </select>
        {loadingCtx && <p className="mt-3 text-sm text-slate-400">Reading the listing and its latest scan…</p>}
        {ctxError && <p role="alert" className="mt-3 text-sm text-rose-300">{ctxError}</p>}
        {ctx && <ClientSummary ctx={ctx} />}
      </section>

      <section aria-label="Services" className="grid gap-5 md:grid-cols-2">
        {data.services.map((s) => (
          <article key={s.type} className="flex flex-col rounded-xl border border-slate-800 bg-slate-900 p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-300">{s.type === 'citation_sync' ? 'Card A · one-time' : 'Card B · monthly'}</p>
            <h2 className="mt-1 text-lg font-bold">{s.name}</h2>
            <p className="mt-1 text-2xl font-extrabold">
              {usd(s.cents)}
              <span className="text-sm font-medium text-slate-400">{s.monthly ? ' / month, ad spend included' : ' once'}</span>
            </p>
            {s.includes?.length ? (
              <ul className="mt-3 space-y-2.5 text-sm leading-relaxed">
                {s.includes.map((x) => (
                  <li key={x.title} className="flex gap-2.5">
                    <Tick />
                    <span>
                      <span className="font-semibold text-slate-100">{x.title}</span> <span className="text-slate-400">({x.note})</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              s.blurb && <p className="mt-3 text-sm leading-relaxed text-slate-300">{s.blurb}</p>
            )}
            <p className="mt-4 self-start rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-200">{MARGIN[s.type](s)}</p>
            <div className="mt-auto pt-5">
              <button
                type="button"
                disabled={!ctx || !data.ready}
                onClick={() => setOrdering(s)}
                className="min-h-[44px] w-full rounded-lg bg-emerald-400 px-4 text-sm font-bold text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-400"
              >
                {!clientId ? 'Pick a client first' : !ctx ? 'Loading the client…' : `Order for ${ctx.client.name}`}
              </button>
            </div>
          </article>
        ))}
      </section>

      <Orders orders={data.orders} admin={data.admin} onChanged={load} />
      {ordering && ctx && <OrderForm service={ordering} ctx={ctx} onClose={() => setOrdering(null)} />}
    </div>
  );
}

function ClientSummary({ ctx }: { ctx: Ctx }) {
  const l = ctx.listing;
  const s = ctx.scan;
  return (
    <div className="mt-4 grid gap-4 md:grid-cols-2">
      <div className="rounded-lg border border-slate-800 bg-slate-950 p-4 text-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Google listing</p>
        {l ? (
          <div className="mt-2 flex gap-3">
            {l.logo && <img src={l.logo} alt="" width={48} height={48} className="h-12 w-12 shrink-0 rounded-lg object-cover" />}
            <dl className="grid min-w-0 grid-cols-[auto,1fr] gap-x-3 gap-y-1">
              <dt className="text-slate-400">Name</dt><dd className="truncate">{l.name}</dd>
              <dt className="text-slate-400">Category</dt><dd>{l.category || '—'}</dd>
              <dt className="text-slate-400">Address</dt><dd>{l.address || '—'}</dd>
              <dt className="text-slate-400">Phone</dt><dd>{l.phone || '—'}</dd>
              <dt className="text-slate-400">Website</dt><dd className="truncate">{l.website || '—'}</dd>
              <dt className="text-slate-400">Hours</dt><dd>{l.hours || '—'}</dd>
            </dl>
          </div>
        ) : (
          <p className="mt-2 text-slate-300">{ctx.listingProblem ? `Could not read the listing: ${ctx.listingProblem}` : 'No Google listing connected for this client; fill the details in by hand.'}</p>
        )}
      </div>
      <div className="rounded-lg border border-slate-800 bg-slate-950 p-4 text-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Latest scan</p>
        {s ? (
          <dl className="mt-2 grid grid-cols-[auto,1fr] gap-x-3 gap-y-1">
            <dt className="text-slate-400">Scan</dt><dd>“{s.keyword}”, {s.gridSize}×{s.gridSize}, {dateOf(s.at)}</dd>
            <dt className="text-slate-400">Weak outer points</dt><dd>{s.weakOuterPinsCount} of {s.outerPins} <span className="text-slate-500">(not in the top 3)</span></dd>
            <dt className="text-slate-400">Weak ZIP codes</dt><dd>{s.weakZipCodes.join(', ') || '—'}</dd>
            <dt className="text-slate-400">Keywords</dt><dd>{s.trackedKeywords.join(', ') || '—'}</dd>
            <dt className="text-slate-400">AI Overview cites</dt><dd>{s.aioCitedDomains.join(', ') || '—'}</dd>
          </dl>
        ) : (
          <p className="mt-2 text-slate-300">No finished scan for this client on this account yet. Run one to fill in the ZIP codes and keywords.</p>
        )}
      </div>
    </div>
  );
}

const input = 'mt-1 min-h-[44px] w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 placeholder:text-slate-500';
const area = 'mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500';

/** The order form, filled in from the listing and the latest scan, then on to Stripe. */
function OrderForm({ service, ctx, onClose }: { service: Service; ctx: Ctx; onClose: () => void }) {
  const l = ctx.listing;
  const citation = service.type === 'citation_sync';
  const [f, setF] = useState({
    business: l?.name ?? ctx.client.name,
    address: l?.address ?? '',
    phone: l?.phone ?? '',
    website: l?.website ?? '',
    category: l?.category ?? '',
    hours: l?.hours ?? '',
    logo: l?.logo ?? '',
    oldNap: '',
    zips: (ctx.scan?.weakZipCodes ?? []).join(', '),
    keywords: (ctx.scan?.trackedKeywords ?? []).join(', '),
    destination: 'gbp' as 'gbp' | 'landing',
    url: l?.mapsUrl ?? (ctx.client.placeId ? 'https://www.google.com/maps/place/?q=place_id:' + ctx.client.placeId : ''),
  });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const pickDestination = (d: 'gbp' | 'landing') =>
    setF({ ...f, destination: d, url: d === 'landing' ? (l?.website ?? '') : (l?.mapsUrl ?? (ctx.client.placeId ? 'https://www.google.com/maps/place/?q=place_id:' + ctx.client.placeId : '')) });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setProblem('');
    setBusy(true);
    try {
      const intake = citation
        ? { business: f.business, address: f.address, phone: f.phone, website: f.website, category: f.category, hours: f.hours, logo: f.logo, oldNap: f.oldNap }
        : { business: f.business, zips: f.zips, keywords: f.keywords, destination: f.destination, url: f.url };
      const d = await json<{ url: string }>(await fetch('/api/services', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ service: service.type, client: ctx.client.id, intake }) }));
      window.location.assign(d.url);
    } catch (err) {
      setProblem((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75">
      <div className="flex min-h-full items-center justify-center p-4">
        <form onSubmit={submit} role="dialog" aria-modal="true" aria-label={service.name} className="w-full max-w-xl space-y-4 rounded-xl bg-slate-900 p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">{service.name}</h2>
              <p className="text-sm text-slate-400">For {ctx.client.name} · {usd(service.cents)}{service.monthly ? ' a month, ad spend included' : ' once'}</p>
            </div>
            <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-slate-800">Close</button>
          </div>
          <label className="block text-sm"><span className="font-semibold">Business name</span><input required value={f.business} onChange={set('business')} className={input} /></label>
          {citation ? (
            <>
              <label className="block text-sm"><span className="font-semibold">Address</span><input required value={f.address} onChange={set('address')} className={input} /></label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm"><span className="font-semibold">Phone</span><input required value={f.phone} onChange={set('phone')} className={input} /></label>
                <label className="block text-sm"><span className="font-semibold">Primary category</span><input value={f.category} onChange={set('category')} className={input} /></label>
              </div>
              <label className="block text-sm"><span className="font-semibold">Website</span><input value={f.website} onChange={set('website')} placeholder="https://" className={input} /></label>
              <label className="block text-sm"><span className="font-semibold">Hours</span><textarea rows={2} value={f.hours} onChange={set('hours')} className={area} /></label>
              <label className="block text-sm">
                <span className="font-semibold">Logo</span>
                <div className="flex items-center gap-3">
                  {f.logo && <img src={f.logo} alt="" width={40} height={40} className="mt-1 h-10 w-10 rounded-md object-cover" />}
                  <input value={f.logo} onChange={set('logo')} placeholder="A link to the logo" className={input} />
                </div>
              </label>
              <label className="block text-sm">
                <span className="font-semibold">Existing listings or old NAP variations to watch for during audit</span> <span className="text-slate-400">(optional)</span>
                <textarea rows={3} value={f.oldNap} onChange={set('oldNap')} placeholder="Directories the business is already on, and any old names, addresses or phone numbers it has used" className={area} />
              </label>
            </>
          ) : (
            <>
              <label className="block text-sm">
                <span className="font-semibold">ZIP codes to target</span> <span className="text-slate-400">(the weak outer points of the latest scan)</span>
                <textarea required rows={2} value={f.zips} onChange={set('zips')} placeholder="33801, 33803" className={area} />
              </label>
              <label className="block text-sm">
                <span className="font-semibold">Keywords people search</span>
                <textarea required rows={2} value={f.keywords} onChange={set('keywords')} placeholder="emergency plumber near me, water heater repair" className={area} />
              </label>
              <fieldset className="text-sm">
                <legend className="font-semibold">Where the ads send people</legend>
                <div role="radiogroup" className="mt-2 inline-flex overflow-hidden rounded-lg border border-slate-700 text-sm font-semibold">
                  <button type="button" aria-pressed={f.destination === 'gbp'} onClick={() => pickDestination('gbp')} className={'min-h-[40px] px-3 ' + (f.destination === 'gbp' ? 'bg-emerald-400 text-slate-950' : 'text-slate-300')}>Promoted GBP pin</button>
                  <button type="button" aria-pressed={f.destination === 'landing'} onClick={() => pickDestination('landing')} className={'min-h-[40px] px-3 ' + (f.destination === 'landing' ? 'bg-emerald-400 text-slate-950' : 'text-slate-300')}>Local landing page</button>
                </div>
              </fieldset>
              <label className="block text-sm">
                <span className="font-semibold">{f.destination === 'gbp' ? 'Google listing link (Maps)' : 'Landing page address'}</span>
                <input required value={f.url} onChange={set('url')} placeholder="https://" className={input} />
              </label>
            </>
          )}
          {problem && <p role="alert" className="text-sm text-rose-300">{problem}</p>}
          <button type="submit" disabled={busy} className="min-h-[48px] w-full rounded-xl bg-emerald-400 px-4 text-[15px] font-extrabold text-slate-950 disabled:opacity-60">
            {busy ? 'Working…' : `Pay ${usd(service.cents)}${service.monthly ? ' a month' : ''} on Stripe`}
          </button>
        </form>
      </div>
    </div>
  );
}

/** Paid orders with their status and proof report. An admin can move each one along and attach the report. */
function Orders({ orders, admin, onChanged }: { orders: Order[]; admin: boolean; onChanged: () => void }) {
  return (
    <section aria-labelledby="orders-title" className="rounded-xl border border-slate-800 bg-slate-900 p-5">
      <h2 id="orders-title" className="text-lg font-bold">Orders & White-Label Deliverables</h2>
      {orders.length === 0 ? (
        <p className="mt-2 text-sm text-slate-400">No orders yet.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-slate-400">
              <tr>
                <th className="py-2 pr-3 font-semibold">Ordered</th>
                <th className="py-2 pr-3 font-semibold">Client</th>
                <th className="py-2 pr-3 font-semibold">Service</th>
                <th className="py-2 pr-3 font-semibold">Status</th>
                <th className="py-2 pr-3 font-semibold">Price</th>
                <th className="py-2 font-semibold">Proof report</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => <OrderRow key={o.id} o={o} admin={admin} onChanged={onChanged} />)}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function OrderRow({ o, admin, onChanged }: { o: Order; admin: boolean; onChanged: () => void }) {
  const [status, setStatus] = useState(o.status);
  const [link, setLink] = useState(o.deliverableUrl ?? '');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const changed = status !== o.status || link !== (o.deliverableUrl ?? '');
  async function save() {
    setBusy(true);
    setProblem('');
    try {
      await json(await fetch('/api/services/orders/' + encodeURIComponent(o.id), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, deliverableUrl: link }) }));
      onChanged();
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const tag = STATUS[o.status] ?? { label: o.status, tone: 'border-slate-600 text-slate-300' };
  return (
    <tr className="border-t border-slate-800 align-top">
      <td className="py-3 pr-3 whitespace-nowrap">{dateOf(o.createdAt)}</td>
      <td className="py-3 pr-3">
        {o.client}
        {admin && o.buyer && <span className="block text-xs text-slate-500">{o.buyer}</span>}
        {admin && o.intake && (
          <details className="mt-1 text-xs text-slate-400">
            <summary className="cursor-pointer text-emerald-300">Order form</summary>
            <ul className="mt-1 space-y-0.5">{o.intake.map((x) => <li key={x}>{x}</li>)}</ul>
          </details>
        )}
      </td>
      <td className="py-3 pr-3">{o.serviceName}</td>
      <td className="py-3 pr-3">
        {admin ? (
          <select aria-label={`Status of the order for ${o.client}`} value={status} onChange={(e) => setStatus(e.target.value)} className="min-h-[36px] rounded-lg border border-slate-700 bg-slate-950 px-2 text-xs">
            {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        ) : (
          <span className={'inline-block rounded-full border px-2 py-0.5 text-xs font-semibold ' + tag.tone}>{tag.label}</span>
        )}
      </td>
      <td className="py-3 pr-3 whitespace-nowrap">{usd(o.cents)}{o.monthly ? '/mo' : ''}</td>
      <td className="py-3">
        {admin ? (
          <div className="flex flex-wrap items-center gap-2">
            <input aria-label={`Proof report link for ${o.client}`} value={link} onChange={(e) => setLink(e.target.value)} placeholder="https:// link to the report" className="min-h-[36px] w-56 rounded-lg border border-slate-700 bg-slate-950 px-2 text-xs" />
            {o.deliverableUrl && <a href={o.deliverableUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-emerald-300 hover:underline">Open</a>}
            <button type="button" onClick={save} disabled={!changed || busy} className="min-h-[36px] rounded-lg bg-emerald-400 px-3 text-xs font-bold text-slate-950 disabled:bg-slate-800 disabled:text-slate-500">{busy ? 'Saving…' : 'Save'}</button>
            {problem && <span role="alert" className="block w-full text-xs text-rose-300">{problem}</span>}
          </div>
        ) : o.deliverableUrl ? (
          <a href={o.deliverableUrl} target="_blank" rel="noreferrer" className="font-semibold text-emerald-300 hover:underline">Download</a>
        ) : (
          <span className="text-slate-500">Not ready yet</span>
        )}
      </td>
    </tr>
  );
}
