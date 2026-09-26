// Inlines style.css and the ES modules into one HTML file, so the greybox opens straight from disk
// (browsers refuse module imports over file://) and can be published as a single page.
// Usage: node tools/bundle.mjs [out.html] [--page night.html] [--fragment]
//   --page      the page to bundle (default index.html)
//   --fragment  omit <!doctype>, <html>, <head>, <body> for hosts that wrap the page themselves.
// Deliberately tiny: it understands `import { a, b as c } from './x.js'` and `export function/const/let/class`,
// which is all this project uses. Each module becomes an IIFE so top-level names can't collide.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve, relative, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const fragment = args.includes('--fragment');
const pageAt = args.indexOf('--page');
const page = pageAt >= 0 ? args[pageAt + 1] : 'index.html';
const out = resolve(root, args.find((a, i) => !a.startsWith('--') && (pageAt < 0 || i !== pageAt + 1)) || `dist/${page.replace(/\.html$/, '')}.html`);

const mods = new Map();
const varOf = (p) => `__${basename(p, '.js').replace(/\W/g, '_')}_${mods.size}`;

function load(path) {
  if (mods.has(path)) return mods.get(path);
  const m = { path, name: null, code: '', deps: [], exports: [] };
  mods.set(path, m);
  m.name = varOf(path);
  let code = readFileSync(path, 'utf8');
  code = code.replace(/^import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"];?[ \t]*$/gm, (_, names, spec) => {
    const dep = load(resolve(dirname(path), spec));
    m.deps.push(dep);
    const binds = names.split(',').map((x) => x.trim()).filter(Boolean).map((x) => x.replace(/\s+as\s+/, ': '));
    return `const { ${binds.join(', ')} } = ${dep.name};`;
  });
  code = code.replace(/^export\s+(async\s+function\*?|function\*?|const|let|class)\s+([A-Za-z_$][\w$]*)/gm, (_, kw, name) => {
    m.exports.push(name);
    return `${kw} ${name}`;
  });
  if (/^\s*(import|export)\s/m.test(code)) throw new Error(`bundle: unsupported import/export form in ${relative(root, path)}`);
  m.code = code;
  return m;
}

let html = readFileSync(resolve(root, page), 'utf8');
const script = html.match(/<script type="module" src="([^"]+)"><\/script>/);
if (!script) throw new Error(`bundle: ${page} has no module script`);

const order = [];
const seen = new Set();
(function visit(m) {
  if (seen.has(m)) return;
  seen.add(m);
  m.deps.forEach(visit);
  order.push(m);
})(load(resolve(root, script[1])));

const js = order
  .map((m) => `// ${relative(root, m.path)}\nconst ${m.name} = (() => {\n${m.code}\nreturn { ${m.exports.join(', ')} };\n})();`)
  .join('\n\n');
html = html.replace(/<link rel="stylesheet" href="(?!https?:)([^"]+)">/g, (_, href) => `<style>\n${readFileSync(resolve(root, href), 'utf8')}</style>`);
// One file can't be an installable app: drop the manifest (the page then skips its service worker too)
// and the home-screen icon, and carry the favicon inline.
html = html.replace(/<link rel="(manifest|apple-touch-icon)"[^>]*>\s*/g, '');
html = html.replace(/<link rel="icon" href="(?!https?:|data:)([^"]+)"/g, (_, href) => `<link rel="icon" href="data:image/png;base64,${readFileSync(resolve(root, href)).toString('base64')}"`);
html = html.replace(script[0], () => `<script>\n'use strict';\n${js}\n</script>`);

if (fragment) {
  html = html
    .replace(/<!doctype html>\s*/i, '')
    .replace(/<\/?html[^>]*>\s*/gi, '')
    .replace(/<\/?head>\s*/gi, '')
    .replace(/<\/?body>\s*/gi, '')
    .replace(/<meta charset[^>]*>\s*/i, '')
    .replace(/<meta name="viewport"[^>]*>\s*/i, '');
  if (!html.trimStart().startsWith('<title>')) throw new Error('bundle: the fragment must start with its <title>');
}

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`${relative(process.cwd(), out)}: ${(html.length / 1024).toFixed(1)} KB from ${order.length} modules${fragment ? ' (fragment)' : ''}`);
