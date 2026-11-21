import { db } from '@stakeout/db';
import { getAuthenticatedUser, readScope } from '@/lib/auth';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { bucket, r2, signedRead } from '@stakeout/core/r2';
import { customerReceipt } from '@/lib/receipt';
import { InputError } from '@stakeout/core/grid';
import { errorResponse } from '@/lib/api';
import { gunzipSync } from 'node:zlib';

export const runtime = 'nodejs';

/** The two files the AI Overview watch keeps next to a point's video (admins only): the capture
 * built from the page, and the full read of the page it was built from. */
const AIO_FILES = { aio: 'aio-capture.json.gz', 'aio-read': 'aio-sources.json.gz' } as const;

export async function GET(
  req: Request,
  c: { params: Promise<{ pinId: string }> },
) {
  try {
    const p = new URL(req.url).searchParams,
      share = p.get('share'),
      kind = p.get('kind') ?? 'video';
    if (
      !['video', 'meta', 'bundle', ...Object.keys(AIO_FILES)].includes(kind) ||
      (share && kind !== 'video')
    )
      throw new InputError('Unavailable proof.', 404);
    const me = share ? null : await getAuthenticatedUser();
    const admin = me?.role === 'ADMIN';
    const aioKind = Object.hasOwn(AIO_FILES, kind);
    // The raw bundle and the AI Overview files show how a search is carried out: admins only.
    if ((kind === 'bundle' || aioKind) && !admin) throw new InputError('Unavailable proof.', 404);
    const scope = me ? readScope(me) : { shareToken: share! };
    const pin = await db.gridPin.findFirst({
      where: { id: (await c.params).pinId, scan: scope },
      include: { scan: { select: { keyword: true, targetBusiness: true } } },
    });
    if (aioKind) {
      const file = AIO_FILES[kind as keyof typeof AIO_FILES];
      // The keys the worker wrote on the point (aioSources.key, aioSources.capture.key), only ever
      // inside this point's own scan folder.
      const kept = (pin?.proxyMeta as { aioSources?: { key?: unknown; capture?: { key?: unknown } } } | null)?.aioSources;
      const stored = kind === 'aio' ? kept?.capture?.key : kept?.key;
      if (!pin || typeof stored !== 'string' || !stored.startsWith('scans/' + pin.scanId + '/') || !stored.endsWith('/' + file))
        throw new InputError('No AI Overview capture for this point.', 404);
      const obj = await r2().send(new GetObjectCommand({ Bucket: bucket, Key: stored }));
      const body = gunzipSync(Buffer.from(await obj.Body!.transformToByteArray())).toString('utf8');
      const name = `${kind === 'aio' ? 'aio-capture' : 'aio-page-read'}-${pin.id}.json`;
      return new Response(body, {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `${p.get('download') ? 'attachment' : 'inline'}; filename="${name}"`,
          'Cache-Control': 'private, no-store',
        },
      });
    }
    const key =
      pin &&
      (kind === 'video'
        ? pin.videoUrl
        : kind === 'meta'
          ? pin.metaJsonUrl
          : pin.dumpsTarUrl);
    if (!pin || !key) throw new InputError('Proof unavailable.', 404);
    let objectKey = key;
    if (key.startsWith('https://')) {
      const u = new URL(key);
      objectKey = decodeURIComponent(u.pathname.slice(1));
    }
    if (!objectKey.startsWith('scans/' + pin.scanId + '/'))
      throw new InputError('Proof unavailable.', 404);
    // A customer's receipt is rebuilt from the stored record with only what a receipt states. The
    // full record (which also describes the run itself) is served to admins alone.
    if (kind === 'meta' && !admin) {
      const obj = await r2().send(new GetObjectCommand({ Bucket: bucket, Key: objectKey }));
      const full = JSON.parse(await obj.Body!.transformToString());
      return new Response(JSON.stringify(customerReceipt(full, pin), null, 2), {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="stakeout-receipt-${pin.rowIdx + 1}-${pin.colIdx + 1}.json"`,
          'Cache-Control': 'private, no-store',
        },
      });
    }
    return new Response(null, {
      status: 307,
      headers: {
        Location: await signedRead(objectKey),
        'Cache-Control': 'private, no-store',
        'Referrer-Policy': 'no-referrer',
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
