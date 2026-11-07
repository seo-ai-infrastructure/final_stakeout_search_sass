import { db } from '@stakeout/db';
import { InputError } from './grid';
import { leasableDeviceWhere, profilesForDevice, deviceMatchesProfile } from './hardware';

/** Profiles served by at least one leasable phone (busy or idle). */
export async function availableProfiles() {
  const devices = await db.devicePool.findMany({
    where: leasableDeviceWhere,
    select: { hardwareModel: true },
  });
  const seen = new Map<string, { brand: string; model: string; phones: number }>();
  for (const d of devices)
    for (const p of profilesForDevice(d)) {
      const entry = seen.get(p.model) ?? { ...p, phones: 0 };
      entry.phones++;
      seen.set(p.model, entry);
    }
  return [...seen.values()];
}

/** Rejects a scan up front when no phone in the fleet matches the chosen profile. */
export async function assertFleetSupports(targetType: string, phoneModel: string) {
  if (targetType === 'desktop_aimode') return;
  const devices = await db.devicePool.findMany({
    where: leasableDeviceWhere,
    select: { hardwareModel: true },
  });
  if (!devices.some((d) => deviceMatchesProfile(d, phoneModel)))
    throw new InputError('No phones are online right now. Please try again in a few minutes.', 409);
}
