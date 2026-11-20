/**
 * Other places a listing's post can go besides Google: the business's Facebook Page and its
 * LinkedIn page (or the owner's own LinkedIn profile). One post, written once, sent to every
 * outlet that is switched on. Google stays the home of the post: it is always sent there, and the
 * others ride along.
 *
 * A sign-in to Facebook or LinkedIn connects a person, who may manage several Pages. Which Page
 * is this business's is chosen once per listing (the "placement") and remembered.
 */
import type { PostDraft } from './gbpPosts';

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
