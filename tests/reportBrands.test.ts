import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The report is one static page; its brand grouping is read out of it so the page stays the only copy.
const page = readFileSync(join(__dirname, '../apps/nextjs/public/reports/visibility.html'), 'utf8');
const body = page.split('/* brand-groups:start */')[1].split('/* brand-groups:end */')[0];
const nameKey = (name: string) => String(name).toLowerCase().normalize('NFKD').replace(/[‘’ʼ`´']/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
const brandGroups = new Function(body + '\nreturn brandGroups;')() as (keys: string[]) => Map<string, string>;
const groups = (names: string[]) => {
  const g = brandGroups(names.map(nameKey)), out = new Map<string, string[]>();
  names.forEach((n) => out.set(g.get(nameKey(n))!, [...(out.get(g.get(nameKey(n))!) || []), n]));
  return [...out.values()].map((v) => v.sort()).sort((a, b) => a[0].localeCompare(b[0]));
};

test('report brands: the spellings Google gave one Lakeland scan fold into one row per firm', () => {
  assert.deepEqual(
    groups(['Roto-Rooter Plumbing & Drain Services', 'Roto-Rooter', '1-Tom-Plumber Lakeland', 'Tom-Plumber Lakeland', 'Benjamin Franklin Plumbing', 'Benjamin Franklin Plumbing of Lakeland', 'Benjamin Franklin Plumbing® of Lakeland', 'Richard C Fox Plumbing', 'Richard C. Fox Plumbing', 'Richard Fox Plumbing', "Stuart's Plumbing", 'Stuart’s Plumbing', 'Nest Plumbing LLC', 'AP Drain Service LLC Plumbing And Septic']),
    [
      ['1-Tom-Plumber Lakeland', 'Tom-Plumber Lakeland'],
      ['AP Drain Service LLC Plumbing And Septic'],
      ['Benjamin Franklin Plumbing', 'Benjamin Franklin Plumbing of Lakeland', 'Benjamin Franklin Plumbing® of Lakeland'],
      ['Nest Plumbing LLC'],
      ['Richard C Fox Plumbing', 'Richard C. Fox Plumbing', 'Richard Fox Plumbing'],
      ['Roto-Rooter', 'Roto-Rooter Plumbing & Drain Services'],
      ["Stuart's Plumbing", 'Stuart’s Plumbing'],
    ],
  );
});

test('report brands: different firms that share common words stay apart', () => {
  const apart = ['Nest Plumbing LLC', 'Vanguard Plumbing', 'Florida Plumbing Medic', 'True Plumbers & AC', 'Top Notch Plumbers Lakeland', 'On-Deck Plumbing', '1 Time Plumbing', 'All Pro Plumbing & Air', 'Pro plumbing LLC', 'A & A Plumbing', 'B & B Plumbing', 'Plumbing'];
  assert.equal(groups(apart).length, apart.length);
});

test('report brands: a company ending alone does not make a new firm', () => {
  assert.deepEqual(groups(['Nest Plumbing LLC', 'Nest Plumbing', 'Ryals Brothers Inc.', 'Ryals Brothers']), [['Nest Plumbing', 'Nest Plumbing LLC'], ['Ryals Brothers', 'Ryals Brothers Inc.']]);
});
