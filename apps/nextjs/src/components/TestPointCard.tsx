'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

type Business = { id: string; name: string; centerLabel: string; centerLat: number; centerLng: number; keywords: string[]; targetType: string };

/** Admin: run one free point (optionally on one phone) to test a template in minutes. */
export function TestPointCard() {
  const [list, setList] = useState<Business[]>([]);
  const [phones, setPhones] = useState<string[]>([]);
  const [bizId, setBizId] = useState('');
  const [keyword, setKeyword] = useState('');
  const [phone, setPhone] = useState('');
  const [state, setState] = useState<{ busy: boolean; scanId?: string; error?: string }>({ busy: false });
  useEffect(() => {
    fetch('/api/businesses').then((r) => (r.ok ? r.json() : { businesses: [] })).then((d) => {
      setList(d.businesses ?? []);
      const first = d.businesses?.[0];
      if (first) { setBizId(first.id); setKeyword(first.keywords[0] ?? ''); }
    }).catch(() => {});
    fetch('/api/admin/devices', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : {})).then((d: { devices?: { imageId: string; offlineAt?: string | null }[] }) => {
      setPhones(((d.devices ?? []) as { imageId: string; offlineAt?: string | null }[]).filter((x) => !x.offlineAt).map((x) => x.imageId));
    }).catch(() => {});
  }, []);
  const biz = list.find((b) => b.id === bizId);
  async function run() {
    if (!biz || !keyword.trim()) return;
    setState({ busy: true });
    const res = await fetch('/api/admin/test-point', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword: keyword.trim(), targetBusiness: biz.name, centerLat: biz.centerLat, centerLng: biz.centerLng, targetType: biz.targetType, imageId: phone || undefined }),
    });
    const d = await res.json().catch(() => ({}));
    setState(res.ok ? { busy: false, scanId: d.scanId } : { busy: false, error: d.error ?? 'Could not start the test point.' });
  }
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
      <h2 className="text-base font-bold">Test one point</h2>
      <p className="mt-1 text-sm text-slate-400">One free search at the business’s centre, set up exactly like a real scan. Use it to test a template in a few minutes.</p>
      {!list.length ? (
        <p className="mt-4 text-sm text-slate-400">Save a business in New scan first.</p>
      ) : (
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_180px_auto] md:items-end">
          <label className="text-sm text-slate-300">Business
            <select value={bizId} onChange={(e) => { setBizId(e.target.value); setKeyword(list.find((b) => b.id === e.target.value)?.keywords[0] ?? ''); }} className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm text-white">
              {list.map((b) => <option key={b.id} value={b.id}>{b.name}{b.centerLabel ? ' · ' + b.centerLabel : ''}</option>)}
            </select>
          </label>
          <label className="text-sm text-slate-300">Keyword
            <input list="test-point-keywords" value={keyword} onChange={(e) => setKeyword(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm text-white" />
            <datalist id="test-point-keywords">{biz?.keywords.map((k) => <option key={k} value={k} />)}</datalist>
          </label>
          <label className="text-sm text-slate-300">Phone
            <select value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm text-white">
              <option value="">Any free phone</option>
              {phones.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <button type="button" onClick={run} disabled={state.busy || !keyword.trim()} className="min-h-[42px] rounded-lg bg-emerald-400 px-4 text-sm font-bold text-slate-950 hover:bg-emerald-300 disabled:opacity-50">
            {state.busy ? 'Starting…' : 'Run test point'}
          </button>
        </div>
      )}
      {state.scanId && (
        <p role="status" className="mt-3 text-sm text-emerald-300">
          Test point started (free). Results in about 3–6 minutes:{' '}
          <Link className="underline" href={'/scans/' + state.scanId}>open its report</Link>, then the Evidence tab.
        </p>
      )}
      {state.error && <p role="alert" className="mt-3 text-sm text-red-300">{state.error}</p>}
    </section>
  );
}
