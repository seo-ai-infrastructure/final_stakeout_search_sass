import { db } from '@stakeout/db';
import { hostOf } from '@stakeout/core/brandHost';
import { brandForEmbed } from '@/lib/brandShare';
import { embedScan } from '@/lib/embeds';
import { embedPage, embedReport, embedTop, esc } from '@/lib/embedHtml';

export const dynamic = 'force-dynamic';

/**
 * A live report embed (Agency and up): the newest finished scan of one business, keyword and grid,
 * made to sit in an iframe on any site. Under the account's white label while its plan includes it;
 * otherwise with our "Verified on real phones" badge, so a move down to Scout never breaks one.
 * ?theme=dark for dark pages.
 */
const SITE = () => (process.env.APP_URL || 'https://stakeoutsearch.com').replace(/\/$/, '');
const GONE = '<p class="note">This report is not available.</p>';

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const dark = new URL(req.url).searchParams.get('theme') === 'dark';
  const token = (await params).token;
  const e = /^[A-Za-z0-9_-]{10,64}$/.test(token) ? await db.reportEmbed.findUnique({ where: { token } }) : null;
  if (!e) return embedPage(404, GONE, dark);
  const { allowed, brand, custom } = await brandForEmbed(e.userId, hostOf(req.headers));
  if (!allowed) return embedPage(404, GONE, dark);
  if (e.revokedAt) return embedPage(410, `${embedTop(brand)}<p class="note">This live report was turned off.</p>`, dark);
  const scanId = await embedScan(e);
  if (!scanId) return embedPage(200, `${embedTop(brand)}<h1>${esc(e.business)}</h1><p class="sub">“${esc(e.keyword)}”</p><p class="note">The first scan is still running. This report fills in when it finishes.</p>`, dark, e.business);
  const [s, pins] = await Promise.all([
    db.gridScan.findUnique({ where: { id: scanId }, select: { targetBusiness: true, keyword: true, gridSize: true, completedAt: true, arp: true, solv: true, city: true, stateCode: true, shareToken: true } }),
    db.gridPin.findMany({ where: { scanId }, select: { rowIdx: true, colIdx: true, rankFound: true, status: true, targetCitedInAi: true } }),
  ]);
  if (!s) return embedPage(404, GONE, dark);
  // The full report opens where the embed is served; on a customer's domain without the white label
  // in force (the plan moved down), on our address, where it still opens.
  const report = s.shareToken ? `${custom && !brand ? SITE() : ''}/share/${s.shareToken}` : null;
  return embedPage(200, embedReport(s, pins, brand, report), dark, s.targetBusiness + ': ' + s.keyword);
}
