import test from 'node:test';
import assert from 'node:assert/strict';
import { PACK_REASONS, endPlan, planRemaining, renewPlan, topUpPlan } from '../packages/core/creditPlan';

test('the first paid month adds the plan’s credits on top of what the account had', () => {
  const r = renewPlan({ balance: 40, bucket: 0, packFloor: 0, bought: 0 }, 700);
  assert.deepEqual(r, { carry: 0, lapse: 0, grant: 700, balance: 740, bucket: 700, packFloor: 40 });
});

test('unused plan credits roll over for one month, capped at a month’s worth', () => {
  // 700 from the plan, 40 from a pack; 250 used (plan credits go first): 450 of the plan left.
  const second = renewPlan({ balance: 490, bucket: 700, packFloor: 40, bought: 0 }, 700);
  assert.deepEqual(second, { carry: 450, lapse: 0, grant: 700, balance: 1190, bucket: 1150, packFloor: 40 });
  // Nothing used the next month: 1,150 plan credits left, 700 may carry, 450 lapse.
  const third = renewPlan({ balance: 1190, bucket: 1150, packFloor: 40, bought: 0 }, 700);
  assert.deepEqual(third, { carry: 700, lapse: 450, grant: 700, balance: 1440, bucket: 1400, packFloor: 40 });
});

test('pack credits bought during the month are never touched', () => {
  // 700 plan, then a 100 pack bought; 760 used: the plan is spent and 60 came out of packs.
  const s = { balance: 40, bucket: 700, packFloor: 0, bought: 100 };
  assert.equal(planRemaining(s), 0);
  assert.deepEqual(renewPlan(s, 700), { carry: 0, lapse: 0, grant: 700, balance: 740, bucket: 700, packFloor: 40 });
  // Used only 100: 600 plan credits left and the whole pack intact.
  assert.equal(planRemaining({ balance: 700, bucket: 700, packFloor: 0, bought: 100 }), 600);
});

test('when the plan ends, its unused credits lapse and pack credits stay', () => {
  assert.deepEqual(endPlan({ balance: 490, bucket: 700, packFloor: 40, bought: 0 }), { lapse: 450, balance: 40, bucket: 0, packFloor: 40 });
  assert.deepEqual(endPlan({ balance: 30, bucket: 700, packFloor: 40, bought: 0 }), { lapse: 0, balance: 30, bucket: 0, packFloor: 30 });
});

test('a downgrade carries over at the new plan’s cap, and one-time purchases are never swept', () => {
  // Agency (3,500) with 3,000 unused, renewing as Starter (700): 700 carry, 2,300 lapse, 1,400 in hand.
  const down = renewPlan({ balance: 3000, bucket: 3500, packFloor: 0, bought: 0 }, 700);
  assert.deepEqual([down.carry, down.lapse, down.bucket, down.balance], [700, 2300, 1400, 1400]);
  // A three-month bundle (2,100, bought once) on top of a Starter month, nothing used: the bundle is pack credits and stays whole.
  const s = { balance: 2800, bucket: 700, packFloor: 0, bought: 2100 };
  assert.equal(planRemaining(s), 700);
  const r = renewPlan(s, 700);
  assert.deepEqual([r.carry, r.lapse, r.balance, r.packFloor], [700, 0, 3500, 2100]);
  assert.deepEqual(endPlan(s), { lapse: 700, balance: 2100, bucket: 0, packFloor: 2100 });
});

test('clients added mid-month add their sessions to the plan’s share, and packs stay apart', () => {
  // 625 from the plan at renewal, 100 bought since; 200 used: 425 of the plan left.
  const s = { balance: 525, bucket: 625, packFloor: 0, bought: 100 };
  assert.equal(planRemaining(s), 425);
  const t = topUpPlan(s, 250);
  assert.deepEqual(t, { grant: 250, balance: 775, bucket: 675, packFloor: 100 });
  // At the next renewal (now 7 clients, 875 a month), the 675 carry over whole and the pack is untouched.
  assert.deepEqual(renewPlan({ balance: t.balance, bucket: t.bucket, packFloor: t.packFloor, bought: 0 }, 875), { carry: 675, lapse: 0, grant: 875, balance: 1650, bucket: 1550, packFloor: 100 });
  assert.ok(PACK_REASONS.includes('BONUS_PACK') && PACK_REASONS.includes('STRIPE_TOPUP'));
  assert.ok(!PACK_REASONS.includes('CLIENT_SESSIONS'));
});
