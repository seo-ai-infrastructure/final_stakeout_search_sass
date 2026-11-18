/**
 * AI visibility in three parts, per business, over a scan's points (the weights of the 3-part
 * scoring spec, read from each point's AI answer in parts):
 *
 * 1. Position 0, up to 50 a point: named in the opening answer (linked to its Google profile,
 *    usually with its phone) or its website cited there. 1st 1.0, 2nd 0.75, later 0.5; a mention
 *    with neither a link, a phone nor a citation 0.85 of that.
 * 2. Business card, up to 35: its card in the AI Overview's own list of businesses. Slot 1.0, 0.75,
 *    0.55, then 0.35; 0.6 of that when the card sat behind "Show more" (read from the real page the
 *    point saved; counted in full where no page was saved).
 * 3. Website, up to 15: its website cited anywhere else in the answer (not the opening answer, not
 *    its own card). First citation 1.0, later 0.6; in the answer's own text 1.0, inside another
 *    business's card 0.5. Summed, at most 15.
 *
 * A point's score is the sum (at most 100); a business's score is its average over the same N
 * points: the finished points whose answer was read in parts, and the points with no AI Overview
 * (0 for everyone). A point whose answer could not be read in parts is left out of N and counted
 * apart. Google itself is never a website; directories, review sites and publishers are listed
 * apart and never score. Businesses are kept apart by their Google ID (two offices with one name
 * are two businesses) and joined by name and website otherwise.
 *
 * Pure, no Node imports: the report computes it in the browser.
 */
import type { AiParts } from './aiParts';
import type { AiPage } from './aiPage';
import { kgmidOf, siteDomain } from './businessIds';
import { isGoogleSource } from './googleSource';
import { isDirectory } from './directories';

export type AiVisPin = {
  id: string;
  status: string;
  rankFound: number | null;
  topCompetitors: string[] | null;
  hasAiOverview?: boolean;
  insights?: { v: number; ai?: { shown: boolean; parts?: AiParts | null; page?: AiPage | null } } | null;
};
export type AiVisTarget = { name: string; kgmid?: string | null; domain?: string | null };

export type AiVisRow = {
  key: string;
  name: string;
  you: boolean;
  /** Google's ID for it, when one was seen. */
  kgmid: string | null;
  /** The websites counted as its own. */
  domains: string[];
  /** Average points over N (0 to 100) and each part's share of it (they add up to it). */
  score: number;
  p0: number;
  card: number;
  web: number;
  /** Half-width of the 95% range on the score (1.96 standard errors). */
  moe: number;
  /** Its share of all businesses' points, 0 to 1. */
  share: number;
  /** Of N: points where the opening answer named it (first there, with its phone). */
  p0Pins: number;
  p0First: number;
  p0Phone: number;
  /** Of N: points where it had a card (in the first slot); its average slot. */
  cardPins: number;
  cardFirst: number;
  cardAvgSlot: number | null;
  /** Of its cards: those above "Show more" and those behind it, where the point's page told (the rest not known). */
  cardAbove: number;
  cardBehind: number;
  /** Of N: points where its website was cited elsewhere in the answer. */
  webPins: number;
  /** Points where the AI Overview recommended it (opening answer or card), and of those, the ones where it was not in that point's local top 10. */
  aiPins: number;
  beyondLocal: number;
  /** Points where it was in the local results' top 10, and its average place there. */
  localPins: number;
  localAvg: number | null;
  /** The point where it scored most: the one to look at. */
  bestPin: string | null;
  /** Its score at each point of N, by point id. */
  pins: Record<string, number>;
  /** Another business here has the same name (another office, its own Google ID). */
  twin: boolean;
};

export type AiVisSite = { domain: string; owner: string | null; ownerKey: string | null; pins: number; points: number };

export type AiVisibility = {
  /** N: the points every score is averaged over. */
  points: number;
  /** Points with an AI Overview whose answer could not be read in parts (not in N). */
  unread: number;
  /** Points of N that showed an AI Overview. */
  withAi: number;
  /** Every business with points, best first. */
  rows: AiVisRow[];
  /** The tracked business: always here, at 0 when the AI never credited it. */
  you: AiVisRow;
  /** Businesses' websites cited outside the opening answer and their own cards (part 3), most points first. */
  websites: AiVisSite[];
  /** Directories, review sites and publishers cited anywhere in the answers: never scored. */
  directories: { domain: string; pins: number }[];
  /** Leaders of each part (null when nobody scored in it). */
  leaders: { p0: AiVisRow | null; card: AiVisRow | null; web: AiVisSite | null };
  /** Businesses the AI Overview recommends at points where they are not in the local top 10 (at least 2 such points). */
  beyondLocal: AiVisRow[];
  /** Points whose saved page told which cards were above "Show more" (the fold counts only there). */
  foldPins: number;
  foldMeasured: boolean;
};

const P0_MAX = 50,
  CARD_MAX = 35,
  WEB_MAX = 15,
  Z = 1.959964;
const p0Decay = (order: number) => (order === 1 ? 1 : order === 2 ? 0.75 : 0.5);
const cardDecay = (slot: number) => (slot === 1 ? 1 : slot === 2 ? 0.75 : slot === 3 ? 0.55 : 0.35);
const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

/** A business name for matching: lower case, "&" as "and", no company suffixes or punctuation. */
export const normName = (s: string) =>
  s.toLowerCase().replace(/&/g, ' and ').replace(/\b(llc|inc|co|corp|company|ltd|pllc|p ?a|p ?c)\b\.?/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();

/** The registered domain of a site ("lakeland.rotorooter.com" → "rotorooter.com"). */
export function rootDomain(site: string): string {
  const d = siteDomain(site);
  if (!d) return '';
  const l = d.split('.');
  const two = /^(co|com|net|org|gov|edu|ac)$/.test(l[l.length - 2] ?? '') && (l[l.length - 1] ?? '').length === 2;
  return l.slice(two ? -3 : -2).join('.');
}

// Words too common to tie a website to one business by itself.
const GENERIC = new Set(
  'plumber plumbers plumbing lawyer lawyers attorney attorneys law legal injury roofing roofer roofers hvac heating cooling dentist dental painting painters painter movers moving electric electrician electricians cleaning services service home homes best top local near repair repairs pro pros experts expert group company'.split(
    ' ',
  ),
);

/**
 * Whether a website looks like a business's own: its name, run together, starts with the domain's
 * name ("rotorooter.com" for "Roto-Rooter Plumbing & Drain Services"), or the domain's name holds
 * the business's first two words ("lakelandbenjaminfranklin.com" for "Benjamin Franklin Plumbing").
 */
export function siteLooksLike(site: string, name: string): boolean {
  const label = rootDomain(site).split('.')[0].replace(/-/g, '');
  if (label.length < 5 || GENERIC.has(label)) return false;
  const all = normName(name).split(' ').filter(Boolean);
  // With and without the little words: "Howell & Thornhill" is howellthornhill.com.
  for (const words of [all, all.filter((w) => w !== 'and' && w !== 'the' && w !== 'of')]) {
    const compact = words.join('');
    if (compact.length < 4) continue;
    if (compact === label || compact.startsWith(label) || (compact.length >= 6 && label.startsWith(compact))) return true;
    const two = words.slice(0, 2).join('');
    if (words.length >= 2 && two.length >= 8 && !GENERIC.has(words[0]) && label.includes(two)) return true;
  }
  return false;
}

// Words that say what a business does or where, not which business it is.
const TRADE = new Set(
  'and the of at in for a an law lawyer lawyers attorney attorneys legal firm group accident accidents injury injuries personal car auto truck motorcycle wreck plumbing plumber plumbers drain drains sewer septic water heater heating cooling air ac hvac services service repair repairs company co roofing roofer painting painters dental dentist clinic center centre medical orthopedic orthopaedic institute surgery surgeon associates partners pa pc pllc llc inc near me best top 24 7 emergency'.split(
    ' ',
  ),
);

/**
 * Whether two names are one business though written differently: a local listing often carries
 * extra words ("Lopez & Humphries, P.A. - Car Accident Lawyers - Lakeland" for "Lopez & Humphries,
 * P.A."; "Lakeland Personal Injury & Car Accident Lawyers | Norden Leacox" for "Norden Leacox
 * Accident & Injury Law"). The same name, one starting with the other, or every distinctive word of
 * one in the other (two such words, or one of 7 letters or more).
 */
export function sameBusinessName(a: string, b: string, common?: Set<string>): boolean {
  const x = normName(a),
    y = normName(b);
  if (!x || !y) return false;
  if (x === y || (x.length >= 6 && y.startsWith(x + ' ')) || (y.length >= 6 && x.startsWith(y + ' '))) return true;
  const tx = x.split(' '),
    ty = y.split(' ');
  const covered = (from: string[], into: string[]) => {
    const d = from.filter((w) => w.length >= 3 && !TRADE.has(w) && !common?.has(w));
    return d.length > 0 && (d.length >= 2 || d[0].length >= 7) && d.every((w) => into.includes(w));
  };
  return covered(tx, ty) || covered(ty, tx);
}

type Entity = { key: string; name: string; kgmid: string | null; domains: Set<string>; you: boolean };

/** Wilson 95% range for k of n. */
export function wilson(k: number, n: number) {
  if (n <= 0) return { rate: 0, lower: 0, upper: 0 };
  const p = k / n,
    z2 = Z * Z,
    den = 1 + z2 / n,
    mid = (p + z2 / (2 * n)) / den,
    half = (Z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / den;
  return { rate: p, lower: Math.max(0, mid - half), upper: Math.min(1, mid + half) };
}

export function aiVisibility(pins: AiVisPin[], target: AiVisTarget): AiVisibility {
  // --- Which points count -----------------------------------------------------------------
  const done = pins.filter((p) => p.status === 'COMPLETED');
  const read: { pin: AiVisPin; parts: AiParts }[] = [];
  let unread = 0;
  const counted: AiVisPin[] = [];
  for (const p of done) {
    const ai = p.insights?.ai;
    const shown = ai ? ai.shown : Boolean(p.hasAiOverview);
    if (!shown) counted.push(p);
    else if (ai?.parts && typeof ai.parts === 'object') {
      read.push({ pin: p, parts: ai.parts });
      counted.push(p);
    } else unread++;
  }
  const N = counted.length;

  // --- Businesses: one per Google ID, joined by name and website otherwise ------------------
  const entities = new Map<string, Entity>();
  const byKgmid = new Map<string, string>(),
    byName = new Map<string, string>(),
    byDomain = new Map<string, string>();
  const targetKgmid = kgmidOf(target.kgmid);
  const targetDomain = rootDomain(target.domain ?? '');
  const targetName = normName(target.name);
  const make = (name: string, kgmid: string | null): Entity => {
    const e: Entity = { key: kgmid ? 'g:' + kgmid : 'n:' + normName(name) + ':' + entities.size, name: name.trim(), kgmid, domains: new Set(), you: false };
    entities.set(e.key, e);
    return e;
  };
  const you = make(target.name, targetKgmid || null);
  you.you = true;
  if (targetKgmid) byKgmid.set(targetKgmid, you.key);
  if (targetName) byName.set(targetName, you.key);
  if (targetDomain) {
    byDomain.set(targetDomain, you.key);
    you.domains.add(targetDomain);
  }
  /** The business a name (and Google ID) is. A different Google ID under a known name is another office. */
  const resolve = (name: string, rawKgmid?: string | null): Entity => {
    const kgmid = kgmidOf(rawKgmid);
    const n = normName(name);
    if (kgmid && byKgmid.has(kgmid)) return entities.get(byKgmid.get(kgmid)!)!;
    const named = n ? entities.get(byName.get(n) ?? '') : undefined;
    if (named && (!kgmid || !named.kgmid || named.kgmid === kgmid)) {
      if (kgmid && !named.kgmid) {
        named.kgmid = kgmid;
        byKgmid.set(kgmid, named.key);
      }
      return named;
    }
    const e = make(name, kgmid || null);
    if (kgmid) byKgmid.set(kgmid, e.key);
    if (n && !byName.has(n)) byName.set(n, e.key);
    return e;
  };
  for (const { parts } of read) {
    for (const b of parts.p0.brands) resolve(b.name, b.kgmid);
    for (const c of parts.cards) resolve(c.name, c.kgmid);
    for (const m of parts.mentions) resolve(m.name, m.kgmid);
  }
  // A business's own website: its card's Website button on the saved page first, then a site its
  // card cites that looks like its name, then any cited site that looks like exactly one business's
  // name. Others stay unattributed.
  const merchantSite = (s: string) => {
    const d = rootDomain(s);
    return d && !isGoogleSource(d) && !isDirectory(d) ? d : '';
  };
  /** The page's card for one of the answer's cards: the same name (or loosely the same). */
  const pageCard = (page: AiPage | null | undefined, name: string) =>
    page?.cards.find((c) => normName(c.name) === normName(name)) ?? page?.cards.find((c) => sameBusinessName(c.name, name)) ?? null;
  for (const { pin, parts } of read) {
    const page = pin.insights?.ai?.page;
    if (!page) continue;
    for (const c of parts.cards) {
      const site = pageCard(page, c.name)?.website;
      const d = site ? merchantSite(site) : '';
      if (!d || byDomain.has(d)) continue;
      const e = resolve(c.name, c.kgmid);
      byDomain.set(d, e.key);
      e.domains.add(d);
    }
  }
  for (const { parts } of read)
    for (const c of parts.cards) {
      const e = resolve(c.name, c.kgmid);
      for (const s of c.sites) {
        const d = merchantSite(s);
        if (d && !byDomain.has(d) && siteLooksLike(d, e.name)) {
          byDomain.set(d, e.key);
          e.domains.add(d);
        }
      }
    }
  const allSites = new Set<string>();
  for (const { parts } of read) for (const s of [...parts.p0.sites, ...parts.other, ...parts.cards.flatMap((c) => c.sites)]) allSites.add(merchantSite(s));
  allSites.delete('');
  for (const d of allSites) {
    if (byDomain.has(d)) continue;
    const owners = [...entities.values()].filter((e) => siteLooksLike(d, e.name));
    if (owners.length === 1) {
      byDomain.set(d, owners[0].key);
      owners[0].domains.add(d);
    }
  }
  const ownerOf = (s: string) => {
    const k = byDomain.get(rootDomain(s));
    return k ? entities.get(k)! : null;
  };

  // --- Scoring, point by point ----------------------------------------------------------------
  type Tally = { p0: number; card: number; web: number; p0First: boolean; p0Phone: boolean; cardSlot: number | null; cardAbove: boolean | null };
  const tallies = new Map<string, Map<string, Tally>>();
  const tally = (key: string, pinId: string): Tally => {
    let m = tallies.get(key);
    if (!m) tallies.set(key, (m = new Map()));
    let t = m.get(pinId);
    if (!t) m.set(pinId, (t = { p0: 0, card: 0, web: 0, p0First: false, p0Phone: false, cardSlot: null, cardAbove: null }));
    return t;
  };
  const sites = new Map<string, { domain: string; owner: Entity | null; pins: Set<string>; points: number }>();
  let foldPins = 0;
  const dirs = new Map<string, Set<string>>();
  const seeDirectory = (s: string, pinId: string) => {
    const d = rootDomain(s);
    if (!d || isGoogleSource(d) || !isDirectory(d)) return;
    if (!dirs.has(d)) dirs.set(d, new Set());
    dirs.get(d)!.add(pinId);
  };
  for (const { pin, parts } of read) {
    // 1. Position 0: the businesses the opening answer names, then the websites it cites.
    let order = 0;
    for (const b of parts.p0.brands) {
      const e = resolve(b.name, b.kgmid);
      order++;
      const t = tally(e.key, pin.id);
      // Every business read from the opening answer is linked to its Google profile (that is how it
      // is found), so the spec's 0.85 for an unlinked mention never applies here.
      t.p0 = Math.max(t.p0, P0_MAX * p0Decay(order));
      if (order === 1) t.p0First = true;
      if (b.phone) t.p0Phone = true;
    }
    for (const s of parts.p0.sites) {
      seeDirectory(s, pin.id);
      const owner = merchantSite(s) ? ownerOf(s) : null;
      if (!owner) continue;
      order++;
      const t = tally(owner.key, pin.id);
      t.p0 = Math.max(t.p0, P0_MAX * p0Decay(order));
      if (order === 1) t.p0First = true;
    }
    // 2. Business cards, in their order; 0.6 of that for a card the saved page shows behind "Show more".
    const page = pin.insights?.ai?.page;
    if (page?.cards.some((c) => c.above != null)) foldPins++;
    parts.cards.forEach((c, i) => {
      const e = resolve(c.name, c.kgmid);
      const t = tally(e.key, pin.id);
      const above = pageCard(page, c.name)?.above ?? null;
      const pts = CARD_MAX * cardDecay(i + 1) * (above === false ? 0.6 : 1);
      if (pts > t.card) {
        t.card = pts;
        t.cardAbove = above;
      }
      if (t.cardSlot == null || i + 1 < t.cardSlot) t.cardSlot = i + 1;
    });
    // 3. Websites cited elsewhere: in the answer's own text first, then inside other businesses' cards.
    const cited: { site: string; surface: number }[] = [
      ...parts.other.map((site) => ({ site, surface: 1 })),
      ...parts.cards.flatMap((c) => {
        const card = resolve(c.name, c.kgmid);
        return c.sites.filter((s) => ownerOf(s)?.key !== card.key).map((site) => ({ site, surface: 0.5 }));
      }),
    ];
    const seen = new Set<string>();
    let k = 0;
    for (const { site, surface } of cited) {
      seeDirectory(site, pin.id);
      const d = merchantSite(site);
      if (!d || seen.has(d)) continue;
      seen.add(d);
      k++;
      const owner = ownerOf(d);
      const pts = WEB_MAX * (k === 1 ? 1 : 0.6) * surface;
      const row = sites.get(d) ?? { domain: d, owner, pins: new Set<string>(), points: 0 };
      row.pins.add(pin.id);
      sites.set(d, row);
      if (!owner) continue;
      const t = tally(owner.key, pin.id);
      const before = t.web;
      t.web = Math.min(WEB_MAX, t.web + pts);
      row.points += t.web - before;
    }
    for (const s of parts.cards.flatMap((c) => c.sites)) seeDirectory(s, pin.id);
  }

  // --- Local results at each point, for "recommended beyond the local results" ----------------
  const localRank = new Map<string, Map<string, number>>(); // pin → business → place
  // A local listing's business: the same name, else the one business whose name it loosely matches.
  const listed = new Map<string, string | null>();
  // Words in three or more different businesses' names here (a city, a trade) identify none of them.
  const freq = new Map<string, number>();
  const names = new Set([...[...entities.values()].map((e) => normName(e.name)), ...counted.flatMap((p) => (p.topCompetitors ?? []).map(normName))]);
  for (const n of names) for (const w of new Set(n.split(' '))) freq.set(w, (freq.get(w) ?? 0) + 1);
  const common = new Set([...freq].filter(([, c]) => c >= 3).map(([w]) => w));
  // Two offices with one name: a local listing (names only) cannot say which one it is.
  const nameCount = new Map<string, number>();
  for (const e of entities.values()) nameCount.set(normName(e.name), (nameCount.get(normName(e.name)) ?? 0) + 1);
  const localKey = (n: string): string | null => {
    if (listed.has(n)) return listed.get(n)!;
    if ((nameCount.get(normName(n)) ?? 0) > 1) {
      listed.set(n, null);
      return null;
    }
    let k: string | null = byName.get(normName(n)) ?? null;
    // The same name or one starting with the other first; shared distinctive words only when that finds none.
    for (const loose of [false, true]) {
      if (k) break;
      for (const e of entities.values()) {
        const x = normName(e.name),
          y = normName(n);
        const hit = loose ? sameBusinessName(e.name, n, common) : x === y || (x.length >= 6 && y.startsWith(x + ' ')) || (y.length >= 6 && x.startsWith(y + ' '));
        if (!hit) continue;
        if (k && k !== e.key) {
          k = null;
          break;
        }
        k = e.key;
      }
    }
    listed.set(n, k);
    return k;
  };
  for (const p of counted) {
    const m = new Map<string, number>();
    (p.topCompetitors ?? []).slice(0, 10).forEach((n, i) => {
      const k = localKey(n);
      if (k && !m.has(k)) m.set(k, i + 1);
    });
    if (p.rankFound != null && p.rankFound <= 10) m.set(you.key, p.rankFound);
    localRank.set(p.id, m);
  }

  // --- Each business over the N points --------------------------------------------------------
  const rows: AiVisRow[] = [];
  let grand = 0;
  for (const e of entities.values()) {
    const m = tallies.get(e.key);
    if (!m && !e.you) continue;
    let sum = 0,
      sp0 = 0,
      scard = 0,
      sweb = 0,
      p0Pins = 0,
      p0First = 0,
      p0Phone = 0,
      cardPins = 0,
      cardFirst = 0,
      cardAbove = 0,
      cardBehind = 0,
      slotSum = 0,
      webPins = 0,
      aiPins = 0,
      beyond = 0,
      localPins = 0,
      localSum = 0,
      best = -1,
      bestPin: string | null = null;
    const values: number[] = [];
    const per: Record<string, number> = {};
    for (const p of counted) {
      const t = m?.get(p.id);
      const v = t ? Math.min(100, t.p0 + t.card + t.web) : 0;
      values.push(v);
      per[p.id] = round(v);
      sum += v;
      if (t) {
        sp0 += t.p0;
        scard += t.card;
        sweb += t.web;
        if (t.p0 > 0) p0Pins++;
        if (t.p0First) p0First++;
        if (t.p0Phone) p0Phone++;
        if (t.cardSlot != null) {
          cardPins++;
          slotSum += t.cardSlot;
          if (t.cardSlot === 1) cardFirst++;
          if (t.cardAbove === true) cardAbove++;
          if (t.cardAbove === false) cardBehind++;
        }
        if (t.web > 0) webPins++;
      }
      const lr = localRank.get(p.id)?.get(e.key);
      if (lr != null) {
        localPins++;
        localSum += lr;
      }
      if (t && (t.p0 > 0 || t.cardSlot != null)) {
        aiPins++;
        // Only where the point had a local list to compare with, and only for a name that list can tell apart.
        if (lr == null && (p.topCompetitors?.length ?? 0) > 0 && (nameCount.get(normName(e.name)) ?? 0) < 2) beyond++;
      }
      if (v > best) {
        best = v;
        bestPin = v > 0 ? p.id : bestPin;
      }
    }
    const mean = N ? sum / N : 0;
    const sd = N > 1 ? Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / (N - 1)) : 0;
    if (sum > 0) grand += sum;
    rows.push({
      key: e.key,
      name: e.name,
      you: e.you,
      kgmid: e.kgmid,
      domains: [...e.domains],
      score: round(mean, 1),
      p0: round(N ? sp0 / N : 0, 1),
      card: round(N ? scard / N : 0, 1),
      web: round(N ? sweb / N : 0, 1),
      moe: round(N ? (Z * sd) / Math.sqrt(N) : 0, 1),
      share: sum,
      p0Pins,
      p0First,
      p0Phone,
      cardPins,
      cardFirst,
      cardAvgSlot: cardPins ? round(slotSum / cardPins, 1) : null,
      cardAbove,
      cardBehind,
      webPins,
      aiPins,
      beyondLocal: beyond,
      localPins,
      localAvg: localPins ? round(localSum / localPins, 1) : null,
      bestPin,
      pins: per,
      twin: (nameCount.get(normName(e.name)) ?? 0) > 1,
    });
  }
  for (const r of rows) r.share = grand > 0 ? round(r.share / grand, 3) : 0;
  const scored = rows.filter((r) => r.score > 0 || r.p0Pins + r.cardPins + r.webPins > 0).sort((a, b) => b.score - a.score || b.p0 - a.p0 || b.card - a.card || a.name.localeCompare(b.name));
  const youRow = rows.find((r) => r.you)!;
  const websites: AiVisSite[] = [...sites.values()]
    .map((s) => ({ domain: s.domain, owner: s.owner?.name ?? null, ownerKey: s.owner?.key ?? null, pins: s.pins.size, points: round(N ? s.points / N : 0, 1) }))
    .sort((a, b) => b.pins - a.pins || b.points - a.points || a.domain.localeCompare(b.domain));
  const top = (f: (r: AiVisRow) => number) => scored.filter((r) => f(r) > 0).sort((a, b) => f(b) - f(a))[0] ?? null;
  return {
    points: N,
    unread,
    withAi: read.length,
    rows: scored,
    you: youRow,
    websites,
    directories: [...dirs.entries()].map(([domain, s]) => ({ domain, pins: s.size })).sort((a, b) => b.pins - a.pins || a.domain.localeCompare(b.domain)),
    leaders: { p0: top((r) => r.p0), card: top((r) => r.card), web: websites[0] ?? null },
    beyondLocal: scored.filter((r) => !r.you && r.beyondLocal >= 2).sort((a, b) => b.beyondLocal - a.beyondLocal || b.score - a.score),
    foldPins,
    foldMeasured: foldPins > 0,
  };
}
