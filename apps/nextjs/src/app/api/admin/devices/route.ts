import { getAuthenticatedUser } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { db } from '@stakeout/db';
import { InputError } from '@stakeout/core/grid';
import { redis, duoplusPost } from '@stakeout/core/redis';
import { RUN_PIN_SH_V2 } from '@stakeout/core/runner';
import { proxyPort } from '@stakeout/core/proxySeller';
import { profilesForDevice } from '@stakeout/core/hardware';
import { failureRate, percentile } from '@stakeout/core/fleetHealth';
import { createHash } from 'node:crypto';

const RUNNER_SHA = createHash('sha256').update(RUN_PIN_SH_V2).digest('hex');

/**
 * Fleet health over the last 24 hours. Utilization = phone-time spent on pins ÷
 * phone-time available; queue wait = scan dispatched → a phone picked the pin up.
 */
async function fleetHealth(devices: { isEnabled: boolean; offlineAt: Date | null; bootstrappedAt: Date | null; autoPausedAt: Date | null }[], busyNow: number) {
  const since = new Date(Date.now() - 86400000);
  const started = await db.gridPin.findMany({
    where: { startedAt: { gte: since } },
    select: { startedAt: true, updatedAt: true, status: true, scan: { select: { dispatchedAt: true } } },
  });
  const waits = started
    .filter((p) => p.scan.dispatchedAt)
    .map((p) => (+p.startedAt! - +p.scan.dispatchedAt!) / 1000)
    .filter((w) => w >= 0);
  const busySeconds = started
    .filter((p) => p.status !== 'PENDING')
    .reduce((sum, p) => sum + Math.min(600, Math.max(0, (+p.updatedAt - +p.startedAt!) / 1000)), 0);
  const ready = devices.filter((d) => d.isEnabled && !d.offlineAt && d.bootstrappedAt && !d.autoPausedAt).length;
  const waitingWhere = { status: 'PENDING', startedAt: null, scan: { dispatchedAt: { not: null } } };
  const [waiting, oldest, failed] = await Promise.all([
    db.gridPin.count({ where: waitingWhere }),
    db.gridPin.findFirst({ where: waitingWhere, orderBy: { scan: { dispatchedAt: 'asc' } }, select: { scan: { select: { dispatchedAt: true } } } }),
    db.gridPin.count({ where: { status: 'FAILED', updatedAt: { gte: since } } }),
  ]);
  const finished = started.filter((p) => p.status !== 'PENDING').length;
  return {
    readyPhones: ready,
    busyNow,
    utilization24h: ready ? Math.min(1, busySeconds / (ready * 86400)) : null,
    queueWaiting: waiting,
    oldestWaitSec: oldest?.scan.dispatchedAt ? Math.round((Date.now() - +oldest.scan.dispatchedAt) / 1000) : 0,
    waitP90Sec: percentile(waits, 90),
    pinsStarted24h: started.length,
    failureRate24h: finished ? failed / finished : null,
    autoPaused: devices.filter((d) => d.autoPausedAt).length,
  };
}

function displayPort(slotIndex: number) {
  try {
    return proxyPort(slotIndex);
  } catch {
    return null; // out of range: the worker would refuse this slot too
  }
}
export const maxDuration = 120;
async function admin() {
  if ((await getAuthenticatedUser()).role !== 'ADMIN')
    throw new InputError('Administrator access required.', 403);
}
export async function GET() {
  try {
    await admin();
    const devices = await db.devicePool.findMany({
      orderBy: { slotIndex: 'asc' },
    });
    // One round trip for every phone's lease instead of two per phone.
    const lockKeys = devices.map((d) => 'lock:duoplus:' + d.imageId);
    const locks = lockKeys.length ? await redis().mget(...lockKeys) : [];
    const lockOf = new Map(devices.map((d, i) => [d.imageId, locks[i]]));
    const health = await fleetHealth(devices, locks.filter(Boolean).length);
    // The worker's own status record (written every minute): null when the worker is not running.
    const system = await redis()
      .get('stakeout:health')
      .then((v) => (v ? JSON.parse(v) : null))
      .catch(() => null);
    return Response.json({
      health,
      system,
      devices: await Promise.all(
        devices.map(async (d) => {
          const value = lockOf.get(d.imageId) ?? null;
          const cooldown = Math.max(
            0,
            Math.ceil((+d.cooldownUntil - Date.now()) / 1000),
          );
          return {
            ...d,
            activePinId: value?.split('|')[0],
            recentFailureRate: failureRate(d.recentOutcomes),
            cooldownRemainingSec: cooldown,
            proxyPort: displayPort(d.slotIndex),
            profiles: profilesForDevice(d).map((p) => p.model),
            runtimeState: !d.isEnabled
              ? 'DISABLED'
              : d.autoPausedAt
                ? 'AUTO_PAUSED'
              : d.offlineAt
                ? 'OFFLINE'
              : value
                ? 'BUSY'
                : cooldown
                  ? 'COOLDOWN'
                  : 'IDLE',
          };
        }),
      ),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
async function bootstrap(ids: string[]) {
  const b64 = Buffer.from(RUN_PIN_SH_V2).toString('base64');
  const cmd = [
    'mkdir -p /data/local/tmp/rt',
    'settings put global window_animation_scale 0',
    'settings put global transition_animation_scale 0',
    'settings put global animator_duration_scale 0',
    "echo 'chrome --disable-fre --no-first-run' > /data/local/tmp/chrome-command-line",
    'echo ' + b64 + ' | base64 -d > /data/local/tmp/rt/run_pin.next',
    'chmod 755 /data/local/tmp/rt/run_pin.next',
    'mv /data/local/tmp/rt/run_pin.next /data/local/tmp/rt/run_pin.sh',
    'echo ' + RUNNER_SHA + ' > /data/local/tmp/rt/run_pin.sha',
    'getprop ro.product.brand',
    'getprop ro.product.model',
  ].join(' && ');
  for (let i = 0; i < ids.length; i += 20) {
    const batch = ids.slice(i, i + 20);
    const res = await duoplusPost('/api/v1/cloudPhone/command', {
      image_ids: batch,
      command: cmd,
    });
    for (const id of batch) {
      const item = res.data[id],
        values = String(item?.content ?? '')
          .trim()
          .split(/\r?\n/);
      if (item?.success !== true || values.length < 2)
        throw new InputError('Bootstrap failed for ' + id, 502);
      await db.devicePool.update({
        where: { imageId: id },
        data: {
          hardwareBrand: values.at(-2)?.trim() || null,
          hardwareModel: values.at(-1)?.trim() || null,
          bootstrappedAt: new Date(),
        },
      });
    }
  }
}
export async function POST(req: Request) {
  try {
    await admin();
    const { action, devices, imageId, isEnabled } = await req.json();
    if (action === 'ADD_DEVICES') {
      if (
        !Array.isArray(devices) ||
        !devices.length ||
        devices.length > 200 ||
        !devices.every((d) =>
          [d?.imageId, d?.proxyId].every(
            (v) => typeof v === 'string' && /^[\w.-]{1,100}$/.test(v),
          ),
        )
      )
        throw new InputError('Provide 1–200 valid phone and proxy ID pairs.');
      await db.$transaction(
        devices.map((d) =>
          db.devicePool.upsert({
            where: { imageId: d.imageId },
            create: {
              imageId: d.imageId,
              proxyId: d.proxyId,
              adbAddr: d.adbAddr ?? null,
            },
            update: { proxyId: d.proxyId, adbAddr: d.adbAddr ?? undefined },
          }),
        ),
      );
    } else if (action === 'RESET_ALL_COOLDOWNS') {
      await db.devicePool.updateMany({ data: { cooldownUntil: new Date(0) } });
    } else if (action === 'BOOTSTRAP_ALL') {
      const fleet = await db.devicePool.findMany({
        where: { isEnabled: true },
      });
      await bootstrap(fleet.map((d) => d.imageId));
    } else {
      const d =
        typeof imageId === 'string'
          ? await db.devicePool.findUnique({ where: { imageId } })
          : null;
      if (!d) throw new InputError('Unknown device.', 404);
      if (action === 'BOOTSTRAP_ONE') await bootstrap([imageId]);
      else if (action === 'RESET_COOLDOWN')
        await db.devicePool.update({
          where: { imageId },
          data: { cooldownUntil: new Date(0) },
        });
      else if (action === 'RESUME_DEVICE')
        // Fresh start: clears the pause and the failure window that triggered it.
        await db.devicePool.update({
          where: { imageId },
          data: { autoPausedAt: null, autoPauseReason: null, recentOutcomes: '' },
        });
      else if (action === 'TOGGLE_ENABLED' && typeof isEnabled === 'boolean')
        await db.devicePool.update({ where: { imageId }, data: { isEnabled } });
      else if (action === 'DELETE_DEVICE') {
        if (d.isEnabled || (await redis().exists('lock:duoplus:' + imageId)))
          throw new InputError(
            'Disable the phone and wait for its lease to finish before deleting.',
            409,
          );
        await db.devicePool.delete({ where: { imageId } });
      } else throw new InputError('Unknown fleet operation.');
    }
    return Response.json({ success: true });
  } catch (e) {
    return errorResponse(e);
  }
}
