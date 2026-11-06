import { randomUUID } from 'node:crypto';
import { db } from '@stakeout/db';
import { parseSpec, InputError } from '@stakeout/core/grid';
import { createScan } from '@stakeout/core/scans';
import { availableProfiles } from '@stakeout/core/fleet';
import { limit, limitIp, clientKey, emailQuotaKey } from '@/lib/limits';
import { requireHuman, turnstileConfigured } from '@/lib/turnstile';
import { mailerConfigured, sendLinkEmail, appUrl } from '@/lib/mailer';
import { issueToken } from '@/lib/emailTokens';
import { errorResponse } from '@/lib/api';

/** Phone used for previews: TEASER_PHONE_MODEL if online, else any online profile. */
async function teaserHardware() {
  const profiles = await availableProfiles();
  const preferred = process.env.TEASER_PHONE_MODEL;
  const pick = profiles.find((p) => p.model === preferred) ?? profiles[0];
  if (!pick)
    throw new InputError('Free previews are paused while our phones are offline. Try again later.', 503);
  return pick;
}

export async function POST(req: Request) {
  try {
    // A free preview spends real phone time, so it needs at least one abuse control.
    const mail = mailerConfigured(),
      human = turnstileConfigured();
    if (!mail && !human && process.env.NODE_ENV === 'production')
      throw new InputError('Free previews are not available yet.', 503);
    const b = await req.json(),
      email = String(b.email ?? '')
        .trim()
        .toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
      throw new InputError('A valid work email is required.');
    const ip = clientKey(req);
    await requireHuman(b.turnstileToken, ip);
    const hardware = await teaserHardware();
    const s = parseSpec({
      keyword: b.keyword,
      targetBusiness: b.targetBusiness,
      centerLat: b.lat,
      centerLng: b.lng,
      gridSize: 3,
      phoneBrand: hardware.brand,
      phoneModel: hardware.model,
    });
    await limitIp(req, 'teaser-ip', 3, 86400);
    await limit('teaser-email', emailQuotaKey(email), 1, 86400);
    await limit(
      'teaser-global',
      'all',
      Number(process.env.TEASER_DAILY_LIMIT ?? 25),
      86400,
    );
    const owner = await db.user.upsert({
      where: { email: 'teasers@internal.invalid' },
      update: {},
      create: {
        email: 'teasers@internal.invalid',
        role: 'SYSTEM',
        creditBalance: 0,
      },
    });
    const scan = await createScan(owner.id, s, 'teaser:' + randomUUID(), {
      email,
      holdForEmail: mail,
    });
    if (!mail)
      return Response.json({ reportPath: '/share/' + scan.shareToken }, { status: 202 });

    // The scan was created as AWAITING_EMAIL; the dispatcher only runs QUEUED scans.
    const token = await issueToken('TEASER', email, { scanId: scan.id });
    await sendLinkEmail(
      email,
      'Start your free Stakeout preview',
      'Confirm your email to run the 3×3 preview for "' + s.keyword + '" around ' + s.targetBusiness + '.',
      'Start the preview',
      appUrl('/api/auth/verify?token=' + token),
    );
    return Response.json({ checkEmail: true }, { status: 202 });
  } catch (e) {
    return errorResponse(e);
  }
}
