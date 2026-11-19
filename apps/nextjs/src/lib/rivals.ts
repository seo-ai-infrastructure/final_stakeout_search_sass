import { db } from '@stakeout/db';
import { postCadence, readPosts, readRival, rivalFacts, type Rival, type RivalFacts, type RivalPost } from '@stakeout/core/gbpGaps';

/**
 * Rivals' public Google listings and posts, from DataForSEO's business data (login and password in
 * DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD, on Vercel only). Every lookup is paid for, so answers
 * are kept for 14 days, including "no such listing found", and lookups only happen when asked for.
 *
 * A listing is found by name near the scan's centre. (Reading it again by its Google id, cid, was
 * tried: it returns the same categories, so it is not paid for twice.) Posts have no instant
 * lookup: a task is set by cid, and its answer is collected on a later visit.
 */
const KEEP_MS = 14 * 86400000;
const API = 'https://api.dataforseo.com/v3/business_data/google/';
export const rivalsConfigured = () => Boolean(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD);
const keyOf = (name: string, lat: number, lng: number) => name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 120) + '|' + lat.toFixed(1) + ',' + lng.toFixed(1);

type Task = { id?: string; status_code?: number; status_message?: string; result?: { items?: unknown[] }[] | null };
async function dfs(path: string, body?: unknown): Promise<Task | null> {
  const auth = Buffer.from(process.env.DATAFORSEO_LOGIN + ':' + process.env.DATAFORSEO_PASSWORD).toString('base64');
  const res = await fetch(API + path, { method: body ? 'POST' : 'GET', headers: { Authorization: 'Basic ' + auth, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, cache: 'no-store', signal: AbortSignal.timeout(40000) });
  const j = (await res.json().catch(() => null)) as { status_code?: number; status_message?: string; tasks?: Task[] } | null;
  if (!res.ok || !j || j.status_code !== 20000) throw new Error('The rival lookup service refused the request' + (j?.status_message ? ': ' + String(j.status_message).slice(0, 160) : ' (' + res.status + ').'));
  return j.tasks?.[0] ?? null;
}
const first = (t: Task | null) => (t?.result?.[0]?.items?.[0] ?? null) as Record<string, unknown> | null;
const failed = (t: Task | null) => Boolean(t?.status_code && t.status_code >= 40000 && !/no search results|not found/i.test(t.status_message ?? ''));

/** One listing, by name within 30 km of the scan's centre (about half a cent). */
async function lookUp(name: string, lat: number, lng: number): Promise<Record<string, unknown> | null> {
  const byName = await dfs('my_business_info/live', [{ keyword: name.replace(/%/g, '%25').slice(0, 300), location_coordinate: `${lat.toFixed(6)},${lng.toFixed(6)},30000`, language_code: 'en' }]);
  if (failed(byName)) throw new Error('The rival lookup failed: ' + String(byName?.status_message ?? byName?.status_code).slice(0, 160));
  return first(byName);
}

export type RivalView = Rival & { facts: RivalFacts; posts: { state: 'ready' | 'collecting' | 'none'; latest: RivalPost[]; cadence: ReturnType<typeof postCadence> } };

/** A rival's posts: what was kept, or the answer to the task set earlier when it has arrived; with `mayLookUp`, a task is set. */
async function postsOf(key: string, cid: string | null, row: { postsTask: string | null; posts: unknown; postsAt: Date | null }, mayLookUp: boolean): Promise<RivalView['posts']> {
  const view = (items: unknown, state: 'ready' | 'collecting' | 'none') => { const list = readPosts(items); return { state, latest: list.slice(0, 3), cadence: postCadence(list) }; };
  if (row.postsAt && Date.now() - row.postsAt.getTime() <= KEEP_MS) return view(row.posts, 'ready');
  if (!rivalsConfigured() || !cid) return view(row.posts, row.posts ? 'ready' : 'none');
  try {
    if (row.postsTask) {
      const t = await dfs('my_business_updates/task_get/' + encodeURIComponent(row.postsTask));
      // Still being collected: 40602 "Task In Queue" and the like.
      if (t?.status_code === 20000) {
        const items = t.result?.[0]?.items ?? [];
        await db.rivalProfile.update({ where: { key }, data: { posts: JSON.parse(JSON.stringify(items)), postsAt: new Date(), postsTask: null } });
        return view(items, 'ready');
      }
      if (t?.status_code && t.status_code >= 40400 && t.status_code !== 40601 && t.status_code !== 40602) await db.rivalProfile.update({ where: { key }, data: { postsTask: null } });
      else return view(row.posts, 'collecting');
    }
    if (mayLookUp) {
      const t = await dfs('my_business_updates/task_post', [{ keyword: 'cid:' + cid, location_code: 2840, language_code: 'en', depth: 20 }]);
      if (t?.id) {
        await db.rivalProfile.update({ where: { key }, data: { postsTask: t.id } });
        return view(row.posts, 'collecting');
      }
    }
  } catch { /* posts are an extra: the listing itself is still shown */ }
  return view(row.posts, row.posts ? 'ready' : 'none');
}

/**
 * The listings of up to three of these rivals near a place, tried in order (so when the top rival's
 * listing cannot be found, the next one down stands in): from what was kept when it is fresh,
 * looked up otherwise (only when `mayLookUp`). `missing`: looked for and not found, or found under
 * a different name. `waiting`: how many lookups pressing the button would make. `problem` says so
 * when a lookup itself failed.
 */
export async function rivalListings(names: string[], lat: number, lng: number, mayLookUp: boolean): Promise<{ rivals: RivalView[]; missing: string[]; waiting: number; problem: string | null; lookedUp: number }> {
  const rivals: RivalView[] = [], missing: string[] = [];
  let problem: string | null = null, lookedUp = 0, waiting = 0, unread = 0;
  for (const name of names) {
    if (rivals.length + unread >= 3) break;
    const key = keyOf(name, lat, lng);
    let kept = await db.rivalProfile.findUnique({ where: { key } });
    const fresh = kept !== null && Date.now() - kept.fetchedAt.getTime() <= KEEP_MS;
    let data = (kept?.data ?? null) as Record<string, unknown> | null;
    if (!fresh) {
      if (!mayLookUp || !rivalsConfigured() || problem) { waiting++; unread++; continue; }
      try {
        data = await lookUp(name, lat, lng);
        lookedUp++;
        const json = data === null ? null : JSON.parse(JSON.stringify(data));
        kept = await db.rivalProfile.upsert({ where: { key }, update: { name, data: json ?? undefined, fetchedAt: new Date() }, create: { key, name, ...(json ? { data: json } : {}) } });
      } catch (e) {
        problem = e instanceof Error ? e.message : 'The rival lookup failed.';
        waiting++; unread++;
        continue;
      }
    }
    const r = data ? readRival(data, name) : null;
    if (!r || !kept) { missing.push(name); continue; }
    const facts = rivalFacts(data);
    const posts = await postsOf(key, facts.cid, kept, mayLookUp);
    if (posts.state === 'none' && facts.cid && rivalsConfigured() && !mayLookUp) waiting++;
    rivals.push({ ...r, facts, posts });
  }
  return { rivals, missing, waiting, problem, lookedUp };
}

/**
 * What is already kept about these businesses near a place: main category, the others, rating and
 * review count. Nothing is looked up or paid for: a business never looked up is simply left out.
 */
export async function keptRivals(names: string[], lat: number, lng: number): Promise<Record<string, { category: string | null; otherCategories: string[]; rating: number | null; reviews: number | null }>> {
  const keys = new Map(names.map((n) => [keyOf(n, lat, lng), n]));
  const rows = await db.rivalProfile.findMany({ where: { key: { in: [...keys.keys()] } }, select: { key: true, data: true } });
  const out: Record<string, { category: string | null; otherCategories: string[]; rating: number | null; reviews: number | null }> = {};
  for (const row of rows) {
    const name = keys.get(row.key) as string;
    const r = row.data ? readRival(row.data as Record<string, unknown>, name) : null;
    if (r) out[name] = { category: r.categories[0]?.name ?? null, otherCategories: r.categories.slice(1, 6).map((c) => c.name), rating: r.rating, reviews: r.reviews };
  }
  return out;
}
