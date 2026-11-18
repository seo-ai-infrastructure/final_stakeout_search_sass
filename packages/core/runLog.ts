/**
 * What the worker keeps about each search attempt, for the admin page: every rejected search
 * (with its video and bundle, so it can be watched) and where the time went in each attempt.
 * Pure rules, so the worker and the admin API agree and the rules can be unit-tested.
 */
import { percentile } from './fleetHealth';

/** Redis lists, newest first. */
export const REFUSED_KEY = 'stakeout:refused';
export const REFUSED_KEEP = 300;
export const TIMINGS_KEY = 'stakeout:timings';
export const TIMINGS_KEEP = 1000;

const clip = (s: unknown, n: number) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

/**
 * A short, stable name for why an attempt failed: the error code, plus what went wrong for the
 * template's own failures ("RPA_SURFACE_ERROR location_not_refreshed"), so the same problem on
 * different phones is recognised as one problem.
 */
export function failureKind(e: unknown): string {
  if (!(e instanceof Error)) return 'PIN_FAILED';
  if (e.name && e.name !== 'Error') return e.name;
  const [code = '', next = ''] = e.message.trim().split(/\s+/, 2);
  if (!code) return 'PIN_FAILED';
  if (/^RPA_(SURFACE_ERROR|TASK_FAILED)$/.test(code)) {
    const sub = next.replace(/[^\w-].*$/, '').slice(0, 32);
    return sub ? code + ' ' + sub : code;
  }
  return code;
}

/** Plain words for the admin page. */
export function kindLabel(kind: string): string {
  const k = kind.trim();
  const known: [RegExp, string][] = [
    [/^RPA_SURFACE_ERROR location_not_refreshed/, "Location not refreshed"],
    [/^RPA_SURFACE_ERROR no_scroll/, "Template didn't scroll the results"],
    [/^RPA_SURFACE_ERROR finder_not_opened/, 'The full list of businesses never opened'],
    [/^RPA_SURFACE_ERROR (surface_error|template)/, 'Template reported a wrong page'],
    [/^RPA_SURFACE_ERROR blocked/, 'Template reported being blocked'],
    [/^RPA_SURFACE_ERROR/, 'Template reported a problem'],
    [/^RPA_TASK_FAILED cancelled/, 'Template cancelled'],
    [/^RPA_TASK_FAILED/, 'A template step failed'],
    [/^RPA_TASK_TIMEOUT/, 'Template ran out of time'],
    [/^LOCATION_UNVERIFIED/, "Google's location line didn't match the point"],
    [/^WRONG_QUERY/, 'The page was for a different search'],
    [/^LOCATION_FROM_IP/, 'Google used the IP address, not the GPS'],
    [/^UNRECOGNIZED_RESULT_LAYOUT/, 'Results page not recognised'],
    [/^FLAG_CAPTCHA_DETECTED/, 'Captcha'],
    [/^FLAG_MAP_DRIFT_OR_CHALLENGE/, 'Map moved or a challenge appeared'],
    [/^EMPTY_VIDEO/, 'No video recorded'],
    [/^DEVICE_SCRIPT_FAILED/, 'Recorder script failed'],
    [/^DEVICE_BUNDLE_TIMEOUT/, 'Evidence never finished on the phone'],
  ];
  return known.find(([re]) => re.test(k))?.[1] ?? k;
}

/** Where a failed attempt's evidence was stored (R2 keys), carried on the error itself. */
export type Evidence = { video: string | null; bundle: string | null; locationPath: string | null; template: string | null };
export function withEvidence(e: unknown, ev: Evidence): unknown {
  if (e instanceof Error) Object.assign(e, { evidence: { ...ev } });
  return e;
}
export function evidenceOf(e: unknown): Evidence | null {
  const ev = e instanceof Error ? (e as Error & { evidence?: Evidence }).evidence : undefined;
  return ev && typeof ev === 'object' ? ev : null;
}

export type RefusedRun = {
  at: string;
  pinId: string;
  scanId: string;
  /** Grid cell, 1-based ("3,4"). */
  point: string;
  keyword: string;
  phone: string;
  model: string | null;
  attempt: number;
  kind: string;
  message: string;
  template: string | null;
  locationPath: string | null;
  video: string | null;
  bundle: string | null;
  seconds: number | null;
};

export function refusedRun(x: Omit<RefusedRun, 'at' | 'message' | 'keyword'> & { message: string; keyword: string; at?: Date }): RefusedRun {
  return {
    ...x,
    at: (x.at ?? new Date()).toISOString(),
    keyword: clip(x.keyword, 80),
    message: clip(x.message, 240),
    kind: clip(x.kind, 64),
  };
}

/** Parses a Redis list of JSON entries, skipping anything unreadable. */
export function parseEntries<T>(raw: (string | null | undefined)[]): T[] {
  const out: T[] = [];
  for (const r of raw) {
    if (!r) continue;
    try {
      out.push(JSON.parse(r) as T);
    } catch {
      /* skip */
    }
  }
  return out;
}

const tally = (xs: string[]) => {
  const m = new Map<string, number>();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1]);
};

/** Rejected searches since a moment: how many, and the commonest reasons and phones. */
export function refusedSummary(runs: RefusedRun[], sinceMs: number) {
  const recent = runs.filter((r) => Date.parse(r.at) >= sinceMs);
  return {
    total: recent.length,
    byKind: tally(recent.map((r) => r.kind)).map(([kind, n]) => ({ kind, n })),
    byPhone: tally(recent.map((r) => r.phone)).map(([phone, n]) => ({ phone, n })),
    byTemplate: tally(recent.map((r) => r.template ?? '?')).map(([template, n]) => ({ template, n })),
  };
}

// ---------------------------------------------------------------------------
// Timings
// ---------------------------------------------------------------------------

/** Moments in one attempt (epoch ms), in the order they happen. */
export type Marks = Partial<Record<'proxy' | 'warmup' | 'added' | 'started' | 'templateDone' | 'bundle' | 'released' | 'stored' | 'saved', number>>;

export const STAGES = ['proxy', 'warmup', 'setup', 'queue', 'template', 'evidence', 'transfer', 'finish'] as const;
export type Stage = (typeof STAGES)[number];
export const STAGE_LABEL: Record<Stage, string> = {
  proxy: 'Proxy',
  warmup: 'Warm-up',
  setup: 'Setup',
  queue: 'DuoPlus start',
  template: 'Template',
  evidence: 'Evidence',
  transfer: 'Pull + store',
  finish: 'Checks + save',
};

const secs = (a: number | undefined, b: number | undefined) => (a === undefined || b === undefined ? null : Math.max(0, Math.round((a - b) / 100) / 10));

/**
 * Seconds per stage of one attempt (null for a stage it never reached):
 * proxy (lease → proxy ready), warm-up (first search after power-on), setup (recorder, template
 * lookup, task added), DuoPlus start (task added → running), template (running → done), evidence
 * (done → bundle ready on the phone), pull + store (→ bundle in R2), checks + save (→ result saved).
 */
export type StageSeconds = Record<Stage, number | null> & { total: number; phoneHeld: number | null };
export function stageSeconds(start: number, m: Marks, end: number): StageSeconds {
  const ready = m.warmup ?? m.proxy;
  return {
    proxy: secs(m.proxy, start),
    warmup: secs(m.warmup, m.proxy),
    setup: secs(m.added, ready),
    queue: secs(m.started, m.added),
    template: secs(m.templateDone, m.started ?? m.added),
    evidence: secs(m.bundle, m.templateDone),
    transfer: secs(m.stored, m.bundle),
    finish: secs(m.saved, m.stored),
    total: secs(end, start) ?? 0,
    phoneHeld: secs(m.released ?? end, start),
  };
}

export type RunTiming = StageSeconds & { at: string; pinId: string; phone: string; ok: boolean; kind: string | null; searched: boolean };

/** The commonest numbers for the admin page: medians of the attempts that succeeded, and the time failures cost. */
export function timingSummary(entries: RunTiming[], sinceMs: number) {
  const recent = entries.filter((t) => Date.parse(t.at) >= sinceMs);
  const ok = recent.filter((t) => t.ok);
  const median = (pick: (t: RunTiming) => number | null) => {
    const v = ok.map(pick).filter((x): x is number => typeof x === 'number');
    return v.length ? percentile(v, 50) : null;
  };
  const lost = (pred: (t: RunTiming) => boolean) => Math.round(recent.filter((t) => !t.ok && pred(t)).reduce((s, t) => s + (t.phoneHeld ?? t.total), 0) / 60);
  return {
    attempts: recent.length,
    succeeded: ok.length,
    failedSearches: recent.filter((t) => !t.ok && t.searched).length,
    failedSetups: recent.filter((t) => !t.ok && !t.searched).length,
    /** Phone-minutes spent on attempts that produced no result. */
    lostMinutesSearches: lost((t) => t.searched),
    lostMinutesSetups: lost((t) => !t.searched),
    median: Object.fromEntries([...STAGES, 'total', 'phoneHeld'].map((k) => [k, median((t) => t[k as Stage | 'total' | 'phoneHeld'])])) as Record<Stage | 'total' | 'phoneHeld', number | null>,
  };
}

/** One log line per attempt: "proxy 22s · DuoPlus start 9s · template 301s …". */
export function timingLine(t: StageSeconds) {
  const parts = STAGES.filter((s) => t[s] !== null).map((s) => STAGE_LABEL[s].toLowerCase() + ' ' + t[s] + 's');
  return parts.join(' · ') + ' · total ' + t.total + 's' + (t.phoneHeld !== null && t.phoneHeld < t.total ? ' (phone free after ' + t.phoneHeld + 's)' : '');
}

// ---------------------------------------------------------------------------
// Location refresh: which way each phone's Chrome lets the template refresh Google's location
// ---------------------------------------------------------------------------

/** The refresh path(s) the template recorded (template v3.42+: "footer", "precise", "top", …), from meta.txt. */
export function locationPathOf(meta: string): string | null {
  const m = /^location_path=([a-z_,]+)\s*$/m.exec(meta);
  return m ? m[1] : null;
}

/** Where the worker remembers each phone's recent location refreshes (JSON: { runs, at }). */
export const locationKey = (imageId: string) => 'stakeout:locpath:' + imageId;

/** One finished run on a phone: did the warm-up find Google's footer "Update location", and was the hunt skipped. */
export type LocationRun = { footer: boolean; skipped: boolean };
export const LOCATION_RUNS_KEPT = 12;
/** The variable value that makes template v3.42 skip the footer hunt (a class every Android screen has), and one that never matches. */
export const SKIP_FOOTER_HUNT = 'android.widget.FrameLayout';
export const HUNT_FOOTER = 'stakeout.NoFooterSkip';

/**
 * Whether the next run on a phone should skip the warm-up's hunt for the footer "Update location"
 * and go straight to the backup (Use precise location). Some phones' Chrome scrolls the results
 * endlessly, so the footer is never reached and the hunt only costs time. Skipped after two runs in
 * a row that hunted and missed it; every `probeEvery` skipped runs one run hunts again, so a phone
 * whose Chrome changes back is noticed. A footer found at any time ends skipping.
 */
export function skipFooterHunt(runs: LocationRun[], probeEvery = 6): { skip: boolean; probe: boolean } {
  let misses = 0;
  let skippedSince = 0;
  for (let i = runs.length - 1; i >= 0 && misses < 2; i--) {
    const r = runs[i];
    if (r.footer) return { skip: false, probe: false };
    if (r.skipped) {
      if (misses === 0) skippedSince++;
      continue;
    }
    misses++;
  }
  if (misses < 2) return { skip: false, probe: false };
  if (skippedSince >= probeEvery) return { skip: false, probe: true };
  return { skip: true, probe: false };
}

export function nextLocationRuns(previous: LocationRun[], run: LocationRun) {
  return [...previous, run].slice(-LOCATION_RUNS_KEPT);
}
