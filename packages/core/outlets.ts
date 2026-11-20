/**
 * Other places a listing's post can go besides Google: the business's Facebook Page and its
 * LinkedIn page (or the owner's own LinkedIn profile). One post, written once, sent to every
 * outlet that is switched on. Google stays the home of the post: it is always sent there, and the
 * others ride along.
 *
 * A sign-in to Facebook or LinkedIn connects a person, who may manage several Pages. Which Page
 * is this business's is chosen once per listing (the "placement") and remembered.
 */
import { isImage, postProblem, postRequest, scheduleProblem, type PostDraft } from './gbpPosts';

export const EXTRA_OUTLETS = ['facebook', 'linkedin'] as const;
export type ExtraOutlet = (typeof EXTRA_OUTLETS)[number];
export const isExtraOutlet = (v: unknown): v is ExtraOutlet => (EXTRA_OUTLETS as readonly string[]).includes(String(v));
export const OUTLET_NAME: Record<ExtraOutlet | 'google_business', string> = { google_business: 'Google', facebook: 'Facebook', linkedin: 'LinkedIn' };
/** The most text each outlet takes. The composer holds a post to the smallest among those switched on. */
export const OUTLET_TEXT_MAX: Record<ExtraOutlet | 'google_business', number> = { google_business: 1500, facebook: 63206, linkedin: 3000 };

/** The Page (or profile) chosen for one listing on one outlet. `placement` null is the person's own LinkedIn profile. */
export type ChosenOutlet = { profile: string; placement: string | null; name: string };
export type ListingOutlets = Partial<Record<ExtraOutlet, ChosenOutlet>>;

/** Why this post cannot go to that outlet (null: it can). */
export function outletProblem(d: PostDraft, outlet: ExtraOutlet, chosen: ChosenOutlet | undefined): string | null {
  const name = OUTLET_NAME[outlet];
  if (!chosen) return `${name} is not connected for this listing.`;
  if (outlet === 'facebook' && !chosen.placement) return 'Choose which Facebook Page is this business first.';
  if (d.format === 'photo') return `A photo with no text is added to the Google listing only. Write an update to send it to ${name} too.`;
  if (!d.body.trim()) return `${name} needs some text.`;
  if (d.body.trim().length > OUTLET_TEXT_MAX[outlet]) return `${name} takes up to ${OUTLET_TEXT_MAX[outlet].toLocaleString()} characters.`;
  return null;
}

type Request = { post: Record<string, string>; profiles: string[]; media?: string[]; platforms: Record<string, Record<string, unknown>> };

/**
 * The Google post request with the chosen outlets added. The text and photo are shared. Google's
 * button, offer and event fields stay Google's; where the post has a button link and no photo,
 * Facebook shows that link as a preview card (Facebook cannot combine a link card with a photo).
 */
export function withOutlets(req: Request, d: PostDraft, send: ListingOutlets): Request {
  const out: Request = { ...req, profiles: [...req.profiles], platforms: { ...req.platforms } };
  for (const outlet of EXTRA_OUTLETS) {
    const c = send[outlet];
    if (!c || out.profiles.includes(c.profile)) continue;
    out.profiles.push(c.profile);
    if (outlet === 'facebook') {
      const link = !d.image && d.cta && d.cta !== 'CALL' && /^https:\/\/\S+$/.test(d.ctaUrl.trim()) ? d.ctaUrl.trim() : '';
      out.platforms.facebook = { format: 'post', ...(c.placement ? { page_id: c.placement } : {}), ...(link ? { link } : {}) };
    } else {
      out.platforms.linkedin = { format: 'post', ...(c.placement ? { organization_id: c.placement } : {}) };
    }
  }
  return out;
}

export type OutletResult = { outlet: ExtraOutlet; state: 'waiting' | 'published' | 'failed'; error: string | null; permalink: string | null };

/** How a post fared on each other outlet it was sent to, read from what the posting service returns. */
export function readOutletResults(raw: unknown): OutletResult[] {
  const list = raw && typeof raw === 'object' && Array.isArray((raw as { platforms?: unknown }).platforms) ? ((raw as { platforms: unknown[] }).platforms as Record<string, unknown>[]) : [];
  const out: OutletResult[] = [];
  for (const p of list) {
    if (!p || typeof p !== 'object' || !isExtraOutlet(p.platform)) continue;
    const s = String(p.status ?? '');
    out.push({
      outlet: p.platform,
      state: s === 'published' ? 'published' : s === 'failed' ? 'failed' : 'waiting',
      error: typeof p.error === 'string' && p.error.trim() ? p.error.trim() : null,
      permalink: typeof p.permalink === 'string' && /^https:\/\//.test(p.permalink) ? p.permalink : null,
    });
  }
  return out;
}

/**
 * Why this post cannot be sent as it is (null: it can). With Google ticked, Google's own rules
 * apply first. Without Google, the post is a plain update for the other outlets: offers, events
 * and photo-only posts are Google's formats, and there must be somewhere for it to go.
 */
export function draftProblem(d: PostDraft, google: boolean, send: ListingOutlets, now: Date = new Date()): string | null {
  const going = EXTRA_OUTLETS.filter((o) => send[o]);
  if (!google && !going.length) return 'Tick at least one place for this post to go.';
  if (google) {
    const g = postProblem(d, now);
    if (g) return g;
  } else {
    if (d.format !== 'standard') return 'Offers, events and photo-only posts are Google formats. Tick Google, or write this as an update.';
    if (d.image && !isImage(d.image)) return 'The image must be a JPG or PNG file, or an https link to one.';
    const when = scheduleProblem(d, now);
    if (when) return when;
  }
  for (const o of going) {
    const why = outletProblem(d, o, send[o]);
    if (why) return why;
  }
  return null;
}

/** The request for the posting service: Google's part when it is ticked, plus each chosen outlet. */
export function buildPostRequest(d: PostDraft, google: { profile: string; location: string } | null, send: ListingOutlets): Request {
  if (google) return withOutlets(postRequest(d, google.profile, google.location) as Request, d, send);
  const post: Record<string, string> = { body: d.body.trim() };
  if (d.scheduledAt) post.scheduled_at = new Date(d.scheduledAt).toISOString();
  return withOutlets({ post, profiles: [], ...(d.image ? { media: [d.image] } : {}), platforms: {} }, d, send);
}

const words = (t: string) =>
  t.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').split(' ').filter((w) => w.length > 1 && !['the', 'and', 'of', 'llc', 'inc', 'co', 'pllc', 'pc', 'llp', 'at', 'law'].includes(w));

/**
 * The Pages to choose from, with the one that looks like this listing first. `suggested` marks it
 * when the names share most of their words ("Plano Tree Service" and "Plano Tree Service Pros");
 * with no clear match the order is left alone and nothing is marked.
 */
export function rankChoices<T extends { name: string }>(listing: string, choices: T[]): (T & { suggested: boolean })[] {
  const want = words(listing);
  const scored = choices.map((c, i) => {
    const have = words(c.name);
    const shared = want.filter((w) => have.includes(w)).length;
    // How much of each name the other covers: both must be largely the same business name.
    const score = want.length && have.length ? (shared / want.length + shared / have.length) / 2 : 0;
    return { c, i, score };
  });
  const best = [...scored].sort((a, b) => b.score - a.score || a.i - b.i)[0];
  const clear = Boolean(best) && best.score >= 0.6;
  return scored
    .sort((a, b) => (clear ? Number(b === best) - Number(a === best) : 0) || a.i - b.i)
    .map((x) => ({ ...x.c, suggested: clear && x === best }));
}
