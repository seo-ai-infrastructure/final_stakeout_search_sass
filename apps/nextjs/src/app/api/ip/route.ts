/**
 * "Which address do you come from?" Asked by our own phones after they are moved to their idle
 * proxies, to make sure they really left the paid one. A few bytes, no database, nothing stored,
 * and no outside service whose limits we could run into.
 */
export const dynamic = 'force-dynamic';

export function GET(req: Request) {
  const h = req.headers;
  const ip = (h.get('x-real-ip') || (h.get('x-forwarded-for') ?? '').split(',')[0] || '').trim();
  const asn = (h.get('x-vercel-ip-as-number') ?? '').trim();
  return new Response(JSON.stringify(asn ? { ip, asn } : { ip }), {
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
