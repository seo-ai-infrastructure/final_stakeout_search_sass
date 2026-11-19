'use client';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

export const card = 'rounded-xl border border-slate-800 bg-slate-900 p-5';
export const fmt = (n: number, digits = 0) => n.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits });
export const shortDate = (iso: string) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
/** Percent change, or null when there is nothing to compare with. */
export const pctOf = (now: number, before: number) => (before ? Math.round(((now - before) / before) * 100) : null);

/** A change against the period before: up or down, coloured by whether that is good. */
export function Change({ now, was, lowerIsBetter, fresh = 'new' }: { now: number | null; was: number | null | undefined; lowerIsBetter?: boolean; fresh?: string }) {
  if (now === null || was === null || was === undefined) return <span className="text-slate-600">{fresh}</span>;
  const c = pctOf(now, was);
  if (c === null) return <span className="text-slate-600">{now > 0 ? fresh : '–'}</span>;
  const good = c === 0 ? null : lowerIsBetter ? c < 0 : c > 0;
  return <span className={good === null ? 'text-slate-500' : good ? 'text-emerald-400' : 'text-rose-400'}>{c > 0 ? '▲' : c < 0 ? '▼' : ''} {Math.abs(c)}%</span>;
}

/** A tiny line with no axes: the shape of a number over the period, nothing more. */
export function Spark({ values, tone = '#34d399' }: { values: number[]; tone?: string }) {
  if (values.length < 2) return <div className="h-7" aria-hidden />;
  const max = Math.max(1, ...values), w = 100, h = 28;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(h - 2 - (v / max) * (h - 4)).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-7 w-full" aria-hidden>
      <polyline points={`0,${h} ${pts} ${w},${h}`} fill={tone} opacity="0.12" stroke="none" />
      <polyline points={pts} fill="none" stroke={tone} strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * One headline number. `big` is for the three or four a section is about. With `onSelect` the tile
 * is also the switch for the chart below it (`active` when it is the one charted), and `spark`
 * draws the number's shape over the period along its foot.
 */
export function Tile({ label, value, was, lowerIsBetter, digits = 0, unit = '', big, note, compare = true, spark, active, onSelect }: { label: string; value: number | null; was?: number | null; lowerIsBetter?: boolean; digits?: number; unit?: string; big?: boolean; note?: ReactNode; compare?: boolean; spark?: number[]; active?: boolean; onSelect?: () => void }) {
  const body = (
    <>
      <p className="flex items-center gap-1.5 text-xs text-slate-400">{onSelect && <span className={'h-1.5 w-1.5 rounded-full ' + (active ? 'bg-emerald-400' : 'bg-slate-600')} aria-hidden />}{label}</p>
      <p className={'mt-1 font-bold tabular-nums text-slate-100 ' + (big ? 'text-3xl' : 'text-xl')}>{value === null ? '–' : fmt(value, digits) + unit}</p>
      <p className="mt-0.5 min-h-4 text-xs text-slate-500">
        {compare && value !== null && was !== null && was !== undefined ? <><Change now={value} was={was} lowerIsBetter={lowerIsBetter} fresh="" /> <span>was {fmt(was, digits)}{unit}</span></> : note ?? ' '}
      </p>
      {spark && <div className="mt-2"><Spark values={spark} tone={active || !onSelect ? '#34d399' : '#64748b'} /></div>}
    </>
  );
  const box = 'rounded-lg border bg-slate-950 p-3 text-left ';
  if (!onSelect) return <div className={box + (big ? 'border-slate-700' : 'border-slate-800')}>{body}</div>;
  return (
    <button type="button" aria-pressed={active} onClick={onSelect} title={'Chart ' + label.toLowerCase()} className={box + 'transition-colors ' + (active ? 'border-emerald-500/70 shadow-[inset_0_2px_0_0_rgb(52_211_153)]' : 'border-slate-800 hover:border-slate-600')}>
      {body}
    </button>
  );
}

/** A section's heading: what it is, one line on what it covers, and its controls on the right. */
export function SectionHead({ title, sub, children }: { title: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <h3 className="text-base font-semibold text-slate-100">{title}</h3>
        {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

/** Grey shapes where a section's numbers will be, while they are read. */
export function Skeleton({ tiles = 4 }: { tiles?: number }) {
  return (
    <div className="animate-pulse space-y-4" role="status" aria-label="Loading">
      <div className={'grid grid-cols-2 gap-3 ' + (tiles === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-4')}>{Array.from({ length: tiles }, (_, i) => <div key={i} className="h-24 rounded-lg bg-slate-800/60" />)}</div>
      <div className="h-44 rounded-lg bg-slate-800/40" />
    </div>
  );
}

/** A number in a table with a thin bar under it, as long as its share of the column's largest. */
export function BarCell({ value, max, strong }: { value: number; max: number; strong?: boolean }) {
  return (
    <td className="w-28 px-3 py-1.5 text-right tabular-nums">
      <span className={strong ? 'text-slate-100' : 'text-slate-300'}>{fmt(value)}</span>
      <span className="mt-0.5 block h-[3px] rounded-full bg-slate-800" aria-hidden>
        <span className="ml-auto block h-full rounded-full bg-emerald-400/70" style={{ width: (max > 0 ? Math.max(value > 0 ? 3 : 0, (value / max) * 100) : 0) + '%' }} />
      </span>
    </td>
  );
}

/** Lines one period's days up with the same day of the period before, for a chart that shows both. */
export function alongside<T extends { date: string }>(now: T[], before: T[] | undefined, days: number, pick: (d: T) => number): ChartPoint[] {
  const was = new Map((before ?? []).map((d) => [d.date, pick(d)]));
  return now.map((d) => {
    const prior = new Date(Date.parse(d.date + 'T00:00:00Z') - days * 86400000).toISOString().slice(0, 10);
    return { label: shortDate(d.date), value: pick(d), before: was.get(prior) ?? null };
  });
}

/** A row of choices where one is on. */
export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: readonly (readonly [T, string])[]; label: string }) {
  return (
    <span role="group" aria-label={label} className="inline-flex max-w-full overflow-x-auto whitespace-nowrap rounded-lg border border-slate-700 text-xs">
      {options.map(([v, text]) => (
        <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)} className={'px-2.5 py-1.5 ' + (value === v ? 'bg-slate-700 font-semibold text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200')}>{text}</button>
      ))}
    </span>
  );
}

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** A round number at or above `max` that makes three even steps. */
function niceMax(max: number) {
  if (max <= 3) return 3;
  const step = Math.pow(10, Math.floor(Math.log10(max / 3)));
  const unit = [1, 2, 2.5, 5, 10].find((u) => u * step * 3 >= max) ?? 10;
  return unit * step * 3;
}

export type ChartPoint = { label: string; value: number; before?: number | null };

/**
 * One measure over time: this period as a solid line, the period before (when given) as a dashed
 * one on the same scale. Move over it to read any point. `name` says what is being counted.
 */
export function MiniChart({ points, name, height = 190 }: { points: ChartPoint[]; name: string; height?: number }) {
  const [ref, width] = useWidth();
  const [at, setAt] = useState<number | null>(null);
  const hasBefore = points.some((p) => typeof p.before === 'number');
  const pad = { l: 44, r: 12, t: 10, b: 24 };
  const geo = useMemo(() => {
    const max = niceMax(Math.max(1, ...points.map((p) => Math.max(p.value, p.before ?? 0))));
    const w = Math.max(0, width - pad.l - pad.r), h = height - pad.t - pad.b;
    const x = (i: number) => pad.l + (points.length > 1 ? (i / (points.length - 1)) * w : w / 2);
    const y = (v: number) => pad.t + h - (v / max) * h;
    const line = (get: (p: ChartPoint) => number | null | undefined) => points.map((p, i) => { const v = get(p); return typeof v === 'number' ? `${x(i).toFixed(1)},${y(v).toFixed(1)}` : null; }).filter(Boolean).join(' ');
    return { max, x, y, now: line((p) => p.value), was: line((p) => p.before) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, width, height]);
  if (!points.length) return <p className="text-sm text-slate-400">Nothing to chart for these dates.</p>;

  const move = (clientX: number) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box || points.length < 1) return;
    const w = box.width - pad.l - pad.r;
    setAt(Math.max(0, Math.min(points.length - 1, Math.round(((clientX - box.left - pad.l) / (w || 1)) * (points.length - 1)))));
  };
  const p = at === null ? null : points[at];
  const labels = points.length <= 2 ? points.map((_, i) => i) : [0, Math.floor((points.length - 1) / 2), points.length - 1];

  return (
    <div>
      <div ref={ref} className="relative" style={{ height }} onMouseMove={(e) => move(e.clientX)} onMouseLeave={() => setAt(null)} onTouchStart={(e) => move(e.touches[0].clientX)} onTouchMove={(e) => move(e.touches[0].clientX)}>
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label={`${name} over time: ${fmt(points.reduce((n, q) => n + q.value, 0))} in total, from ${points[0].label} to ${points[points.length - 1].label}`}>
            {[0, 1, 2, 3].map((i) => {
              const v = (geo.max / 3) * i;
              return (
                <g key={i}>
                  <line x1={pad.l} x2={width - pad.r} y1={geo.y(v)} y2={geo.y(v)} stroke="#1e293b" strokeWidth="1" />
                  <text x={pad.l - 8} y={geo.y(v) + 4} textAnchor="end" fontSize="11" fill="#64748b">{fmt(v, v % 1 ? 1 : 0)}</text>
                </g>
              );
            })}
            {labels.map((i, n) => <text key={i} x={geo.x(i)} y={height - 6} textAnchor={n === 0 ? 'start' : n === labels.length - 1 ? 'end' : 'middle'} fontSize="11" fill="#64748b">{points[i].label}</text>)}
            {hasBefore && <polyline points={geo.was} fill="none" stroke="#64748b" strokeWidth="1.5" strokeDasharray="4 4" strokeLinejoin="round" />}
            {points.length > 1 && geo.now && <polygon points={`${geo.x(0).toFixed(1)},${geo.y(0).toFixed(1)} ${geo.now} ${geo.x(points.length - 1).toFixed(1)},${geo.y(0).toFixed(1)}`} fill="#34d399" opacity="0.08" />}
            <polyline points={geo.now} fill="none" stroke="#34d399" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            {points.length === 1 && <circle cx={geo.x(0)} cy={geo.y(points[0].value)} r="4" fill="#34d399" />}
            {p && at !== null && (
              <g>
                <line x1={geo.x(at)} x2={geo.x(at)} y1={pad.t} y2={height - pad.b} stroke="#475569" strokeWidth="1" />
                {typeof p.before === 'number' && <circle cx={geo.x(at)} cy={geo.y(p.before)} r="3.5" fill="#0f172a" stroke="#64748b" strokeWidth="2" />}
                <circle cx={geo.x(at)} cy={geo.y(p.value)} r="4.5" fill="#34d399" stroke="#0f172a" strokeWidth="2" />
              </g>
            )}
          </svg>
        )}
        {p && at !== null && width > 0 && (
          <div className="pointer-events-none absolute top-1 z-10 rounded-lg border border-slate-700 bg-slate-950/95 px-2.5 py-1.5 text-xs shadow-lg" style={geo.x(at) > width / 2 ? { right: width - geo.x(at) + 10 } : { left: geo.x(at) + 10 }}>
            <p className="text-slate-400">{p.label}</p>
            <p className="font-semibold tabular-nums text-slate-100">{fmt(p.value)} <span className="font-normal text-slate-400">{name.toLowerCase()}</span></p>
            {typeof p.before === 'number' && <p className="tabular-nums text-slate-400">{fmt(p.before)} the period before</p>}
          </div>
        )}
      </div>
      {hasBefore && (
        <p className="mt-1 flex flex-wrap gap-x-4 text-[11px] text-slate-400">
          <span><span className="mr-1.5 inline-block h-0.5 w-5 translate-y-[-3px] bg-emerald-400" />This period</span>
          <span><span className="mr-1.5 inline-block w-5 translate-y-[-3px] border-t-2 border-dashed border-slate-500" />The period before</span>
        </p>
      )}
    </div>
  );
}

/** A thin bar split into named parts, each with its share. */
export function SplitBar({ parts }: { parts: { label: string; value: number }[] }) {
  const total = parts.reduce((n, p) => n + p.value, 0);
  if (!total) return null;
  const tones = ['bg-emerald-400', 'bg-sky-400', 'bg-amber-400', 'bg-violet-400'];
  return (
    <div>
      <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full" aria-hidden>
        {parts.map((p, i) => p.value > 0 && <div key={p.label} className={tones[i % tones.length]} style={{ width: (p.value / total) * 100 + '%' }} />)}
      </div>
      <ul className="mt-2 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
        {parts.map((p, i) => (
          <li key={p.label} className="flex items-baseline gap-2">
            <span className={'h-2 w-2 shrink-0 rounded-sm ' + tones[i % tones.length]} aria-hidden />
            <span className="min-w-0 flex-1 truncate text-slate-300">{p.label}</span>
            <span className="tabular-nums text-slate-200">{fmt(p.value)}</span>
            <span className="w-9 text-right tabular-nums text-slate-500">{Math.round((p.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
