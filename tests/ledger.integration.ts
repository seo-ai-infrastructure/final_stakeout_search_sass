// Run only on a disposable migrated database. Exercises the same transaction functions as the worker.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { db } from '@stakeout/db';
import { parseSpec } from '@stakeout/core/grid';
import { cloneScheduledRun, createScan, settlePin } from '@stakeout/core/scans';
import { fulfill } from '../apps/nextjs/src/lib/billing';
async function run() {
  if (process.env.TEST_DISPOSABLE_DB !== 'yes')
    throw Error('Use a disposable database and set TEST_DISPOSABLE_DB=yes.');
  const u = await db.user.create({
    data: { email: randomUUID() + '@internal.invalid', creditBalance: 18 },
  });
  let orderId = 'fixture-' + randomUUID();
  try {
    const s = parseSpec({
      targetBusiness: 'Fixture Plumbing',
      keyword: 'plumber',
      centerLat: 28.04,
      centerLng: -81.95,
      gridSize: 3,
      trackAiOverviews: true,
    });
    const a = await createScan(u.id, s, 'fixture:' + u.id);
    assert.equal(a.creditsCharged, 18);
    assert.equal((await createScan(u.id, s, 'fixture:' + u.id)).id, a.id);
    await assert.rejects(createScan(u.id, s, 'second:' + u.id), /Insufficient/);
    const pins = await db.gridPin.findMany({ where: { scanId: a.id } });
    for (const [i, p] of pins.entries()) {
      if (i === 0) {
        await settlePin(p.id, { error: 'fixture failure' });
        await settlePin(p.id, { error: 'duplicate failure' });
      } else {
        await settlePin(p.id, {
          data: { rankFound: 2, hasAiOverview: true, targetCitedInAi: true },
        });
        await settlePin(p.id, { error: 'late failure' });
      }
    }
    const settled = await db.gridScan.findUniqueOrThrow({
      where: { id: a.id },
    });
    assert.deepEqual(
      [
        settled.status,
        settled.completedPins,
        settled.failedPins,
        settled.creditsRefunded,
        settled.solv,
      ],
      ['PARTIAL', 8, 1, 2, 100],
    );
    assert.equal(
      (await db.user.findUniqueOrThrow({ where: { id: u.id } })).creditBalance,
      2,
    );
    assert.equal(
      await db.creditLedger.count({
        where: { userId: u.id, reason: 'PIN_REFUND' },
      }),
      1,
    );
    await db.paymentOrder.create({
      data: { id: orderId, userId: u.id, credits: 500, cents: 1234 },
    });
    const original = globalThis.fetch;
    let amount = 1;
    process.env.STRIPE_SECRET_KEY = 'sk_test_fixture';
    globalThis.fetch = async () =>
      Response.json({ id: orderId, status: 'complete', payment_status: 'paid', currency: 'usd', amount_total: amount, client_reference_id: u.id, metadata: { credits: '500' }, payment_intent: 'pi_' + u.id });
    try {
      await assert.rejects(fulfill(orderId), /matched/);
      amount = 1234;
      assert.equal((await fulfill(orderId)).creditBalance, 502);
      assert.equal((await fulfill(orderId)).creditBalance, 502);
    } finally {
      globalThis.fetch = original;
    }
    await db.gridScan.update({
      where: { id: a.id },
      data: { scheduleType: 'daily', scheduleCron: '0 13 * * *' },
    });
    const child = await cloneScheduledRun(a.id, 'daily-1');
    assert.ok(child);
    assert.equal(child.scheduleType, 'once');
    assert.equal(child.campaignId, a.campaignId);
    assert.equal((await cloneScheduledRun(a.id, 'daily-1'))?.id, child.id);
    assert.equal(
      (await db.user.findUniqueOrThrow({ where: { id: u.id } })).creditBalance,
      484,
    );
    await db.user.update({ where: { id: u.id }, data: { creditBalance: 0 } });
    assert.equal(await cloneScheduledRun(a.id, 'daily-2'), null);
    assert.equal(
      (await db.gridScan.findUniqueOrThrow({ where: { id: a.id } }))
        .scheduleCron,
      'PAUSED:0 13 * * *',
    );
    console.log(
      'PASS · recurring snapshot clone, exactly-once occurrence charge, low-balance schedule pause.',
    );
    console.log(
      'PASS · atomic debit, idempotent replay, insufficient funds, terminal refund, partial rollup, wrong-price rejection, duplicate capture.',
    );
  } finally {
    await db.paymentOrder.deleteMany({ where: { id: orderId } });
    await db.user.delete({ where: { id: u.id } });
    await db.$disconnect();
  }
}
run().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
