import { protectedResource } from '@stakeout/core/oauth';
import { notHere, originOf, preflight, reply } from '@/lib/oauthHttp';

export const dynamic = 'force-dynamic';

/**
 * GET /.well-known/oauth-protected-resource (and …/api/mcp): what the MCP server protects and
 * which server signs apps in to it (RFC 9728). An app reads this after its first 401.
 */
export function GET(req: Request) {
  const origin = originOf(req);
  return origin ? reply(protectedResource(origin), 200, { 'Cache-Control': 'public, max-age=300' }) : notHere();
}
export const OPTIONS = preflight;
