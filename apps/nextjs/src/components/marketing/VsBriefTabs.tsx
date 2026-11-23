'use client';

import { useState, type KeyboardEvent, type ReactNode } from 'react';

/**
 * The two example briefs on /vs-scraper-credits, as tabs, with the case-fee slider. Every figure is
 * copied from the compiled briefs of November 23, 2026 (Stuart's Plumbing: cmwtlsnza0007md7j709rml28;
 * Broderick: cmwtlqkq70005md7jeghzpjum). A compiled brief changes only when its owner spends a brief
 * credit to update it; if either is updated, copy the new figures here.
 */
const WINS = 1.47; // Broderick: 21 actions × 35% qualified × 20% signed
const FEE = 16500;
const dollars = (n: number) => '$' + Math.round(n).toLocaleString('en-US');

type Kpi = { kind?: 'priced' | 'modeled'; prov: string; num: ReactNode; desc: ReactNode };

function Panel({ id, tab, hidden, eyebrow, headline, link, kpis, children }: { id: string; tab: string; hidden: boolean; eyebrow: string; headline: string; link?: string; kpis: Kpi[]; children?: ReactNode }) {
  return (
    <div className="tearsheet" role="tabpanel" id={id} aria-labelledby={tab} hidden={hidden}>
      <div className="ts-header">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <p className="ts-headline">{headline}</p>
        </div>
        {link && <a href={link} className="btn btn-outline">Open the full brief ↗</a>}
      </div>
      <div className="provenance-grid">
        {kpis.map((k) => (
          <div key={k.prov} className={'kpi-cell' + (k.kind ? ' ' + k.kind : '')}>
            <p className="kpi-prov">{k.prov}</p>
            <p className="kpi-num">{k.num}</p>
            <p className="kpi-desc">{k.desc}</p>
          </div>
        ))}
      </div>
      {children}
    </div>
  );
}

export default function VsBriefTabs({ links }: { links: { stuart?: string | null; broderick?: string | null } }) {
  const [tab, setTab] = useState<'cold' | 'connected'>('cold');
  const [fee, setFee] = useState(FEE);
  const tabs = [
    { key: 'cold' as const, label: 'Cold prospect: Stuart’s Plumbing, no Google logins' },
    { key: 'connected' as const, label: 'Connected client: Broderick, personal injury law' },
  ];
  // Arrow keys move between the two tabs, as in any tab list.
  const keys = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const next = tab === 'cold' ? 'connected' : 'cold';
    setTab(next);
    document.getElementById('vs-tab-' + next)?.focus();
  };

  return (
    <>
      <div className="tabs" role="tablist" aria-label="Example briefs">
        {tabs.map((t) => (
          <button key={t.key} type="button" role="tab" id={'vs-tab-' + t.key} className="tab-btn" aria-selected={tab === t.key} aria-controls={'vs-panel-' + t.key} tabIndex={tab === t.key ? 0 : -1} onClick={() => setTab(t.key)} onKeyDown={keys}>
            {t.label}
          </button>
        ))}
      </div>

      <Panel
        id="vs-panel-cold"
        tab="vs-tab-cold"
        hidden={tab !== 'cold'}
        eyebrow="Lakeland, FL · 144 real-phone pins · no client logins"
        headline="Stuart’s Plumbing scores 38.7 of 100 for local search visibility around Lakeland. Google puts it first at 13 of 21 points in the eastern columns, and at 1 of 28 in the western columns."
        link={links.stuart ?? undefined}
        kpis={[
          { prov: 'Measured on phones', num: <>38.7<span className="unit"> / 100</span></>, desc: <>“Emergency plumber near me”, Nov 17: 43.6 in the eastern columns, 9.3 in the western.</> },
          { prov: 'Measured · single listing', num: <>20<span className="unit"> of 49 pins</span></>, desc: <>Pins where a rival’s listing was the only one Google showed. Stuart’s held 7.</> },
          { kind: 'priced', prov: 'Priced · Polk County ads', num: <>1,280<span className="unit"> / mo</span></>, desc: <>Searches a month from Lakeland. Advertisers pay <strong>$56.53 to $77.97 a click</strong> across Polk County.</> },
          { kind: 'modeled', prov: 'Modeled · sample tap rate', num: <>$3,275<span className="unit"> / mo</span></>, desc: <>About 54 taps a month at Polk County’s $60.88 average click: what today’s visibility would cost as ads.</> },
        ]}
      />

      <Panel
        id="vs-panel-connected"
        tab="vs-tab-connected"
        hidden={tab !== 'connected'}
        eyebrow="Huntington, NY · Business Profile, Search Console and Analytics connected"
        headline="Broderick scores 32.4 of 100 for local search visibility around Huntington, and Google sent it 21 verified actions in 28 days, up from 17."
        link={links.broderick ?? undefined}
        kpis={[
          { prov: 'Measured on phones', num: <>32.4<span className="unit"> / 100</span></>, desc: <>“Car accident lawyer”, Nov 19: 73.0 in the northern rows, 26.6 in the southern.</> },
          { prov: 'Measured · Google accounts', num: <>21<span className="unit"> actions</span></>, desc: <>4 calls and 13 site visits from the listing, plus 4 Google Search clicks, in 28 days. Up from 17.</> },
          { kind: 'priced', prov: 'Priced · Suffolk County ads', num: '$3,305', desc: <>21 actions at <strong>$157.40</strong>, Suffolk County’s average click for the firm’s non-brand searches.</> },
          { kind: 'modeled', prov: 'Modeled · editable inputs', num: <span aria-live="polite">{dollars(WINS * fee)}</span>, desc: <>Case pipeline: {WINS} signed cases at a <strong>{dollars(fee)}</strong> average fee (21 actions × 35% qualified × 20% signed).</> },
        ]}
      >
        <div className="calc-bar">
          <p><strong>Try it the way you would on a pitch call:</strong> drag the average case fee. The modeled pipeline moves; the measured and priced figures don’t.</p>
          <label>
            Case fee
            <input type="range" min={8000} max={35000} step={500} value={fee} aria-valuetext={dollars(fee)} onChange={(e) => setFee(Number(e.target.value))} />
            <output>{dollars(fee)}</output>
          </label>
        </div>
      </Panel>

      <p className="ts-source">From the compiled revenue briefs for Stuart’s Plumbing (Lakeland, FL) and Brandon J. Broderick, Personal Injury Attorney at Law (Huntington, NY), November 23, 2026.</p>
    </>
  );
}
