import test from 'node:test';
import assert from 'node:assert/strict';
import { readMhtml, mhtmlToReplayHtml } from '../packages/core/mhtml';

// 1×1 PNG.
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const B = '----MultipartBoundary--abc123----';
const snapshot = [
  'From: <Saved by Blink>',
  'Snapshot-Content-Location: https://www.google.com/search?q=plumber',
  'MIME-Version: 1.0',
  'Content-Type: multipart/related;',
  '\ttype="text/html";',
  '\tboundary="' + B + '"',
  '',
  '',
  '--' + B,
  'Content-Type: text/html',
  'Content-ID: <frame-1@mhtml.blink>',
  'Content-Transfer-Encoding: quoted-printable',
  'Content-Location: https://www.google.com/search?q=plumber',
  '',
  '<!DOCTYPE html><html><head><link rel=3D"stylesheet" href=3D"https://www.gstatic.com/s/a.css"><script>alert(1)</script></head>=',
  '<body><div onclick=3D"go()" aria-label=3D"a > b" style=3D"background:url(/img/bg.png)">AI Overview Stuart=E2=80=99s Plumbing</div>',
  '<img src=3D"https://lh3.googleusercontent.com/p/x=3Dw80" alt=3D"photo"><a href=3D"javascript:void(0)">x</a><iframe src=3D"https://ads.example"></iframe></body></html>',
  '--' + B,
  'Content-Type: text/css',
  'Content-Transfer-Encoding: quoted-printable',
  'Content-Location: https://www.gstatic.com/s/a.css',
  '',
  '.card{background:url(../i/star.png)}',
  '--' + B,
  'Content-Type: image/png',
  'Content-Transfer-Encoding: base64',
  'Content-Location: https://www.gstatic.com/i/star.png',
  '',
  PNG,
  '--' + B,
  'Content-Type: image/png',
  'Content-Transfer-Encoding: base64',
  'Content-Location: https://lh3.googleusercontent.com/p/x=w80',
  '',
  PNG,
  '--' + B,
  'Content-Type: image/png',
  'Content-Transfer-Encoding: base64',
  'Content-Location: https://www.google.com/img/bg.png',
  '',
  PNG,
  '--' + B + '--',
  '',
].join('\r\n');

test('a Chrome snapshot (MHTML) is read part by part', () => {
  const parts = readMhtml(snapshot);
  assert.deepEqual(parts.map((p) => p.type), ['text/html', 'text/css', 'image/png', 'image/png', 'image/png']);
  assert.match(parts[0].body.toString('utf8'), /Stuart’s Plumbing/, 'quoted-printable decoded, UTF-8 kept');
  assert.equal(parts[2].body.subarray(1, 4).toString('latin1'), 'PNG');
  assert.deepEqual(readMhtml('not a snapshot'), []);
});

test('the snapshot becomes one self-contained page that runs nothing', () => {
  const html = mhtmlToReplayHtml(snapshot)!;
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /onclick/i);
  assert.doesNotMatch(html, /<iframe/i);
  assert.doesNotMatch(html, /javascript:/i);
  assert.doesNotMatch(html, /gstatic\.com\/s\/a\.css/, 'the stylesheet is inlined');
  assert.match(html, /<style>\.card\{background:var\(--sk\w+\)\}<\/style>/, "the stylesheet's own image, resolved against the stylesheet");
  assert.match(html, /<style>:root\{--sk0:url\(data:image\/png;base64,iVBOR[^;]*;--sk1:url\(data:image\/png;base64,iVBOR[^}]*\}<\/style>/, 'each image the styles use, written once');
  assert.match(html, /<img src="data:image\/png;base64,iVBOR/, 'images inlined, matched through the escaped address');
  assert.match(html, /style="background:var\(--sk\w+\)"/, 'images in style attributes, relative to the page');
  assert.match(html, /aria-label="a > b"/, 'attributes holding ">" survive');
  assert.match(html, /<meta name="referrer" content="no-referrer"><base href="https:\/\/www\.google\.com\/search\?q=plumber">/);
  assert.equal(mhtmlToReplayHtml('nothing'), null);
});

/** A snapshot of one page and the given resources. */
const mhtml = (page: string, res: [string, string, string][]) =>
  [
    'MIME-Version: 1.0',
    'Content-Type: multipart/related; type="text/html"; boundary="' + B + '"',
    '',
    '--' + B,
    'Content-Type: text/html',
    'Content-Transfer-Encoding: 8bit',
    'Content-Location: https://www.google.com/search?q=plumber&hl=en',
    '',
    page,
    ...res.flatMap(([loc, type, body]) => ['--' + B, 'Content-Type: ' + type, 'Content-Transfer-Encoding: ' + (type.startsWith('text/') ? '8bit' : 'base64'), 'Content-Location: ' + loc, '', body]),
    '--' + B + '--',
    '',
  ].join('\n');

test('an image used again and again is stored once, and the page stays valid around it', () => {
  const big = Buffer.alloc(30000, 7).toString('base64');
  const rules = Array.from({ length: 200 }, (_, i) => `.i${i}{background:url(/sprite.png) -${i * 20}px 0}`).join('');
  const page =
    '<html><head><link rel="stylesheet" href="https://www.gstatic.com/css/m.css"><style>' + rules + '.g{fill:url(#grad)}</style></head><body>' +
    '<div style="font-family:&quot;Google Sans&quot;,arial;background:url(&quot;/sprite.png&quot;)">x</div>' +
    '<img data-src="https://www.gstatic.com/big.png" src="https://www.gstatic.com/big.png">'.repeat(5) +
    '<img srcset="data:image/png;base64,' + PNG + ' 1x, https://www.gstatic.com/big.png 2x">' +
    '</body></html>';
  const css = '@font-face{font-family:G;src:url(../f/g.woff2) format("woff2")}.b{background:url(../i/missing.png)}.c{background:url(/sprite.png)}';
  const html = mhtmlToReplayHtml(
    mhtml(page, [
      ['https://www.gstatic.com/css/m.css', 'text/css', css],
      ['https://www.google.com/sprite.png', 'image/png', PNG],
      ['https://www.gstatic.com/f/g.woff2', 'font/woff2', PNG],
      ['https://www.gstatic.com/big.png', 'image/png', big],
    ]),
    { repeatBudget: 100000 },
  )!;
  assert.equal(html.split('url(data:image/png;base64,' + PNG + ')').length - 1, 1, 'the sprite: once, for 200 rules, a stylesheet and a style attribute');
  assert.match(html, /\.i199\{background:var\(--sk0\) -3980px 0\}/);
  assert.match(html, /src:url\(data:font\/woff2;base64,[^)]+\) format\("woff2"\)/, 'a font goes in directly (its description takes no var())');
  assert.match(html, /\.b\{background:url\(https:\/\/www\.gstatic\.com\/i\/missing\.png\)\}/, "an image the snapshot lacks: resolved against its stylesheet");
  assert.match(html, /\.g\{fill:url\(#grad\)\}/, 'a reference inside the page is left alone');
  assert.match(html, /<div style="font-family:&quot;Google Sans&quot;,arial;background:var\(--sk0\)">/, 'a style attribute stays one valid attribute');
  assert.equal((html.match(/data-src="https:\/\/www\.gstatic\.com\/big\.png"/g) ?? []).length, 5, 'data-src is not shown without scripts: left as it was');
  // 40 KB inlined per use: the first use, then two repeats within the 100 KB budget, then addresses.
  assert.equal((html.match(/ src="data:image\/png;base64,BwcH/g) ?? []).length, 3);
  assert.equal((html.match(/ src="https:\/\/www\.gstatic\.com\/big\.png"/g) ?? []).length, 2);
  assert.match(html, new RegExp('srcset="data:image/png;base64,' + PNG.replace(/[+/=]/g, '\\$&') + ' 1x, https://www\\.gstatic\\.com/big\\.png 2x"'), 'a srcset keeps its data URI whole (commas and all)');
  assert.match(html, /<base href="https:\/\/www\.google\.com\/search\?q=plumber&amp;hl=en">/);
});
