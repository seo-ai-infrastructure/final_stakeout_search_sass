// Disposable databases only. Registers one fixture phone so the HTTP smoke test can
// create scans now that scans require an online phone of the requested model.
// Keep the worker stopped: the fixture is never leased.
import { db } from '@stakeout/db';
async function run() {
  if (process.env.TEST_DISPOSABLE_DB !== 'yes')
    throw Error('Use a disposable database and set TEST_DISPOSABLE_DB=yes.');
  await db.devicePool.upsert({
    where: { imageId: 'smoke-fixture-phone' },
    update: {},
    create: {
      imageId: 'smoke-fixture-phone',
      proxyId: 'smoke-fixture-proxy',
      adbAddr: '127.0.0.1:5555',
      hardwareBrand: 'samsung',
      hardwareModel: 'SM-S918U',
      bootstrappedAt: new Date(),
    },
  });
  console.log('Seeded fixture Galaxy S23 Ultra.');
}
run()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
