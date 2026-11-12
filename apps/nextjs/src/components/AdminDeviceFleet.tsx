// apps/nextjs/src/app/(dashboard)/admin/devices/page.tsx
'use client';
import { AdminOps } from './AdminOps';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Smartphone,
  Terminal,
  RefreshCw,
  Plus,
  Trash2,
  ShieldAlert,
  Server,
  Lock,
  Unlock,
  AlertTriangle,
} from 'lucide-react';
interface EnrichedDevice {
  imageId: string;
  proxyId: string;
  slotIndex: number;
  proxyPort: number | null;
  profiles: string[];
  adbAddr: string | null;
  isEnabled: boolean;
  hardwareModel: string | null;
  cooldownUntil: string;
  runtimeState: 'IDLE' | 'BUSY' | 'COOLDOWN' | 'DISABLED' | 'OFFLINE' | 'AUTO_PAUSED';
  activePinId: string | null;
  cooldownRemainingSec: number;
  recentOutcomes: string;
  recentFailureRate: number | null;
  pinsSucceeded: number;
  pinsFailed: number;
  lastFailureCode: string | null;
  autoPauseReason: string | null;
}
interface FleetHealth {
  readyPhones: number;
  busyNow: number;
  utilization24h: number | null;
  queueWaiting: number;
  oldestWaitSec: number;
  waitP90Sec: number | null;
  pinsStarted24h: number;
  failureRate24h: number | null;
  autoPaused: number;
}
const pct = (v: number | null) => (v == null ? '—' : Math.round(v * 100) + '%');
const dur = (sec: number | null) =>
  sec == null ? '—' : sec < 90 ? Math.round(sec) + 's' : sec < 5400 ? Math.round(sec / 60) + 'm' : (sec / 3600).toFixed(1) + 'h';
type TemplateInfo = { id: string; name: string; version: string | null } | null;
type SystemHealth = {
  at: string;
  proxySellerKey: boolean;
  searchGapSeconds: number;
  templates: { chrome: TemplateInfo; maps: TemplateInfo };
  proxyLists: number;
  /** Seconds the longest-idle list has gone unused (absent from an older worker). */
  proxyListIdleSeconds?: number;
  openScans: number;
  pointsWithoutInsights: number;
};

/** The worker's own status, so a missing key or template is visible here instead of only in the logs. */
function SystemHealthCard({ system }: { system: SystemHealth | null }) {
  const age = system ? Math.round((Date.now() - new Date(system.at).getTime()) / 1000) : null;
  const tpl = (t: TemplateInfo) => (t ? `${t.id} · ${t.version ? 'version ' + t.version : 'no version declared (' + t.name + ')'}` : 'not found');
  const rows: [string, boolean, string][] = system
    ? [
        ['Worker', age !== null && age < 240, age !== null && age < 240 ? `reported ${age}s ago` : `last report ${age}s ago: it may be down`],
        ['Proxy-Seller key on the worker', system.proxySellerKey, system.proxySellerKey ? 'set: idle proxy lists are deleted' : 'missing: idle proxy lists cannot be deleted and keep using bandwidth'],
        ['Chrome template', Boolean(system.templates.chrome), tpl(system.templates.chrome)],
        ['Maps template', Boolean(system.templates.maps), tpl(system.templates.maps)],
        // A list left over right after a scan is normal: it is deleted after two idle minutes. Only one
        // that has sat unused for ten minutes with no scan open means the clean-up is not working.
        [
          'Proxy lists',
          system.openScans > 0 || system.proxyLists === 0 || (system.proxyListIdleSeconds ?? 0) < 600,
          `${system.proxyLists} list(s) · ${system.openScans} scan(s) open` +
            (system.openScans === 0 && system.proxyLists > 0
              ? (system.proxyListIdleSeconds ?? 0) >= 600
                ? `: idle for ${Math.round((system.proxyListIdleSeconds ?? 0) / 60)} minutes and not deleted`
                : ': just finished, deleted after 2 idle minutes'
              : ''),
        ],
        ['Insights', system.pointsWithoutInsights < 25, `${system.pointsWithoutInsights} point(s) waiting for insights`],
      ]
    : [['Worker', false, 'no status report: the worker is not running, or has not reported yet']];
  const failing = rows.filter(([, ok]) => !ok).map(([label]) => label);
  return (
    <section className={'mb-6 rounded-2xl border p-5 ' + (failing.length ? 'border-rose-500/60 bg-rose-950/20' : 'border-slate-800 bg-slate-900/60')}>
      {failing.length > 0 && (
        <p role="alert" className="mb-4 rounded-xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white">
          Needs attention: {failing.join(', ')}
        </p>
      )}
      <h2 className="text-sm font-bold text-white">System health</h2>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {rows.map(([label, ok, note]) => (
          <li key={label} className="flex items-start gap-2 text-sm">
            <span className={'mt-1 h-2.5 w-2.5 shrink-0 rounded-full ' + (ok ? 'bg-emerald-400' : 'bg-rose-500')} />
            <span>
              <span className="font-semibold text-slate-200">{label}</span>
              <span className="block text-xs text-slate-400">{note}</span>
            </span>
          </li>
        ))}
      </ul>
      {system && <p className="mt-3 text-xs text-slate-500">Pause between searches on a phone: {system.searchGapSeconds}s.</p>}
    </section>
  );
}

export default function AdminDeviceFleetPage() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [devices, setDevices] = useState<EnrichedDevice[]>([]);
  const [health, setHealth] = useState<FleetHealth | null>(null);
  const [system, setSystem] = useState<SystemHealth | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [bannerMsg, setBannerMsg] = useState<{
    type: 'ok' | 'err';
    text: string;
  } | null>(null);
  const [singleImageId, setSingleImageId] = useState('');
  const [singleProxyId, setSingleProxyId] = useState('');
  const [singleAdbAddr, setSingleAdbAddr] = useState('');
  const [bulkText, setBulkText] = useState('');
  const [showBulkModal, setShowBulkModal] = useState(false);
  async function checkRoleAndFetchFleet() {
    try {
      const userRes = await fetch('/api/user/me', { cache: 'no-store' });
      if (!userRes.ok) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }
      const userData = await userRes.json();
      if (userData?.role !== 'ADMIN') {
        setIsAdmin(false);
        setLoading(false);
        return;
      }
      setIsAdmin(true);
      const res = await fetch('/api/admin/devices', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.devices)) setDevices(data.devices);
        if (data.health) setHealth(data.health);
        setSystem(data.system ?? null);
      }
      setLoading(false);
    } catch {
      setIsAdmin(false);
      setLoading(false);
    }
  }
  useEffect(() => {
    checkRoleAndFetchFleet();
    const interval = setInterval(() => {
      if (isAdmin) checkRoleAndFetchFleet();
    }, 4000);
    return () => clearInterval(interval);
  }, [isAdmin]);
  async function dispatchAdminAction(
    payload: Record<string, any>,
    label: string,
  ) {
    setActionBusy(label);
    setBannerMsg(null);
    try {
      const res = await fetch('/api/admin/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Admin action failed');
      setBannerMsg({ type: 'ok', text: `Success: ${label}` });
      await checkRoleAndFetchFleet();
    } catch (err: any) {
      setBannerMsg({ type: 'err', text: err.message });
    } finally {
      setActionBusy(null);
    }
  }
  async function handleAddSingle(e: React.FormEvent) {
    e.preventDefault();
    if (!singleImageId.trim() || !singleProxyId.trim()) return;
    await dispatchAdminAction(
      {
        action: 'ADD_DEVICES',
        devices: [
          {
            imageId: singleImageId.trim(),
            proxyId: singleProxyId.trim(),
            adbAddr: singleAdbAddr.trim() || undefined,
          },
        ],
      },
      `Added DuoPlus Phone ${singleImageId.trim()}`,
    );
    setSingleImageId('');
    setSingleProxyId('');
    setSingleAdbAddr('');
  }
  async function handleAddBulk(e: React.FormEvent) {
    e.preventDefault();
    const lines = bulkText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const parsed = lines
      .map((line) => {
        const [imageId, proxyId, adbAddr] = line.split(/[\s,;]+/);
        return { imageId, proxyId, adbAddr };
      })
      .filter((p) => p.imageId && p.proxyId);
    if (parsed.length === 0) return;
    await dispatchAdminAction(
      { action: 'ADD_DEVICES', devices: parsed },
      `Registered ${parsed.length} DuoPlus Phones`,
    );
    setBulkText('');
    setShowBulkModal(false);
  }
  if (loading) {
    return (
      <div className="flex h-[calc(100vh-4rem)] w-full items-center justify-center bg-slate-950 text-slate-300 text-xs">
        <RefreshCw className="mr-2 h-4 w-4 animate-spin text-emerald-400" />
        Verifying administrator credentials...
      </div>
    );
  }
  if (isAdmin === false) {
    return (
      <div className="flex h-[calc(100vh-4rem)] w-full flex-col items-center justify-center bg-slate-950 p-6">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10 border border-red-500/30">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <h1 className="text-xl font-extrabold text-white">Restricted Access</h1>
        <p className="mt-1 max-w-sm text-xs text-slate-400">
          Sign in with an administrator account to manage phones.
        </p>
        <Link
          href="/scans"
          className="mt-6 rounded-xl bg-slate-800 px-5 py-2.5 text-xs font-bold text-slate-200 hover:bg-slate-700"
        >
          Return to Stakeout Scans
        </Link>
      </div>
    );
  }
  const idleCount = devices.filter((d) => d.runtimeState === 'IDLE').length;
  const busyCount = devices.filter((d) => d.runtimeState === 'BUSY').length;
  const cooldownCount = devices.filter(
    (d) => d.runtimeState === 'COOLDOWN',
  ).length;
  return (
    <div className="min-h-[calc(100vh-4rem)] w-full bg-slate-950 p-6 text-slate-100">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-800">
          <div>
            <div className="flex items-center gap-2.5">
              <Server className="h-6 w-6 text-emerald-400" />
              <h1 className="text-xl font-extrabold text-white">
                Admin DuoPlus Cloud Phone Fleet Manager
              </h1>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Restricted Admin View • Manage `imageId` ↔ `proxyId` bindings,
              Redis locks, and 1-click bootstrap scripts.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setShowBulkModal((prev) => !prev)}
              className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-xs"
            >
              <Plus className="h-4 w-4 text-emerald-400" />
              Bulk Paste IDs
            </button>
            <button
              type="button"
              disabled={actionBusy !== null}
              onClick={() =>
                dispatchAdminAction(
                  { action: 'RESET_ALL_COOLDOWNS' },
                  'Cleared all cooldowns',
                )
              }
              className="flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5"
            >
              <Unlock className="h-4 w-4" />
              Clear All Cooldowns
            </button>
            <button
              type="button"
              disabled={actionBusy !== null || devices.length === 0}
              onClick={() =>
                dispatchAdminAction(
                  { action: 'BOOTSTRAP_ALL' },
                  'Bootstrapped All Enabled DuoPlus Phones',
                )
              }
              className="flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-xs font-extrabold"
            >
              <Terminal className="h-4 w-4" />
              1-Click Bootstrap All Phones
            </button>
          </div>
        </div>
        {system !== undefined && <SystemHealthCard system={system} />}
        <AdminOps />
        {health && (
          <section aria-label="Fleet health" className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-bold text-white">Fleet health · last 24 hours</h2>
              <span className="text-[11px] text-slate-400">
                Add a phone when utilization stays above 70% or the 90th-percentile wait above 10 minutes for a week.
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
              {[
                ['Ready phones', String(health.readyPhones), health.autoPaused ? health.autoPaused + ' auto-paused' : 'none paused'],
                ['Busy now', String(health.busyNow), 'of ' + health.readyPhones + ' ready'],
                ['Utilization', pct(health.utilization24h), 'phone time on pins', health.utilization24h != null && health.utilization24h > 0.7],
                ['Pins waiting', String(health.queueWaiting), 'oldest ' + dur(health.oldestWaitSec), health.oldestWaitSec > 600],
                ['Queue wait, p90', dur(health.waitP90Sec), health.pinsStarted24h + ' pins started', (health.waitP90Sec ?? 0) > 600],
                ['Failure rate', pct(health.failureRate24h), 'of finished pins', (health.failureRate24h ?? 0) > 0.1],
                ['Auto-paused', String(health.autoPaused), 'phones needing a look', health.autoPaused > 0],
              ].map(([label, value, sub, alert]) => (
                <div key={String(label)} className={`rounded-xl border p-3 ${alert ? 'border-amber-500/50 bg-amber-950/20' : 'border-slate-800 bg-slate-950/60'}`}>
                  <div className="text-[11px] text-slate-400">{label}</div>
                  <div className="mt-1 font-mono text-xl font-bold text-white">{value}</div>
                  <div className="text-[11px] text-slate-500">{sub}</div>
                </div>
              ))}
            </div>
          </section>
        )}
        {bannerMsg && (
          <div
            className={`flex items-center justify-between rounded-xl border px-4 py-3 text-xs font-semibold font-semibold ${
              bannerMsg.type === 'ok'
                ? 'border-emerald-500/40 bg-emerald-950/40 text-emerald-300'
                : 'border-red-500/40 bg-red-950/40 text-red-300'
            }`}
          >
            <span>{bannerMsg.text}</span>
            <button
              type="button"
              onClick={() => setBannerMsg(null)}
              className="text-slate-400 hover:text-white"
            >
              ✕
            </button>
          </div>
        )}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
            <div className="text-xs text-slate-400">
              Total Registered Phones
            </div>
            <div className="mt-1 text-2xl font-extrabold text-white">
              {devices.length}
            </div>
          </div>
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4">
            <div className="text-xs text-emerald-400">Idle & Ready</div>
            <div className="mt-1 text-2xl font-extrabold text-emerald-300">
              {idleCount}
            </div>
          </div>
          <div className="rounded-xl border border-indigo-500/30 bg-indigo-950/20 p-4">
            <div className="text-xs text-indigo-400">Active Leased</div>
            <div className="mt-1 text-2xl font-extrabold text-indigo-300">
              {busyCount}
            </div>
          </div>
          <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-4">
            <div className="text-xs text-amber-400">In Cooldown</div>
            <div className="mt-1 text-2xl font-extrabold text-amber-300">
              {cooldownCount}
            </div>
          </div>
        </div>
        <form
          onSubmit={handleAddSingle}
          className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4"
        >
          <div className="flex-1 min-w-[200px]">
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              DuoPlus Cloud Phone ID (`image_id`)
            </label>
            <input
              type="text"
              required
              placeholder="e.g., dp_img_987654"
              value={singleImageId}
              onChange={(e) => setSingleImageId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs"
            />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              DuoPlus Bound Proxy ID (`proxy_id`)
            </label>
            <input
              type="text"
              required
              placeholder="e.g., dp_prx_123456"
              value={singleProxyId}
              onChange={(e) => setSingleProxyId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs"
            />
          </div>
          <div className="w-56">
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              ADB Address (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g., 1.2.3.4:5555"
              value={singleAdbAddr}
              onChange={(e) => setSingleAdbAddr(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs"
            />
          </div>
          <button
            type="submit"
            disabled={actionBusy !== null}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-xs font-bold text-slate-950"
          >
            <Plus className="h-4 w-4" />
            Add Phone Pair
          </button>
        </form>
        {showBulkModal && (
          <form
            onSubmit={handleAddBulk}
            className="space-y-3 rounded-xl border border-emerald-500/30 bg-slate-900 p-5"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-400">
                Bulk Paste `imageId, proxyId` Pairs
              </span>
              <button
                type="button"
                onClick={() => setShowBulkModal(false)}
                className="text-xs text-slate-400 hover:text-white"
              >
                Close
              </button>
            </div>
            <textarea
              rows={5}
              placeholder={`dp_image_01, dp_proxy_01\ndp_image_02, dp_proxy_02`}
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3 font-mono text-xs text-white"
            />
            <button
              type="submit"
              className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-400"
            >
              Import All Pairs
            </button>
          </form>
        )}
        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/90 shadow-xl">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="border-b border-slate-800 bg-slate-950/80 text-[11px] font-semibold uppercase">
              <tr>
                <th className="py-3.5 pl-6 pr-3">Slot & Port</th>
                <th className="px-3 py-3.5">`imageId`</th>
                <th className="px-3 py-3.5">`proxyId`</th>
                <th className="px-3 py-3.5">Status</th>
                <th className="px-3 py-3.5">Last 20 pins</th>
                <th className="py-3.5 pl-3 pr-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {devices.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    {loading ? 'Loading Fleet...' : 'No devices registered.'}
                  </td>
                </tr>
              ) : (
                devices.map((dev) => (
                  <tr key={dev.imageId} className="hover:bg-slate-950/40">
                    <td className="py-3.5 pl-6 pr-3 font-mono">
                      <span className="rounded bg-slate-800 px-2 py-1 font-bold text-slate-200">
                        #{dev.slotIndex}
                      </span>
                      <span className="ml-2 text-slate-400">
                        {dev.proxyPort == null ? 'port out of range' : ':' + dev.proxyPort}
                      </span>
                    </td>
                    <td className="px-3 py-3.5 font-mono font-semibold text-white">
                      {dev.imageId}
                    </td>
                    <td className="px-3 py-3.5 font-mono text-emerald-400">
                      {dev.proxyId}
                    </td>
                    <td className="px-3 py-3.5">
                      {dev.runtimeState === 'IDLE' && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1">
                          <span className="h-2 w-2 rounded-full bg-emerald-400" />{' '}
                          IDLE
                        </span>
                      )}
                      {dev.runtimeState === 'BUSY' && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/20 px-2.5 py-1">
                          <RefreshCw className="h-3 w-3 animate-spin" /> BUSY
                        </span>
                      )}
                      {dev.runtimeState === 'COOLDOWN' && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/20 px-2.5 py-1">
                          <AlertTriangle className="h-3 w-3" /> COOLDOWN (
                          {Math.ceil(dev.cooldownRemainingSec / 60)}m)
                        </span>
                      )}
                      {dev.runtimeState === 'OFFLINE' && (
                        <span className="rounded-full bg-slate-800 px-2.5 py-1 text-[11px] text-amber-300">
                          OFFLINE
                        </span>
                      )}
                      {dev.runtimeState === 'AUTO_PAUSED' && (
                        <span title={dev.autoPauseReason ?? ''} className="inline-flex items-center gap-1.5 rounded-full bg-red-500/15 px-2.5 py-1 text-[11px] text-red-300">
                          <AlertTriangle className="h-3 w-3" /> AUTO-PAUSED
                        </span>
                      )}
                      {dev.runtimeState === 'DISABLED' && (
                        <span className="rounded-full bg-slate-800 px-2.5 py-1 text-[11px] text-slate-400">
                          DISABLED
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3.5">
                      {dev.recentOutcomes ? (
                        <div className="flex flex-col gap-1">
                          <span className="flex gap-[2px]" aria-label={`${dev.recentOutcomes.length} recent pins, ${pct(dev.recentFailureRate)} failed`}>
                            {[...dev.recentOutcomes].map((o, i) => (
                              <span key={i} className={`h-3 w-1.5 rounded-sm ${o === 'S' ? 'bg-emerald-500/70' : 'bg-red-500'}`} />
                            ))}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            {pct(dev.recentFailureRate)} failed · {dev.pinsSucceeded + dev.pinsFailed} total
                            {dev.lastFailureCode ? ' · last: ' + dev.lastFailureCode : ''}
                          </span>
                          {dev.autoPauseReason && <span className="text-[11px] text-red-300">{dev.autoPauseReason}</span>}
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-500">No pins yet</span>
                      )}
                    </td>
                    <td className="py-3.5 pl-3 pr-6 text-right">
                      <div className="inline-flex items-center gap-2">
                        <span className="mr-2 text-xs">
                          {!dev.hardwareModel
                            ? 'Bootstrap needed'
                            : dev.profiles.length
                              ? dev.profiles.join(', ') + ' (' + dev.hardwareModel + ')'
                              : dev.hardwareModel + ' · matches no profile'}
                        </span>
                        <button
                          className="mr-2 text-xs underline"
                          type="button"
                          onClick={() =>
                            dispatchAdminAction(
                              {
                                action: 'TOGGLE_ENABLED',
                                imageId: dev.imageId,
                                isEnabled: !dev.isEnabled,
                              },
                              dev.isEnabled ? 'Disable phone' : 'Enable phone',
                            )
                          }
                        >
                          {dev.isEnabled ? 'Disable' : 'Enable'}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            dispatchAdminAction(
                              { action: 'BOOTSTRAP_ONE', imageId: dev.imageId },
                              `Bootstrapped ${dev.imageId}`,
                            )
                          }
                          className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-[11px]"
                        >
                          Bootstrap
                        </button>
                        {dev.runtimeState === 'AUTO_PAUSED' && (
                          <button
                            type="button"
                            onClick={() =>
                              dispatchAdminAction(
                                { action: 'RESUME_DEVICE', imageId: dev.imageId },
                                `Resumed ${dev.imageId}`,
                              )
                            }
                            className="rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1.5 text-[11px]"
                          >
                            Resume
                          </button>
                        )}
                        {(dev.runtimeState === 'COOLDOWN' ||
                          dev.runtimeState === 'BUSY') && (
                          <button
                            type="button"
                            onClick={() =>
                              dispatchAdminAction(
                                {
                                  action: 'RESET_COOLDOWN',
                                  imageId: dev.imageId,
                                },
                                `Unlocked ${dev.imageId}`,
                              )
                            }
                            className="rounded-lg border border-amber-500/40 bg-amber-500/15 px-2.5 py-1.5 text-[11px]"
                          >
                            Unlock
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            dispatchAdminAction(
                              { action: 'DELETE_DEVICE', imageId: dev.imageId },
                              `Removed ${dev.imageId}`,
                            )
                          }
                          className="rounded-lg border border-red-500/30 bg-red-950/30 p-1.5 text-red-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
