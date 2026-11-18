import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readAiPage, markAiPage, mergeAiPages } from '../packages/core/aiPage';
import { parseHtml, htmlText, findHtml } from '../packages/core/htmlTree';

const fx = (f: string) => readFileSync(new URL('./fixtures/' + f, import.meta.url), 'utf8');

test('the HTML reader: elements in order, attributes and text decoded, scripts and comments skipped', () => {
  const root = parseHtml('<!DOCTYPE html><div id="a" data-x=\'1 > 2\'>Tom&amp;Co<br><!-- x --><script>if (a<b) "</div>"</script><span>Plumbing</span></div><p>after</p>');
  const a = findHtml(root, (n) => n.attrs.id === 'a')!;
  assert.equal(a.attrs['data-x'], '1 > 2');
  assert.equal(htmlText(a), 'Tom&CoPlumbing');
  assert.equal(findHtml(root, (n) => n.tag === 'p')!.parent!.tag, '#root', 'the script did not swallow the rest');
});

test('the page as it loaded: four cards, the first in view, the rest behind "Show more"; each Website button (Lakeland, 18 Nov)', () => {
  const p = readAiPage(fx('aio-page-pre.html'))!;
  assert.equal(p.expanded, false);
  assert.deepEqual(
    p.cards.map((c) => [c.name, c.website, c.above]),
    [
      ['1-Tom-Plumber Lakeland', '1tomplumber.com', true],
      ['Richard C Fox Plumbing', 'richardfoxplumbing.com', false],
      ['Benjamin Franklin Plumbing', 'lakelandbenjaminfranklin.com', false],
      ['Roto-Rooter Plumbing & Drain Services', 'rotorooter.com', false],
    ],
  );
  assert.equal(p.cards[0].phone, '+1 863-225-1411', "the card's own phone line");
  assert.deepEqual(p.sites, ['yelp.com', 'rotorooter.com'], "cited outside the cards, Google's own pages left out");
});

test('the page with the AI Overview open: the same cards and buttons, no fold to read', () => {
  const p = readAiPage(fx('aio-page-post.html'))!;
  assert.equal(p.expanded, true);
  assert.deepEqual(p.cards.map((c) => c.above), [null, null, null, null]);
  const both = mergeAiPages(readAiPage(fx('aio-page-pre.html')), p)!;
  assert.deepEqual(both.cards.map((c) => [c.website, c.above]), [
    ['1tomplumber.com', true],
    ['richardfoxplumbing.com', false],
    ['lakelandbenjaminfranklin.com', false],
    ['rotorooter.com', false],
  ]);
  assert.equal(readAiPage('<html><body><p>No AI Overview</p></body></html>'), null);
});

test('the parts are marked on the page shown, and nothing else changes', () => {
  const src = fx('aio-page-post.html');
  const marked = markAiPage(src);
  assert.equal((marked.match(/data-sk="p0"/g) ?? []).length, 1);
  assert.equal((marked.match(/data-sk="card"/g) ?? []).length, 4);
  assert.ok((marked.match(/data-sk="web"/g) ?? []).length >= 2);
  assert.match(marked, /<a id="sk-all" class="sk-at"><\/a>.*<div[^>]*id="m-x-content"/s, 'anchors just before the AI Overview');
  assert.match(marked, /<head><style>\.sk-at\{/);
  // Read again from the marked page: the same answer.
  assert.deepEqual(readAiPage(marked), readAiPage(src));
  // The marks only add attributes: removing them gives the page back.
  const back = marked.replace(/ data-sk="\w+"/g, '').replace(/<a id="sk-\w+" class="sk-at"><\/a>/g, '').replace(/<style>\.sk-at\{[^<]*<\/style>/, '');
  assert.equal(back, src);
  // The opening answer is the line before the cards.
  assert.match(htmlText(findHtml(parseHtml(marked), (n) => n.attrs['data-sk'] === 'p0')!), /^Here are 24-hour emergency plumbers available in Lakeland, FL:/);
});
