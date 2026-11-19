/**
 * What an account's own AI agent can do through the MCP server, and how each tool turns into a
 * request the site already knows how to check and carry out.
 *
 * An agent reads everything, starts scans, and makes the everyday edits: description, hours,
 * holiday hours, services, attributes, posts and review replies. It can never change a listing's
 * name, categories, phone, website or address: those stay with a person on the site.
 */
export type Tool = { name: string; description: string; inputSchema: { type: 'object'; properties: Record<string, unknown>; required?: string[] } };
/** A request to one of the site's own handlers. */
export type Call = { route: string; method: 'GET' | 'POST' | 'PATCH' | 'DELETE'; query?: Record<string, string>; body?: Record<string, unknown> };

const str = (description: string) => ({ type: 'string', description });
const listing = {
  profile: str('The connected Google account the listing is in: `profile` from list_listings.'),
  location: str('The listing: `id` from list_listings, in the form accounts/123/locations/456.'),
};
const days = { type: 'integer', minimum: 1, maximum: 480, description: 'How many days back to look. Default 30. Figures come with the same number of days before, for comparison.' };
const tool = (name: string, description: string, properties: Record<string, unknown> = {}, required: string[] = []): Tool => ({ name, description, inputSchema: { type: 'object', properties, required } });
const L = ['profile', 'location'];

export const TOOLS: Tool[] = [
  tool('list_listings', 'The Google Business listings this account has connected, each with the plan it is on. Listing tools work on listings on the Agent plan.'),
  tool('get_listing', 'A listing as Google has it now: name, address, phone, website, categories, description, hours, and the edits made to it from here.', listing, L),
  tool('get_listing_details', 'A listing’s attributes, services and booking/order links, with what Google allows to be set for its categories.', listing, L),
  tool('get_listing_insights', 'Google’s own numbers for a listing: calls, website clicks, direction requests and views day by day, and the searches people found it with.', { ...listing, days }, L),
  tool('list_reviews', 'A listing’s Google reviews, newest first, 50 a page, each with the reply if it has one.', { ...listing, page: { type: 'integer', minimum: 1, description: 'Page number. Default 1.' } }, L),
  tool('reply_to_review', 'Answers a review publicly on Google. A review has one reply: a new one replaces the old.', { profile: listing.profile, review: str('The review’s `id` from list_reviews.'), body: str('The reply, as it will show on Google. Up to 4,000 characters.') }, ['profile', 'review', 'body']),
  tool('list_posts', 'A listing’s Google posts sent from here: scheduled ones first, then the rest, newest first.', listing, L),
  tool('create_post', 'Publishes or schedules a Google post on a listing: an update, an offer or an event.', {
    ...listing,
    body: str('The post’s text. Up to 1,500 characters.'),
    format: { type: 'string', enum: ['standard', 'offer', 'event'], description: 'Default standard (an update).' },
    title: str('Event name or offer headline. Needed for an offer or an event.'),
    startDate: str('YYYY-MM-DD. Needed for an offer or an event.'),
    endDate: str('YYYY-MM-DD. Needed for an offer or an event.'),
    startTime: str('HH:MM, 24-hour. Optional, events only.'),
    endTime: str('HH:MM, 24-hour. Optional, events only.'),
    cta: { type: 'string', enum: ['', 'BOOK', 'ORDER', 'SHOP', 'LEARN_MORE', 'SIGN_UP', 'CALL'], description: 'A button on the post. Optional.' },
    ctaUrl: str('Where the button goes (https). Needed with every button except CALL.'),
    coupon: str('Offer code. Optional, offers only.'),
    redeemUrl: str('Where the offer is redeemed (https). Optional, offers only.'),
    terms: str('Offer terms. Optional, offers only.'),
    image: str('A public https address of a JPG or PNG. Optional.'),
    scheduledAt: str('When it goes out, as an ISO time. Leave out to publish now.'),
  }, [...L, 'body']),
  tool('delete_post', 'Cancels a scheduled post, or takes a published one off the listing.', { ...listing, id: str('The post’s `id` from list_posts.'), alsoOnGoogle: { type: 'boolean', description: 'True to remove a post that is already published on Google.' } }, [...L, 'id']),
  tool('update_listing', 'Changes a listing’s description, weekly hours or holiday hours. Built on the live listing, logged, and checked on Google afterwards. Name, categories, phone, website and address cannot be changed by an agent.', {
    ...listing,
    description: str('The business description. Up to 750 characters; no links or phone numbers.'),
    regularHours: { type: 'array', description: 'All seven days, MONDAY to SUNDAY.', items: { type: 'object', properties: { day: str('MONDAY … SUNDAY'), closed: { type: 'boolean' }, allDay: { type: 'boolean', description: 'Open 24 hours.' }, open: str('HH:MM'), close: str('HH:MM') }, required: ['day', 'closed'] } },
    specialHours: { type: 'array', description: 'Every upcoming date with its own hours (the whole list: a date left out is removed).', items: { type: 'object', properties: { date: str('YYYY-MM-DD'), closed: { type: 'boolean' }, open: str('HH:MM'), close: str('HH:MM') }, required: ['date', 'closed'] } },
  }, L),
  tool('update_services', 'Sets a listing’s services. Send the whole list in order (from get_listing_details, with your changes): a service left out is removed.', {
    ...listing,
    services: { type: 'array', items: { type: 'object', properties: { key: str('The service’s `key` from get_listing_details, to keep or edit one that is there.'), typeId: str('One of Google’s suggested services for the category (`typeId`), to add it.'), name: str('The name of a service of your own.'), description: str('Up to 300 characters.') } } },
  }, [...L, 'services']),
  tool('update_attributes', 'Sets attributes on a listing (payments, accessibility, service options and the like). Only the attributes named are touched.', {
    ...listing,
    attributes: { type: 'object', description: 'Attribute id (from get_listing_details, e.g. "attributes/has_wheelchair_accessible_entrance") → true, false, null to clear, or a list of values for a multiple-choice one.' },
  }, [...L, 'attributes']),
  tool('list_changes', 'Changes found on this account’s listings that were not made from here (the watchdog), waiting for a decision.'),
  tool('search_console', 'Search Console for a listing’s website: clicks, impressions and position for a range against the range before, broken down by one thing.', {
    website: str('The website address, with https://.'),
    by: { type: 'string', enum: ['query', 'page', 'device', 'country', 'date'], description: 'What to break it down by. Default query.' },
    days, query: str('Only searches containing this.'), page: str('Only this page (address contains).'), device: { type: 'string', enum: ['desktop', 'mobile', 'tablet'] },
  }, ['website']),
  tool('analytics', 'Google Analytics for a website: visits and key events for a range against the range before, broken down by one thing.', {
    property: str('The Analytics property, in the form properties/123456. website_properties lists them.'),
    by: { type: 'string', enum: ['landingPagePlusQueryString', 'sessionSourceMedium', 'deviceCategory', 'date'], description: 'Default landingPagePlusQueryString.' },
    days, page: str('Only this page (address contains).'), device: { type: 'string', enum: ['desktop', 'mobile', 'tablet'] }, came: { type: 'string', enum: ['listing', 'google', 'ai'], description: 'Only visits from the Google listing, from Google search, or from AI assistants.' },
  }, ['property']),
  tool('website_properties', 'Which Search Console property and Analytics properties the connected Google login has for a website.', { website: str('The website address, with https://.') }, ['website']),
  tool('list_scans', 'This account’s rank scans, newest first: keyword, business, status and share of local voice.'),
  tool('get_scan', 'One scan: where the business ranked at each point of the grid, and who ranked above it.', { scanId: str('The scan’s `id` from list_scans.') }, ['scanId']),
  tool('start_scan', 'Starts a rank scan: a grid of points around a place, each searched on a real phone. Costs one credit per point (25 for a 5×5).', {
    keyword: str('The search to track, e.g. "plumber near me".'),
    business: str('The business name exactly as on Google.'),
    lat: { type: 'number', description: 'Centre of the grid.' },
    lng: { type: 'number', description: 'Centre of the grid.' },
    gridSize: { type: 'integer', enum: [3, 5, 7, 9, 11], description: 'Points per side. Default 5.' },
    spacingMiles: { type: 'number', enum: [0.5, 1, 2, 5], description: 'Distance between points. Default 1.' },
    trackAiOverviews: { type: 'boolean', description: 'Also record Google’s AI answer at each point. Default false.' },
  }, ['keyword', 'business', 'lat', 'lng']),
];

/** Tools that change something: an agent's client can ask the person before running them. */
export const WRITES = new Set(['reply_to_review', 'create_post', 'delete_post', 'update_listing', 'update_services', 'update_attributes', 'start_scan']);

const KM: Record<string, number> = { '0.5': 0.80467, '1': 1.60934, '2': 3.21868, '5': 8.04672 };
const s = (v: unknown) => (typeof v === 'string' ? v : '');
const where = (a: Record<string, unknown>) => ({ profile: s(a.profile), location: s(a.location) });
const daysOf = (a: Record<string, unknown>) => (Number.isFinite(Number(a.days)) && Number(a.days) >= 1 ? String(Math.round(Number(a.days))) : '30');

/**
 * The request a tool call becomes, or a sentence saying what is wrong with it. Only the fields a
 * tool names are passed on, so a call can never reach an edit the tool does not offer (a name, a
 * category, a phone number, a website).
 */
export function toolCall(name: string, a: Record<string, unknown>): Call | string {
  switch (name) {
    case 'list_listings': return { route: 'listings', method: 'GET' };
    case 'get_listing': return { route: 'location', method: 'GET', query: where(a) };
    case 'get_listing_details': return { route: 'extras', method: 'GET', query: where(a) };
    case 'get_listing_insights': return { route: 'insights', method: 'GET', query: { ...where(a), days: daysOf(a) } };
    case 'list_reviews': return { route: 'reviews', method: 'GET', query: { ...where(a), page: String(Math.max(1, Math.round(Number(a.page)) || 1)) } };
    case 'reply_to_review': return { route: 'reviews', method: 'POST', body: { profile: s(a.profile), review: s(a.review), body: s(a.body) } };
    case 'list_posts': return { route: 'posts', method: 'GET', query: where(a) };
    case 'create_post': {
      const draft: Record<string, string> = {};
      for (const k of ['format', 'body', 'cta', 'ctaUrl', 'title', 'startDate', 'endDate', 'startTime', 'endTime', 'coupon', 'redeemUrl', 'terms', 'image', 'scheduledAt']) if (typeof a[k] === 'string') draft[k] = a[k] as string;
      if (draft.image && !/^https:\/\//.test(draft.image)) return 'The image must be a public https address.';
      return { route: 'posts', method: 'POST', body: { ...where(a), draft } };
    }
    case 'delete_post': return { route: 'posts', method: 'DELETE', query: { ...where(a), id: s(a.id), ...(a.alsoOnGoogle === true ? { google: '1' } : {}) } };
    case 'update_listing': {
      const change: Record<string, unknown> = {};
      if (typeof a.description === 'string') change.description = a.description;
      if (Array.isArray(a.regularHours)) change.regularHours = a.regularHours.map((d) => { const x = (d ?? {}) as Record<string, unknown>; return { day: s(x.day), closed: x.closed === true, allDay: x.allDay === true, open: s(x.open), close: s(x.close) }; });
      if (Array.isArray(a.specialHours)) change.specialHours = a.specialHours.map((d) => { const x = (d ?? {}) as Record<string, unknown>; return { date: s(x.date), closed: x.closed === true, open: s(x.open), close: s(x.close) }; });
      const refused = ['title', 'name', 'primaryCategory', 'additionalCategories', 'categories', 'primaryPhone', 'phone', 'additionalPhones', 'websiteUri', 'website', 'address'].filter((k) => k in a);
      if (refused.length) return 'An agent cannot change a listing’s ' + refused.join(', ') + '. A person does that on the site.';
      if (!Object.keys(change).length) return 'Give a description, regularHours or specialHours to change.';
      return { route: 'update', method: 'POST', body: { ...where(a), change } };
    }
    case 'update_services':
      if (!Array.isArray(a.services)) return 'Give the whole list of services.';
      return { route: 'extras', method: 'POST', body: { ...where(a), kind: 'services', want: a.services } };
    case 'update_attributes':
      if (!a.attributes || typeof a.attributes !== 'object' || Array.isArray(a.attributes)) return 'Give the attributes to set, by id.';
      return { route: 'extras', method: 'POST', body: { ...where(a), kind: 'attributes', want: a.attributes } };
    case 'list_changes': return { route: 'watch', method: 'GET' };
    case 'search_console': return { route: 'explore', method: 'POST', body: { source: 'gsc', website: s(a.website), by: s(a.by) || 'query', days: Number(daysOf(a)), query: s(a.query) || undefined, page: s(a.page) || undefined, device: s(a.device) || undefined } };
    case 'analytics': return { route: 'explore', method: 'POST', body: { source: 'ga', property: s(a.property), by: s(a.by) || undefined, days: Number(daysOf(a)), page: s(a.page) || undefined, device: s(a.device) || undefined, came: s(a.came) || undefined } };
    case 'website_properties': return { route: 'site', method: 'GET', query: { website: s(a.website) } };
    case 'list_scans': return { route: 'scans', method: 'GET' };
    case 'get_scan': return /^[a-z0-9]{10,40}$/.test(s(a.scanId)) ? { route: 'scan', method: 'GET', query: { scanId: s(a.scanId) } } : 'Unknown scan.';
    case 'start_scan': {
      const spacingKm = KM[String(a.spacingMiles ?? 1)];
      if (!spacingKm) return 'spacingMiles must be 0.5, 1, 2 or 5.';
      return { route: 'scan-create', method: 'POST', body: { keyword: s(a.keyword), targetBusiness: s(a.business), centerLat: a.lat, centerLng: a.lng, gridSize: typeof a.gridSize === 'number' ? a.gridSize : 5, spacingKm, trackAiOverviews: a.trackAiOverviews === true, targetType: 'mobile_chrome' } };
    }
    default: return 'Unknown tool.';
  }
}

/* ───────────── JSON-RPC, as MCP speaks it ───────────── */

export const MCP_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
export type Rpc = { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: unknown };
export const rpcResult = (id: unknown, result: unknown) => ({ jsonrpc: '2.0', id, result });
export const rpcError = (id: unknown, code: number, message: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

/** The answer to everything except a tool call, or null when the message needs none (a notification) or is a tool call. */
export function rpcAnswer(m: Rpc): object | null | 'call' {
  if (m.jsonrpc !== '2.0' || typeof m.method !== 'string') return rpcError(m.id, -32600, 'Not a JSON-RPC 2.0 request.');
  // A notification carries no id and gets no answer.
  if (m.id === undefined) return null;
  const p = (m.params && typeof m.params === 'object' ? m.params : {}) as Record<string, unknown>;
  switch (m.method) {
    case 'initialize':
      return rpcResult(m.id, {
        protocolVersion: MCP_VERSIONS.includes(String(p.protocolVersion)) ? p.protocolVersion : MCP_VERSIONS[0],
        capabilities: { tools: {} },
        serverInfo: { name: 'stakeout-search', title: 'Stakeout Search', version: '1.0.0' },
        instructions: 'Local rank scans and Google Business Profile management. Start with list_listings or list_scans. Listing tools need the listing to be on the Agent plan. Name, categories, phone, website and address are never editable here.',
      });
    case 'ping': return rpcResult(m.id, {});
    case 'tools/list':
      return rpcResult(m.id, { tools: TOOLS.map((t) => ({ ...t, annotations: { readOnlyHint: !WRITES.has(t.name), destructiveHint: t.name === 'delete_post', openWorldHint: true } })) });
    case 'tools/call': return 'call';
    case 'resources/list': return rpcResult(m.id, { resources: [] });
    case 'prompts/list': return rpcResult(m.id, { prompts: [] });
    default: return rpcError(m.id, -32601, 'Method not found: ' + m.method);
  }
}
