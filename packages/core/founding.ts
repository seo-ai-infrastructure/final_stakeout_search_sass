import { db } from '@stakeout/db';
import { FOUNDING } from './gbpPlans';

/**
 * Founding members: the first FOUNDING.seats accounts to start a plan (Scout, Agency or Scale,
 * monthly or yearly) get FOUNDING.bonus more of their plan's phone sessions every month for as long
 * as they have a plan (gbpPlans' monthlyPoints). A spot is taken once and kept by the account, even
 * if it leaves and comes back. Admin accounts never take one.
 */

/** How many founding spots are left. */
export async function foundingLeft(): Promise<number> {
  const taken = await db.user.count({ where: { foundingNo: { not: null } } });
  return Math.max(0, FOUNDING.seats - taken);
}

/** Whether the account is a founding member. */
export async function isFounding(userId: string): Promise<boolean> {
  return Boolean((await db.user.findUnique({ where: { id: userId }, select: { foundingNo: true } }))?.foundingNo);
}

/**
 * Makes the account a founding member when a spot is left: its number, or null when the spots are
 * gone (or it is an admin). An account that already is one keeps its number. Two accounts taking the
 * same number at once: the database lets one have it, and the other tries the next.
 */
export async function claimFounding(userId: string): Promise<number | null> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const me = await db.user.findUnique({ where: { id: userId }, select: { foundingNo: true, role: true } });
    if (!me || me.role === 'ADMIN') return null;
    if (me.foundingNo) return me.foundingNo;
    const top = (await db.user.aggregate({ _max: { foundingNo: true } }))._max.foundingNo ?? 0;
    const n = top + 1;
    if (n > FOUNDING.seats) return null;
    try {
      const r = await db.user.updateMany({ where: { id: userId, foundingNo: null }, data: { foundingNo: n } });
      if (r.count) return n;
    } catch (e) {
      if ((e as { code?: string })?.code !== 'P2002') throw e;
    }
  }
  return null;
}
