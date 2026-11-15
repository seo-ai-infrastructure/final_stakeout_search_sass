import { db } from '@stakeout/db';
import { InputError } from './grid';
import { fleetWhere, profilesForDevice, deviceMatchesProfile } from './hardware';
import { getSettings } from './settings';


/** Profiles served by at least one leasable phone (busy or idle). */
export async function availableProfiles() {
  const devices = await db.devicePool.findMany({
    where: fleetWhere((await getSettings()).powerSave),
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

/** Every phone a new scan can run on, by its real make and model (as read from Android). */
export async function fleetPhones() {
  const devices = await db.devicePool.findMany({
    where: fleetWhere((await getSettings()).powerSave),
    select: { hardwareBrand: true, hardwareModel: true },
    orderBy: { slotIndex: 'asc' },
  });
  return devices.map((d: { hardwareBrand: string | null; hardwareModel: string | null }) => ({ brand: d.hardwareBrand ?? '', model: d.hardwareModel ?? '' }));
}

/** Rejects a scan up front when no phone in the fleet matches the chosen profile. */
export async function assertFleetSupports(targetType: string, phoneModel: string) {
  if (targetType === 'desktop_aimode') return;
  const devices = await db.devicePool.findMany({
    where: fleetWhere((await getSettings()).powerSave),
    select: { hardwareModel: true },
  });
  if (!devices.some((d) => deviceMatchesProfile(d, phoneModel)))
    throw new InputError('No phones are online right now. Please try again in a few minutes.', 409);
}
