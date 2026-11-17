import { combinedHalves, type CombinedReading } from './combinedMap';

/**
 * Draws a combined-map point as a split pin into its map marker's button, which is already the
 * same 34 px circle with a white border as every other pin: the top half is the AI Overview
 * (higher on the page), the bottom half the local results, so both readings show at once.
 */
export function paintSplitPin(el: HTMLElement, r: CombinedReading) {
  const { top, bottom } = combinedHalves(r);
  el.textContent = '';
  el.style.cssText += ';padding:0;overflow:hidden;display:flex;flex-direction:column;font-size:10px;line-height:1;background-color:#020617';
  const half = (h: { text: string; fill: string; ink: string }, isTop: boolean) => {
    const d = document.createElement('span');
    d.style.cssText =
      `flex:1;display:flex;align-items:center;justify-content:center;white-space:nowrap;background:${h.fill};color:${h.ink};` +
      (isTop ? 'padding-top:2px;border-bottom:1px solid rgba(255,255,255,0.35)' : 'padding-bottom:2px');
    d.textContent = h.text;
    return d;
  };
  el.append(half(top, true), half(bottom, false));
}
