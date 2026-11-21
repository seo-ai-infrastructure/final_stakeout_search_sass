import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLANS, SCOUT, SCAN_NOW_5X5, addedCents, allows, clientSeats, dollars, isLine, isPlan, lineCents, monthlyCents, planNow, quantityPlan, seatGrant, seatPoints, stripeTiers, unitCents, settlePending, tierNudge } from '../packages/core/gbpPlans';

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

test('Scout, Command and Dominator are priced per client on graduated brackets', () => {
  // Each bracket's price is for the clients inside it.
  assert.equal(lineCents('COMMAND', 1), 5900);
  assert.equal(lineCents('COMMAND', 9), 9 * 5900);
  assert.equal(lineCents('COMMAND', 10), 9 * 5900 + 4900);
  assert.equal(lineCents('COMMAND', 12), 67800, 'twelve Command clients: 9 × $59 + 3 × $49 = $678');
  assert.equal(lineCents('COMMAND', 25), 9 * 5900 + 15 * 4900 + 3900);
  assert.equal(lineCents('COMMAND', 120), 9 * 5900 + 15 * 4900 + 75 * 3900 + 21 * 2900);
  assert.equal(lineCents('SCOUT', 10), 9 * 3900 + 3200);
  assert.equal(lineCents('DOMINATOR', 100), 9 * 9900 + 15 * 8500 + 75 * 6900 + 5500);
  assert.equal(lineCents('SCOUT', 0), 0);
  // Adding a client never makes the month cheaper, unlike a volume price.
  for (const line of ['SCOUT', 'COMMAND', 'DOMINATOR'] as const)
    for (let n = 0; n < 130; n++) assert.ok(lineCents(line, n + 1) > lineCents(line, n), `${line} ${n} → ${n + 1}`);
  assert.equal(addedCents('COMMAND', 9), 4900);
  assert.equal(addedCents('SCOUT', 0), 3900);
  assert.equal(unitCents('DOMINATOR', 10), 8500);
  assert.equal(monthlyCents({ COMMAND: 2, SCOUT: 3, DOMINATOR: 1 }), 2 * 5900 + 3 * 3900 + 9900);
  assert.equal(tierNudge('COMMAND', 9), null);
  assert.equal(PLANS.COMMAND.available && PLANS.DOMINATOR.available && SCOUT.available, true);
  assert.equal(PLANS.MANAGE.available, false, 'Manage is retired: Command replaced it');
  assert.deepEqual(stripeTiers('SCOUT').map((t) => t.up_to), [9, 24, 99, 'inf']);
  assert.equal(isPlan('DOMINATOR'), true);
  assert.equal(isPlan('SCOUT'), false, 'Scout seats are not a listing plan');
  assert.equal(isLine('SCOUT'), true);
});

test('points: each seat adds its points every paid month, and seats added mid-month their share', () => {
  assert.equal(SCAN_NOW_5X5, 50);
  assert.equal(PLANS.COMMAND.points, 550, '500 plus one Scan Now 5×5');
  assert.equal(PLANS.DOMINATOR.points, 1250, '1,100 plus three Scan Now 5×5s');
  assert.equal(SCOUT.points, 250);
  assert.equal(seatPoints({ SCOUT: 2, COMMAND: 3, DOMINATOR: 1, MANAGE: 4 }), 500 + 1650 + 1250);
  assert.equal(clientSeats({ SCOUT: 2, COMMAND: 3, DOMINATOR: 1, MANAGE: 4 }), 6);
  assert.deepEqual(seatGrant('subscription_create', 1650, 0), { renew: true, points: 1650, granted: 1650 });
  assert.deepEqual(seatGrant('subscription_cycle', 1100, 1650), { renew: true, points: 1100, granted: 1100 });
  // Two more Command seats with half the month left: half their points, like half their price.
  assert.deepEqual(seatGrant('subscription_update', 2750, 1650, 0.5), { renew: false, points: 550, granted: 2750 });
  // Added a minute before the month ends: next to nothing, as Stripe charges next to nothing.
  assert.equal(seatGrant('subscription_update', 2750, 1650, 0.0001)?.points, 0);
  // A seat put back that the month had already paid for, or the add-on added: nothing more.
  assert.equal(seatGrant('subscription_update', 1650, 1650), null);
  assert.equal(seatGrant('subscription_update', 1100, 1650), null);
  assert.equal(seatGrant('manual', 1650, 0), null);
  assert.deepEqual(seatGrant('subscription_cycle', 0, 550), { renew: true, points: 0, granted: 0 });
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

test('free reads, Manage changes, a paid listing lets an agent in', () => {
  assert.equal(allows(null, 'free'), true);
  assert.equal(allows(null, 'manage'), false);
  assert.equal(allows('MANAGE', 'manage'), true);
  assert.equal(allows('MANAGE', 'agent'), true);
  assert.equal(allows('AGENT', 'manage'), true);
  assert.equal(allows('AGENT', 'agent'), true);
  assert.equal(allows('COMMAND', 'manage'), true);
  assert.equal(allows('COMMAND', 'agent'), true);
  assert.equal(allows('DOMINATOR', 'manage'), true);
});

test('the subscription follows the listings that are on a plan', () => {
  const rows = [{ plan: 'MANAGE', status: 'ACTIVE' }, { plan: 'MANAGE', status: 'ACTIVE' }, { plan: 'MANAGE', status: 'ENDING' }, { plan: 'AGENT', status: 'PENDING' }];
  assert.deepEqual(quantityPlan(rows, { MANAGE: 1 }), { want: { DOMINATOR: 0, COMMAND: 0, MANAGE: 2, AGENT: 0, SCOUT: 0 }, grows: true, same: false, empty: false });
  assert.equal(quantityPlan(rows, { MANAGE: 3 }).grows, false);
  assert.equal(quantityPlan(rows, { MANAGE: 2 }).same, true);
  assert.equal(quantityPlan([{ plan: 'MANAGE', status: 'ENDING' }], { MANAGE: 1 }).empty, true);
  // Scout seats stay as they are unless a new number is given.
  const cmd = [{ plan: 'COMMAND', status: 'ACTIVE' }, { plan: 'DOMINATOR', status: 'ACTIVE' }];
  assert.deepEqual(quantityPlan(cmd, { COMMAND: 1, DOMINATOR: 1, SCOUT: 4 }).want, { DOMINATOR: 1, COMMAND: 1, MANAGE: 0, AGENT: 0, SCOUT: 4 });
  assert.equal(quantityPlan(cmd, { COMMAND: 1, DOMINATOR: 1, SCOUT: 4 }).same, true);
  assert.equal(quantityPlan(cmd, { COMMAND: 1, DOMINATOR: 1, SCOUT: 4 }, 6).grows, true);
  assert.equal(quantityPlan(cmd, { COMMAND: 1, DOMINATOR: 1, SCOUT: 4 }, 2).grows, false);
  assert.equal(quantityPlan([], { SCOUT: 4 }, 0).empty, true);
  assert.equal(quantityPlan([], {}, 3).empty, false, 'Scout seats alone are a subscription');
});

import { PLAYBOOKS, TOOLS, WRITES, annotationsOf, playbookText, rpcAnswer, toolCall } from '../packages/core/agentTools';
import { withUtm } from '../packages/core/gbpExtras';
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
  assert.equal((toolCall('upsert_services', { ...at, services: [{ name: 'Drain cleaning' }], kind: 'link-add' }) as { body: { kind: string } }).body.kind, 'services-patch');
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
  // Every tool says whether it only reads; every one that changes something or spends credits is marked so a client asks first.
  for (const t of list.result.tools as unknown as { name: string; annotations: { readOnlyHint: boolean; destructiveHint: boolean } }[]) assert.equal(t.annotations.destructiveHint, !t.annotations.readOnlyHint, t.name);
  for (const w of WRITES) assert.ok(TOOLS.some((t) => t.name === w), w);
  assert.equal(annotationsOf('start_scan').destructiveHint, true);
  assert.equal(annotationsOf('get_workspace_briefing').readOnlyHint, true);
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

  assert.deepEqual(unpaidClock(true, new Date('2026-11-01T00:00:00Z'), now), { unpaidSince: null, disconnect: false, daysLeft: null, minutesLeft: null });
  // Just stopped paying: the clock starts now.
  assert.deepEqual(unpaidClock(false, null, now), { unpaidSince: now, disconnect: false, daysLeft: 7, minutesLeft: 10080 });
  assert.equal(unpaidClock(false, new Date('2026-11-14T12:00:00Z'), now).daysLeft, 2);
  assert.equal(unpaidClock(false, new Date('2026-11-12T12:00:00Z'), now).disconnect, true);
  assert.equal(unpaidClock(false, new Date('2026-11-12T12:00:01Z'), now).disconnect, false);
});

test('just under a bracket, the nudge to reach it', () => {
  assert.deepEqual(tierNudge('MANAGE', 8), { count: 10, cents: 22000, each: 2200, more: 2 });
  assert.deepEqual(tierNudge('MANAGE', 9), { count: 10, cents: 22000, each: 2200, more: 1 });
  assert.equal(tierNudge('MANAGE', 7), null, '7 at $29 is $203: ten would cost more');
  assert.deepEqual(tierNudge('MANAGE', 20), { count: 25, cents: 40000, each: 1600, more: 5 });
  assert.equal(tierNudge('MANAGE', 18), null);
  assert.equal(tierNudge('MANAGE', 150), null);
  assert.equal(tierNudge('MANAGE', 0), null);
  assert.equal(settlePending(10, 8, 2), 'activate');
  assert.equal(settlePending(8, 8, 2), 'drop');
  assert.equal(settlePending(8, 8, 0), 'none');
});

test('agent access comes with a listing on a plan; the add-on is for an account without one', async () => {
  const { addonOn } = await import('../packages/core/gbpPlans');
  assert.equal(allows('MANAGE', 'agent'), true);
  assert.equal(allows('AGENT', 'agent'), true);
  assert.equal(allows(null, 'agent'), false, 'a listing that is not on a plan stays closed to agents');
  assert.equal(addonOn({ agentAddon: true, status: 'active' }), true);
  assert.equal(addonOn({ agentAddon: true, status: 'past_due' }), true, 'kept while Stripe retries the card');
  assert.equal(addonOn({ agentAddon: true, status: 'canceled' }), false);
  assert.equal(addonOn({ agentAddon: false, status: 'active' }), false);
  assert.equal(addonOn(null), false);
});

test('a connection never paid for is given back after an hour', () => {
  const now = new Date('2026-11-19T12:00:00Z'), ago = (min: number) => new Date(now.getTime() - min * 60000);
  assert.deepEqual(unpaidClock(false, ago(20), now, false), { unpaidSince: ago(20), disconnect: false, daysLeft: 1, minutesLeft: 40 });
  assert.equal(unpaidClock(false, ago(60), now, false).disconnect, true);
  assert.equal(unpaidClock(false, ago(60), now, true).disconnect, false, 'an account that paid before keeps the week');
  assert.equal(unpaidClock(true, ago(600), now, false).disconnect, false);
});

test('an agent patches services; it never sends a whole list', () => {
  // The old whole-list tool is gone, and says what to use instead.
  assert.match(String(toolCall('update_services', { ...at, services: [] })), /upsert_services/);
  assert.equal(TOOLS.some((t) => t.name === 'update_services'), false);
  assert.deepEqual((toolCall('upsert_services', { ...at, services: [{ name: 'Drain cleaning', description: 'Same day.' }] }) as { body: unknown }).body, { ...at, kind: 'services-patch', upsert: [{ key: undefined, typeId: undefined, name: 'Drain cleaning', description: 'Same day.' }], remove: [] });
  assert.deepEqual((toolCall('remove_services', { ...at, services: ['Drain cleaning', ''] }) as { body: unknown }).body, { ...at, kind: 'services-patch', upsert: [], remove: ['Drain cleaning'] });
  assert.match(String(toolCall('upsert_services', { ...at, services: [{ description: 'x' }] })), /Name each service/);
  assert.match(String(toolCall('remove_services', { ...at, services: [] })), /Name the services/);
});

test('an agent’s scan is 5×5 unless a size is named', () => {
  const scan = (a: Record<string, unknown>) => toolCall('start_scan', { keyword: 'plumber', business: 'Acme', lat: 28, lng: -81, ...a });
  assert.equal((scan({}) as { body: { gridSize: number } }).body.gridSize, 5);
  assert.equal((scan({ gridSize: 9 }) as { body: { gridSize: number } }).body.gridSize, 9);
  assert.match(String(scan({ gridSize: 13 })), /gridSize/);
  assert.match(String(scan({ gridSize: 6 })), /gridSize/);
});

test('booking links are tagged and preferred unless told otherwise', () => {
  const add = toolCall('manage_action_links', { ...at, action: 'add', type: 'APPOINTMENT', uri: 'https://acme.com/book' }) as { body: Record<string, unknown> };
  assert.equal(add.body.kind, 'link-add');
  assert.equal(add.body.preferred, true);
  assert.equal(add.body.uri, 'https://acme.com/book?utm_source=google&utm_medium=organic&utm_campaign=gbp_listing&utm_content=appointment');
  // Tags already on the link are kept, and tagging can be switched off.
  assert.equal(withUtm('https://acme.com/book?utm_campaign=spring', 'APPOINTMENT'), 'https://acme.com/book?utm_campaign=spring&utm_source=google&utm_medium=organic&utm_content=appointment');
  assert.equal((toolCall('manage_action_links', { ...at, action: 'add', type: 'APPOINTMENT', uri: 'https://acme.com/book', tag: false, preferred: false }) as { body: Record<string, unknown> }).body.uri, 'https://acme.com/book');
  assert.equal(withUtm('not a link', 'APPOINTMENT'), 'not a link');
  assert.equal((toolCall('manage_action_links', { ...at, action: 'delete', name: 'locations/2/placeActionLinks/x' }) as { body: Record<string, unknown> }).body.kind, 'link-delete');
  assert.match(String(toolCall('manage_action_links', { ...at, action: 'update', uri: 'https://acme.com' })), /name/);
  assert.match(String(toolCall('manage_action_links', { ...at, action: 'wipe' })), /add, update or delete/);
});

test('the new tools become the right requests', () => {
  assert.deepEqual(toolCall('resolve_change', { change_id: 'abc', action: 'revert' }), { route: 'resolve', method: 'OP', body: { id: 'abc', action: 'revert' } });
  assert.match(String(toolCall('resolve_change', { change_id: 'abc', action: 'delete' })), /accept or revert/);
  assert.deepEqual(toolCall('get_workspace_briefing', {}), { route: 'briefing', method: 'OP' });
  assert.deepEqual(toolCall('inspect_url', { url: 'https://acme.com/plumbing' }), { route: 'overview', method: 'POST', body: { source: 'inspect', website: 'https://acme.com/plumbing' } });
  assert.match(String(toolCall('inspect_url', { url: 'acme.com' })), /https/);
  assert.equal((toolCall('add_media', { ...at, url: 'https://acme.com/a.jpg', category: 'team' }) as { body: Record<string, unknown> }).body.category, 'TEAMS');
  assert.match(String(toolCall('add_media', { ...at, url: 'https://acme.com/a.jpg', category: 'MENU' })), /category must be/);
  assert.deepEqual((toolCall('delete_media', { ...at, name: 'accounts/1/locations/2/media/x' }) as { query: unknown }).query, { ...at, name: 'accounts/1/locations/2/media/x' });
  assert.deepEqual((toolCall('search_gbp_categories', { ...at, q: 'pressure washing' }) as { query: unknown }).query, { ...at, q: 'pressure washing', full: '1' });
  const ga = toolCall('analytics', { property: 'properties/1', by: 'landingPagePlusQueryString', by2: 'sessionCampaignName', utm_campaign: 'gbp_listing' }) as { body: Record<string, unknown> };
  assert.equal(ga.body.by2, 'sessionCampaignName');
  assert.equal(ga.body.campaign, 'gbp_listing');
  assert.equal((toolCall('search_console', { website: 'https://acme.com', by: 'query', by2: 'page' }) as { body: Record<string, unknown> }).body.by2, 'page');
  // A queued post takes the queue's slot; an edit to a post carries only what changes.
  assert.match(String(toolCall('enqueue_post', { ...at, queue: 'q1', body: 'Hi', scheduledAt: '2027-01-01T10:00:00Z' })), /leave scheduledAt out/);
  assert.deepEqual((toolCall('enqueue_post', { ...at, queue: 'q1', body: 'Hi' }) as { body: unknown }).body, { ...at, draft: { body: 'Hi' }, queue: 'q1', priority: 'medium' });
  assert.deepEqual((toolCall('update_post', { ...at, id: 'p1', image: '', body: 'New' }) as { body: unknown }).body, { ...at, id: 'p1', change: { body: 'New', image: '' } });
  assert.match(String(toolCall('get_post_stats', { ...at, ids: [] })), /ids/);
  const more = toolCall('update_listing', { ...at, openingDate: '2011-10-01', moreHours: [{ type: 'delivery', days: [{ day: 'MONDAY', closed: false, open: '09:00', close: '17:00' }] }] }) as { body: { change: { moreHours: { type: string }[]; openingDate: string } } };
  assert.equal(more.body.change.moreHours[0].type, 'DELIVERY');
  assert.equal(more.body.change.openingDate, '2011-10-01');
});

test('the playbooks are offered as MCP prompts', () => {
  const init = rpcAnswer({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }) as { result: { capabilities: Record<string, unknown> } };
  assert.ok(init.result.capabilities.prompts);
  const list = rpcAnswer({ jsonrpc: '2.0', id: 2, method: 'prompts/list' }) as { result: { prompts: { name: string }[] } };
  assert.deepEqual(list.result.prompts.map((p) => p.name), ['weekly_listing_check', 'reply_to_new_reviews', 'find_why_i_dropped', 'monthly_client_report', 'optimize-vs-top-rivals']);
  const got = rpcAnswer({ jsonrpc: '2.0', id: 3, method: 'prompts/get', params: { name: 'weekly_listing_check', arguments: { business: 'Acme Plumbing' } } }) as { result: { messages: { role: string; content: { type: string; text: string } }[] } };
  assert.equal(got.result.messages[0].role, 'user');
  assert.match(got.result.messages[0].content.text, /Acme Plumbing/);
  assert.equal((rpcAnswer({ jsonrpc: '2.0', id: 4, method: 'prompts/get', params: { name: 'nope' } }) as { error: { code: number } }).error.code, -32602);
  // Every tool a playbook names is one the server has.
  for (const b of PLAYBOOKS) for (const m of playbookText(b).matchAll(/\b([a-z]+(?:_[a-z]+)+)\b/g)) if (!/^(utm|gbp)_/.test(m[1])) assert.ok(TOOLS.some((t) => t.name === m[1]), b.name + ' names ' + m[1]);
  assert.match(playbookText(PLAYBOOKS[0]), /my business/);
});

import { sameBusiness, siteDomain } from '../packages/core/businessSite';
import { parseSpec } from '../packages/core/grid';

test('a scan keeps the business’s website as a bare domain', () => {
  for (const [typed, want] of [['stuartsplumbing.com', 'stuartsplumbing.com'], ['https://www.StuartsPlumbing.com/', 'stuartsplumbing.com'], ['http://stuartsplumbing.com/contact?utm_source=google#top', 'stuartsplumbing.com'], ['WWW.stuartsplumbing.com:443', 'stuartsplumbing.com'], ['book.stuartsplumbing.co.uk', 'book.stuartsplumbing.co.uk']] as const)
    assert.equal(siteDomain(typed), want, typed);
  for (const bad of ['', 'stuarts plumbing', 'localhost', 'not a site', 'http://', '12345', undefined, 42]) assert.equal(siteDomain(bad), null, String(bad));
  assert.equal(sameBusiness("Stuart's Plumbing", 'STUARTS  PLUMBING'), true);
  assert.equal(sameBusiness('Stuart’s Plumbing', "Stuart's Plumbing"), true);
  assert.equal(sameBusiness("Stuart's Plumbing", "Stuart's Plumbing & Air"), false);
  assert.equal(sameBusiness('', ''), false);
  const base = { keyword: 'plumber near me', targetBusiness: "Stuart's Plumbing", centerLat: 28.03, centerLng: -81.94, targetType: 'mobile_chrome' };
  assert.equal(parseSpec({ ...base, targetDomain: 'https://www.stuartsplumbing.com/' }).targetDomain, 'stuartsplumbing.com');
  assert.equal(parseSpec(base).targetDomain, null);
  assert.throws(() => parseSpec({ ...base, targetDomain: 'stuarts plumbing' }), /website as a domain/);
  // AI Overviews are recorded on every Google search scan whatever is asked; the Maps app has none.
  assert.equal(parseSpec({ ...base, trackAiOverviews: false }).trackAiOverviews, true);
  assert.equal(parseSpec({ ...base, targetType: 'mobile_maps' }).trackAiOverviews, false);
  // An agent's scan passes the website through, and no longer offers AI tracking as a choice.
  const call = toolCall('start_scan', { keyword: 'plumber near me', business: "Stuart's Plumbing", lat: 28.03, lng: -81.94, website: 'stuartsplumbing.com' }) as { body: Record<string, unknown> };
  assert.equal(call.body.targetDomain, 'stuartsplumbing.com');
  assert.equal('trackAiOverviews' in call.body, false);
  assert.equal('trackAiOverviews' in (TOOLS.find((t) => t.name === 'start_scan')!.inputSchema.properties), false);
});

import { compareProblem, compareScans, type ComparedScan } from '../packages/core/scanCompare';
import { cronParts, fixedCron, scheduleText } from '../packages/core/grid';

const gridScan = (id: string, at: string, ranks: (number | null)[], over: Partial<ComparedScan> = {}): ComparedScan => ({
  id, keyword: 'emergency plumber near me', business: "Stuart's Plumbing", gridSize: 3, spacingKm: 1.60934, centerLat: 28.0289, centerLng: -81.9386, targetType: 'mobile_chrome', createdAt: new Date(at),
  pins: ranks.map((rank, i) => ({ row: Math.floor(i / 3), col: i % 3, status: 'COMPLETED', rank, top3: rank !== null && rank <= 3 ? ['Nest Plumbing LLC', "Stuart's Plumbing", 'Pro plumbing LLC'] : ['Nest Plumbing LLC', '1 Time Plumbing', 'Pro plumbing LLC'] })),
  ...over,
});

test('two scans of the same grid, point by point', () => {
  const a = gridScan('scanaaaaaaaaa', '2026-11-18T11:54:00Z', [null, 5, 5, 4, 5, 4, 4, 3, 3]);
  const b = gridScan('scanbbbbbbbbb', '2026-11-19T16:35:00Z', [6, 8, 8, 5, 6, 6, null, 3, 1]);
  assert.equal(compareProblem(a, b), null);
  // Given in either order, the earlier scan is "before".
  const c = compareScans(b, a, 'America/New_York');
  assert.equal(c.before.id, 'scanaaaaaaaaa');
  assert.deepEqual([c.before.inTop3, c.after.inTop3, c.before.notFound, c.after.notFound], [2, 2, 1, 1]);
  assert.deepEqual(c.moved, { better: 1, worse: 5, same: 1, gained: 1, lost: 1 });
  assert.deepEqual(c.points[0], { row: 0, col: 0, before: null, after: 6, move: 'gained' });
  assert.deepEqual(c.points[8], { row: 2, col: 2, before: 3, after: 1, move: 'better', places: 2 });
  assert.deepEqual(c.points[1], { row: 0, col: 1, before: 5, after: 8, move: 'worse', places: -3 });
  assert.equal(c.points[6].move, 'lost');
  // The scanned business is never one of its own rivals; a rival is counted wherever it is in the first three.
  assert.equal(c.rivalsInTheTopThree.list.some((r) => r.name === "Stuart's Plumbing"), false);
  assert.deepEqual(c.rivalsInTheTopThree.list.find((r) => r.name === 'Nest Plumbing LLC'), { name: 'Nest Plumbing LLC', inTopThreeBefore: 9, inTopThreeAfter: 9, change: 0 });
  // What makes the comparison less than fair is said: the hour of the day, and how close together they are.
  assert.match(c.before.at, /6:54 AM/);
  assert.match(c.after.at, /11:35 AM/);
  assert.equal(c.cautions.some((x) => /different times of day/.test(x)), true);
  assert.equal(c.cautions.some((x) => /day-to-day movement/.test(x)), true);
  // Same hour a week apart: nothing to caution about.
  assert.deepEqual(compareScans(a, gridScan('scancccccccccc', '2026-11-25T11:50:00Z', [null, 5, 5, 4, 5, 4, 4, 3, 3]), 'America/New_York').cautions, []);
  // Different grids, spacing or centres are refused: their points do not line up.
  assert.match(String(compareProblem(a, { ...b, gridSize: 5 })), /different grids \(3×3 and 5×5\)/);
  assert.match(String(compareProblem(a, { ...b, spacingKm: 3.21868 })), /space their points differently/);
  assert.match(String(compareProblem(a, { ...b, centerLat: 28.2 })), /different places/);
  assert.match(String(compareProblem(a, a)), /two different scans/);
  // A point that was not read in one scan is left out of the moves and said.
  const half = gridScan('scanddddddddd', '2026-11-25T11:50:00Z', [null, 5, 5, 4, 5, 4, 4, 3, 3]);
  half.pins[4].status = 'FAILED';
  const h = compareScans(a, half, 'UTC');
  assert.equal(h.points[4].move, 'not read in both');
  assert.equal(h.cautions.some((x) => /not read in both/.test(x)), true);
});

test('a repeating scan at a set time of day', () => {
  assert.equal(fixedCron('daily', '07:30', 'America/New_York'), '30 7 * * *;tz=America/New_York');
  assert.equal(fixedCron('weekly', '18:05', 'America/Chicago', 3), '5 18 * * 3;tz=America/Chicago');
  assert.equal(fixedCron('weekly', '9:00', 'UTC'), '0 9 * * 1;tz=UTC');
  for (const bad of [['once', '07:30', 'UTC'], ['daily', '7.30', 'UTC'], ['daily', '25:00', 'UTC'], ['daily', '07:30', 'Mars/Olympus'], ['daily', '07:30', ''], ['weekly', '07:30', 'UTC', 9]] as const)
    assert.equal(typeof fixedCron(bad[0], bad[1], bad[2], bad[3]), 'object', bad.join(' '));
  assert.deepEqual(cronParts('30 7 * * *;tz=America/New_York'), { pattern: '30 7 * * *', tz: 'America/New_York' });
  // The usual schedules carry no time zone and stay in UTC; a paused one keeps its time.
  assert.deepEqual(cronParts('0 13 * * 1'), { pattern: '0 13 * * 1', tz: 'UTC' });
  assert.deepEqual(cronParts('PAUSED:30 7 * * *;tz=America/New_York'), { pattern: '30 7 * * *', tz: 'America/New_York' });
  assert.equal(scheduleText('daily', '30 7 * * *;tz=America/New_York'), 'every day at 7:30 AM (America/New_York)');
  assert.equal(scheduleText('weekly', 'PAUSED:0 13 * * 1'), 'every Monday at 1:00 PM (UTC), paused');
  assert.equal(scheduleText('once', null), null);
  // An agent's scan: a time of day only with a scan that repeats.
  const base = { keyword: 'plumber near me', business: 'Acme', lat: 28, lng: -81 };
  const daily = toolCall('start_scan', { ...base, repeat: 'daily', at: '07:30', timezone: 'America/New_York' }) as { body: Record<string, unknown> };
  assert.deepEqual([daily.body.scheduleType, daily.body.scheduleAt, daily.body.scheduleTimezone], ['daily', '07:30', 'America/New_York']);
  assert.equal((toolCall('start_scan', base) as { body: Record<string, unknown> }).body.scheduleType, 'once');
  assert.match(String(toolCall('start_scan', { ...base, at: '07:30' })), /scan that repeats/);
  assert.match(String(toolCall('start_scan', { ...base, repeat: 'hourly' })), /once, daily or weekly/);
  assert.deepEqual(toolCall('set_scan_schedule', { scanId: 'cmwnut6r60004k8zvvyx2rgp6', action: 'pause' }), { route: 'scan-action', method: 'OP', body: { scanId: 'cmwnut6r60004k8zvvyx2rgp6', action: 'pause' } });
  assert.match(String(toolCall('set_scan_schedule', { scanId: 'cmwnut6r60004k8zvvyx2rgp6', action: 'delete' })), /pause or resume/);
  assert.deepEqual(toolCall('compare_scans', { scanA: 'cmwnut6r60004k8zvvyx2rgp6', scanB: 'cmwntwpvy0004siqf50wazp2c' }), { route: 'compare', method: 'OP', body: { a: 'cmwnut6r60004k8zvvyx2rgp6', b: 'cmwntwpvy0004siqf50wazp2c', timezone: 'UTC' } });
  assert.match(String(toolCall('compare_scans', { scanA: '../x', scanB: 'y' })), /two scan ids/);
});
