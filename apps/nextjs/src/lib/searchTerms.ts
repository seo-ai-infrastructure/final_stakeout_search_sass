/** What a search's own words say: its language, and the place it names. Pure, for the visibility report. */

/**
 * A search in Spanish: a word only Spanish uses for the trade ("abogado", "lesiones", "accidentes"),
 * with a Spanish joining word or in a short phrase. English searches are never caught by "auto".
 */
const SPANISH_WORD = /\b(abogad[oa]s?|lesiones|lesionad[oa]s?|accidentes?|personales|cami[oó]n(es)?|choques?|carros?|cerca|mejor(es)?|bufete|despacho|demandas?|seguro|aseguranza|plomer[oa]s?|dentistas?|reparaci[oó]n)\b/i;
const SPANISH_GLUE = /\b(de|del|en|para|por|los|las|el|la|y|mi)\b/i;
export const isSpanish = (q: string) => SPANISH_WORD.test(q) && (SPANISH_GLUE.test(q) || q.trim().split(/\s+/).length <= 3);

/** Words of the trade and of searching, left out when looking for a place in a search. */
const TRADE = new Set('a an the best top near me my in for of and to car auto truck motorcycle accident accidents injury injuries personal lawyer lawyers attorney attorneys law firm firms office offices legal services service company companies abogado abogados de en emergency plumber plumbers dentist cheap free consultation'.split(' '));
const STATE = /\s(al|ak|az|ar|ca|co|ct|de|fl|ga|hi|id|il|in|ia|ks|ky|la|me|md|ma|mi|mn|ms|mo|mt|ne|nv|nh|nj|nm|ny|nc|nd|oh|ok|or|pa|ri|sc|sd|tn|tx|ut|vt|va|wa|wv|wi|wy|new york|new jersey)$/;
/**
 * The place a search names, if any: "<name> county", "<name> <state>" at its end, or "in <name>" at
 * its end, without the trade's own words ("car accident attorney orange county ny" → "orange county").
 */
export function placeIn(query: string): string | null {
  const q = ' ' + query.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const clean = (x: string) => x.split(' ').filter((w) => w && !TRADE.has(w)).join(' ').trim() || null;
  const county = /((?:[a-z]+ ){0,2}[a-z]+) county\b/.exec(q);
  if (county) return (clean(county[1]) ?? '') ? clean(county[1]) + ' county' : null;
  const st = STATE.exec(q);
  if (st) return clean(q.slice(0, st.index).split(' ').slice(-2).join(' '));
  const inn = / in ((?:[a-z]+ ){0,2}[a-z]+)$/.exec(q);
  return inn ? clean(inn[1]) : null;
}

export const placeWords = (x: string) => x.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Whether a search names another market: Google ranks the page far down for it (past 50) and the
 * place in it is none of the scan's own. For a county, none of the counties the grid lies in (none
 * known, never); for a town, none of the points' towns or the office's city.
 */
export function otherMarket(places: string[], counties: string[] | null) {
  const local = places.map(placeWords).filter((x) => x.length >= 3);
  return (query: string, position: number | null) => {
    const at = placeIn(query);
    if (!at || position === null || position <= 50) return false;
    const county = /^(.+) county$/.exec(at);
    if (county) return Boolean(counties?.length) && !counties!.includes(county[1]);
    return !local.some((l) => at.includes(l) || l.includes(at));
  };
}
