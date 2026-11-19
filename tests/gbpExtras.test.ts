import test from 'node:test';
import assert from 'node:assert/strict';
import { attributePatch, attributeProblem, buildServices, linkProblem, readAttributes, readLinks, readServices, serviceProblem, serviceTypeName } from '../packages/core/gbpExtras';

const available = [
  { parent: 'attributes/is_owned_by_women', valueType: 'BOOL', displayName: 'Identifies as women-owned', groupDisplayName: 'From the business', valueMetadata: [{ value: true, displayName: 'Yes' }] },
  { parent: 'attributes/has_wheelchair_accessible_entrance', valueType: 'BOOL', displayName: 'Wheelchair accessible entrance', groupDisplayName: 'Accessibility', valueMetadata: [{ value: true }, { value: false }] },
  { parent: 'attributes/url_facebook', valueType: 'URL', displayName: 'Facebook', groupDisplayName: 'Social' },
  { parent: 'attributes/url_text_messaging', valueType: 'URL', displayName: 'Text messaging', groupDisplayName: 'Social' },
  { parent: 'attributes/pay_methods', valueType: 'REPEATED_ENUM', displayName: 'Payments', groupDisplayName: 'Payments', valueMetadata: [{ value: 'visa', displayName: 'Visa' }, { value: 'amex', displayName: 'Amex' }, { value: 'cash', displayName: 'Cash' }] },
  { parent: 'attributes/old_one', valueType: 'BOOL', displayName: 'Old', deprecated: true },
  { parent: 'attributes/strange', valueType: 'HOLOGRAM', displayName: 'Strange' },
];
const current = [
  { name: 'attributes/has_wheelchair_accessible_entrance', valueType: 'BOOL', values: [true] },
  { name: 'attributes/url_facebook', valueType: 'URL', uriValues: [{ uri: 'https://www.facebook.com/glow/' }] },
  { name: 'attributes/url_text_messaging', valueType: 'URL', uriValues: [{ uri: 'sms:+17205550100' }] },
  { name: 'attributes/pay_methods', valueType: 'REPEATED_ENUM', repeatedEnumValue: { setValues: ['visa'] } },
];

test('attributes are read with their value now; unknown and retired ones are left out', () => {
  const a = readAttributes(available, current);
  assert.deepEqual(a.map((x) => x.name.replace('attributes/', '')), ['is_owned_by_women', 'has_wheelchair_accessible_entrance', 'url_facebook', 'url_text_messaging', 'pay_methods']);
  assert.deepEqual(a.map((x) => x.value), [null, true, ['https://www.facebook.com/glow/'], ['sms:+17205550100'], ['visa']]);
  assert.deepEqual([a[0].canSayNo, a[1].canSayNo], [false, true]);
  assert.deepEqual(a[4].options[1], { value: 'amex', label: 'Amex' });
});

test('only the attributes that differ are sent, and only they are in the mask', () => {
  const a = readAttributes(available, current);
  assert.equal(attributePatch(a, {}), null);
  assert.equal(attributePatch(a, { 'attributes/has_wheelchair_accessible_entrance': true, 'attributes/url_facebook': ['https://www.facebook.com/glow/'] }), null);
  const p = attributePatch(a, {
    'attributes/is_owned_by_women': true,
    'attributes/has_wheelchair_accessible_entrance': null,
    'attributes/url_facebook': ['https://www.facebook.com/glowdenver/'],
    'attributes/pay_methods': ['visa', 'cash'],
    'attributes/not_on_this_listing': true,
  })!;
  assert.deepEqual(p.attribute_mask, ['attributes/is_owned_by_women', 'attributes/has_wheelchair_accessible_entrance', 'attributes/url_facebook', 'attributes/pay_methods']);
  // "Not stated" is in the mask and not in the values: that clears it.
  assert.deepEqual(p.attributes, [
    { name: 'attributes/is_owned_by_women', values: [true] },
    { name: 'attributes/url_facebook', uriValues: [{ uri: 'https://www.facebook.com/glowdenver/' }] },
    { name: 'attributes/pay_methods', repeatedEnumValue: { setValues: ['visa', 'cash'], unsetValues: ['amex'] } },
  ]);
  assert.deepEqual(p.changed[1], { label: 'Wheelchair accessible entrance', from: 'yes', to: 'not stated' });
  assert.deepEqual(p.changed[3], { label: 'Payments', from: 'Visa', to: 'Visa, Cash' });
});

test('attribute values Google would refuse are caught first', () => {
  const a = readAttributes(available, current);
  assert.match(attributeProblem(a, { 'attributes/is_owned_by_women': false })!, /claimed or left blank/);
  assert.match(attributeProblem(a, { 'attributes/url_facebook': ['facebook.com/glow'] })!, /not an https link/);
  assert.match(attributeProblem(a, { 'attributes/pay_methods': ['bitcoin'] })!, /unknown choice/);
  // The text-message link already there is kept as it is; adding a web link beside it is fine.
  assert.equal(attributeProblem(a, { 'attributes/url_text_messaging': ['sms:+17205550100', 'https://glow.example/text'] }), null);
  assert.equal(attributeProblem(a, { 'attributes/has_wheelchair_accessible_entrance': false }), null);
});

const live = [
  { structuredServiceItem: { serviceTypeId: 'job_type_id:lip_fillers', description: 'From $600 a syringe.' }, price: { currencyCode: 'USD', units: '600' } },
  { structuredServiceItem: { serviceTypeId: 'job_type_id:hydrafacial' } },
  { freeFormServiceItem: { category: 'categories/gcid:medical_spa', label: { displayName: 'Lip flip' } } },
];

test('services are read as rows, structured ones named from their id', () => {
  assert.equal(serviceTypeName('job_type_id:bbl_photo_facial'), 'Bbl photo facial');
  assert.deepEqual(readServices(live, { 'job_type_id:hydrafacial': 'HydraFacial' }), [
    { key: 's:job_type_id:lip_fillers', name: 'Lip fillers', description: 'From $600 a syringe.', kind: 'structured' },
    { key: 's:job_type_id:hydrafacial', name: 'HydraFacial', description: '', kind: 'structured' },
    { key: 'f:lip flip', name: 'Lip flip', description: '', kind: 'free' },
  ]);
});

test('the new service list keeps Google’s own objects and changes only what was asked', () => {
  const r = buildServices(live, [
    { key: 's:job_type_id:lip_fillers', description: 'From $600 a syringe.' },
    { key: 'f:lip flip', description: 'A quick lift for the upper lip.' },
    { name: 'Semaglutide', description: '' },
    { typeId: 'job_type_id:microneedling', name: 'Microneedling', description: 'Collagen induction.' },
  ], 'categories/gcid:medical_spa');
  // The price Google returned is still there, untouched.
  assert.deepEqual(r.serviceItems[0], live[0]);
  assert.deepEqual(r.serviceItems[1], { freeFormServiceItem: { category: 'categories/gcid:medical_spa', label: { displayName: 'Lip flip', description: 'A quick lift for the upper lip.' } } });
  assert.deepEqual(r.serviceItems[2], { freeFormServiceItem: { category: 'categories/gcid:medical_spa', label: { displayName: 'Semaglutide', languageCode: 'en' } } });
  assert.deepEqual(r.serviceItems[3], { structuredServiceItem: { serviceTypeId: 'job_type_id:microneedling', description: 'Collagen induction.' } });
  assert.deepEqual(r.changed, ['Lip flip: description added', 'Semaglutide: added', 'Microneedling: added', 'Hydrafacial: removed']);
  // Nothing asked to change: nothing changes, and the live list is not altered in place.
  assert.deepEqual(buildServices(live, live.map((_, i) => ({ key: readServices(live)[i].key, description: readServices(live)[i].description })), 'c').changed, []);
  assert.equal((live[2] as any).freeFormServiceItem.label.description, undefined);
});

test('service limits', () => {
  assert.equal(serviceProblem([{ key: 's:x', description: '' }, { name: 'Lip flip', description: 'ok' }]), null);
  assert.match(serviceProblem([{ name: ' ', description: '' }])!, /needs a name/);
  assert.match(serviceProblem([{ name: 'A', description: 'x'.repeat(301) }])!, /at most 300/);
  assert.match(serviceProblem([{ key: 'f:lip flip', description: '' }, { name: 'Lip Flip', description: '' }])!, /listed twice/);
});

test('action links', () => {
  const links = readLinks([
    { name: 'locations/1/placeActionLinks/a', uri: 'https://book.example/x', placeActionType: 'APPOINTMENT', isPreferred: true, isEditable: true, providerType: 'MERCHANT' },
    { name: 'locations/1/placeActionLinks/b', uri: 'https://partner.example', placeActionType: 'APPOINTMENT', isEditable: false, providerType: 'AGGREGATOR_3P' },
    { name: 'junk' },
  ]);
  assert.deepEqual(links.map((l) => [l.preferred, l.editable]), [[true, true], [false, false]]);
  assert.equal(linkProblem('https://book.example/x', 'APPOINTMENT', ['APPOINTMENT']), null);
  assert.match(linkProblem('book.example', 'APPOINTMENT', [])!, /https/);
  assert.match(linkProblem('https://x.example', 'TELEPORT', [])!, /Choose what/);
  assert.match(linkProblem('https://x.example', 'FOOD_ORDERING', ['APPOINTMENT'])!, /does not offer/);
});
