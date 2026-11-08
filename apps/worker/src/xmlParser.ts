import { XMLParser, XMLValidator } from 'fast-xml-parser';
type Node = { node?: Node[]; [attribute: string]: unknown };
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  isArray: (tag) => tag === 'node',
  processEntities: true,
});
const label = (n: Node) => String(n.text || n['content-desc'] || '').trim();
const rid = (n: Node) =>
  String(n['resource-id'] ?? '')
    .split('/')
    .pop() ?? '';
const normalize = (s: string) =>
  s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
function walk(n: Node): Node[] {
  return [n, ...(n.node ?? []).flatMap(walk)];
}
function trees(xml: string): Node[] {
  if (
    xml.length > 4000000 ||
    /<!DOCTYPE/i.test(xml) ||
    XMLValidator.validate(xml) !== true
  )
    throw new Error('INVALID_UI_XML');
  const roots = parser.parse(xml)?.hierarchy?.node;
  if (!Array.isArray(roots) || !roots.length) throw new Error('EMPTY_UI_XML');
  return roots;
}
const aiTitle =
  /^(AI Overview|Ask Maps|AI-organized results|Generative AI)(?:$|[ :·])/i;
const aiResource =
  /^(ai_overview|aio_panel|ask_maps_answer|generative_answer)(?:_container)?$/i;
const placeTitle =
  /^(?:place_name|place_title|business_name|result_title|place_result_title|poi_name|search_result_title|section_result_title)$/i;
const rating = /\b[0-5][.,]\d\s*(?:stars?|\(\s*[\d,.]+\s*\)|out of 5)/i;
function aiPanels(n: Node): Node[] {
  if (aiResource.test(rid(n))) return [n];
  const children = n.node ?? [];
  const nested = children.flatMap(aiPanels);
  if (nested.length) return nested;
  if (
    children.some((c) => aiTitle.test(label(c))) &&
    children.length > 1 &&
    !walk(n).some((c) => placeTitle.test(rid(c)))
  )
    return [n];
  return [];
}
export function parsePinXmlBundle(
  scroll: string[],
  ai: string[],
  target: string,
) {
  if (!scroll.length) throw new Error('NO_RESULT_DUMPS');
  const names: string[] = [],
    seen = new Set<string>();
  let matchedDumpIndex: number | null = null,
    hasAiOverview = false,
    noResults = false;
  scroll.forEach((xml, index) => {
    for (const root of trees(xml)) {
      const panels = new Set(aiPanels(root).flatMap(walk));
      for (const node of walk(root)) {
        const text = label(node);
        if (/unusual traffic|not a robot|verify you are human/i.test(text))
          throw new Error('FLAG_CAPTCHA_DETECTED');
        if (
          /no (places|results|matches) found|couldn.t find any results/i.test(
            text,
          )
        )
          noResults = true;
        if (panels.has(node)) continue;
        let name = placeTitle.test(rid(node)) ? text : '';
        const imageCard = String(node['content-desc'] ?? '');
        if (!name && rating.test(imageCard))
          name = imageCard
            .split(/,?\s*\b[0-5][.,]\d\s*(?:stars?|\(|out of 5)/i)[0]
            .replace(/[,·\s]+$/, '');
        if (
          !name ||
          name.length > 180 ||
          /^(sponsored|ad)\b/i.test(name) ||
          seen.has(normalize(name)) ||
          names.length >= 20
        )
          continue;
        seen.add(normalize(name));
        names.push(name);
        if (normalize(name) === normalize(target)) matchedDumpIndex = index;
      }
    }
  });
  const aiResult = parseAiPanels(ai, target);
  hasAiOverview = aiResult.hasAiOverview;
  if (!names.length && !noResults && !hasAiOverview)
    throw new Error('UNRECOGNIZED_RESULT_LAYOUT');
  const targetKey = normalize(target);
  const rank = names.findIndex((n) => normalize(n) === targetKey);
  return {
    orderedBusinesses: names,
    targetRank: rank < 0 ? null : rank + 1,
    matchedDumpIndex,
    ...aiResult,
  };
}

/** AI answer text and sources from the AI-panel dumps, scoped to the panel itself. */
function parseAiPanels(ai: string[], target: string) {
  const citations = new Set<string>(),
    texts = new Set<string>();
  let hasAiOverview = false;
  for (const xml of ai)
    for (const root of trees(xml)) {
      for (const panel of aiPanels(root)) {
        hasAiOverview = true;
        for (const node of walk(panel)) {
          const text = label(node);
          if (!text || aiTitle.test(text) || /^show more$/i.test(text))
            continue;
          texts.add(text);
          if (
            /citation|source_(?:name|title|link)|attribution/i.test(
              rid(node),
            ) ||
            /^(?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/\S*)?$/i.test(text)
          )
            citations.add(text);
        }
      }
    }
  const aiOverviewText = [...texts].join('\n').slice(0, 16000);
  const targetKey = normalize(target);
  return {
    hasAiOverview,
    targetCitedInAi:
      hasAiOverview &&
      (' ' + normalize(aiOverviewText) + ' ').includes(' ' + targetKey + ' '),
    aiOverviewText,
    aiCitations: [...citations].slice(0, 100),
  };
}

// A business card in Google's web results (Chrome and the Google app). Its
// accessibility label reads "<name> [About this result] Rated 4.8 out of 5 …".
const webCard = /^(.*?)\s+(About this result\s+)?Rated ([0-5](?:[.,]\d)?) out of 5(,?)/;

export type WebAd = { name: string; kind: 'local_services' | 'sponsored'; position: number };

/**
 * Parses Chrome / Google-app results. Chrome's UI dump holds the entire loaded
 * page (off-screen nodes report bounds [0,0][0,0]), so ranks come from ONE final
 * dump. Only cards carrying "About this result" are organic; every other card is
 * an ad and is reported separately, never ranked. The page footer states how
 * Google located the searcher; an IP-based location means GPS was not used.
 */
export function parseWebResults(
  finalXml: string,
  positional: string[],
  ai: string[],
  target: string,
) {
  const organic: string[] = [],
    ads: WebAd[] = [],
    // An advertiser can also rank organically: de-duplicate within each group, never across.
    seenOrganic = new Set<string>(),
    seenAds = new Set<string>();
  let locationSource: string | null = null,
    noResults = false,
    cards = 0;
  for (const root of trees(finalXml))
    for (const node of walk(root)) {
      const text = label(node).replace(/\u00a0/g, ' ');
      if (/unusual traffic|not a robot|verify you are human/i.test(text))
        throw new Error('FLAG_CAPTCHA_DETECTED');
      if (/no (places|results|matches) found|did not match any/i.test(text))
        noResults = true;
      if (!locationSource && text.length < 160 && /\b(From your|Based on your)\b/i.test(text))
        locationSource = text;
      if (!/View$/.test(String(node.class ?? ''))) continue;
      const m = webCard.exec(text);
      if (!m || !(/reviews for/i.test(text) || text.includes('·'))) continue;
      const name = m[1].trim(),
        key = normalize(name);
      const seen = m[2] ? seenOrganic : seenAds;
      if (!name || name.length > 180 || seen.has(key)) continue;
      seen.add(key);
      cards++;
      if (m[2]) {
        if (organic.length < 20) organic.push(name);
      } else {
        ads.push({ name, kind: m[4] === ',' ? 'local_services' : 'sponsored', position: cards });
      }
    }
  if (!organic.length && !ads.length && !noResults)
    throw new Error('UNRECOGNIZED_RESULT_LAYOUT');
  const targetKey = normalize(target);
  const rank = organic.findIndex((n) => normalize(n) === targetKey);
  // First positional dump in which the target was actually on screen.
  let matchedDumpIndex: number | null = null;
  if (rank >= 0)
    positional.some((xml, index) => {
      const onScreen = trees(xml).some((root) =>
        walk(root).some(
          (n) =>
            normalize(label(n)) === targetKey &&
            String(n.bounds ?? '') !== '[0,0][0,0]',
        ),
      );
      if (onScreen) matchedDumpIndex = index;
      return onScreen;
    });
  return {
    orderedBusinesses: organic,
    ads,
    targetRank: rank < 0 ? null : rank + 1,
    matchedDumpIndex,
    locationSource,
    locationFromIp: /IP address/i.test(locationSource ?? ''),
    ...parseAiPanels(ai, target),
  };
}
