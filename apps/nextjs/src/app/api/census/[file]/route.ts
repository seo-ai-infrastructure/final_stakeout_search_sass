import { GetObjectCommand } from '@aws-sdk/client-s3';
import { r2, bucket } from '@stakeout/core/r2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/census/acs2024.pmtiles: byte ranges of the yearly Census map-tile file
 * (tools/census/build.py), read from the private R2 bucket. The map's PMTiles reader asks
 * for small ranges only; a request without a range is refused so the whole file
 * (hundreds of MB) is never sent in one go. The data is public Census data.
 */
export async function GET(req: Request, c: { params: Promise<{ file: string }> }) {
  const { file } = await c.params;
  const match = /^(acs\d{4})\.pmtiles$/.exec(file);
  if (!match) return new Response('Not found', { status: 404 });
  const range = req.headers.get('range') ?? '';
  const parts = /^bytes=(\d+)-(\d+)$/.exec(range);
  if (!parts || Number(parts[2]) < Number(parts[1]) || Number(parts[2]) - Number(parts[1]) > 16 * 1024 * 1024)
    return new Response('Send a byte range (at most 16 MB)', { status: 416 });
  try {
    const o = await r2().send(
      new GetObjectCommand({ Bucket: bucket, Key: `census/${match[1]}/census.pmtiles`, Range: range }),
    );
    const headers = new Headers({
      'Content-Type': 'application/octet-stream',
      'Accept-Ranges': 'bytes',
      // Browser cache only: shared caches must not reuse one byte range for another.
      'Cache-Control': 'private, max-age=86400',
    });
    if (o.ContentRange) headers.set('Content-Range', o.ContentRange);
    if (o.ContentLength != null) headers.set('Content-Length', String(o.ContentLength));
    if (o.ETag) headers.set('ETag', o.ETag);
    return new Response(o.Body!.transformToWebStream(), { status: 206, headers });
  } catch (e: any) {
    const code = e?.$metadata?.httpStatusCode;
    if (code === 404 || e?.name === 'NoSuchKey') return new Response('Census tiles not built yet', { status: 404 });
    if (code === 416) return new Response('Range not satisfiable', { status: 416 });
    console.error('[census tiles]', e?.name, e?.message);
    return new Response('Census tiles unavailable', { status: 502 });
  }
}
