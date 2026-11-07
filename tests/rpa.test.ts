import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTaskConfig, extractTemplateVars, formatServerTime, learnServerOffset, pickKeywordKey, pickTemplate } from '../packages/core/rpaRules';

test('rpa: task times are written on DuoPlus clock', () => {
  const t = Date.UTC(2026, 10, 7, 16, 5, 9);
  assert.equal(formatServerTime(t, 480), '2026-11-08 00:05');
  assert.equal(formatServerTime(t, 0, true), '2026-11-07 16:05:09');
});

test('rpa: the server clock offset is learned from created_at', () => {
  const now = Date.UTC(2026, 10, 7, 16, 5, 30);
  assert.equal(learnServerOffset('2026-11-08 00:05:21', now), 480);
  assert.equal(learnServerOffset('2026-11-07 16:05:21', now), 0);
  assert.equal(learnServerOffset('2026-11-07 11:05:21', now), -300);
  assert.equal(learnServerOffset('garbage', now), null);
});

test('rpa: picks the Stakeout template for the surface, or an explicit id', () => {
  const list = [
    { id: 'a', name: 'TikTok warmup' },
    { id: 'b', name: 'Chrome generic' },
    { id: 'c', name: 'Stakeout_chrome_final' },
    { id: 'd', name: 'Stakeout Maps search' },
  ];
  assert.equal(pickTemplate(list, 'chrome')?.id, 'c');
  assert.equal(pickTemplate(list, 'maps')?.id, 'd');
  assert.equal(pickTemplate(list, 'chrome', 'b')?.id, 'b');
  assert.equal(pickTemplate(list, 'google'), null);
});

test('rpa: finds the keyword variable by name, or the only text variable', () => {
  assert.equal(pickKeywordKey([{ key: 'kw', type: 'string', required: true, desc: '' }, { key: 'n', type: 'number', required: false, desc: '' }]), 'kw');
  assert.equal(pickKeywordKey([{ key: 'text1', type: 'textarea', required: true, desc: 'Search keyword' }, { key: 'x', type: 'string', required: false, desc: '' }]), 'text1');
  assert.equal(pickKeywordKey([{ key: 'only', type: 'string', required: true, desc: '' }]), 'only');
  assert.equal(pickKeywordKey([{ key: 'a', type: 'string', required: false, desc: '' }, { key: 'b', type: 'string', required: false, desc: '' }]), null);
});

test('rpa: a run sends every template variable, with the keyword and pin_id filled in', () => {
  const vars = [
    { key: 'keyword', type: 'string', required: true, desc: '', value: 'default kw' },
    { key: 'pin_id', type: 'string', required: true, desc: '', value: 'test_1_1' },
    { key: 'mb_text', type: 'string', required: true, desc: '', value: 'More businesses' },
  ];
  const cfg = buildTaskConfig(vars, 'keyword', 'painting contractors', 'ab12_3_4');
  assert.equal(cfg.keyword.value, 'painting contractors');
  assert.equal(cfg.pin_id.value, 'ab12_3_4');
  assert.equal(cfg.mb_text.value, 'More businesses');
});

test('rpa: template variables are found even when nested or JSON-encoded', () => {
  const v = [{ key: 'keyword', type: 'string', required: true, value: 'x' }];
  assert.equal(extractTemplateVars({ config: v })[0].key, 'keyword');
  assert.equal(extractTemplateVars({ template: { config: JSON.stringify(v) } })[0].key, 'keyword');
  assert.equal(extractTemplateVars({ info: { detail: { config: v } } })[0].key, 'keyword');
  assert.deepEqual(extractTemplateVars({ nothing: true }), []);
});

test('rpa: the tracked business is passed to the template as business_name', () => {
  const vars = [
    { key: 'keyword', type: 'string', required: true, desc: '', value: 'x' },
    { key: 'pin_id', type: 'string', required: true, desc: '', value: 'p' },
    { key: 'business_name', type: 'string', required: true, desc: '', value: 'McIntyre Painting' },
  ];
  assert.equal(buildTaskConfig(vars, 'keyword', 'kw', 'run1', 'Steinger, Greene & Feiner').business_name.value, 'Steinger, Greene & Feiner');
  assert.equal(buildTaskConfig(vars, 'keyword', 'kw', 'run1').business_name.value, 'McIntyre Painting');
});
