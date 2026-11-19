import test from 'node:test';
import assert from 'node:assert/strict';
import { endPlan, planRemaining, renewPlan } from '../packages/core/creditPlan';

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
