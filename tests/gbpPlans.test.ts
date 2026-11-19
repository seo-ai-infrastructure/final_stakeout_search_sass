import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allows, dollars, monthlyCents, planNow, quantityPlan, stripeTiers, unitCents } from '../packages/core/gbpPlans';

test('one listing costs less the more listings an account pays for', () => {
  assert.equal(unitCents('MANAGE', 1), 2900);
  assert.equal(unitCents('MANAGE', 9), 2900);
  assert.equal(unitCents('MANAGE', 10), 2200);
  assert.equal(unitCents('MANAGE', 25), 1600);
  assert.equal(unitCents('MANAGE', 100), 1200);
  assert.equal(unitCents('AGENT', 3), 5900);
  // The whole count is charged at the bracket it lands in.
  assert.equal(monthlyCents({ MANAGE: 10 }), 22000);
  assert.equal(monthlyCents({ MANAGE: 2, AGENT: 1 }), 2 * 2900 + 5900);
  assert.equal(monthlyCents({}), 0);
  assert.equal(dollars(2900), '$29');
  assert.equal(dollars(2950), '$29.50');
});

test('the brackets go to Stripe with an open last one', () => {
  const t = stripeTiers('MANAGE');
  assert.deepEqual(t[0], { up_to: 9, unit_amount: 2900 });
  assert.deepEqual(t[t.length - 1], { up_to: 'inf', unit_amount: 1200 });
});

test('a listing is paid only while its subscription is paying or its paid month is still running', () => {
  const now = new Date('2026-11-18T12:00:00Z');
  const row = (status: string, endsAt: Date | null = null, plan = 'MANAGE') => ({ plan, status, endsAt });
  assert.equal(planNow(row('ACTIVE'), 'active', now), 'MANAGE');
  assert.equal(planNow(row('ACTIVE'), 'past_due', now), 'MANAGE');
  assert.equal(planNow(row('ACTIVE'), 'canceled', now), null);
  assert.equal(planNow(row('ACTIVE'), null, now), null);
  assert.equal(planNow(row('PENDING'), 'active', now), null);
  assert.equal(planNow(row('ENDING', new Date('2026-11-30T00:00:00Z')), 'canceled', now), 'MANAGE');
  assert.equal(planNow(row('ENDING', new Date('2026-11-01T00:00:00Z')), 'active', now), null);
  assert.equal(planNow(row('ENDING'), 'active', now), null);
  assert.equal(planNow(row('ACTIVE', null, 'GOLD'), 'active', now), null);
  assert.equal(planNow(null, 'active', now), null);
});

test('free reads, Manage changes, Agent lets an agent in', () => {
  assert.equal(allows(null, 'free'), true);
  assert.equal(allows(null, 'manage'), false);
  assert.equal(allows('MANAGE', 'manage'), true);
  assert.equal(allows('MANAGE', 'agent'), false);
  assert.equal(allows('AGENT', 'manage'), true);
  assert.equal(allows('AGENT', 'agent'), true);
});

test('the subscription follows the listings that are on a plan', () => {
  const rows = [{ plan: 'MANAGE', status: 'ACTIVE' }, { plan: 'MANAGE', status: 'ACTIVE' }, { plan: 'MANAGE', status: 'ENDING' }, { plan: 'AGENT', status: 'PENDING' }];
  assert.deepEqual(quantityPlan(rows, { MANAGE: 1 }), { want: { MANAGE: 2, AGENT: 0 }, grows: true, same: false, empty: false });
  assert.equal(quantityPlan(rows, { MANAGE: 3 }).grows, false);
  assert.equal(quantityPlan(rows, { MANAGE: 2 }).same, true);
  assert.equal(quantityPlan([{ plan: 'MANAGE', status: 'ENDING' }], { MANAGE: 1 }).empty, true);
});

import { TOOLS, WRITES, rpcAnswer, toolCall } from '../packages/core/agentTools';
import { exploreRange } from '../packages/core/googleExplore';
import { monthsOf } from '../packages/core/gbpInsights';
import { reviewAlert } from '../packages/core/reviewAlert';

const at = { profile: 'W9UG3z', location: 'accounts/1/locations/2' };

test('an agent can never reach an identity edit', () => {
  for (const k of ['title', 'primaryCategory', 'additionalCategories', 'primaryPhone', 'websiteUri', 'address', 'name', 'website', 'phone', 'categories'])
    assert.match(String(toolCall('update_listing', { ...at, description: 'x', [k]: 'y' })), /cannot change/);
  const c = toolCall('update_listing', { ...at, description: 'Family plumber.', regularHours: [{ day: 'MONDAY', closed: false, open: '08:00', close: '17:00', title: 'x' }] });
  assert.equal(typeof c, 'object');
  const change = (c as { body: { change: Record<string, unknown> } }).body.change;
  assert.deepEqual(Object.keys(change).sort(), ['description', 'regularHours']);
  assert.deepEqual(change.regularHours, [{ day: 'MONDAY', closed: false, allDay: false, open: '08:00', close: '17:00' }]);
  assert.match(String(toolCall('update_listing', at)), /Give a description/);
  // The extras handler also takes booking links: an agent's tools only ever ask for services or attributes.
  assert.equal((toolCall('update_services', { ...at, services: [], kind: 'link-add' }) as { body: { kind: string } }).body.kind, 'services');
  assert.equal((toolCall('update_attributes', { ...at, attributes: { 'attributes/x': true } }) as { body: { kind: string } }).body.kind, 'attributes');
});

test('tools turn into the site’s own requests', () => {
  assert.deepEqual(toolCall('get_listing_insights', { ...at, days: 90 }), { route: 'insights', method: 'GET', query: { ...at, days: '90' } });
  assert.deepEqual(toolCall('delete_post', { ...at, id: 'abc', alsoOnGoogle: true }), { route: 'posts', method: 'DELETE', query: { ...at, id: 'abc', google: '1' } });
  const scan = toolCall('start_scan', { keyword: 'plumber', business: 'Stuart Plumbing', lat: 28.04, lng: -81.95, spacingMiles: 2 }) as { body: Record<string, unknown> };
  assert.equal(scan.body.spacingKm, 3.21868);
  assert.equal(scan.body.gridSize, 5);
  assert.equal(scan.body.targetBusiness, 'Stuart Plumbing');
  assert.match(String(toolCall('start_scan', { keyword: 'x', business: 'y', lat: 1, lng: 1, spacingMiles: 4 })), /spacingMiles/);
  assert.equal((toolCall('start_scan', { keyword: 'x', business: 'y', lat: 1, lng: 1, spacingMiles: 3 }) as { body: Record<string, unknown> }).body.spacingKm, 4.82802);
  assert.match(String(toolCall('create_post', { ...at, body: 'Hi', image: 'data:image/png;base64,AAAA' })), /https/);
  assert.equal(toolCall('nope', {}), 'Unknown tool.');
  assert.equal(toolCall('get_scan', { scanId: '../x' }), 'Unknown scan.');
  // Every tool has a route, and every write is a real tool.
  for (const t of TOOLS) assert.notEqual(toolCall(t.name, { ...at, services: [], attributes: {}, description: 'd', scanId: 'cmabcdefghij1234', spacingMiles: 1 }), 'Unknown tool.', t.name);
  for (const w of WRITES) assert.ok(TOOLS.some((t) => t.name === w), w);
});

test('the MCP handshake', () => {
  const init = rpcAnswer({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } }) as { result: { protocolVersion: string; capabilities: object } };
  assert.equal(init.result.protocolVersion, '2025-03-26');
  assert.equal((rpcAnswer({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '1999-01-01' } }) as { result: { protocolVersion: string } }).result.protocolVersion, '2025-06-18');
  assert.equal(rpcAnswer({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
  assert.equal(rpcAnswer({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: {} }), 'call');
  const list = rpcAnswer({ jsonrpc: '2.0', id: 3, method: 'tools/list' }) as { result: { tools: { name: string; annotations: { readOnlyHint: boolean } }[] } };
  assert.equal(list.result.tools.length, TOOLS.length);
  assert.equal(list.result.tools.find((t) => t.name === 'get_listing')?.annotations.readOnlyHint, true);
  assert.equal(list.result.tools.find((t) => t.name === 'create_post')?.annotations.readOnlyHint, false);
  assert.equal((rpcAnswer({ jsonrpc: '2.0', id: 4, method: 'nope' }) as { error: { code: number } }).error.code, -32601);
  assert.equal((rpcAnswer({ id: 5, method: 'ping' }) as { error: { code: number } }).error.code, -32600);
});

test('a listing’s history reaches back 18 months; Search Console stops at 16', () => {
  const today = new Date('2026-11-18T12:00:00Z');
  const gbp = exploreRange({ days: 540 }, today, 2, 18);
  assert.equal(typeof gbp === 'object' && gbp.days, 540);
  const gsc = exploreRange({ days: 540 }, today, 3);
  assert.equal(typeof gsc === 'object' && gsc.days, 480);
  assert.deepEqual(monthsOf('2025-05-27', '2026-11-16', 18), { from: '2025-06', to: '2026-11' });
  assert.deepEqual(monthsOf('2024-01-01', '2026-11-16'), { from: '2025-12', to: '2026-11' });
});

test('a low-star review email says who, how many stars and what', () => {
  const a = reviewAlert({ stars: 1, author: 'Dana', text: 'Never showed up.' }, 'Stuart Plumbing');
  assert.equal(a.subject, 'Stakeout: new 1-star review on Stuart Plumbing');
  assert.match(a.lines[0], /Dana left 1 star on/);
  assert.match(a.lines[1], /Never showed up/);
  assert.match(reviewAlert({ stars: 2, author: 'A', text: '' }, 'X').lines[1], /rating only/);
});

import { parseSpec } from '../packages/core/grid';

test('points can be three miles apart', () => {
  const spec = { keyword: 'plumber', targetBusiness: 'Stuart Plumbing', centerLat: 28.04, centerLng: -81.95, gridSize: 5, targetType: 'mobile_chrome' };
  assert.equal(parseSpec({ ...spec, spacingKm: 4.82802 }).spacingKm, 4.82802);
  assert.throws(() => parseSpec({ ...spec, spacingKm: 4 }));
});

import { connectionPaid, unpaidClock } from '../packages/core/gbpPlans';

test('an unpaid connection gets seven days, and a failed card starts the clock', () => {
  const now = new Date('2026-11-19T12:00:00Z');
  const row = (status: string, endsAt: Date | null = null) => ({ plan: 'MANAGE', status, endsAt });
  assert.equal(connectionPaid([row('ACTIVE')], 'active', now), true);
  assert.equal(connectionPaid([row('ACTIVE')], 'past_due', now), false);
  assert.equal(connectionPaid([row('PENDING')], 'active', now), false);
  assert.equal(connectionPaid([row('ENDING', new Date('2026-11-25T00:00:00Z'))], 'canceled', now), true);
  assert.equal(connectionPaid([row('ENDING', new Date('2026-11-01T00:00:00Z'))], 'canceled', now), false);
  assert.equal(connectionPaid([], null, now), false);

  assert.deepEqual(unpaidClock(true, new Date('2026-11-01T00:00:00Z'), now), { unpaidSince: null, disconnect: false, daysLeft: null });
  // Just stopped paying: the clock starts now.
  assert.deepEqual(unpaidClock(false, null, now), { unpaidSince: now, disconnect: false, daysLeft: 7 });
  assert.equal(unpaidClock(false, new Date('2026-11-14T12:00:00Z'), now).daysLeft, 2);
  assert.equal(unpaidClock(false, new Date('2026-11-12T12:00:00Z'), now).disconnect, true);
  assert.equal(unpaidClock(false, new Date('2026-11-12T12:00:01Z'), now).disconnect, false);
});
