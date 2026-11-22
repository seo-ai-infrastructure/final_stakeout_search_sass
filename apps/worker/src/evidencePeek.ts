/**
 * A look inside stored evidence, for working out why a page was read the way it was. Named in
 * EVIDENCE_PEEK (comma-separated R2 keys of raw.tar.gz files, or folders ending in "/" whose
 * bundles are all read). For each bundle the copied AI answer and the on-screen labels of the
 * AI answer and of the top of the results page are written to the Kept table (scope
 * "evidence-peek"), where they can be read back without the log. Runs once per worker start; does
 * nothing when the variable is empty.
 */
import { GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { db } from '@stakeout/db';
import { r2, bucket } from '@stakeout/core/r2';
import { aiOverviewFold, uiBoxes, uiLabels, untarGz } from '@stakeout/core/serpEvidence';

/** The overview's cards and its edges (fold button, footer, ads) with their boxes on the screen. */
const overviewBoxes = (xml: string | null) => {
  if (!xml) return null;
  const L = uiBoxes(xml);
  const start = L.findIndex((x) => x.label === 'AI Overview');
  if (start < 0) return null;
  const screen = /<node\b[^>]*bounds="\[0,0\]\[(\d+),(\d+)\]"/.exec(xml);
  return {
    screen: screen ? screen[1] + 'x' + screen[2] : null,
    lines: L.slice(start)
      .filter((x, i) => i === 0 || /Rated \d|^Show (more|less)|^Copy text|^Good response|^More options for response|^Sponsored|^People also ask|^Web results|^Ads$/.test(x.label))
      .slice(0, 60)
      .map((x) => `${x.cls} | ${x.label.slice(0, 70)} | ${x.box ? `[${x.box[0]},${x.box[1]}][${x.box[2]},${x.box[3]}]` : '-'}`),
  };
};

const lines = (xml: string | null, from: (l: { cls: string; label: string }[]) => number, max: number) => {
  if (!xml) return null;
  const L = uiLabels(xml);
  const start = Math.max(0, from(L));
  return L.slice(start, start + max).map((x) => x.cls + ' | ' + x.label.slice(0, 160));
};

export async function evidencePeek() {
  const asked = (process.env.EVIDENCE_PEEK ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  if (!asked.length) return;
  const keys: string[] = [];
  for (const a of asked.slice(0, 6)) {
    if (!a.endsWith('/')) {
      keys.push(a);
      continue;
    }
    const res = await r2().send(new ListObjectsV2Command({ Bucket: bucket, Prefix: a, MaxKeys: 200 }));
    for (const o of res.Contents ?? []) if (o.Key?.endsWith('raw.tar.gz')) keys.push(o.Key);
  }
  for (const key of keys.slice(0, 8)) {
    try {
      const obj = await r2().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      const files = untarGz(await obj.Body!.transformToByteArray());
      const read = (name: string) => {
        for (const [path, data] of files) if (path === name || path.endsWith('/' + name)) return data.toString('utf8');
        return null;
      };
      const names = [...files].map(([path, data]) => path.split('/').pop() + ' ' + data.length);
      const ai = (l: { label: string }[]) => l.findIndex((x) => x.label === 'AI Overview');
      const value = JSON.stringify({
        key,
        files: names,
        meta: read('meta.txt'),
        aiCopy: read('aio_copy.txt')?.slice(0, 12000) ?? null,
        aiExpanded: lines(read('aio_expanded.xml'), ai, 260),
        aiInitial: lines(read('aio_initial.xml'), ai, 80),
        aiInitialBoxes: overviewBoxes(read('aio_initial.xml')),
        aiInitialFold: aiOverviewFold(read('aio_initial.xml')),
        aiExpandedBoxes: overviewBoxes(read('aio_expanded.xml')),
        serpTop: lines(read('serp.xml'), () => 0, 140),
        finalTop: lines(read('final.xml'), () => 0, 140),
      });
      await db.$executeRaw`INSERT INTO "Kept" (scope, key, value, "updatedAt") VALUES ('evidence-peek', ${key}, ${value}, now()) ON CONFLICT (scope, key) DO UPDATE SET value = EXCLUDED.value, "updatedAt" = now()`;
      console.log('[peek] saved', key, '(' + value.length + ' chars)');
    } catch (e) {
      console.warn('[peek]', key, 'not read:', (e as Error).message);
    }
  }
}
