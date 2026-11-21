/**
 * What an account's own AI agent can do through the MCP server, and how each tool turns into a
 * request the site already knows how to check and carry out.
 *
 * An agent reads everything, starts scans, and makes the everyday edits: description, hours,
 * holiday hours, services, attributes, photos, booking links, posts and review replies. It can
 * never change a listing's name, categories, phone, website or address: those stay with a person
 * on the site. Three more things keep it from doing harm by accident: services are patched, never
 * sent as a whole list; a reply to a low-rated review waits as a draft for a person; and scans
 * count against a monthly point limit the account sets.
 */
import { withUtm } from './gbpExtras';
export type Tool = { name: string; description: string; inputSchema: { type: 'object'; properties: Record<string, unknown>; required?: string[] } };
/** A request to one of the site's own handlers. */
export type Call = { route: string; method: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'OP'; query?: Record<string, string>; body?: Record<string, unknown> };

const str = (description: string) => ({ type: 'string', description });
const listing = {
  profile: str('The connected Google account the listing is in: `profile` from list_listings.'),
  location: str('The listing: `id` from list_listings, in the form accounts/123/locations/456.'),
};
const days = { type: 'integer', minimum: 1, maximum: 480, description: 'How many days back to look. Default 30. Figures come with the same number of days before, for comparison.' };
const tool = (name: string, description: string, properties: Record<string, unknown> = {}, required: string[] = []): Tool => ({ name, description, inputSchema: { type: 'object', properties, required } });
const L = ['profile', 'location'];

const week = (what: string) => ({ type: 'array', description: what + ' All seven days, MONDAY to SUNDAY.', items: { type: 'object', properties: { day: str('MONDAY … SUNDAY'), closed: { type: 'boolean' }, allDay: { type: 'boolean', description: 'Open 24 hours.' }, open: str('HH:MM'), close: str('HH:MM') }, required: ['day', 'closed'] } });
const postFields = {
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
};
const GSC_BY = ['query', 'page', 'device', 'country', 'date'];
const GA_BY = ['landingPagePlusQueryString', 'sessionSourceMedium', 'sessionDefaultChannelGroup', 'sessionCampaignName', 'deviceCategory', 'city', 'date'];
const MEDIA = ['COVER', 'LOGO', 'EXTERIOR', 'INTERIOR', 'PRODUCT', 'AT_WORK', 'TEAMS', 'ADDITIONAL'];
const LINK_TYPES = ['APPOINTMENT', 'ONLINE_APPOINTMENT', 'DINING_RESERVATION', 'FOOD_ORDERING', 'FOOD_DELIVERY', 'FOOD_TAKEOUT', 'SHOP_ONLINE'];
/** The grid an agent's scan gets when it names none, and the sizes it may ask for by name. */
export const AGENT_GRID = 5;
export const AGENT_GRIDS = [3, 5, 7, 9, 11];

export const TOOLS: Tool[] = [
  tool('get_workspace_briefing', 'Start here. One short read of what needs attention across the account: changes to listings nobody here made, reviews without a reply (and agent drafts waiting for a person), posts scheduled or failed, the latest scans against the ones before, and the scan points agents have left this month.'),
  tool('list_listings', 'The Google Business listings this account has connected, each with the plan it is on. Listing tools work on listings on a Command or Dominator seat.'),
  tool('get_listing', 'A listing as Google has it now: name, address, phone, website, categories, description, hours, and the edits made to it from here.', listing, L),
  tool('get_listing_details', 'A listing’s attributes, services and booking/order links, with what Google allows to be set for its categories.', listing, L),
  tool('get_listing_insights', 'Google’s own numbers for a listing: calls, website clicks, direction requests and views day by day, and the searches people found it with.', { ...listing, days }, L),
  tool('list_reviews', 'A listing’s Google reviews, newest first, 50 a page. Each has its reply if there is one, with Google’s own check of that reply (`moderation`: pending, approved or rejected, and `policyReason` when rejected), `replyRemoved` when a reply was taken down on Google, and `agentDraft` when an agent’s reply is waiting for a person. Reviews removed from Google are not listed.', { ...listing, page: { type: 'integer', minimum: 1, description: 'Page number. Default 1.' } }, L),
  tool('reply_to_review', 'Answers a review publicly on Google. A review has one reply: a new one replaces the old. For a review of 4 or 5 stars the reply is sent. For 3 stars or fewer (or no rating) it is NOT sent: it is saved as a draft that a person reads and sends from the review inbox, and the answer says so (`sent: false`).', { profile: listing.profile, review: str('The review’s `id` from list_reviews.'), body: str('The reply, as it will show on Google. Up to 4,000 characters.') }, ['profile', 'review', 'body']),
  tool('list_posts', 'A listing’s Google posts sent from here: scheduled ones first, then the rest, newest first.', listing, L),
  tool('create_post', 'Publishes or schedules a Google post on a listing: an update, an offer or an event.', { ...listing, ...postFields, scheduledAt: str('When it goes out, as an ISO time. Leave out to publish now.') }, [...L, 'body']),
  tool('update_post', 'Edits a post that has not gone out yet (scheduled more than five minutes from now). Send only what changes. A published post cannot be edited: remove it and post again.', {
    ...listing, id: str('The post’s `id` from list_posts.'), body: postFields.body, image: str('A public https address of a JPG or PNG; an empty string removes the image.'), scheduledAt: str('The new time, as an ISO time, at least ten minutes from now.'),
    cta: postFields.cta, ctaUrl: postFields.ctaUrl, title: postFields.title, startDate: postFields.startDate, endDate: postFields.endDate,
  }, [...L, 'id']),
  tool('delete_post', 'Cancels a scheduled post, or takes a published one off the listing.', { ...listing, id: str('The post’s `id` from list_posts.'), alsoOnGoogle: { type: 'boolean', description: 'True to remove a post that is already published on Google.' } }, [...L, 'id']),
  tool('get_post_stats', 'The state of up to ten of a listing’s posts and whatever was recorded for them. Google reports no views or clicks for a single post, so use get_listing_insights for the days after a post to see what it did.', { ...listing, ids: { type: 'array', items: { type: 'string' }, description: 'Post ids from list_posts. Up to ten.' } }, [...L, 'ids']),
  tool('list_queues', 'The posting queues of the Google account a listing is in: weekly time slots that queued posts fall into one after another, with how many posts are waiting and when the next would go out.', listing, L),
  tool('create_queue', 'Makes a posting queue of weekly time slots. Posts are moved a few minutes either way of each slot so the listing does not post at the same minute every week.', {
    ...listing, name: str('A name for the queue, e.g. "Weekly updates".'), timezone: str('The business’s time zone by name, e.g. America/New_York.'),
    timeslots: { type: 'array', description: '1 to 21 weekly slots.', items: { type: 'object', properties: { day: { type: 'integer', minimum: 0, maximum: 6, description: '0 Sunday … 6 Saturday.' }, time: str('HH:MM, 24-hour, in the queue’s time zone.') }, required: ['day', 'time'] } },
    jitter: { type: 'integer', minimum: 0, maximum: 60, description: 'Minutes a post may move either way of its slot. Default 15.' },
  }, [...L, 'name', 'timezone', 'timeslots']),
  tool('enqueue_post', 'Adds a Google post to a queue, which gives it the next open slot. Takes what create_post takes, without a time.', { ...listing, queue: str('The queue’s `id` from list_queues.'), priority: { type: 'string', enum: ['high', 'medium', 'low'], description: 'Higher goes out sooner. Default medium.' }, ...postFields }, [...L, 'queue', 'body']),
  tool('update_listing', 'Changes a listing’s description, weekly hours, holiday hours, named hour sets (delivery, pickup, online service and the like) or opening date. Built on the live listing, logged, and checked on Google afterwards. Name, categories, phone, website and address cannot be changed by an agent.', {
    ...listing,
    description: str('The business description. Up to 750 characters; no links or phone numbers.'),
    regularHours: week('The main opening hours.'),
    specialHours: { type: 'array', description: 'Every upcoming date with its own hours (the whole list: a date left out is removed).', items: { type: 'object', properties: { date: str('YYYY-MM-DD'), closed: { type: 'boolean' }, open: str('HH:MM'), close: str('HH:MM') }, required: ['date', 'closed'] } },
    moreHours: { type: 'array', description: 'Named hour sets. Only the sets named are touched; the listing’s other sets stay. A set with every day closed is removed.', items: { type: 'object', properties: { type: str('Google’s id for the set, e.g. DELIVERY, PICKUP, ONLINE_SERVICE_HOURS. search_gbp_categories lists the ones a category offers.'), days: week('The hours of this set.') }, required: ['type', 'days'] } },
    openingDate: str('YYYY-MM-DD: the day the business first opened.'),
  }, L),
  tool('upsert_services', 'Adds services to a listing, or changes the description of ones it has. Every service not named here stays exactly as it is. Name a service by its `key` (from get_listing_details), by one of Google’s suggested `typeId`s, or by its name.', {
    ...listing,
    services: { type: 'array', items: { type: 'object', properties: { key: str('The `key` of a service the listing has.'), typeId: str('One of Google’s suggested services for the category, to add it.'), name: str('The name of a service the listing has, or of a new one of your own.'), description: str('Up to 300 characters.') } } },
  }, [...L, 'services']),
  tool('remove_services', 'Removes the named services from a listing. Every other service stays. A name that matches nothing is refused, with the list the listing has.', { ...listing, services: { type: 'array', items: { type: 'string' }, description: 'Each one a service’s `key`, `typeId` or name.' } }, [...L, 'services']),
  tool('update_attributes', 'Sets attributes on a listing (payments, accessibility, service options and the like). Only the attributes named are touched.', {
    ...listing,
    attributes: { type: 'object', description: 'Attribute id (from get_listing_details, e.g. "attributes/has_wheelchair_accessible_entrance") → true, false, null to clear, or a list of values for a multiple-choice one.' },
  }, [...L, 'attributes']),
  tool('manage_action_links', 'Adds, changes or removes a button on a listing (book, order, shop). A link is tagged so Analytics can tell a click on the button from other visits, and is made the preferred one for its kind, unless told otherwise.', {
    ...listing,
    action: { type: 'string', enum: ['add', 'update', 'delete'] },
    type: { type: 'string', enum: LINK_TYPES, description: 'What the button does. Needed to add one; get_listing_details lists the kinds this listing may have.' },
    uri: str('Where the button goes (https). Needed to add or update.'),
    name: str('The link’s `name` from get_listing_details. Needed to update or delete.'),
    preferred: { type: 'boolean', description: 'Make it the preferred link for its kind. Default true.' },
    tag: { type: 'boolean', description: 'Add the tracking tags (utm_source=google, utm_medium=organic, utm_campaign=gbp_listing). Default true; tags already on the link are kept.' },
  }, [...L, 'action']),
  tool('list_media', 'A listing’s photos and videos (the first 100), each with the `name` it is removed by and the category it is filed under.', listing, L),
  tool('add_media', 'Adds a photo or video to a listing. Google downloads it itself from a public https address. A COVER or LOGO replaces the one the listing has.', {
    ...listing, url: str('A public https address of the file (not a signed or expiring link).'),
    category: { type: 'string', enum: MEDIA, description: 'Where it is filed. TEAMS is the team; AT_WORK is the business at work. Default ADDITIONAL.' },
    format: { type: 'string', enum: ['PHOTO', 'VIDEO'], description: 'Default PHOTO.' }, description: str('Optional, up to 2,000 characters.'),
  }, [...L, 'url']),
  tool('delete_media', 'Removes one photo or video from a listing for good.', { ...listing, name: str('The item’s `name` from list_media.') }, [...L, 'name']),
  tool('search_gbp_categories', 'Google’s business categories whose name contains some words, for the listing’s country, each with the services and named hour sets Google offers for it. Read-only: use it to recommend a category to the person, who makes that change on the site.', { ...listing, q: str('Part of a category name, e.g. "pressure washing". At least two letters.') }, [...L, 'q']),
  tool('list_changes', 'Changes found on this account’s listings that were not made from here (the watchdog), waiting for a decision. Each has an `id` for resolve_change.'),
  tool('resolve_change', 'Decides one change from list_changes. "accept" keeps what Google shows now; "revert" puts the listing back as it was. Done at once for a description, opening hours or holiday hours. For anything else (name, category, phone, website, address, open or closed) nothing is changed: the answer says a person has to decide it on the site (`staged: true`).', { change_id: str('The change’s `id` from list_changes.'), action: { type: 'string', enum: ['accept', 'revert'] } }, ['change_id', 'action']),
  tool('search_console', 'Search Console for a website: clicks, impressions and position for a range against the range before, broken down by one thing or by two at once (searches by page, pages by device).', {
    website: str('The website address, with https://.'),
    by: { type: 'string', enum: GSC_BY, description: 'What to break it down by. Default query.' },
    by2: { type: 'string', enum: GSC_BY, description: 'A second breakdown. Each row then has `key` and `key2`.' },
    days, query: str('Only searches containing this.'), page: str('Only this page (a full address, or part of one).'), device: { type: 'string', enum: ['desktop', 'mobile', 'tablet'] },
  }, ['website']),
  tool('analytics', 'Google Analytics for a website: visits, engaged visits and key events for a range against the range before, broken down by one thing or by two at once (landing pages by campaign).', {
    property: str('The Analytics property, in the form properties/123456. website_properties lists them.'),
    by: { type: 'string', enum: GA_BY, description: 'Default landingPagePlusQueryString. sessionCampaignName is the utm_campaign.' },
    by2: { type: 'string', enum: GA_BY, description: 'A second breakdown. Each row then has `key` and `key2`.' },
    days, page: str('Only this landing page (address contains).'), device: { type: 'string', enum: ['desktop', 'mobile', 'tablet'] },
    utm_campaign: str('Only visits tagged with exactly this campaign, e.g. gbp_listing.'),
    came: { type: 'string', enum: ['listing', 'google', 'ai'], description: 'Only visits from the Google listing, from Google search, or from AI assistants.' },
  }, ['property']),
  tool('inspect_url', 'What Google’s own index says about one page: indexed or not and why, the address Google filed it under, when it last fetched it, and the rich results it found. The answer is kept for 24 hours.', { url: str('The page’s full address, with https://. Its website has to be in the connected Search Console.') }, ['url']),
  tool('website_properties', 'Which Search Console property and Analytics properties the connected Google login has for a website.', { website: str('The website address, with https://.') }, ['website']),
  tool('list_scans', 'This account’s rank scans, newest first: keyword, business, grid, status, share of local voice, and whether it repeats.'),
  tool('compare_scans', 'Two scans of the same grid, point by point: the rank before and after at each point, how many points got better or worse, the change in top-three placements and average rank, which other businesses gained or lost top-three places, and what makes the comparison less than fair (a different hour of the day, a different search). Scans of different grids are refused.', { scanA: str('A scan’s `id` from list_scans.'), scanB: str('Another scan’s `id`. The earlier of the two is taken as “before”.'), timezone: str('The time zone to show the scans’ times in, e.g. America/New_York. Default UTC.') }, ['scanA', 'scanB']),
  tool('set_scan_schedule', 'Pauses or resumes a repeating scan. A paused scan runs no more and charges nothing until it is resumed.', { scanId: str('The repeating scan’s `id` from list_scans.'), action: { type: 'string', enum: ['pause', 'resume'] } }, ['scanId', 'action']),
  tool('get_scan', 'One scan: where the business ranked at each point of the grid; the other businesses seen most often among the first three results (`inTopThreeAtPoints`: a business is counted wherever it is in the first three, whether or not it is above the scanned business there), the first three of them with their categories, rating and review count where known; and how often Google gave an AI answer, how often it cited the business or its website, and the sites it cited most. A scan run in the Google Maps app has no AI answers to record, and says so.', { scanId: str('The scan’s `id` from list_scans.') }, ['scanId']),
  tool('start_scan', 'Starts a rank scan: a grid of points around a place, each searched in Google on a real phone. Google’s AI Overview is recorded at every point, at no extra cost. It runs right away (Scan Now) at 2 points a grid point: 50 for the default 5×5. A larger grid is only run when gridSize is given, and every scan counts against the monthly point limit the account sets for its agents. It can be made to repeat every day or week at a set time of day; a repeating scan is refused when a month of its runs would cost more than that limit.', {
    keyword: str('The search to track, e.g. "plumber near me".'),
    business: str('The business name exactly as on Google.'),
    lat: { type: 'number', description: 'Centre of the grid.' },
    lng: { type: 'number', description: 'Centre of the grid.' },
    gridSize: { type: 'integer', enum: AGENT_GRIDS, description: 'Points per side. Default 5: 25 grid points, 50 points to run now. 7 is 49 grid points, 9 is 81, 11 is 121.' },
    spacingMiles: { type: 'number', enum: [0.5, 1, 2, 3, 5], description: 'Distance between points. Default 1.' },
    repeat: { type: 'string', enum: ['once', 'daily', 'weekly'], description: 'Default once. A repeating scan runs now and then again on its schedule, charging points each time (each scheduled run 1 a grid point), until it is paused or the account runs out of points.' },
    at: str('For a repeating scan: the time of day to run it, HH:MM in 24-hour time, e.g. 07:30. Scans compared over time should run at the same hour, since Google ranks a business higher while it is shown as open. Left out, it runs at 13:00 UTC.'),
    timezone: str('The time zone `at` is in, by name, e.g. America/New_York. Needed with `at`.'),
    weekday: { type: 'integer', minimum: 0, maximum: 6, description: 'For a weekly scan: the day, 0 Sunday to 6 Saturday. Default 1 (Monday).' },
    website: str('The business’s own website, e.g. stuartsplumbing.com, so the report can tell when an AI answer cites it. Left out, it is taken from the account’s earlier scans of the business or its listing, when one is known.'),
  }, ['keyword', 'business', 'lat', 'lng']),
];

/** Tools that change something or spend points: an agent's client asks the person before running them. */
export const WRITES = new Set(['reply_to_review', 'create_post', 'update_post', 'enqueue_post', 'create_queue', 'delete_post', 'update_listing', 'upsert_services', 'remove_services', 'update_attributes', 'manage_action_links', 'add_media', 'delete_media', 'resolve_change', 'start_scan', 'set_scan_schedule']);
/** What a client is told about a tool, so it can ask before a change and run a read straight away. */
export const annotationsOf = (name: string) => (WRITES.has(name) ? { readOnlyHint: false, destructiveHint: true, openWorldHint: true } : { readOnlyHint: true, destructiveHint: false, openWorldHint: true });

const KM: Record<string, number> = { '0.5': 0.80467, '1': 1.60934, '2': 3.21868, '3': 4.82802, '5': 8.04672 };
const s = (v: unknown) => (typeof v === 'string' ? v : '');
const where = (a: Record<string, unknown>) => ({ profile: s(a.profile), location: s(a.location) });
const daysOf = (a: Record<string, unknown>) => (Number.isFinite(Number(a.days)) && Number(a.days) >= 1 ? String(Math.round(Number(a.days))) : '30');
const dayOf = (d: unknown) => { const x = (d ?? {}) as Record<string, unknown>; return { day: s(x.day), closed: x.closed === true, allDay: x.allDay === true, open: s(x.open), close: s(x.close) }; };
const POST_KEYS = ['format', 'body', 'cta', 'ctaUrl', 'title', 'startDate', 'endDate', 'startTime', 'endTime', 'coupon', 'redeemUrl', 'terms', 'image'];
function draftOf(a: Record<string, unknown>, keys: string[]): Record<string, string> | string {
  const draft: Record<string, string> = {};
  for (const k of keys) if (typeof a[k] === 'string') draft[k] = a[k] as string;
  if (draft.image && !/^https:\/\//.test(draft.image)) return 'The image must be a public https address.';
  return draft;
}

/**
 * The request a tool call becomes, or a sentence saying what is wrong with it. Only the fields a
 * tool names are passed on, so a call can never reach an edit the tool does not offer (a name, a
 * category, a phone number, a website).
 */
export function toolCall(name: string, a: Record<string, unknown>): Call | string {
  switch (name) {
    case 'get_workspace_briefing': return { route: 'briefing', method: 'OP' };
    case 'list_listings': return { route: 'listings', method: 'GET' };
    case 'get_listing': return { route: 'location', method: 'GET', query: where(a) };
    case 'get_listing_details': return { route: 'extras', method: 'GET', query: where(a) };
    case 'get_listing_insights': return { route: 'insights', method: 'GET', query: { ...where(a), days: daysOf(a) } };
    case 'list_reviews': return { route: 'reviews', method: 'GET', query: { ...where(a), page: String(Math.max(1, Math.round(Number(a.page)) || 1)) } };
    case 'reply_to_review': return { route: 'reviews', method: 'POST', body: { profile: s(a.profile), review: s(a.review), body: s(a.body) } };
    case 'list_posts': return { route: 'posts', method: 'GET', query: where(a) };
    case 'create_post': {
      const draft = draftOf(a, [...POST_KEYS, 'scheduledAt']);
      return typeof draft === 'string' ? draft : { route: 'posts', method: 'POST', body: { ...where(a), draft } };
    }
    case 'enqueue_post': {
      if (!s(a.queue)) return 'Name the queue: its `id` from list_queues.';
      if (a.scheduledAt !== undefined) return 'A queued post takes the queue’s next slot: leave scheduledAt out, or use create_post to set a time.';
      const draft = draftOf(a, POST_KEYS);
      return typeof draft === 'string' ? draft : { route: 'posts', method: 'POST', body: { ...where(a), draft, queue: s(a.queue), priority: s(a.priority) || 'medium' } };
    }
    case 'update_post': {
      const change = draftOf(a, ['body', 'image', 'scheduledAt', 'cta', 'ctaUrl', 'title', 'startDate', 'endDate']);
      return typeof change === 'string' ? change : { route: 'posts', method: 'PATCH', body: { ...where(a), id: s(a.id), change } };
    }
    case 'delete_post': return { route: 'posts', method: 'DELETE', query: { ...where(a), id: s(a.id), ...(a.alsoOnGoogle === true ? { google: '1' } : {}) } };
    case 'get_post_stats': {
      const ids = (Array.isArray(a.ids) ? a.ids : []).filter((x): x is string => typeof x === 'string' && /^[A-Za-z0-9_-]{3,80}$/.test(x)).slice(0, 10);
      return ids.length ? { route: 'posts', method: 'GET', query: { ...where(a), stats: ids.join(',') } } : 'Give the ids of up to ten posts, from list_posts.';
    }
    case 'list_queues': return { route: 'queues', method: 'GET', query: where(a) };
    case 'create_queue': return { route: 'queues', method: 'POST', body: { ...where(a), name: s(a.name), timezone: s(a.timezone), timeslots: Array.isArray(a.timeslots) ? a.timeslots : [], ...(typeof a.jitter === 'number' ? { jitter: a.jitter } : {}) } };
    case 'update_listing': {
      const change: Record<string, unknown> = {};
      if (typeof a.description === 'string') change.description = a.description;
      if (Array.isArray(a.regularHours)) change.regularHours = a.regularHours.map(dayOf);
      if (Array.isArray(a.specialHours)) change.specialHours = a.specialHours.map((d) => { const x = (d ?? {}) as Record<string, unknown>; return { date: s(x.date), closed: x.closed === true, open: s(x.open), close: s(x.close) }; });
      if (Array.isArray(a.moreHours)) change.moreHours = a.moreHours.map((m) => { const x = (m ?? {}) as Record<string, unknown>; return { type: s(x.type).trim().toUpperCase(), days: (Array.isArray(x.days) ? x.days : []).map(dayOf) }; });
      if (typeof a.openingDate === 'string') change.openingDate = a.openingDate;
      const refused = ['title', 'name', 'primaryCategory', 'additionalCategories', 'categories', 'primaryPhone', 'phone', 'additionalPhones', 'websiteUri', 'website', 'address'].filter((k) => k in a);
      if (refused.length) return 'An agent cannot change a listing’s ' + refused.join(', ') + '. A person does that on the site.';
      if (!Object.keys(change).length) return 'Give a description, regularHours, specialHours, moreHours or openingDate to change.';
      return { route: 'update', method: 'POST', body: { ...where(a), change } };
    }
    case 'update_services': return 'update_services has been replaced, so that a service left out of a list is never removed by accident. Use upsert_services to add or change services, and remove_services to remove them.';
    case 'upsert_services': {
      const list = (Array.isArray(a.services) ? a.services : []).map((x) => (x && typeof x === 'object' ? x : {}) as Record<string, unknown>).map((x) => ({ key: s(x.key) || undefined, typeId: s(x.typeId) || undefined, name: s(x.name) || undefined, ...(typeof x.description === 'string' ? { description: x.description } : {}) }));
      if (!list.length || list.some((x) => !x.key && !x.typeId && !x.name)) return 'Name each service by its key, a typeId, or a name.';
      return { route: 'extras', method: 'POST', body: { ...where(a), kind: 'services-patch', upsert: list, remove: [] } };
    }
    case 'remove_services': {
      const list = (Array.isArray(a.services) ? a.services : []).filter((x): x is string => typeof x === 'string' && Boolean(x.trim()));
      return list.length ? { route: 'extras', method: 'POST', body: { ...where(a), kind: 'services-patch', upsert: [], remove: list } } : 'Name the services to remove.';
    }
    case 'update_attributes':
      if (!a.attributes || typeof a.attributes !== 'object' || Array.isArray(a.attributes)) return 'Give the attributes to set, by id.';
      return { route: 'extras', method: 'POST', body: { ...where(a), kind: 'attributes', want: a.attributes } };
    case 'manage_action_links': {
      const uri = a.tag === false ? s(a.uri).trim() : withUtm(s(a.uri), s(a.type));
      const preferred = a.preferred !== false;
      if (a.action === 'add') return s(a.uri) && s(a.type) ? { route: 'extras', method: 'POST', body: { ...where(a), kind: 'link-add', uri, type: s(a.type), preferred } } : 'To add a button give its type and its uri.';
      if (a.action === 'update') return s(a.uri) && s(a.name) ? { route: 'extras', method: 'POST', body: { ...where(a), kind: 'link-update', name: s(a.name), uri, preferred } } : 'To change a button give its name (from get_listing_details) and its new uri.';
      if (a.action === 'delete') return s(a.name) ? { route: 'extras', method: 'POST', body: { ...where(a), kind: 'link-delete', name: s(a.name) } } : 'To remove a button give its name (from get_listing_details).';
      return 'action must be add, update or delete.';
    }
    case 'list_media': return { route: 'media', method: 'GET', query: { ...where(a), all: '1' } };
    case 'add_media': {
      const category = s(a.category).toUpperCase() === 'TEAM' ? 'TEAMS' : s(a.category).toUpperCase() || 'ADDITIONAL';
      if (!MEDIA.includes(category)) return 'category must be one of ' + MEDIA.join(', ') + '.';
      return { route: 'media', method: 'POST', body: { ...where(a), url: s(a.url), category, format: s(a.format).toUpperCase() === 'VIDEO' ? 'VIDEO' : 'PHOTO', ...(s(a.description) ? { description: s(a.description) } : {}) } };
    }
    case 'delete_media': return { route: 'media', method: 'DELETE', query: { ...where(a), name: s(a.name) } };
    case 'search_gbp_categories': return { route: 'categories', method: 'GET', query: { ...where(a), q: s(a.q), full: '1' } };
    case 'list_changes': return { route: 'watch', method: 'GET' };
    case 'resolve_change':
      if (a.action !== 'accept' && a.action !== 'revert') return 'action must be accept or revert.';
      return s(a.change_id) ? { route: 'resolve', method: 'OP', body: { id: s(a.change_id), action: a.action } } : 'Give the change’s id from list_changes.';
    case 'search_console': return { route: 'explore', method: 'POST', body: { source: 'gsc', website: s(a.website), by: s(a.by) || 'query', by2: s(a.by2) || undefined, days: Number(daysOf(a)), query: s(a.query) || undefined, page: s(a.page) || undefined, device: s(a.device) || undefined } };
    case 'analytics': return { route: 'explore', method: 'POST', body: { source: 'ga', property: s(a.property), by: s(a.by) || undefined, by2: s(a.by2) || undefined, days: Number(daysOf(a)), page: s(a.page) || undefined, device: s(a.device) || undefined, came: s(a.came) || undefined, campaign: s(a.utm_campaign) || undefined } };
    case 'inspect_url': return /^https?:\/\/\S+$/.test(s(a.url)) ? { route: 'overview', method: 'POST', body: { source: 'inspect', website: s(a.url) } } : 'Give the page’s full address, with https://.';
    case 'website_properties': return { route: 'site', method: 'GET', query: { website: s(a.website) } };
    case 'list_scans': return { route: 'scans', method: 'GET' };
    case 'compare_scans': {
      const ok = (v: unknown) => /^[a-z0-9]{10,40}$/.test(s(v));
      if (!ok(a.scanA) || !ok(a.scanB)) return 'Give two scan ids from list_scans.';
      return { route: 'compare', method: 'OP', body: { a: s(a.scanA), b: s(a.scanB), timezone: s(a.timezone) || 'UTC' } };
    }
    case 'set_scan_schedule':
      if (a.action !== 'pause' && a.action !== 'resume') return 'action must be pause or resume.';
      return /^[a-z0-9]{10,40}$/.test(s(a.scanId)) ? { route: 'scan-action', method: 'OP', body: { scanId: s(a.scanId), action: a.action } } : 'Unknown scan.';
    case 'get_scan': return /^[a-z0-9]{10,40}$/.test(s(a.scanId)) ? { route: 'scan', method: 'GET', query: { scanId: s(a.scanId) } } : 'Unknown scan.';
    case 'start_scan': {
      const spacingKm = KM[String(a.spacingMiles ?? 1)];
      if (!spacingKm) return 'spacingMiles must be 0.5, 1, 2, 3 or 5.';
      // 5×5 unless a size is named: a scan is never made larger than asked for.
      const gridSize = a.gridSize === undefined || a.gridSize === null ? AGENT_GRID : Number(a.gridSize);
      if (!AGENT_GRIDS.includes(gridSize)) return 'gridSize must be 3, 5, 7, 9 or 11.';
      const repeat = a.repeat === undefined || a.repeat === null ? 'once' : s(a.repeat);
      if (!['once', 'daily', 'weekly'].includes(repeat)) return 'repeat must be once, daily or weekly.';
      if (repeat === 'once' && (a.at !== undefined || a.weekday !== undefined)) return 'A time of day is for a scan that repeats: set repeat to daily or weekly, or leave `at` out to run it once, now.';
      const when = repeat !== 'once' && a.at !== undefined ? { scheduleAt: s(a.at), scheduleTimezone: s(a.timezone), ...(a.weekday !== undefined ? { scheduleWeekday: a.weekday } : {}) } : {};
      return { route: 'scan-create', method: 'POST', body: { keyword: s(a.keyword), targetBusiness: s(a.business), centerLat: a.lat, centerLng: a.lng, gridSize, spacingKm, targetType: 'mobile_chrome', scheduleType: repeat, ...when, ...(s(a.website).trim() ? { targetDomain: s(a.website).trim() } : {}) } };
    }
    default: return 'Unknown tool.';
  }
}

/* ───────────── Playbooks: ready-made jobs, offered to an agent as MCP prompts ───────────── */

export type Playbook = { name: string; title: string; description: string; /** What the agent is asked to do. `{business}` is the listing it is for. */ text: string };
export const PLAYBOOKS: Playbook[] = [
  { name: 'weekly_listing_check', title: 'Weekly listing check', description: 'What changed, what needs a reply, and what to do this week.',
    text: 'Using Stakeout, run my weekly check for {business}. Start with get_workspace_briefing. Then: (1) list any changes to the listing I did not make and tell me whether to keep or undo each one; (2) list reviews without a reply, and draft a reply to each; (3) check the last 30 days of listing insights against the 30 before and tell me what moved; (4) check whether a post has gone out in the last 7 days and, if not, draft one. Finish with a short list of what you did and what needs my decision. Ask before changing anything.' },
  { name: 'reply_to_new_reviews', title: 'Reply to new reviews', description: 'Answer every review that has no reply yet.',
    text: 'Using Stakeout, find every review of {business} that has no reply (list_reviews). Write a reply to each in a warm, specific voice that mentions what the reviewer said, never offers a discount, and never shares personal details. Send the replies to 4 and 5 star reviews. For 3 stars or fewer, save the reply as a draft and tell me which ones are waiting for me. Show me each reply before you send it.' },
  { name: 'find_why_i_dropped', title: 'Find why I dropped', description: 'Work out why calls, clicks or rankings fell.',
    text: 'Using Stakeout, work out why {business} is getting fewer calls or clicks. Check, in this order: (1) list_changes, for an edit to the listing I did not make; (2) get_listing_insights for the last 30 days against the 30 before, and which searches fell; (3) search_console for the website, by query and by page, for the same dates; (4) inspect_url on the page the listing links to, to see whether Google still has it indexed; (5) the two most recent scans for the same keyword (list_scans, get_scan) and who moved above me. Give me the most likely cause first, the evidence for it, and the one thing to do about it. Do not change anything.' },
  { name: 'monthly_client_report', title: 'Monthly client report', description: 'A plain-English month in review for a client.',
    text: 'Using Stakeout, write a one-page monthly report for {business} that a business owner can read in two minutes. Cover the last 30 days against the 30 before: calls, website clicks and direction requests from the listing (get_listing_insights); new reviews and the average rating (list_reviews); website clicks and the searches that grew or fell (search_console); visits and leads from the listing (analytics with came=listing); the latest scan’s share of local voice against the one before (list_scans, get_scan); and the work done this month (posts sent, replies written, edits made). End with three priorities for next month. Plain words, no jargon, and say plainly where a number went down. Do not change anything.' },
  { name: 'optimize-vs-top-rivals', title: 'Optimize against the top rivals', description: 'Close the gaps between this listing and the businesses ranking above it.',
    text: 'Using Stakeout, compare {business} with the businesses that outrank it and close the gaps. (1) Open the most recent scan (list_scans, get_scan) and name the three rivals most often above me, with their categories, rating and review count where known. (2) Read my listing (get_listing, get_listing_details, list_media). (3) Tell me what they have that I lack: categories (look them up with search_gbp_categories), services, attributes, named hours, booking links, photos, and how often they post. (4) Fix what you are allowed to: add the missing services Google offers for my categories with upsert_services, set the attributes that are true of my business with update_attributes, and draft one post. (5) For anything only I can change (name, categories, phone, website, address), give me the exact change to make and why. Only claim things that are true of my business: ask me when you are not sure. Show me every change before you make it.' },
];
/** A playbook's text for one business (or, with none named, for the account's listings). */
export const playbookText = (p: Playbook, business?: string) => p.text.replace(/\{business\}/g, (business ?? '').trim().slice(0, 120) || 'my business');

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
        capabilities: { tools: {}, prompts: {} },
        serverInfo: { name: 'stakeout-search', title: 'Stakeout Search', version: '1.1.0' },
        instructions: 'Local rank scans and Google Business Profile management. Start with get_workspace_briefing, then list_listings or list_scans. Listing tools need the listing to be on a Command or Dominator seat. Name, categories, phone, website and address are never editable here. A reply to a review of three stars or fewer is saved as a draft for a person, not sent. Scans cost points (Scan Now 2 a grid point, scheduled 1) and count against a monthly limit: ask before starting one.',
      });
    case 'ping': return rpcResult(m.id, {});
    case 'tools/list':
      return rpcResult(m.id, { tools: TOOLS.map((t) => ({ ...t, annotations: annotationsOf(t.name) })) });
    case 'tools/call': return 'call';
    case 'resources/list': return rpcResult(m.id, { resources: [] });
    case 'prompts/list':
      return rpcResult(m.id, { prompts: PLAYBOOKS.map((b) => ({ name: b.name, title: b.title, description: b.description, arguments: [{ name: 'business', description: 'The business or listing it is for. Leave out for all of them.', required: false }] })) });
    case 'prompts/get': {
      const book = PLAYBOOKS.find((b) => b.name === p.name);
      if (!book) return rpcError(m.id, -32602, 'Unknown prompt.');
      const args = (p.arguments && typeof p.arguments === 'object' ? p.arguments : {}) as Record<string, unknown>;
      return rpcResult(m.id, { description: book.description, messages: [{ role: 'user', content: { type: 'text', text: playbookText(book, typeof args.business === 'string' ? args.business : undefined) } }] });
    }
    default: return rpcError(m.id, -32601, 'Method not found: ' + m.method);
  }
}
