import { brandLogo } from '@stakeout/core/brands';
import { cleanDomain, hostOf, isPrimaryHost } from '@stakeout/core/brandHost';

export const dynamic = 'force-dynamic';

/** A white-label logo. On a customer's domain it is that domain's; on ours, the one named in ?d=. */
export async function GET(req: Request) {
  const host = hostOf(req.headers);
  const domain = host && !isPrimaryHost(host) ? host : cleanDomain(new URL(req.url).searchParams.get('d'));
  const logo = domain ? await brandLogo(domain) : null;
  if (!logo) return new Response('Not found', { status: 404 });
  return new Response(new Uint8Array(logo.data), {
    headers: { 'content-type': logo.type, 'cache-control': 'public, max-age=3600', 'x-content-type-options': 'nosniff' },
  });
}
