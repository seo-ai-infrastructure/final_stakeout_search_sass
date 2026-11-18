import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
import { HERO_VIDEO_KEY } from './heroVideo';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
export const bucket = process.env.R2_BUCKET_NAME ?? 'stakeout-artifacts';
let client: S3Client | undefined;
export function r2() {
  return (client ??= new S3Client({
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    region: 'auto',
    // Buckets created in a jurisdiction (e.g. ".us." or ".eu.") have their own address;
    // set R2_ENDPOINT to the bucket's S3 API URL from the Cloudflare dashboard.
    endpoint:
      process.env.R2_ENDPOINT?.trim().replace(/\/+$/, '') ||
      'https://' + process.env.R2_ACCOUNT_ID + '.r2.cloudflarestorage.com',
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  }));
}
export async function signedRead(key: string) {
  return getSignedUrl(
    r2(),
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: 3600 },
  );
}
export async function uploadURL(key: string) {
  return getSignedUrl(
    r2(),
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: 'application/gzip',
    }),
    { expiresIn: 900 },
  );
}
export async function uploaded(key: string) {
  try {
    await r2().send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (e: any) {
    if (e.$metadata?.httpStatusCode === 404 || e.name === 'NotFound')
      return false;
    throw e;
  }
}
export async function put(
  key: string,
  body: Buffer | string,
  contentType: string,
) {
  await r2().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

/**
 * Deletes every stored file of one scan (its points' videos, records and evidence bundles), except
 * the home page's recording. Returns how many files were deleted.
 */
export async function deleteScanFiles(scanId: string) {
  if (!/^[a-z0-9]{10,40}$/i.test(scanId)) throw new Error('BAD_SCAN_ID');
  let deleted = 0,
    token: string | undefined;
  do {
    const page = await r2().send(new ListObjectsV2Command({ Bucket: bucket, Prefix: 'scans/' + scanId + '/', ContinuationToken: token, MaxKeys: 1000 }));
    const keys = (page.Contents ?? []).map((o) => o.Key!).filter((k) => k && k !== HERO_VIDEO_KEY);
    if (keys.length) {
      const res = await r2().send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true } }));
      deleted += keys.length - (res.Errors?.length ?? 0);
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return deleted;
}
