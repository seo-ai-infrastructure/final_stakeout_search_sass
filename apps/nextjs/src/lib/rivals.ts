import { db } from '@stakeout/db';
import { readRival, type Rival } from '@stakeout/core/gbpGaps';

/**
 * Rivals' public Google listings, from DataForSEO's business-listing lookup (login and password in
 * DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD, on Vercel only). Each lookup is paid for, so an answer
 * is kept for 14 days, including "no such listing found", and at most three are made at a time.
 */
const KEEP_MS = 14 * 86400000;
export const rivalsConfigured = () => Boolean(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD);
const keyOf = (name: string, lat: number, lng: number) => name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 120) + '|' + lat.toFixed(1) + ',' + lng.toFixed(1);

async function lookUp(name: string, lat: number, lng: number): Promise<unknown | null> {
  const auth = Buffer.from(process.env.DATAFORSEO_LOGIN + ':' + process.env.DATAFORSEO_PASSWORD).toString('base64');
  const res = await fetch('https://api.dataforseo.com/v3/business_data/google/my_business_info/live', {
    method: 'POST',
    headers: { Authorization: 'Basic ' + auth, 'Content-Type': 'application/json' },
    // Within 30 km of the scan's centre: the rival that ranked there, not a namesake elsewhere.
    body: JSON.stringify([{ keyword: name.replace(/%/g, '%25').slice(0, 300), location_coordinate: `${lat.toFixed(6)},${lng.toFixed(6)},30000`, language_code: 'en' }]),
    cache: 'no-store',
    signal: AbortSignal.timeout(40000),
  });
  const j = (await res.json().catch(() => null)) as { status_code?: number; status_message?: string; tasks?: { status_code?: number; status_message?: string; result?: { items?: unknown[] }[] }[] } | null;
  if (!res.ok || !j || j.status_code !== 20000) throw new Error('The rival lookup service refused the request' + (j?.status_message ? ': ' + String(j.status_message).slice(0, 160) : ' (' + res.status + ').'));
  const task = j.tasks?.[0];
  // 40102 and the like: looked, found nothing. Anything else in the 4xxxx/5xxxx range is a failure.
  if (task?.status_code && task.status_code !== 20000 && !/no search results/i.test(task.status_message ?? '')) throw new Error('The rival lookup failed: ' + String(task.status_message ?? task.status_code).slice(0, 160));
  return task?.result?.[0]?.items?.[0] ?? null;
}

/**
 * The listings of up to three of these rivals near a place, tried in order (so when the top rival's
 * listing cannot be found, the next one down stands in): from what was kept when it is fresh,
 * looked up otherwise (only when `mayLookUp`). `missing`: looked for and not found, or found under
 * a different name. `waiting`: how many more would have to be looked up to have three. `problem`
 * says so when a lookup itself failed.
 */
export async function rivalListings(names: string[], lat: number, lng: number, mayLookUp: boolean): Promise<{ rivals: Rival[]; missing: string[]; waiting: number; problem: string | null; lookedUp: number }> {
  const rivals: Rival[] = [], missing: string[] = [];
  let problem: string | null = null, lookedUp = 0, waiting = 0;
  for (const name of names) {
    if (rivals.length + waiting >= 3) break;
    const key = keyOf(name, lat, lng);
    const kept = await db.rivalProfile.findUnique({ where: { key } });
    const fresh = kept !== null && Date.now() - kept.fetchedAt.getTime() <= KEEP_MS;
    let data: unknown = kept?.data ?? null;
    if (!fresh) {
      if (!mayLookUp || !rivalsConfigured() || problem) { waiting++; continue; }
      try {
        data = await lookUp(name, lat, lng);
        lookedUp++;
        const json = data === null ? null : JSON.parse(JSON.stringify(data));
        await db.rivalProfile.upsert({ where: { key }, update: { name, data: json ?? undefined, fetchedAt: new Date() }, create: { key, name, ...(json ? { data: json } : {}) } });
      } catch (e) {
        problem = e instanceof Error ? e.message : 'The rival lookup failed.';
        waiting++;
        continue;
      }
    }
    const r = data ? readRival(data, name) : null;
    if (r) rivals.push(r); else missing.push(name);
  }
  return { rivals, missing, waiting, problem, lookedUp };
}
