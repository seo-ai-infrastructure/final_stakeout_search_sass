import { randomBytes } from 'node:crypto';
import { db } from '@stakeout/db';
import { InputError } from '@stakeout/core/grid';
import { redis } from '@stakeout/core/redis';
import { visibilityForScan } from '@/lib/visibilityReport';
import { assumptionsKey, buildBrief, cleanAssumptions, defaultsFor } from '@/lib/brief';

/**
 * Compiled briefs: the live brief (/reports/brief.html?scan=…) recalculates every time it opens; a
 * compiled one is the brief as it stood when compiled, kept with its own assumptions and share link,
 * so the agency, the client and anyone they forward it to read the same numbers. Each compile is a
 * row, which is what counts against a plan's briefs. Until the plans with brief allowances are live,
 * only admins compile.
 */
type Me = { id: string; role: string };
type Built = Awaited<ReturnType<typeof buildBrief>>;

export const canCompile = (me: Me) => me.role === 'ADMIN';

const shareUrl = (token: string) => '/reports/brief.html?b=' + encodeURIComponent(token);

async function mine(id: string, me: Me) {
  const row = await db.brief.findUnique({ where: { id } });
  if (!row || (row.userId !== me.id && me.role !== 'ADMIN')) throw new InputError('Brief not found.', 404);
  return row;
}

/** What the page needs: the brief as compiled, with the inputs in force now. */
function view(row: { id: string; scanId: string; createdAt: Date; data: unknown; assumptions: unknown; shareToken: string | null }, report: string | null, canEdit: boolean) {
  const data = row.data as Built;
  const base = (data.assumptions as { base?: Record<string, unknown> } | undefined)?.base ?? {};
  const own = row.assumptions as Record<string, unknown> | null;
  return {
    ...data,
    assumptions: own ? { ...own, sample: false, base } : { ...base, sample: true, base },
    link: { ...data.link, report },
    compiled: { id: row.id, at: row.createdAt.toISOString(), scan: row.scanId, share: canEdit && row.shareToken ? shareUrl(row.shareToken) : null },
    canEdit,
    canCompile: false,
  };
}

/** Compiles the brief for a scan: built now (a first look-up of local prices may be paid for), then kept as it is. */
export async function compileBrief(scanId: string, me: Me) {
  if (!canCompile(me)) throw new InputError('Compiling a brief comes with the new plans.', 403);
  const s = await db.gridScan.findUnique({ where: { id: scanId }, select: { userId: true, targetBusiness: true } });
  if (!s || (s.userId !== me.id && me.role !== 'ADMIN')) throw new InputError('Scan not found.', 404);
  const v = await visibilityForScan(scanId, me);
  const kept = await redis().get(assumptionsKey(s.userId, s.targetBusiness)).catch(() => null);
  const own = kept ? (JSON.parse(kept) as Record<string, unknown>) : null;
  const brief = await buildBrief(v, { lookUp: true, assumptions: own, link: { report: '/reports/visibility.html?scan=' + encodeURIComponent(scanId) } });
  const row = await db.brief.create({ data: { userId: s.userId, scanId, business: s.targetBusiness, version: brief.version, data: JSON.parse(JSON.stringify(brief)), ...(own ? { assumptions: JSON.parse(JSON.stringify(own)) } : {}) } });
  return { id: row.id };
}

export async function briefFor(id: string, me: Me) {
  const row = await mine(id, me);
  return view(row, '/reports/visibility.html?scan=' + encodeURIComponent(row.scanId), true);
}

/** A compiled brief by its share link: read-only, and its receipts link only when the scan is shared too. */
export async function briefByToken(token: string) {
  if (!/^[a-f0-9]{48}$/.test(token)) throw new InputError('Brief unavailable.', 404);
  const row = await db.brief.findUnique({ where: { shareToken: token } });
  if (!row) throw new InputError('Brief unavailable.', 404);
  const scan = await db.gridScan.findUnique({ where: { id: row.scanId }, select: { shareToken: true } });
  return view(row, scan?.shareToken ? '/reports/visibility.html?share=' + encodeURIComponent(scan.shareToken) : null, false);
}

/** { assumptions } or { reset: true }: the inputs for this brief's modeled figures. { share: true | false }: its share link. */
export async function updateBrief(id: string, me: Me, body: { assumptions?: unknown; reset?: unknown; share?: unknown }) {
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
