import { test } from 'node:test';
import assert from 'node:assert/strict';

test('combined map: a point is a miss only when the business is in neither place', async () => {
  const { combinedReading, combinedTotals, combinedIcon, combinedStyle, COMBINED_STYLES } = await import('../apps/nextjs/src/lib/combinedMap');
  const base = { rank: null, rankFrom: null, hasAiOverview: true, cited: false, aiPos: null };
  // Missing from the local results, first in the AI Overview: rescued, not a miss.
  const rescued = combinedReading({ ...base, cited: true, aiPos: 1 });
  assert.deepEqual([rescued.kind, rescued.hero, rescued.sub, rescued.top3], ['ai', 'AI #1', 'LP 20+', true]);
  // In both: leads with the better of the two.
  const both = combinedReading({ ...base, rank: 1, cited: true, aiPos: 2 });
  assert.deepEqual([both.kind, both.hero, both.sub], ['both', '#1', 'AI #2 · LP 1']);
  // Named in the AI Overview without a place.
  assert.deepEqual([combinedReading({ ...base, cited: true }).hero, combinedReading({ ...base, cited: true }).top3], ['AI ✓', true]);
  // Local only, 4th: pale, and says an AI Overview appeared without the business.
  const local = combinedReading({ ...base, rank: 4 });
  assert.deepEqual([local.kind, local.hero, local.sub, local.top3], ['local', 'LP #4', 'AI: No', false]);
  assert.equal(combinedReading({ ...base, rank: 2, hasAiOverview: false }).sub, 'No AI');
  // A page with no local results stores the AI list place as the rank: that is an AI reading, not a local one.
  const aiList = combinedReading({ ...base, rank: 3, rankFrom: 'ai_overview_list', cited: true });
  assert.deepEqual([aiList.kind, aiList.ai, aiList.local], ['ai', 3, null]);
  // A single-business result held by the business is a local #1.
  assert.equal(combinedReading({ ...base, rank: 1, rankFrom: 'single_business', hasAiOverview: true }).kind, 'local');
  // No local results on the page at all reads "No LP"; a page that had them and left you out reads "LP 20+".
  assert.deepEqual([aiList.sub, aiList.localShown, rescued.sub, rescued.localShown], ['No LP', false, 'LP 20+', true]);
  const { combinedHalves } = await import('../apps/nextjs/src/lib/combinedMap');
  assert.deepEqual([combinedHalves(aiList).top.text, combinedHalves(aiList).bottom.text, combinedHalves(local).top.text, combinedHalves(local).bottom.text], ['#3', 'No LP', 'No', 'LP #4']);
  const miss = combinedReading(base);
  assert.deepEqual([miss.kind, miss.hero], ['miss', 'AI: No']);
  // A crown only for #1 in both; a sparkle wherever the AI Overview is the win; nothing on a local-only point or a miss.
  assert.deepEqual([combinedIcon(combinedReading({ ...base, rank: 1, cited: true, aiPos: 1 })), combinedIcon(rescued), combinedIcon(local), combinedIcon(miss)], ['crown', 'sparkle', null, null]);
  assert.equal(combinedStyle(local), COMBINED_STYLES.localLow);
  assert.equal(combinedStyle(rescued), COMBINED_STYLES.ai);
  const t = combinedTotals([rescued, both, local, aiList, miss]);
  assert.deepEqual([t.total, t.visible, t.localVisible, t.notInLocal, t.rescued, t.miss], [5, 4, 2, 3, 2, 1]);
});
