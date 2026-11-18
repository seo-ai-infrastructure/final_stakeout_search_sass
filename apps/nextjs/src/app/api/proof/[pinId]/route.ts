import { db } from '@stakeout/db';
import { getAuthenticatedUser, readScope } from '@/lib/auth';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { bucket, r2, signedRead } from '@stakeout/core/r2';
import { customerReceipt } from '@/lib/receipt';
import { InputError } from '@stakeout/core/grid';
import { errorResponse } from '@/lib/api';
export async function GET(
  req: Request,
  c: { params: Promise<{ pinId: string }> },
) {
  try {
    const p = new URL(req.url).searchParams,
      share = p.get('share'),
      kind = p.get('kind') ?? 'video';
    // page_pre / page_post: the results page as Google served it, saved by the worker (v156+).
    const page = kind === 'page_pre' || kind === 'page_post';
    if (
      !['video', 'meta', 'bundle', 'page_pre', 'page_post'].includes(kind) ||
      (share && kind !== 'video' && !page)
    )
      throw new InputError('Unavailable proof.', 404);
    const me = share ? null : await getAuthenticatedUser();
    const admin = me?.role === 'ADMIN';
    // The raw bundle shows how a search is carried out: admins only.
    if (kind === 'bundle' && !admin) throw new InputError('Unavailable proof.', 404);
    const scope = me ? readScope(me) : { shareToken: share! };
    const pin = await db.gridPin.findFirst({
      where: { id: (await c.params).pinId, scan: scope },
      include: { scan: { select: { keyword: true, targetBusiness: true } } },
    });
    const pages = (pin?.proxyMeta as { pages?: Record<string, { replay?: string | null }> } | null)?.pages;
    const key =
      pin &&
      (page
        ? (pages?.[kind.slice(5)]?.replay ?? null)
        : kind === 'video'
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
