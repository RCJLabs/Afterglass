import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(root, p), 'utf8');
const html = read('season.html');
const manifest = JSON.parse(read('season.webmanifest'));

// The worker's CORE list and FONT_CSS, read by running sw.js against a stub worker scope.
function core() {
  const scope = { self: { addEventListener() {}, location: new URL('https://example.test/Base-Manager/prototype/sw.js') }, URL, Set };
  vm.runInNewContext(`${read('sw.js')}\nself.CORE = CORE;\nself.FONT_CSS = FONT_CSS;`, scope);
  return scope.self;
}

// Every module the page imports, the way the bundler follows them.
function modules() {
  const entry = html.match(/<script type="module" src="([^"]+)"><\/script>/)[1];
  const seen = new Set();
  (function visit(p) {
    if (seen.has(p)) return;
    seen.add(p);
    for (const m of readFileSync(p, 'utf8').matchAll(/^import\s*\{[^}]*\}\s*from\s*['"]([^'"]+)['"]/gm)) visit(resolve(dirname(p), m[1]));
  })(resolve(root, entry));
  return [...seen].map((p) => relative(root, p).split('\\').join('/'));
}

const pngSize = (p) => {
  const b = readFileSync(resolve(root, p));
  assert.equal(b.subarray(1, 4).toString('ascii'), 'PNG', `${p} is not a PNG`);
  return `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}`;
};

test('the service worker caches everything the season page needs, and nothing that is missing', () => {
  const { CORE: list, FONT_CSS } = core();
  const fonts = [...html.matchAll(/<link rel="stylesheet" href="(https:\/\/fonts\.googleapis\.com\/[^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));
  assert.deepEqual(fonts, [FONT_CSS], 'sw.js FONT_CSS is not the stylesheet season.html loads');
  const local = (href) => !/^(https?:|data:)/.test(href);
  const needs = [
    'season.html',
    ...modules(),
    ...[...html.matchAll(/<link rel="(?:stylesheet|manifest|icon|apple-touch-icon)" href="([^"]+)"/g)].map((m) => m[1]).filter(local),
    ...manifest.icons.map((i) => i.src),
  ];
  for (const f of needs) assert.ok(list.includes(f), `sw.js CORE is missing ${f}`);
  for (const f of list) assert.ok(existsSync(resolve(root, f)), `sw.js CORE lists ${f}, which doesn't exist`);
  assert.equal(new Set(list).size, list.length, 'sw.js CORE has a duplicate');
});

test('the manifest makes an installable, full-screen app whose icons are the sizes it says', () => {
  for (const k of ['name', 'short_name', 'start_url', 'scope', 'display', 'background_color', 'theme_color', 'icons']) assert.ok(manifest[k], `manifest has no ${k}`);
  assert.equal(manifest.display, 'fullscreen');
  const base = 'https://example.test/Base-Manager/prototype/season.webmanifest';
  const start = new URL(manifest.start_url, base).href;
  assert.ok(start.startsWith(new URL(manifest.scope, base).href), 'start_url is outside the scope');
  assert.ok(existsSync(resolve(root, new URL(manifest.start_url, 'https://x/').pathname.slice(1))), 'start_url is not a page here');
  assert.ok(manifest.short_name.length <= 12, 'short_name gets cut off under a launcher icon');
  const sizes = manifest.icons.map((i) => ({ ...i, real: pngSize(i.src) }));
  for (const i of sizes) assert.equal(i.real, i.sizes, `${i.src} is ${i.real}, the manifest says ${i.sizes}`);
  assert.ok(sizes.some((i) => i.sizes === '192x192' && i.purpose.includes('any')), 'no 192 icon');
  assert.ok(sizes.some((i) => i.sizes === '512x512' && i.purpose.includes('any')), 'no 512 icon');
  assert.ok(sizes.some((i) => i.purpose.includes('maskable')), 'no maskable icon');
  assert.equal(pngSize('icons/apple-touch-icon.png'), '180x180');
  assert.match(html, /<meta name="theme-color" content="#0e0b18">/);
  assert.equal(manifest.theme_color, '#0e0b18');
});
