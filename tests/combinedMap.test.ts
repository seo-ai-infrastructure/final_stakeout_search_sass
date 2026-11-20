import { test } from 'node:test';
import assert from 'node:assert/strict';

test('combined map: a point is a miss only when the business is in neither place', async () => {
  const { combinedReading, combinedTotals, combinedStyle, AI_PURPLE } = await import('../apps/nextjs/src/lib/combinedMap');
  const base = { rank: null, rankFrom: null, hasAiOverview: true, cited: false, aiPos: null };
  // Missing from the local results, first in the AI Overview: recommended there, not a miss.
  const recommended = combinedReading({ ...base, cited: true, aiPos: 1 });
  assert.deepEqual([recommended.kind, recommended.label, recommended.top3], ['ai', '#1', true]);
  assert.equal(recommended.detail, 'AI Overview #1 · not in the local results');
  // In both: the label is the better of the two.
  const both = combinedReading({ ...base, rank: 1, cited: true, aiPos: 2 });
  assert.deepEqual([both.kind, both.label, both.detail], ['both', '#1', 'AI Overview #2 · local results #1']);
  assert.equal(combinedReading({ ...base, rank: 6, cited: true, aiPos: 2 }).label, '#2');
  // Named in the AI Overview without a place: a tick.
  const named = combinedReading({ ...base, cited: true });
  assert.deepEqual([named.label, named.top3, named.detail], ['✓', true, 'Named in the AI Overview · not in the local results']);
  assert.deepEqual([combinedReading({ ...base, rank: 5, cited: true }).label, combinedReading({ ...base, rank: 5, cited: true }).kind], ['#5', 'both']);
  // Local only, 4th.
  const local = combinedReading({ ...base, rank: 4 });
  assert.deepEqual([local.kind, local.label, local.top3, local.detail], ['local', '#4', false, 'Not in the AI Overview · local results #4']);
  assert.equal(combinedReading({ ...base, rank: 2, hasAiOverview: false }).detail, 'No AI Overview · local results #2');
  // A page with no local results stores the AI list place as the rank: that is an AI reading, not a local one.
  const aiList = combinedReading({ ...base, rank: 3, rankFrom: 'ai_overview_list', cited: true });
  assert.deepEqual([aiList.kind, aiList.ai, aiList.local, aiList.localShown, aiList.label], ['ai', 3, null, false, '#3']);
  assert.equal(aiList.detail, 'AI Overview #3 · no local results on the page');
  // A single-business result held by the business is a local #1.
  assert.equal(combinedReading({ ...base, rank: 1, rankFrom: 'single_business', hasAiOverview: true }).kind, 'local');
  // In neither: "20+".
  const miss = combinedReading(base);
  assert.deepEqual([miss.kind, miss.label, miss.top3, miss.detail], ['miss', '20+', false, 'Not in the AI Overview · not in the local results']);
  // The pin takes the Pack rank colour of the placement it shows; purple where that placement is the AI Overview's.
  const { rankColor } = await import('../apps/nextjs/src/lib/gridColumns');
  assert.equal(combinedStyle(local).swatch, rankColor('COMPLETED', 4));
  assert.equal(combinedStyle(miss).swatch, rankColor('COMPLETED', null));
  assert.equal(combinedStyle(recommended).swatch, AI_PURPLE);
  assert.equal(combinedStyle(aiList).swatch, AI_PURPLE);
  // In both: purple only when the AI Overview place is the better one.
  assert.equal(combinedStyle(combinedReading({ ...base, rank: 6, cited: true, aiPos: 5 })).swatch, AI_PURPLE);
  assert.equal(combinedStyle(combinedReading({ ...base, rank: 2, cited: true, aiPos: 5 })).swatch, rankColor('COMPLETED', 2));
  assert.equal(combinedStyle(combinedReading({ ...base, rank: 2, cited: true })).swatch, rankColor('COMPLETED', 2));
  const t = combinedTotals([recommended, both, local, aiList, miss]);
  assert.deepEqual([t.total, t.visible, t.localVisible, t.notInLocal, t.recommended, t.miss], [5, 4, 2, 3, 2, 1]);
});

test('combined map, 50/50 split: AI Overview on top, the local results below in the Pack rank colours', async () => {
  const { combinedReading, combinedHalves } = await import('../apps/nextjs/src/lib/combinedMap');
  const { rankColor, RANK_COLORS } = await import('../apps/nextjs/src/lib/gridColumns');
  const base = { rank: null, rankFrom: null, hasAiOverview: true, cited: false, aiPos: null };
  const half = (p: Partial<typeof base> & Record<string, unknown>) => combinedHalves(combinedReading({ ...base, ...p } as typeof base));
  // AI #1, not in the local results: purple "#1" over a neutral "20+" (the AI Overview has it, so not a miss).
  const a = half({ cited: true, aiPos: 1 });
  assert.deepEqual([a.top.text, a.top.fill, a.bottom.text, a.bottom.fill], ['#1', '#7c3aed', '20+', '#0f172a']);
  // AI 5th, local #6: indigo over the #6 colour, with a label readable on it.
  const b = half({ cited: true, aiPos: 5, rank: 6 });
  assert.deepEqual([b.top.text, b.top.fill, b.bottom.text, b.bottom.fill, b.bottom.ink], ['#5', '#4f46e5', '#6', rankColor('COMPLETED', 6), '#0f172a']);
  // Local #2 with an AI Overview that leaves the business out; then with no AI Overview at all.
  const c = half({ rank: 2 });
  assert.deepEqual([c.top.text, c.bottom.text, c.bottom.fill, c.bottom.ink], ['No', '#2', '#2a6600', '#ffffff']);
  assert.equal(half({ rank: 2, hasAiOverview: false }).top.text, '–');
  // Named without a place, on a page with no local results.
  const d = half({ cited: true, rank: 3, rankFrom: 'ai_overview_list' });
  assert.deepEqual([d.top.text, d.bottom.text, d.bottom.fill], ['#3', '–', '#0f172a']);
  assert.equal(half({ cited: true }).top.text, '✓');
  // In neither place: the 20+ red underneath.
  const e = half({});
  assert.deepEqual([e.top.text, e.bottom.text, e.bottom.fill, e.bottom.ink], ['No', '20+', RANK_COLORS.none, '#ffffff']);
});
