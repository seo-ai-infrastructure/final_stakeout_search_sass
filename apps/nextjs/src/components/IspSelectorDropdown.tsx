'use client';

export type IspMode = 'any' | 'single' | 'mix';
export type IspOption = { name: string; label?: string };

const MODES: { value: IspMode; title: string; help: string }[] = [
  { value: 'any', title: 'Any ISP', help: 'Residential connections from any provider in the market.' },
  { value: 'single', title: 'One ISP', help: 'Every grid point searches from the same provider.' },
  { value: 'mix', title: 'Mix of ISPs', help: 'Points are spread across 2–6 providers. Each point keeps its ISP on every run, so runs compare like for like.' },
];

/**
 * Lets the customer choose which residential internet providers the grid searches
 * from. Options come from /api/isps: the ISPs that actually have residential IPs
 * in this market.
 */
export function IspSelectorDropdown(p: {
  stateCode: string;
  city: string;
  zip: string;
  mode: IspMode;
  selected: string[];
  options: IspOption[];
  loading?: boolean;
  onChange: (mode: IspMode, selected: string[]) => void;
}) {
  const label = (o: IspOption) => o.label ?? o.name;
  function toggle(name: string) {
    if (p.mode === 'single') return p.onChange('single', [name]);
    const next = p.selected.includes(name) ? p.selected.filter((n) => n !== name) : [...p.selected, name].slice(0, 6);
    p.onChange('mix', next);
  }
  return (
    <fieldset className="space-y-3 rounded-xl border border-slate-700 bg-slate-950/40 p-3.5">
      <legend className="px-1 text-xs font-semibold text-slate-300">
        Residential ISP · {p.city}, {p.stateCode} {p.zip}
      </legend>
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="ISP mode">
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            role="radio"
            aria-checked={p.mode === m.value}
            disabled={m.value !== 'any' && !p.options.length}
            onClick={() =>
              p.onChange(m.value, m.value === 'any' ? [] : m.value === 'single' ? p.selected.slice(0, 1) : p.selected)
            }
            className={`min-h-[44px] rounded-lg border px-2 text-xs font-semibold disabled:opacity-40 ${
              p.mode === m.value ? 'border-indigo-400 bg-indigo-500/15 text-white' : 'border-slate-700 text-slate-300'
            }`}
          >
            {m.title}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-slate-400">{MODES.find((m) => m.value === p.mode)!.help}</p>
      {p.mode !== 'any' && (
        <div className="space-y-1.5">
          {p.loading && <p className="text-[11px] text-slate-400">Loading ISPs for this market…</p>}
          {!p.loading && !p.options.length && (
            <p className="text-[11px] text-amber-300">No ISP data for this market yet. Use “Any ISP”.</p>
          )}
          <div className="grid max-h-48 grid-cols-1 gap-1.5 overflow-y-auto sm:grid-cols-2">
            {p.options.map((o) => {
              const on = p.selected.includes(o.name);
              return (
                <label
                  key={o.name}
                  className={`flex min-h-[40px] cursor-pointer items-center gap-2 rounded-lg border px-2.5 text-xs ${
                    on ? 'border-indigo-400 bg-indigo-500/10 text-white' : 'border-slate-800 text-slate-300'
                  }`}
                >
                  <input
                    type={p.mode === 'single' ? 'radio' : 'checkbox'}
                    name="isp-choice"
                    checked={on}
                    onChange={() => toggle(o.name)}
                  />
                  {label(o)}
                </label>
              );
            })}
          </div>
          {p.mode === 'mix' && (
            <p className={`text-[11px] ${p.selected.length >= 2 ? 'text-slate-400' : 'text-amber-300'}`}>
              {p.selected.length} selected · choose 2–6
            </p>
          )}
        </div>
      )}
    </fieldset>
  );
}
