import { googleIdOf, googleIdsIn, googleShortLink, isGoogleHost } from '@stakeout/core/businessIds';

const UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';

/**
 * Google's ID for a business from what was pasted (see googleIdOf). A Share link (maps.app.goo.gl,
 * g.co/kgs, share.google …) is followed here, a few hops through Google's own hosts only (https),
 * reading the address each hop leads to. A hop that answers with a page instead of a redirect is
 * read for the ID only when the page names exactly one. '' when no ID comes out of it.
 */
export async function resolveGoogleId(input: unknown): Promise<string> {
  const direct = googleIdOf(input);
  if (direct) return direct;
  let url = googleShortLink(input);
  for (let hop = 0; url && hop < 6; hop++) {
    const id = googleIdOf(url);
    if (id) return id;
    let res: Response;
    try {
      res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(5000), headers: { 'user-agent': UA, 'accept-language': 'en-US,en;q=0.9' } });
    } catch {
      return '';
    }
    const next = res.headers.get('location');
    if (!next) {
      if (res.status !== 200) return '';
      const ids = googleIdsIn((await res.text().catch(() => '')).slice(0, 400_000));
      return ids.length === 1 ? ids[0] : '';
    }
    let to: URL;
    try {
      to = new URL(next, url);
    } catch {
      return '';
    }
    if (to.protocol !== 'https:' || !isGoogleHost(to.hostname)) return '';
    url = to.toString();
  }
  return url ? googleIdOf(url) : '';
}

/**
 * For a scan or a saved business: what was pasted, made into the ID when it can be (a Share link
 * is followed). Anything that yields no ID is returned as pasted, so the usual check refuses it
 * with the reason.
 */
export async function googleIdField(input: unknown): Promise<unknown> {
  if (typeof input !== 'string' || !input.trim()) return input;
  return (await resolveGoogleId(input).catch(() => '')) || input;
}
