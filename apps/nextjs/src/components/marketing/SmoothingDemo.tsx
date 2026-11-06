'use client';

import { useMemo, useState } from 'react';

/** A realistic, messy 7×7 grid. 21 = not in the top 20. null = the point failed. */
const MEASURED: (number | null)[][] = [
  [14, 21, 9, 17, 6, 21, 12],
  [8, 13, 4, 11, null, 7, 21],
  [21, 5, 9, 2, 14, 3, 16],
  [6, 18, 3, 1, 8, 12, 5],
  [11, 2, 15, 4, 21, 6, 9],
  [21, 7, 10, 13, 3, 17, 21],
  [9, 16, 21, 6, 12, 21, 8],
];
const N = 7;
const RES = 7; // smoothed cells per grid point, per side: 49 × 49 = 2,401 painted cells

function rankColor(r: number) {
  // green (1) → gold (8) → orange (15) → grey-red (21)
  const stops: [number, [number, number, number]][] = [
    [1, [61, 220, 151]],
    [8, [245, 196, 81]],
    [15, [255, 138, 76]],
    [21, [120, 64, 70]],
  ];
  const v = Math.max(1, Math.min(21, r));
  for (let i = 0; i < stops.length - 1; i++) {
    const [a, ca] = stops[i];
    const [b, cb] = stops[i + 1];
    if (v <= b) {
      const t = (v - a) / (b - a);
      const c = ca.map((x, k) => Math.round(x + (cb[k] - x) * t));
      return `rgb(${c[0]},${c[1]},${c[2]})`;
    }
  }
  return 'rgb(120,64,70)';
}

/** The "pretty" version: fill the failed point from its neighbours, blur heavily, then paint every pixel. */
function smooth(): number[][] {
  const filled = MEASURED.map((row, y) =>
    row.map((v, x) => {
      if (v !== null) return v;
      const n = [MEASURED[y - 1]?.[x], MEASURED[y + 1]?.[x], MEASURED[y]?.[x - 1], MEASURED[y]?.[x + 1]].filter((z): z is number => typeof z === 'number');
      return n.reduce((a, b) => a + b, 0) / n.length;
    }),
  );
  // Gaussian blur over the grid: neighbours are averaged together, so spikes and holes disappear.
  const sigma = 1.0;
  const blurred = filled.map((row, y) =>
    row.map((_, x) => {
      let sum = 0;
      let w = 0;
      for (let j = 0; j < N; j++)
        for (let i = 0; i < N; i++) {
          const d2 = (i - x) ** 2 + (j - y) ** 2;
          const k = Math.exp(-d2 / (2 * sigma * sigma));
          sum += filled[j][i] * k;
          w += k;
        }
      return sum / w;
    }),
  );
  // Paint every cell between the points (bilinear interpolation), as a heat map does.
  const out: number[][] = [];
  const size = N * RES;
  for (let py = 0; py < size; py++) {
    const row: number[] = [];
    for (let px = 0; px < size; px++) {
      const gx = Math.min(N - 1, Math.max(0, (px + 0.5) / RES - 0.5));
      const gy = Math.min(N - 1, Math.max(0, (py + 0.5) / RES - 0.5));
      const x0 = Math.floor(gx), y0 = Math.floor(gy);
      const x1 = Math.min(N - 1, x0 + 1), y1 = Math.min(N - 1, y0 + 1);
      const tx = gx - x0, ty = gy - y0;
      const v =
        blurred[y0][x0] * (1 - tx) * (1 - ty) + blurred[y0][x1] * tx * (1 - ty) + blurred[y1][x0] * (1 - tx) * ty + blurred[y1][x1] * tx * ty;
      row.push(v);
    }
    out.push(row);
  }
  // Stretch the color scale to fit the data: the best blurred patch becomes green, the worst orange.
  const all = out.flat();
  const lo = Math.min(...all), hi = Math.max(...all);
  return out.map((row) => row.map((v) => 1 + ((v - lo) / (hi - lo)) * 14));
}

export default function SmoothingDemo() {
  const [mode, setMode] = useState<'measured' | 'smoothed'>('smoothed');
  const smoothed = useMemo(smooth, []);
  const flat = MEASURED.flat();
  const failed = flat.filter((v) => v === null).length;
  const top3 = flat.filter((v) => v !== null && v <= 3).length;
  const swings = useMemo(() => {
    let big = 0;
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N - 1; x++) {
        const a = MEASURED[y][x], b = MEASURED[y][x + 1];
        if (a !== null && b !== null && Math.abs(a - b) >= 8) big++;
      }
    return big;
  }, []);

  return (
    <div className="rounded-3xl border border-[#1b2431] bg-[#0b0f15] p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Grid view" className="inline-flex rounded-xl border border-[#2a3442] bg-[#0c1118] p-1">
          {(['smoothed', 'measured'] as const).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={
                'rounded-lg px-4 py-2 text-sm font-semibold transition ' +
                (mode === m ? (m === 'measured' ? 'bg-[#f5c451] text-[#1a1300]' : 'bg-[#2a3442] text-white') : 'text-[#9aa7b8] hover:text-white')
              }
            >
              {m === 'smoothed' ? 'Smoothed (pretty)' : 'Measured (real)'}
            </button>
          ))}
        </div>
        <span className="mk-mono text-[12px] text-[#9aa7b8]">same 49 points · same day</span>
      </div>

      <div className="relative mx-auto aspect-square w-full max-w-[460px] overflow-hidden rounded-2xl border border-[#1b2431]">
        {mode === 'smoothed' ? (
          <svg viewBox={`0 0 ${N * RES} ${N * RES}`} className="h-full w-full" shapeRendering="crispEdges" aria-label="Smoothed heat map: a neat gradient from the centre outward">
            {smoothed.map((row, y) => row.map((v, x) => <rect key={`${x}-${y}`} x={x} y={y} width="1.02" height="1.02" fill={rankColor(v)} />))}
            {MEASURED.map((row, y) =>
              row.map((_, x) => <circle key={`d${x}-${y}`} cx={x * RES + RES / 2} cy={y * RES + RES / 2} r="0.55" fill="#06080c" opacity="0.45" />),
            )}
          </svg>
        ) : (
          <div className="grid h-full w-full grid-cols-7 gap-[3px] bg-[#06080c] p-[3px]" aria-label="Measured grid: ranks jump from point to point, and one point failed">
            {MEASURED.flat().map((v, i) => (
              <div key={i} className="flex items-center justify-center rounded-md" style={{ background: v === null ? 'repeating-linear-gradient(45deg,#1b2431 0 6px,#0c1118 6px 12px)' : rankColor(v) }}>
                <span className="mk-display text-sm font-bold sm:text-base" style={{ color: v === null ? '#ff6b6b' : '#06080c' }}>
                  {v === null ? 'FAIL' : v > 20 ? '20+' : v}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
        {mode === 'smoothed' ? (
          <>
            <p className="rounded-xl border border-[#1b2431] bg-[#0c1118] px-4 py-3 text-[#c9d3df]"><b className="text-white">2,401</b> colored cells. Only <b className="text-white">49</b> were ever searched.</p>
            <p className="rounded-xl border border-[#1b2431] bg-[#0c1118] px-4 py-3 text-[#c9d3df]">The failed point? <b className="text-white">Painted in</b> from its neighbours.</p>
            <p className="rounded-xl border border-[#1b2431] bg-[#0c1118] px-4 py-3 text-[#c9d3df]">The color scale is <b className="text-white">stretched</b>: an average rank of 7 is painted green.</p>
          </>
        ) : (
          <>
            <p className="rounded-xl border border-[#f5c451]/30 bg-[#f5c451]/[0.06] px-4 py-3 text-[#c9d3df]"><b className="text-white">{swings}</b> places where one block over, the rank jumps <b className="text-white">8+ spots</b>.</p>
            <p className="rounded-xl border border-[#f5c451]/30 bg-[#f5c451]/[0.06] px-4 py-3 text-[#c9d3df]"><b className="text-white">{failed}</b> point failed, and it says so.</p>
            <p className="rounded-xl border border-[#f5c451]/30 bg-[#f5c451]/[0.06] px-4 py-3 text-[#c9d3df]">Top 3 at only <b className="text-white">{top3}</b> of 48 points. <b className="text-white">That&apos;s the truth.</b></p>
          </>
        )}
      </div>
    </div>
  );
}
