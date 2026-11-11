import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankDistribution, reportSummary } from '../apps/nextjs/src/lib/reportSummary';

const pin = (id: string, rank: number | null, extra: Record<string, unknown> = {}) =>
  ({ id, status: 'COMPLETED', rankFound: rank, lat: 28.04, lng: -81.95, topCompetitors: ['Rival Co', "Stuart's Plumbing", 'Third LLC'], ...extra }) as any;

test('rank distribution: completed points split into the five bands, failed points left out', () => {
  const d = rankDistribution([pin('a', 1), pin('b', 2), pin('c', 3), pin('d', 7), pin('e', 14), pin('f', null), { ...pin('g', 1), status: 'FAILED' }]);
  assert.equal(d.total, 6);
  assert.deepEqual(d.buckets.map((b) => [b.key, b.count]), [['first', 1], ['top3', 2], ['top10', 1], ['beyond', 1], ['absent', 1]]);
  assert.equal(Math.round(d.buckets[1].pct), 33);
  assert.deepEqual(rankDistribution([]).buckets.map((b) => b.pct), [0, 0, 0, 0, 0], 'no points: no division by zero');
});

test('summary: headline numbers and plain-language findings come from the scan data', () => {
  const s = reportSummary({ targetBusiness: "Stuart's Plumbing", centerLat: 28.04, centerLng: -81.95, pins: [pin('a', 1), pin('b', 2), pin('c', 5), pin('d', null)] });
  assert.equal(s.completed, 4);
  assert.equal(s.top3, 2);
  assert.equal(s.found, 3);
  assert.equal(Math.round((s.avgRank ?? 0) * 100), 267);
  assert.match(s.findings[0], /in the top 3 at 2 of 4 points \(50%\), and #1 at 1\./);
  assert.match(s.findings[1], /does not appear in the results at 1 point\./);
  assert.ok(s.findings.some((f) => /Rival Co/.test(f)), 'the leading competitor is named');
  assert.ok(!s.findings.some((f) => /AI Overview|Ads appear|buying power/.test(f)), 'no finding without data behind it');
  const none = reportSummary({ targetBusiness: 'X', centerLat: 0, centerLng: 0, pins: [pin('a', null), pin('b', 9)] });
  assert.match(none.findings[0], /not in the top 3 at any of the 2 points/);
  const all = reportSummary({ targetBusiness: 'X', centerLat: 0, centerLng: 0, pins: [pin('a', 1), pin('b', 3)] });
  assert.match(all.findings[0], /top 3 at every point \(2 of 2\)/);
  assert.deepEqual(reportSummary({ targetBusiness: 'X', centerLat: 0, centerLng: 0, pins: [] }).findings, []);
});
