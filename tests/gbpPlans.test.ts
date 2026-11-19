import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allows, dollars, monthlyCents, planNow, quantityPlan, stripeTiers, unitCents, settlePending, tierNudge } from '../packages/core/gbpPlans';

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

test('free reads, Manage changes, a paid listing lets an agent in', () => {
  assert.equal(allows(null, 'free'), true);
  assert.equal(allows(null, 'manage'), false);
  assert.equal(allows('MANAGE', 'manage'), true);
  assert.equal(allows('MANAGE', 'agent'), true);
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
