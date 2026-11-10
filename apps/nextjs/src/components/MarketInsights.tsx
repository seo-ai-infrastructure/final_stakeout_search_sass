'use client';
import type { ReactNode } from 'react';
import type { GridScanData } from './GeoGridDashboard';
import { aiSources, groundOwners, paidPressure, winningRadius } from '../lib/marketInsights';
import { rankColor } from '../lib/gridColumns';

const pct = (v: number | null) => (v === null ? 'n/a' : `${v >= 10 ? v.toFixed(0) : v.toFixed(1)}%`);
const WHERE: Record<string, string> = { results: 'results page', local_services: 'Local Services', finder: 'Local Finder' };

function Card({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
      <h3 className="text-sm font-bold">{title}</h3>
      <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function Bar({ value, you }: { value: number; you?: boolean }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
      <div className={'h-full rounded-full ' + (you ? 'bg-emerald-400' : 'bg-sky-400/80')} style={{ width: `${Math.max(2, Math.min(100, value))}%` }} />
    </div>
  );
}

/** Rank against distance for every completed point, with the winning radius marked. */
function RadiusChart({ points, radius }: { points: { id: string; miles: number; rank: number | null }[]; radius: number | null }) {
  const W = 320, H = 170, L = 34, R = 10, T = 10, B = 26;
  const maxMiles = Math.max(0.5, Math.ceil(Math.max(...points.map((p) => p.miles)) * 2) / 2);
  const x = (m: number) => L + ((W - L - R) * m) / maxMiles;
  const y = (rank: number | null) => T + ((H - T - B) * (Math.min(rank ?? 21, 21) - 1)) / 20;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Rank by distance from the business">
      {[1, 3, 10, 20].map((r) => (
        <g key={r}>
          <line x1={L} x2={W - R} y1={y(r)} y2={y(r)} className="stroke-slate-800" strokeWidth={r === 3 ? 1 : 0.5} strokeDasharray={r === 3 ? '0' : '2 3'} />
          <text x={L - 6} y={y(r) + 3} textAnchor="end" className="fill-slate-500 text-[9px]">#{r}</text>
        </g>
      ))}
      <text x={L - 6} y={y(21) + 3} textAnchor="end" className="fill-slate-500 text-[9px]">20+</text>
      {[0, maxMiles / 2, maxMiles].map((m) => (
        <text key={m} x={x(m)} y={H - 8} textAnchor="middle" className="fill-slate-500 text-[9px]">
          {m} mi
        </text>
      ))}
      {radius !== null && (
        <g>
          <rect x={L} y={T} width={x(radius) - L} height={H - T - B} className="fill-emerald-400/10" />
          <line x1={x(radius)} x2={x(radius)} y1={T} y2={H - B} className="stroke-emerald-400" strokeDasharray="4 3" />
          <text x={Math.min(x(radius) + 4, W - R - 60)} y={T + 10} className="fill-emerald-300 text-[9px] font-bold">
            {radius} mi
          </text>
        </g>
      )}
      {points.map((p) => (
        <circle key={p.id} cx={x(p.miles)} cy={y(p.rank)} r={4.5} fill={rankColor('COMPLETED', p.rank)} stroke="#0f172a" strokeWidth={1} />
      ))}
    </svg>
  );
}

/** Grid-wide insights: who owns the valuable ground, the winning radius, paid pressure and AI sources. */
export function MarketInsights({ scan }: { scan: GridScanData }) {
  const owners = groundOwners(scan.pins, scan.targetBusiness);
  const radius = winningRadius(scan.pins, { lat: scan.centerLat, lng: scan.centerLng });
  const paid = paidPressure(scan.pins);
  const ai = aiSources(scan.pins, scan.targetBusiness);
  if (!owners.points && !radius) return null;
  const hasWeights = owners.rows.some((r) => r.buyingPower !== null);
  return (
    <section aria-label="Market insights" className="space-y-3">
      <h2 className="text-lg font-bold">Market insights</h2>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title="Who owns the valuable ground"
          subtitle={hasWeights ? 'Share of this grid’s buying power where each business is in the top 3' : 'Points where each business is in the top 3'}
        >
          <ol className="space-y-2.5 text-sm">
            {owners.rows.map((r) => (
              <li key={r.name} className={r.isYou ? 'text-emerald-200' : ''}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate">
                    {r.name}
                    {r.isYou && <span className="ml-1 text-xs">(you)</span>}
                  </span>
                  <span className="shrink-0 font-bold">{hasWeights ? pct(r.buyingPower) : pct(r.standard)}</span>
                </div>
                <Bar value={hasWeights ? (r.buyingPower ?? 0) : r.standard} you={r.isYou} />
                <p className="mt-0.5 text-[11px] text-slate-500">
                  Top 3 at {r.top3Points} of {owners.points} points
                </p>
              </li>
            ))}
          </ol>
        </Card>

        <Card
          title="Your winning radius"
          subtitle={
            radius?.source === 'google'
              ? 'Your rank by distance from your business, as Google showed it at each point'
              : radius?.source === 'mixed'
                ? 'Your rank by distance: Google’s distance where shown, the grid’s centre elsewhere'
                : 'Your rank by distance from the grid’s centre (your listing shows no distance)'
          }
        >
          {radius && (
            <>
              <p className="text-sm">
                {radius.radius !== null ? (
                  <>
                    You hold the top 3 out to <span className="font-bold text-emerald-300">{radius.radius} mi</span>: top 3 at{' '}
                    {radius.within.top3} of {radius.within.total} points within it, {radius.beyond.top3} of {radius.beyond.total} beyond.
                  </>
                ) : (
                  <>You are not top 3 at the points closest to you yet.</>
                )}
              </p>
              <RadiusChart points={radius.points} radius={radius.radius} />
            </>
          )}
        </Card>

        <Card title="Paid pressure" subtitle="Advertisers at your grid points, on the results page and in the Local Finder">
          {paid.points === 0 ? (
            <p className="text-sm text-slate-400">Ad details are being read from each point’s evidence and appear shortly.</p>
          ) : (
            <>
              <p className="text-sm">
                Ads at <span className="font-bold">{paid.withAds}</span> of {paid.points} points
                {paid.avgAdsAboveYou !== null && (
                  <>
                    {' '}· on average <span className="font-bold">{paid.avgAdsAboveYou.toFixed(1)}</span> ads above you in the Local Finder
                  </>
                )}
                .
              </p>
              <ul className="mt-3 space-y-1.5 text-sm">
                {paid.advertisers.slice(0, 6).map((a) => (
                  <li key={a.name} className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate">{a.name}</span>
                    <span className="shrink-0 text-xs text-slate-400">
                      {a.points} {a.points === 1 ? 'point' : 'points'} · {a.where.map((w) => WHERE[w] ?? w).join(', ')}
                    </span>
                  </li>
                ))}
                {paid.advertisers.length === 0 && <li className="text-slate-400">No ads at these points.</li>}
              </ul>
            </>
          )}
        </Card>

        <Card title="What AI cites" subtitle="Websites Google’s AI Overviews linked to across your grid">
          {ai.points === 0 ? (
            <p className="text-sm text-slate-400">AI Overview details are being read from each point’s evidence and appear shortly.</p>
          ) : ai.shown === 0 ? (
            <p className="text-sm text-slate-400">No AI Overview appeared at these points.</p>
          ) : (
            <>
              <p className="text-sm">
                AI Overviews at <span className="font-bold">{ai.shown}</span> of {ai.points} points · you were named at{' '}
                <span className={'font-bold ' + (ai.youNamed ? 'text-emerald-300' : 'text-rose-300')}>{ai.youNamed}</span>.
              </p>
              {ai.sources.length ? (
                <ol className="mt-3 space-y-2 text-sm">
                  {ai.sources.slice(0, 8).map((s) => (
                    <li key={s.domain}>
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0 truncate">{s.label}</span>
                        <span className="shrink-0 text-xs text-slate-400">
                          {s.points} of {ai.shown}
                        </span>
                      </div>
                      <Bar value={(100 * s.points) / ai.shown} />
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mt-2 text-xs text-slate-400">The AI Overviews here were captured without their links (scans before template v3.14).</p>
              )}
            </>
          )}
        </Card>
      </div>
    </section>
  );
}
