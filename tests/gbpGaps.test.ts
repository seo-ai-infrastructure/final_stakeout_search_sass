import test from 'node:test';
import assert from 'node:assert/strict';
import { findGaps, gcid, readRival, topRivals } from '../packages/core/gbpGaps';
import type { Attr } from '../packages/core/gbpExtras';

const item = (over: object = {}) => ({
  title: 'Roto-Rooter Plumbing & Water Cleanup', category: 'Plumber', category_ids: ['plumber', 'drainage_service', 'water_damage_restoration_service'],
  additional_categories: ['Drainage service', 'Water damage restoration service'],
  attributes: { available_attributes: { accessibility: ['has_wheelchair_accessible_entrance'], payments: ['pay_credit_card', 'pay_debit_card'], service_options: ['has_onsite_services'] }, unavailable_attributes: { payments: ['pay_check'] } },
  local_business_links: [{ type: 'reservation', title: 'rotorooter.com', url: 'https://rotorooter.com/schedule' }, { type: 'order', delivery_services: [{ type: 'delivery_services_element', url: 'https://order.example/x' }] }, { type: 'reservation', url: 'javascript:alert(1)' }],
  total_photos: 212, rating: { value: 4.8, votes_count: 1930 }, ...over,
});

test('a rival’s listing is read: categories by Google’s ids, what it says it has, its booking links', () => {
  const r = readRival(item(), 'Roto-Rooter')!;
  assert.deepEqual(r.categories, [{ id: 'plumber', name: 'Plumber' }, { id: 'drainage_service', name: 'Drainage service' }, { id: 'water_damage_restoration_service', name: 'Water damage restoration service' }]);
  assert.deepEqual(r.attributes, ['has_wheelchair_accessible_entrance', 'pay_credit_card', 'pay_debit_card', 'has_onsite_services']);
  assert.deepEqual(r.links, [{ type: 'reservation', url: 'https://rotorooter.com/schedule' }, { type: 'order', url: 'https://order.example/x' }]);
  assert.deepEqual([r.photos, r.rating, r.reviews], [212, 4.8, 1930]);
  // A lookup by name that landed on some other business is not the rival.
  assert.equal(readRival(item({ title: 'Mr. Rooter Plumbing' }), 'Roto-Rooter'), null);
  assert.equal(readRival({}, 'Roto-Rooter'), null);
  // An id with no name beside it still reads, and so does a name with no id (the id is looked up later).
  assert.equal(readRival(item({ category: '', additional_categories: [] }), 'Roto-Rooter')!.categories[1].name, 'Drainage service');
  assert.deepEqual(readRival(item({ category: 'Attorney', category_ids: null, additional_categories: null }), 'Roto-Rooter')!.categories, [{ id: '', name: 'Attorney' }]);
  assert.deepEqual(readRival(item({ services: [{ title: 'Drain cleaning', snippet: 'x' }, { title: 'Hydro jetting' }, { title: '' }, { title: 'Drain cleaning' }] }), 'Roto-Rooter')!.services, ['Drain cleaning', 'Hydro jetting']);
  assert.equal(gcid('gcid:plumber'), 'categories/gcid:plumber');
  assert.equal(gcid('categories/gcid:plumber'), 'categories/gcid:plumber');
});

test('the top rivals are the ones in the top three at the most points', () => {
  const pins = [
    { status: 'COMPLETED', topCompetitors: ['Roto-Rooter', 'Acme Plumbing', 'Benjamin Franklin', 'Fourth Place'] },
    { status: 'COMPLETED', topCompetitors: ['Benjamin Franklin', 'roto rooter', 'Mr. Rooter'] },
    { status: 'COMPLETED', topCompetitors: ['Roto-Rooter', 'Mr. Rooter', 'Acme Plumbing LLC'] },
    { status: 'FAILED', topCompetitors: ['Never Counted', 'Never Counted', 'Never Counted'] },
  ];
  assert.deepEqual(topRivals(pins, 'Acme Plumbing', 3), [{ name: 'Roto-Rooter', points: 3 }, { name: 'Benjamin Franklin', points: 2 }, { name: 'Mr. Rooter', points: 2 }]);
});

test('gaps: what rivals have that the listing lacks, rival-backed first', () => {
  const A = (name: string, label: string, value: boolean | null, kind: Attr['kind'] = 'BOOL'): Attr => ({ name: 'attributes/' + name, label, group: 'G', kind, value, options: [], canSayNo: true });
  const rivals = [readRival(item({ services: [{ title: 'drain cleaning' }, { title: 'Hydro jetting' }, { title: 'Leak Repair' }] }), 'Roto-Rooter')!, readRival(item({ title: 'Benjamin Franklin Plumbing', category_ids: ['plumber', 'drainage_service', 'hvac_contractor'], additional_categories: ['Drainage service', 'HVAC contractor'], attributes: { available_attributes: { payments: ['pay_credit_card'] } }, local_business_links: [] }), 'Benjamin Franklin Plumbing')!];
  const g = findGaps({
    primaryCategory: 'categories/gcid:plumber', additionalCategories: ['categories/gcid:water_damage_restoration_service'],
    attributes: [A('pay_credit_card', 'Credit cards', null), A('has_wheelchair_accessible_entrance', 'Wheelchair entrance', null), A('pay_debit_card', 'Debit cards', true), A('has_restroom', 'Restroom', null), A('url_facebook', 'Facebook', [] as unknown as null, 'URL')],
    suggestedServices: [{ typeId: 'job_type_id:drain_cleaning', name: 'Drain cleaning' }, { typeId: 'job_type_id:leak_repair', name: 'Leak repair' }],
    services: [{ key: 's:job_type_id:leak_repair', name: 'Leak repair', description: '', kind: 'structured' }],
    links: [], linkTypes: ['APPOINTMENT'],
  }, rivals, { APPOINTMENT: 'Book an appointment' });
  // Categories: only ones a rival uses and the listing lacks, never one it already has.
  assert.deepEqual(g.categories.map((c) => [c.id, c.label, c.rivals.length]), [['categories/gcid:drainage_service', 'Drainage service', 2], ['categories/gcid:hvac_contractor', 'HVAC contractor', 1]]);
  assert.equal(g.categoryRoom, 8);
  // Attributes: unanswered yes/no ones; answered ones and links are not gaps here.
  assert.deepEqual(g.attributes.map((a) => [a.label, a.rivals.length]), [['Credit cards', 2], ['Wheelchair entrance', 1], ['Restroom', 0]]);
  // Google's own service a rival also lists is marked; a rival's own wording can be added as the business's own; one already listed is left out.
  assert.deepEqual(g.services.map((s) => [s.id, s.label, s.rivals.length]), [['job_type_id:drain_cleaning', 'Drain cleaning', 1], ['free:Hydro jetting', 'Hydro jetting', 1]]);
  assert.deepEqual(g.links, [{ id: 'APPOINTMENT', label: 'Book an appointment', rivals: ['Roto-Rooter Plumbing & Water Cleanup'] }]);
  // With no rival looked up there are no category suggestions, and the rest is still listed.
  const alone = findGaps({ primaryCategory: 'categories/gcid:plumber', additionalCategories: [], attributes: [A('has_restroom', 'Restroom', null)], suggestedServices: [], services: [], links: [], linkTypes: [] }, []);
  assert.deepEqual([alone.categories.length, alone.attributes.length], [0, 1]);
});

import { postCadence, readPosts, rivalFacts } from '../packages/core/gbpGaps';

test('the rest of a rival’s listing: hours, busiest time, review make-up', () => {
  const span = (oh: number, ch: number) => [{ open: { hour: oh, minute: 0 }, close: { hour: ch, minute: 30 } }];
  const f = rivalFacts({
    description: 'Personal injury law firm.', phone: '+1863-777-4191', domain: 'lopezandhumphries.com', is_claimed: true, cid: '963',
    work_time: { work_hours: { timetable: { monday: span(8, 17), tuesday: span(8, 17), wednesday: [{ open: { hour: 0, minute: 0 }, close: { hour: 24, minute: 0 } }], thursday: null, friday: span(22, 2), saturday: [], sunday: [] } } },
    popular_times: { popular_times_by_days: { friday: [{ time: { hour: 4, minute: 0 }, popular_index: 67 }], tuesday: [{ time: { hour: 14, minute: 0 }, popular_index: 91 }] } },
    rating_distribution: { '1': 14, '2': 1, '3': 3, '4': 10, '5': 437 }, place_topics: { settlement: 31, insurance: 12, 'car accident': 44 },
    attributes: { unavailable_attributes: { payments: ['pay_check'] } },
  });
  assert.deepEqual(f.hours, ['Mon 8:00 AM – 5:30 PM', 'Tue 8:00 AM – 5:30 PM', 'Wed open 24 hours', 'Thu closed', 'Fri 10:00 PM – 2:30 AM', 'Sat closed', 'Sun closed']);
  assert.equal(f.hoursPerWeek, 9.5 + 9.5 + 24 + 4.5);
  assert.equal(f.busiest, 'Tuesdays around 2:00 PM');
  assert.deepEqual(f.stars, [437, 10, 3, 1, 14]);
  assert.deepEqual(f.topics.map((t) => t.topic), ['car accident', 'settlement', 'insurance']);
  assert.deepEqual([f.phone, f.website, f.claimed, f.lacks, f.cid], ['+1863-777-4191', 'lopezandhumphries.com', true, ['pay_check'], '963']);
  // A listing that gives nothing still reads.
  assert.deepEqual(rivalFacts({}), { description: '', phone: null, website: null, claimed: null, hoursPerWeek: null, hours: [], busiest: null, stars: null, topics: [], lacks: [], cid: null });
});

test('a rival’s posts and how often it posts', () => {
  const posts = readPosts([
    { type: 'google_business_post', post_text: 'Injured in a crash? Free case review.', timestamp: '2026-11-10 14:00:00 +00:00', url: 'https://posts.example/1', images_url: ['https://img.example/1.jpg'] },
    { snippet: 'We won a $1.2M verdict.', post_date: '2026-09-01', url: 'javascript:x' },
    { post_text: '', images_url: null },
    { post_text: 'Older news', timestamp: '2026-05-01 00:00:00 +00:00' },
  ]);
  assert.deepEqual(posts.map((p) => [p.text.slice(0, 12), p.at?.slice(0, 10), p.url, p.image]), [['Injured in a', '2026-11-10', 'https://posts.example/1', 'https://img.example/1.jpg'], ['We won a $1.', '2026-09-01', null, null], ['Older news', '2026-05-01', null, null]]);
  assert.deepEqual(postCadence(posts, new Date('2026-11-18T00:00:00Z')), { total: 3, last30: 1, last90: 2, latest: '2026-11-10T14:00:00.000Z', daysSince: 7 });
  assert.deepEqual(postCadence([]), { total: 0, last30: 0, last90: 0, latest: null, daysSince: null });
  assert.deepEqual(readPosts(null), []);
});
