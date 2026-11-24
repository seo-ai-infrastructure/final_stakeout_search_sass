/**
 * The live report embed's page: plain HTML and inline styles, made to sit in an iframe on any site
 * (frame-ancestors *). No script runs in it. Kept apart from the route so it can be checked alone.
 */
export type EmbedBrand = { name: string; accent: string | null; logo: string | null } | null;
export type EmbedPin = { rowIdx: number; colIdx: number; rankFound: number | null; status: string; targetCitedInAi: boolean | null };
export type EmbedScan = { targetBusiness: string; keyword: string; gridSize: number; completedAt: Date | null; arp: number | null; solv: number | null; city: string | null; stateCode: string | null };

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
const pct = (v: number | null | undefined) => (typeof v === 'number' ? Math.round(v) + '%' : '—');

/** The page around an embed's content, with the headers that let any site frame it. */
export function embedPage(status: number, body: string, dark: boolean, title = 'Local rankings'): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title><style>
:root{--bg:${dark ? '#0b1017' : '#ffffff'};--ink:${dark ? '#f1f5f9' : '#0f172a'};--muted:${dark ? '#94a3b8' : '#475569'};--line:${dark ? 'rgba(255,255,255,.12)' : '#e2e8f0'};--tile:${dark ? '#111823' : '#f8fafc'};--accent:${dark ? '#5eead4' : '#0f766e'}}
*{box-sizing:border-box}html,body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:920px;margin:0 auto;padding:20px}
.top{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding-bottom:14px;border-bottom:1px solid var(--line)}
.brand{display:flex;align-items:center;gap:10px;font-weight:700}.brand img{height:36px;max-width:180px;object-fit:contain;background:#fff;border-radius:6px;padding:3px}
.badge{font-size:12.5px;font-weight:600;color:var(--muted);border:1px solid var(--line);border-radius:999px;padding:4px 10px}
h1{margin:16px 0 2px;font-size:22px;line-height:1.25}.sub{margin:0;color:var(--muted)}
.stats{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin:16px 0}@media (min-width:600px){.stats{grid-template-columns:repeat(4,1fr)}}
.stat{background:var(--tile);border:1px solid var(--line);border-radius:10px;padding:10px 12px}.stat b{display:block;font-size:22px;line-height:1.2;font-variant-numeric:tabular-nums}.stat span{font-size:13px;color:var(--muted)}
.grid{display:grid;grid-template-columns:repeat(var(--n),1fr);gap:4px;max-width:520px}
.cell{aspect-ratio:1;border-radius:6px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:clamp(11px,2.4vw,16px);color:#fff;font-variant-numeric:tabular-nums}
.r1{background:#15803d}.r2{background:#a16207}.r3{background:#c2410c}.r0{background:#b91c1c}.rx{background:var(--line);color:var(--muted)}
.mid{box-shadow:inset 0 0 0 3px var(--ink)}
.legend{display:flex;flex-wrap:wrap;gap:12px;margin:10px 0 0;font-size:13px;color:var(--muted)}.legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px;vertical-align:-1px}
.foot{margin-top:16px;padding-top:12px;border-top:1px solid var(--line);font-size:13px;color:var(--muted);display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}
a{color:var(--accent);font-weight:600}a:focus-visible{outline:2px solid var(--accent);outline-offset:2px}.note{padding:40px 0;color:var(--muted)}
</style></head><body><main>${body}</main></body></html>`;
  return new Response(html, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // Made to be framed by any dashboard or page; nothing else is loaded or run.
      'content-security-policy': "frame-ancestors *; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
      'cache-control': status === 200 ? 'public, max-age=60, s-maxage=120, stale-while-revalidate=300' : 'no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin',
    },
  });
}

/** The top line: the account's brand when it has one in force, otherwise our badge. */
export function embedTop(brand: EmbedBrand, extra = '') {
  const head = brand
    ? `<div class="brand">${brand.logo ? `<img src="${esc(brand.logo)}" alt="${esc(brand.name)}">` : ''}<span>${esc(brand.name)}</span></div>`
    : `<span class="badge">Verified on real phones by Stakeout Search</span>`;
  const accent = brand?.accent && /^#[0-9a-f]{6}$/i.test(brand.accent) ? `<style>:root{--accent:${brand.accent}}</style>` : '';
  return `${accent}<div class="top">${head}${extra}</div>`;
}

/** The report: the scan's headline numbers and its grid, each square coloured by the map rank there. */
export function embedReport(s: EmbedScan, pins: EmbedPin[], brand: EmbedBrand, reportHref: string | null) {
  const n = s.gridSize, mid = (n - 1) / 2;
  const at = new Map(pins.map((p) => [p.rowIdx + '_' + p.colIdx, p]));
  const done = pins.filter((p) => p.status === 'COMPLETED');
  const top3 = done.filter((p) => p.rankFound && p.rankFound <= 3).length;
  const cited = done.filter((p) => p.targetCitedInAi).length;
  const cells: string[] = [];
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) {
      const p = at.get(r + '_' + c);
      const centre = r === mid && c === mid ? ' mid' : '';
      // A circle grid has no point in its corners: those squares stay empty.
      if (!p) { cells.push('<div aria-hidden="true"></div>'); continue; }
      if (p.status !== 'COMPLETED') { cells.push(`<div class="cell rx${centre}" title="No result at this point"></div>`); continue; }
      const k = p.rankFound ? (p.rankFound <= 3 ? 'r1' : p.rankFound <= 10 ? 'r2' : 'r3') : 'r0';
      cells.push(`<div class="cell ${k}${centre}" title="${p.rankFound ? 'Map rank ' + p.rankFound : 'Not in the map results'}">${p.rankFound ?? '–'}</div>`);
    }
  const when = s.completedAt ? s.completedAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' }) : '';
  const place = [s.city, s.stateCode].filter(Boolean).join(', ');
  return `${embedTop(brand, when ? `<span class="badge">Updated ${esc(when)}</span>` : '')}
<h1>${esc(s.targetBusiness)}</h1><p class="sub">“${esc(s.keyword)}”, ${n}×${n} grid${place ? ' around ' + esc(place) : ''}</p>
<div class="stats"><div class="stat"><b>${pct(s.solv)}</b><span>Share of local voice</span></div><div class="stat"><b>${typeof s.arp === 'number' ? s.arp.toFixed(1) : '—'}</b><span>Average map rank</span></div><div class="stat"><b>${top3} of ${done.length}</b><span>Points in the top 3</span></div><div class="stat"><b>${cited} of ${done.length}</b><span>AI Overviews naming it</span></div></div>
<div class="grid" style="--n:${n}" role="img" aria-label="Map rank at each of the ${pins.length} grid points. The outlined square is the business: ${top3} of ${done.length} points rank in the top 3.">${cells.join('')}</div>
<div class="legend" aria-hidden="true"><span><i class="r1"></i>Rank 1–3</span><span><i class="r2"></i>4–10</span><span><i class="r3"></i>11–20</span><span><i class="r0"></i>Not in the map results</span></div>
<div class="foot"><span>Each square is one real-phone search at that spot.</span>${reportHref ? `<a href="${esc(reportHref)}" target="_blank" rel="noopener">Open the full report</a>` : ''}</div>`;
}
