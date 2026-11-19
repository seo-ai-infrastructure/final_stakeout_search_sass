import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/api';
import { getAuthenticatedUser } from '@/lib/auth';
import { agentGate } from '@/lib/gbpAccess';
import { google, googleAccess } from '@/lib/googleOAuth';

const bare = (w: string) => w.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');

/**
 * GET /api/admin/google/sites: the websites the connected Google login has in Search Console, each
 * as an address the insights panels can be pointed at. Free: it goes through our own Google app.
 */
export async function GET() {
  try {
    const u = await getAuthenticatedUser();
    await agentGate(u);
    const token = await googleAccess(u.id);
    const r = await google<{ siteEntry?: { siteUrl: string; permissionLevel?: string }[] }>(token, 'https://www.googleapis.com/webmasters/v3/sites');
    const seen = new Set<string>();
    const sites = (r.siteEntry ?? [])
      .filter((s) => s.permissionLevel !== 'siteUnverifiedUser')
      .map((s) => (s.siteUrl.startsWith('sc-domain:') ? 'https://' + s.siteUrl.slice(10) + '/' : s.siteUrl))
      .filter((w) => /^https?:\/\//.test(w))
      // A site held both as a domain and as an address shows once.
      .filter((w) => (seen.has(bare(w)) ? false : (seen.add(bare(w)), true)))
      .sort((a, b) => bare(a).localeCompare(bare(b)));
    return NextResponse.json({ sites });
  } catch (e) {
    return errorResponse(e);
  }
}
