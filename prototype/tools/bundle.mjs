// Inlines style.css and the ES modules into one HTML file, so the greybox opens straight from disk
// (browsers refuse module imports over file://) and can be published as a single page.
// Usage: node tools/bundle.mjs [out.html] [--fragment]
//   --fragment  omit <!doctype>, <html>, <head>, <body> for hosts that wrap the page themselves.
// Deliberately tiny: it understands `import { a, b as c } from './x.js'` and `export function/const/let/class`,
// which is all this project uses. Each module becomes an IIFE so top-level names can't collide.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve, relative, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const fragment = args.includes('--fragment');
const out = resolve(root, args.find((a) => !a.startsWith('--')) || 'dist/afterglass-greybox.html');

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

const order = [];
const seen = new Set();
(function visit(m) {
  if (seen.has(m)) return;
  seen.add(m);
  m.deps.forEach(visit);
  order.push(m);
})(load(resolve(root, 'src/ui.js')));

const js = order
  .map((m) => `// ${relative(root, m.path)}\nconst ${m.name} = (() => {\n${m.code}\nreturn { ${m.exports.join(', ')} };\n})();`)
  .join('\n\n');
const css = readFileSync(resolve(root, 'style.css'), 'utf8');
let html = readFileSync(resolve(root, 'index.html'), 'utf8');

const swap = (from, to) => {
  if (!html.includes(from)) throw new Error(`bundle: index.html has no ${from}`);
  html = html.replace(from, () => to);
};
swap('<link rel="stylesheet" href="style.css">', `<style>\n${css}</style>`);
swap('<script type="module" src="src/ui.js"></script>', `<script>\n'use strict';\n${js}\n</script>`);

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
