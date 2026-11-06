'use client';

import { useState } from 'react';
import { WALL, AI_NAMED, GRID_LATS, GRID_LNGS, GRID_ZIPS, rankStyle } from './demoData';

const DEVICES = ['Galaxy S23 Ultra', 'Pixel 8 Pro', 'Galaxy S24', 'Pixel 7a'];
const START = 8 * 3600 + 2 * 60 + 8; // 08:02:08 CST, so point 3,3 lands on 08:07:12

function pad(n: number) {
  return String(n).padStart(2, '0');
}

/** Deterministic, realistic-looking values for each of the 49 points. */
function receiptFor(i: number) {
  const row = Math.floor(i / 7);
  const col = i % 7;
  const rank = WALL[i];
  const named = AI_NAMED[i] === 1;
  const t = START + i * 19;
  let h = Math.imul(i + 1, 2654435761) | 0;
  const hex = Array.from({ length: 36 }, (_, k) => {
    h = (Math.imul(h ^ (h >>> 13), 1274126177) + k) | 0; // 32-bit integer mixing, stays finite
    return '0123456789abcdef'[(h >>> 0) % 16];
  }).join('');
  const secs = 151 + ((i * 7) % 27);
  const r = {
    point: `${row + 1},${col + 1}`,
    gps: `${GRID_LATS[row].toFixed(6)}, ${GRID_LNGS[col].toFixed(6)}`,
    captured: `2026-11-06 ${pad(Math.floor(t / 3600))}:${pad(Math.floor((t % 3600) / 60))}:${pad(t % 60)} CST`,
    device: `Android · ${DEVICES[i % 4]}`,
    network: `Residential · ${(row + col) % 2 === 0 ? 'Comcast Cable' : 'TDS Telecom'}`,
    located: `${GRID_ZIPS[i]}, Tennessee – From your device`,
    result: rank > 20 ? 'Not in the top 20' : `Rank #${rank}`,
    ai: named ? 'Named in the AI answer' : 'Not named in the AI answer',
    named,
    rank,
    video: `${Math.floor(secs / 60)}:${pad(secs % 60)}`,
    id: `#R-${hex.slice(0, 4).toUpperCase()}-${hex.slice(4, 8).toUpperCase()}`,
    sha: hex,
  };
  // Point 3,3 is the receipt from the hero: keep it identical, including Google's real location line from our capture test.
  if (i === 16) Object.assign(r, { located: '37122, Tennessee – From your device', video: '2:47', id: '#R-7F3K-2Q9M', sha: '9f2c41d0e6b8a37c55e1f0a9d2c4b7e8a41e' });
  return r;
}

export default function ReceiptPrinter() {
  const [sel, setSel] = useState(16);
  const [prints, setPrints] = useState(0);
  const r = receiptFor(sel);

  function pick(i: number) {
    setSel(i);
    setPrints((p) => p + 1);
  }

  const rows: [string, string, 'ok' | 'bad' | undefined][] = [
    ['Keyword', 'plumber near me', undefined],
    ['Grid point', `${r.point} · ${r.gps}`, undefined],
    ['Captured', r.captured, undefined],
    ['Device', r.device, undefined],
    ['Network', r.network, undefined],
    ['Google located', r.located, 'ok'],
    ['Result', r.result, r.rank <= 3 ? 'ok' : r.rank > 20 ? 'bad' : undefined],
    ['AI answer', r.ai, r.named ? 'ok' : 'bad'],
  ];

  return (
    <div className="grid items-start gap-10 lg:grid-cols-[1fr_1.05fr]">
      <div className="mx-auto w-full max-w-[520px]">
        <p className="mk-mono mb-4 text-[12px] uppercase tracking-widest text-[#9aa7b8]">Tap any point · pull its receipt</p>
        <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
          {WALL.map((rank, i) => {
            const { bg, ink } = rankStyle(rank);
            const on = i === sel;
            return (
              <button
                key={i}
                type="button"
                onClick={() => pick(i)}
                aria-pressed={on}
                aria-label={`Point ${Math.floor(i / 7) + 1},${(i % 7) + 1}: ${rank > 20 ? 'not in the top 20' : 'rank ' + rank}${AI_NAMED[i] ? ', named in the AI answer' : ''}`}
                className={
                  'relative flex aspect-square items-center justify-center rounded-lg border transition ' +
                  (on ? 'scale-[1.08] border-[#f5c451] bg-[#1a1608] shadow-[0_0_0_3px_rgba(245,196,81,0.25)]' : 'border-[#1b2431] bg-[#0f141c] hover:border-[#3a4658]')
                }
              >
                <span className="mk-display rounded-md px-1.5 text-[13px] font-bold sm:text-base" style={{ background: bg, color: ink }}>
                  {rank > 20 ? '20+' : rank}
                </span>
                {AI_NAMED[i] === 1 && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-[#7aa7ff]" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
        <p className="mt-4 flex items-center gap-2 text-[12px] text-[#6b7686]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#7aa7ff]" aria-hidden="true" /> named in the AI answer · illustrative ranks, real grid coordinates
        </p>
      </div>

      <div className="mx-auto w-full max-w-[460px]">
        {/* the printer */}
        <div className="relative z-10 rounded-2xl border border-[#2a3442] bg-gradient-to-b from-[#1a212c] to-[#0e131b] px-5 pb-4 pt-3 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.8)]">
          <div className="flex items-center justify-between">
            <span className="mk-mono text-[11px] tracking-widest text-[#9aa7b8]">STAKEOUT · RECEIPT PRINTER</span>
            <span className="mk-mono flex items-center gap-1.5 text-[11px] text-[#3ddc97]">
              <span key={prints} className="mk-rec inline-block h-2 w-2 rounded-full bg-[#3ddc97]" aria-hidden="true" /> point {r.point}
            </span>
          </div>
          <div className="mt-3 h-2.5 rounded-full bg-[#05070a] shadow-[inset_0_2px_4px_rgba(0,0,0,0.9)]" aria-hidden="true" />
        </div>

        {/* the paper, printed out of the slot */}
        <div className="-mt-2 overflow-hidden px-3 pb-10">
          <div key={prints} className="mk-print relative" aria-live="polite">
            <div className="mk-receipt rounded-b-xl">
              <div className="px-5 pb-5 pt-5">
                <div className="flex items-baseline justify-between border-b border-dashed border-[#2a3442] pb-2">
                  <span className="mk-display text-sm font-semibold tracking-[0.18em] text-[#f5c451]">RECEIPT</span>
                  <span className="mk-mono text-[11px] text-[#9aa7b8]">{r.id}</span>
                </div>
                <dl className="mt-3 space-y-1.5 text-[12px]">
                  {rows.map(([k, v, tone]) => (
                    <div key={k} className="flex justify-between gap-3">
                      <dt className="flex-none text-[#9aa7b8]">{k}</dt>
                      <dd className={'mk-mono text-right ' + (tone === 'ok' ? 'text-[#3ddc97]' : tone === 'bad' ? 'text-[#ff8a4c]' : 'text-[#eef2f7]')}>{v}</dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-3 flex items-center gap-2 rounded-lg border border-[#2a3442] bg-[#0b0f15] px-3 py-2">
                  <span className="mk-rec inline-block h-2 w-2 rounded-full bg-[#ff4d4d]" aria-hidden="true" />
                  <span className="text-[12px]">Screen recording · {r.video}</span>
                  <span className="ml-auto text-[11px] text-[#7aa7ff]">▶ Watch</span>
                </div>
                <p className="mk-mono mt-3 break-all text-[10.5px] leading-relaxed text-[#6b7686]">SHA-256 {r.sha}</p>
                <div className="mt-4 flex justify-end pr-2">
                  <div key={`stamp-${prints}`} className="mk-stamp rounded-md border-[3px] border-[#3ddc97] px-3 py-1.5 text-center" aria-hidden="true">
                    <span className="mk-display block text-[13px] font-bold leading-tight tracking-widest text-[#3ddc97]">RECORDED ON A</span>
                    <span className="mk-display block text-[13px] font-bold leading-tight tracking-widest text-[#3ddc97]">REAL PHONE</span>
                  </div>
                </div>
              </div>
              <div className="mk-perf rotate-180" aria-hidden="true" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
