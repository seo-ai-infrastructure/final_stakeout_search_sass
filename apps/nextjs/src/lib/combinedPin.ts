import { combinedHalves, combinedIcon, combinedStyle, type CombinedReading } from './combinedMap';

// Two small line icons (Lucide's "sparkles" and "crown"), drawn inline so a pin needs no image.
const ICONS = {
  sparkle:
    '<path d="M9.94 15.5A2 2 0 0 0 8.5 14.06l-6.14-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.14a.5.5 0 0 1 .96 0L14.06 8.5A2 2 0 0 0 15.5 9.94l6.14 1.58a.5.5 0 0 1 0 .96L15.5 14.06a2 2 0 0 0-1.44 1.44l-1.58 6.14a.5.5 0 0 1-.96 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/>',
  crown:
    '<path d="M11.56 3.27a.5.5 0 0 1 .88 0l2.95 5.6a1 1 0 0 0 1.52.3l4.28-3.67a.5.5 0 0 1 .8.52l-2.84 10.25a1 1 0 0 1-.96.73H5.81a1 1 0 0 1-.96-.73L2.02 6.02a.5.5 0 0 1 .8-.52l4.28 3.67a1 1 0 0 0 1.52-.3z"/><path d="M5 21h14"/>',
};

/**
 * Draws one combined-map pin into a map marker's button: a gradient body inside a coloured ring
 * with a soft glow, the headline placement (with a sparkle where the AI Overview is the win and a
 * crown for #1 in both places) and, when the grid leaves room, the other reading in a small pill.
 */
const svg = (icon: keyof typeof ICONS, px: number) =>
  `<svg aria-hidden="true" width="${px}" height="${px}" viewBox="0 0 24 24" fill="none" stroke="${icon === 'crown' ? '#fcd34d' : '#fde68a'}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="flex:none">${ICONS[icon]}</svg>`;

/**
 * The same point as a split pin: the top half is the AI Overview (higher on the page), the bottom
 * half the local results, so both readings show at once with neither hidden behind the other.
 */
export function paintSplitPin(el: HTMLElement, r: CombinedReading, roomy: boolean) {
  const { top, bottom, ring } = combinedHalves(r), size = roomy ? 58 : 44;
  el.textContent = '';
  el.style.cssText +=
    `;width:${size}px;height:${size}px;padding:0;border:2.5px solid transparent;border-radius:9999px;overflow:hidden;` +
    `background:linear-gradient(#020617,#020617) padding-box, ${ring.fill} border-box;box-shadow:0 0 14px ${ring.glow};` +
    `display:flex;flex-direction:column;font-weight:800;letter-spacing:-0.01em;line-height:1;font-size:${roomy ? 10.5 : 9}px`;
  const half = (h: { text: string; fill: string; ink: string; icon?: boolean }, isTop: boolean) => {
    const d = document.createElement('span');
    d.style.cssText = `flex:1;display:flex;align-items:center;justify-content:center;gap:2px;white-space:nowrap;background:${h.fill};color:${h.ink};` + (isTop ? 'padding-top:3px;border-bottom:1px solid rgba(255,255,255,0.22)' : 'padding-bottom:3px');
    if (h.icon) d.innerHTML = svg('sparkle', roomy ? 9 : 8);
    d.append(document.createTextNode(h.text));
    return d;
  };
  el.append(half(top, true), half(bottom, false));
}

export function paintCombinedPin(el: HTMLElement, r: CombinedReading, roomy: boolean) {
  const st = combinedStyle(r), icon = combinedIcon(r), size = roomy ? 58 : 42;
  el.textContent = '';
  el.style.cssText +=
    `;width:${size}px;height:${size}px;padding:0;border:2.5px solid transparent;border-radius:9999px;` +
    `background:${st.fill} padding-box, ${st.ring} border-box;color:${st.ink};` +
    `box-shadow:0 0 14px ${st.glow};display:flex;flex-direction:column;align-items:center;justify-content:center;` +
    `font-weight:800;letter-spacing:-0.01em;line-height:1;font-size:${roomy ? 12 : 10}px`;
  const hero = document.createElement('span');
  hero.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:2px;white-space:nowrap';
  if (icon) {
    hero.innerHTML = svg(icon, roomy ? 10 : 9);
  }
  hero.append(document.createTextNode(r.hero));
  el.append(hero);
  if (!roomy) return;
  const sub = document.createElement('span');
  sub.textContent = r.sub.replace(' · ', '·');
  // The longest labels ("AI #10·LP 12") get a slightly smaller size so they stay inside the pin.
  const long = sub.textContent.length > 10;
  sub.style.cssText = `margin-top:3px;padding:1.5px ${long ? 3 : 5}px;border-radius:999px;background:${st.pill};color:${st.pillInk};font-size:${long ? 7 : 8}px;font-weight:700;letter-spacing:0;white-space:nowrap`;
  el.append(sub);
}
