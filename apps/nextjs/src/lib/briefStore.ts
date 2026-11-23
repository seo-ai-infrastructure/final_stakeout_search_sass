import { randomBytes } from 'node:crypto';
import { db } from '@stakeout/db';
import { InputError } from '@stakeout/core/grid';
import { redis } from '@stakeout/core/redis';
import { visibilityForScan } from '@/lib/visibilityReport';
import { assumptionsKey, buildBrief, cleanAssumptions, defaultsFor } from '@/lib/brief';
import { briefSource, briefsLeft, type BriefSource } from '@stakeout/core/briefWallet';
import { getSettings, newPlansFor } from '@stakeout/core/settings';

/**
 * Compiled briefs: the live brief (/reports/brief.html?scan=…) recalculates every time it opens; a
 * compiled one is the brief as it stood when compiled, kept with its own assumptions and share link,
 * so the agency, the client and anyone they forward it to read the same numbers. It never
 * recalculates on opening: it changes only when it is updated, which rebuilds it from the newest scan
 * and today's prices under the same link. Compiling and updating each use one brief credit (an
 * admin's are free). An account sold the account plans compiles instead of seeing the live brief; one
 * still before them sees the live brief, as before.
 */
type Me = { id: string; role: string; email?: string };
type Built = Awaited<ReturnType<typeof buildBrief>>;
const PAYING = ['active', 'trialing', 'past_due'];

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

/** Spends one brief credit: last month's plan credits first, then this month's, then bought ones (an admin's are free). */
async function spend(tx: Tx, me: Me): Promise<BriefSource | 'admin'> {
  if (me.role === 'ADMIN') return 'admin';
  const [sub, user] = await Promise.all([tx.gbpSub.findUnique({ where: { userId: me.id } }), tx.user.findUnique({ where: { id: me.id }, select: { briefBalance: true } })]);
  const src = briefSource({ plan: sub?.briefPlan ?? 0, carry: sub?.briefCarry ?? 0, bought: user?.briefBalance ?? 0, paying: Boolean(sub?.subscriptionId) && PAYING.includes(sub?.status ?? '') });
  if (!src) throw new InputError(NO_CREDITS, 402);
  const used =
    src === 'carry' ? await tx.gbpSub.updateMany({ where: { userId: me.id, briefCarry: { gt: 0 } }, data: { briefCarry: { decrement: 1 } } })
    : src === 'plan' ? await tx.gbpSub.updateMany({ where: { userId: me.id, briefPlan: { gt: 0 } }, data: { briefPlan: { decrement: 1 } } })
    : await tx.user.updateMany({ where: { id: me.id, briefBalance: { gt: 0 } }, data: { briefBalance: { decrement: 1 } } });
  if (!used.count) throw new InputError('That brief credit was just used. Try again.', 409);
  return src;
}

const NO_CREDITS = 'No brief credits left. Buy one, or move to a plan with more brief credits a month.';
/** A second click on Compile or Update within this long is the same request: no second build, no second credit. */
const SAME_REQUEST_MS = 2 * 60_000;

/** Before any paid price lookup: an account with no brief credit left stops here (an admin's are free). */
async function needsCredit(me: Me) {
  if (me.role !== 'ADMIN' && (await walletOf(me.id)).left < 1) throw new InputError(NO_CREDITS, 402);
}

/**
 * One build at a time for a scan or a brief: a second click while the first is building gets a 409
 * rather than a second price lookup. Lets go when the build ends. If Redis can't be reached the
 * build goes on; the row lock in the save still keeps it to one credit.
 */
async function oneAtATime<T>(key: string, busy: string, run: () => Promise<T>): Promise<T> {
  const k = 'stakeout:brief:busy:' + key;
  const got = await redis().set(k, '1', 'EX', 120, 'NX').catch(() => 'OK');
  if (got !== 'OK') throw new InputError(busy, 409);
  try {
    return await run();
  } finally {
    await redis().del(k).catch(() => null);
  }
}

/** Whether this person sees the live brief with a Compile button (admins) rather than compiling first. */
export const canCompile = (me: Me) => me.role === 'ADMIN';

/** The briefs an account can compile now, by kind. */
export async function walletOf(userId: string) {
  const [sub, user] = await Promise.all([db.gbpSub.findUnique({ where: { userId } }), db.user.findUnique({ where: { id: userId }, select: { briefBalance: true } })]);
  const paying = Boolean(sub?.subscriptionId) && PAYING.includes(sub?.status ?? '');
  const w = { plan: sub?.briefPlan ?? 0, carry: sub?.briefCarry ?? 0, bought: user?.briefBalance ?? 0, paying };
  return { ...w, left: briefsLeft(w) };
}

/** Whether this account compiles briefs (the account plans) instead of reading the live one. */
export async function compilesBriefs(me: Me) {
  return me.role !== 'ADMIN' && newPlansFor(me, await getSettings());
}

/** For an account that compiles: what the live brief's address shows instead, a prompt to compile and the briefs already compiled. */
export async function compilePrompt(scanId: string, me: Me) {
  const s = await db.gridScan.findUnique({ where: { id: scanId }, select: { userId: true, targetBusiness: true, keyword: true } });
  if (!s || (s.userId !== me.id && me.role !== 'ADMIN')) throw new InputError('Scan not found.', 404);
  const [wallet, done] = await Promise.all([walletOf(me.id), db.brief.findMany({ where: { userId: s.userId, business: s.targetBusiness }, orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, createdAt: true, scanId: true } })]);
  return { needsCompile: true, business: s.targetBusiness, keyword: s.keyword, wallet, compiled: done.map((d) => ({ id: d.id, at: d.createdAt.toISOString(), thisScan: d.scanId === scanId })) };
}

const shareUrl = (token: string) => '/reports/brief.html?b=' + encodeURIComponent(token);

async function mine(id: string, me: Me) {
  const row = await db.brief.findUnique({ where: { id } });
  if (!row || (row.userId !== me.id && me.role !== 'ADMIN')) throw new InputError('Brief not found.', 404);
  return row;
}

/** What the page needs: the brief as compiled, with the inputs in force now. */
function view(row: { id: string; scanId: string; createdAt: Date; data: unknown; assumptions: unknown; shareToken: string | null }, report: string | null, canEdit: boolean, owner?: { admin: boolean; next: { id: string; at: string; keyword: string } | null; left: number }) {
  const data = row.data as Built & { updatedAt?: string };
  const base = (data.assumptions as { base?: Record<string, unknown> } | undefined)?.base ?? {};
  const own = row.assumptions as Record<string, unknown> | null;
  return {
    ...data,
    assumptions: own ? { ...own, sample: false, base } : { ...base, sample: true, base },
    link: { ...data.link, report },
    compiled: { id: row.id, at: row.createdAt.toISOString(), updated: data.updatedAt ?? null, scan: row.scanId, share: canEdit && row.shareToken ? shareUrl(row.shareToken) : null, ...(owner ? { admin: owner.admin, next: owner.next, left: owner.left } : {}) },
    canEdit,
    canCompile: false,
  };
}

/** Compiles the brief for a scan: built now (a first look-up of local prices may be paid for), then kept as it is. */
export async function compileBrief(scanId: string, me: Me) {
  if (!canCompile(me) && !(await compilesBriefs(me))) throw new InputError('Compiling a brief comes with the new plans.', 403);
  const s = await db.gridScan.findUnique({ where: { id: scanId }, select: { userId: true, targetBusiness: true } });
  if (!s || (s.userId !== me.id && me.role !== 'ADMIN')) throw new InputError('Scan not found.', 404);
  // No credit, no paid lookup.
  await needsCredit(me);
  return oneAtATime('scan:' + scanId, 'This brief is already being compiled. It opens when it’s ready.', async () => {
    const v = await visibilityForScan(scanId, me);
    const kept = await redis().get(assumptionsKey(s.userId, s.targetBusiness)).catch(() => null);
    const own = kept ? (JSON.parse(kept) as Record<string, unknown>) : null;
    // Built before any credit is spent: if the market prices can't be had, it stops here (PricingUnavailable) and nothing is used.
    const brief = await buildBrief(v, { lookUp: true, strict: true, assumptions: own, link: { report: '/reports/visibility.html?scan=' + encodeURIComponent(scanId) } });
    // The credit and the brief together, or neither. The scan's row is locked while saving, so two
    // saves for one scan run one after the other, and the second finds the first's brief.
    const row = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "GridScan" WHERE id = ${scanId} FOR UPDATE`;
      const just = await tx.brief.findFirst({ where: { userId: s.userId, scanId, createdAt: { gte: new Date(Date.now() - SAME_REQUEST_MS) } }, orderBy: { createdAt: 'desc' }, select: { id: true } });
      if (just) return just;
      const paidBy = await spend(tx, me);
      return tx.brief.create({ data: { userId: s.userId, scanId, business: s.targetBusiness, version: brief.version, paidBy, data: JSON.parse(JSON.stringify(brief)), ...(own ? { assumptions: JSON.parse(JSON.stringify(own)) } : {}) } });
    });
    return { id: row.id };
  });
}

/** The scan an update would rebuild from: the newest finished scan of the same business and search, else the brief's own. */
async function newestFor(row: { userId: string; scanId: string; business: string }) {
  const cur = await db.gridScan.findUnique({ where: { id: row.scanId }, select: { id: true, keyword: true, createdAt: true } });
  const next = cur
    ? await db.gridScan.findFirst({
        where: { userId: row.userId, targetBusiness: { equals: row.business, mode: 'insensitive' }, keyword: { equals: cur.keyword, mode: 'insensitive' }, status: { in: ['COMPLETED', 'PARTIAL'] }, completedPins: { gt: 0 }, createdAt: { gte: cur.createdAt } },
        orderBy: { createdAt: 'desc' },
        select: { id: true, keyword: true, createdAt: true },
      })
    : null;
  const s = next ?? cur;
  return s ? { id: s.id, at: s.createdAt.toISOString(), keyword: s.keyword } : null;
}

export async function briefFor(id: string, me: Me) {
  const row = await mine(id, me);
  const [next, wallet] = await Promise.all([newestFor(row), me.role === 'ADMIN' ? null : walletOf(me.id)]);
  return view(row, '/reports/visibility.html?scan=' + encodeURIComponent(row.scanId), true, { admin: me.role === 'ADMIN', next, left: wallet?.left ?? 0 });
}

/**
 * Updates a compiled brief: rebuilt from the newest scan of its search (or the scan named, a finished
 * scan of the same business), with today's prices and its own inputs, under the same id and share
 * link. Uses one brief credit. Opening a brief never does this.
 */
export async function refreshBrief(id: string, me: Me, scanId?: unknown) {
  const row = await mine(id, me);
  if (!canCompile(me) && !(await compilesBriefs(me))) throw new InputError('Updating a brief comes with the new plans.', 403);
  let target: string | null = null;
  if (typeof scanId === 'string' && scanId) {
    const s = await db.gridScan.findFirst({ where: { id: scanId, userId: row.userId, targetBusiness: { equals: row.business, mode: 'insensitive' }, status: { in: ['COMPLETED', 'PARTIAL'] }, completedPins: { gt: 0 } }, select: { id: true } });
    if (!s) throw new InputError('That scan can’t update this brief: it must be a finished scan of the same business.', 400);
    target = s.id;
  } else target = (await newestFor(row))?.id ?? null;
  if (!target) throw new InputError('This brief’s scan is no longer available, so it can’t be updated.', 409);
  // No credit, no paid lookup.
  await needsCredit(me);
  const scan = target;
  return oneAtATime('brief:' + id, 'This brief is already being updated. Reload in a moment.', () => rebuild(row, me, scan));
}

async function rebuild(row: Awaited<ReturnType<typeof mine>>, me: Me, target: string) {
  const id = row.id;
  // The owner's own scans (an admin reads them as an admin).
  const v = await visibilityForScan(target, me);
  const kept = row.assumptions ?? (await redis().get(assumptionsKey(row.userId, row.business)).then((x) => (x ? JSON.parse(x) : null)).catch(() => null));
  // As with compiling: no prices, no update, no credit used.
  const brief = await buildBrief(v, { lookUp: true, strict: true, assumptions: kept, link: { report: '/reports/visibility.html?scan=' + encodeURIComponent(target) } });
  const at = new Date().toISOString();
  // The credit and the update together, or neither; the brief's row is locked while saving, so a
  // second save of the same update a moment later finds it done and spends nothing.
  const done = await db.$transaction(async (tx) => {
    const [cur] = await tx.$queryRaw<{ scan_id: string; data: unknown }[]>`SELECT scan_id, data FROM briefs WHERE id = ${id} FOR UPDATE`;
    const was = (cur?.data as { updatedAt?: string } | null)?.updatedAt;
    if (cur && cur.scan_id === target && was && Date.now() - Date.parse(was) < SAME_REQUEST_MS) return was;
    await spend(tx, me);
    await tx.brief.update({ where: { id }, data: { scanId: target, version: brief.version, data: JSON.parse(JSON.stringify({ ...brief, updatedAt: at })) } });
    return at;
  });
  return { id, updated: done };
}

/** A compiled brief by its share link: read-only, and its receipts link only when the scan is shared too. */
export async function briefByToken(token: string) {
  if (!/^[a-f0-9]{48}$/.test(token)) throw new InputError('Brief unavailable.', 404);
  const row = await db.brief.findUnique({ where: { shareToken: token } });
  if (!row) throw new InputError('Brief unavailable.', 404);
  const scan = await db.gridScan.findUnique({ where: { id: row.scanId }, select: { shareToken: true } });
  return view(row, scan?.shareToken ? '/reports/visibility.html?share=' + encodeURIComponent(scan.shareToken) : null, false);
}

/**
 * { assumptions } or { reset: true }: the inputs for this brief's modeled figures. { share: true | false }: its share link.
 * { refresh: true, scanId? }: rebuild it from the newest scan (one brief credit).
 */
export async function updateBrief(id: string, me: Me, body: { assumptions?: unknown; reset?: unknown; share?: unknown; refresh?: unknown; scanId?: unknown }) {
  if (body.refresh === true) return refreshBrief(id, me, body.scanId);
  const row = await mine(id, me);
  if (body.share === true) {
    const token = row.shareToken ?? randomBytes(24).toString('hex');
    if (!row.shareToken) await db.brief.update({ where: { id }, data: { shareToken: token } });
    return { share: shareUrl(token) };
  }
  if (body.share === false) {
    await db.brief.update({ where: { id }, data: { shareToken: null } });
    return { share: null };
  }
  if (body.reset === true) {
    await db.$executeRaw`UPDATE "briefs" SET "assumptions" = NULL, "updated_at" = NOW() WHERE "id" = ${id}`;
    return { assumptions: null };
  }
  const kws = ((row.data as Built).searches ?? []).map((s) => s.kw);
  const a = cleanAssumptions(body.assumptions, defaultsFor(kws));
  await db.brief.update({ where: { id }, data: { assumptions: JSON.parse(JSON.stringify(a)) } });
  return { assumptions: a };
}
