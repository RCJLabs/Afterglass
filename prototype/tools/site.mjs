// Builds the site GitHub Pages publishes (round seven, phase 19): a copy of a source tree, the repository root,
// with the build stamped in, and the season's page as one script. .github/workflows/pages.yml builds the latest
// release tag into the site's root and main into preview/; with no tag yet, main goes at the root.
//
//   node prototype/tools/site.mjs --src <tree> --out <dir> --channel release|preview --build <name>
//
// In the copy: prototype/src/build.js says the build and channel; the season's modules are bundled by esbuild
// (pinned, fetched by npx as it builds: the game itself has no dependencies) into prototype/season.js, which
// season.html loads instead; the service worker caches that instead of the modules, and a preview's worker
// keeps a cache of its own; prototype/version.json says the build, for the page's update notice; and a
// preview's app is named as one, so it installs beside the release. A tree from before the page was split (no
// src/page) is copied with the stamp alone, its modules as they were.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const ESBUILD = 'esbuild@0.24.2';
const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i < 0 ? d : process.argv[i + 1];
};
const src = resolve(arg('src', '.'));
const out = resolve(arg('out', '_site'));
const channel = arg('channel', 'release');
const build = arg('build', 'dev');
if (!['release', 'preview'].includes(channel)) throw new Error(`--channel is release or preview, not ${channel}`);
if (!/^[\w.-]+$/.test(build)) throw new Error(`--build ${build} isn't a plain name`);

const SKIP = new Set(['.git', 'node_modules', '_site', 'dist']);
mkdirSync(out, { recursive: true });
cpSync(src, out, { recursive: true, filter: (p) => !p.slice(src.length).split(/[\\/]/).some((x) => SKIP.has(x)) });
const P = (f) => join(out, 'prototype', f);
const read = (f) => readFileSync(P(f), 'utf8');
const write = (f, text) => writeFileSync(P(f), text);
const edit = (f, from, to) => {
  const text = read(f);
  const next = text.replace(from, to);
  if (next === text) throw new Error(`site: ${f} has no ${from}`);
  write(f, next);
};

write('src/build.js', `export const BUILD = '${build}';\nexport const CHANNEL = '${channel}';\n`);
write('version.json', `${JSON.stringify({ build, channel })}\n`);
if (existsSync(P('src/page'))) {
  execFileSync('npx', ['--yes', ESBUILD, P('src/slice-ui.js'), '--bundle', '--format=esm', '--target=es2020', '--minify-whitespace', '--minify-syntax', '--legal-comments=none', `--outfile=${P('season.js')}`], { stdio: 'inherit' });
  edit('season.html', '<script type="module" src="src/slice-ui.js"></script>', '<script type="module" src="season.js"></script>');
  // The worker caches the one script in place of the modules.
  const sw = read('sw.js');
  const core = sw.match(/const CORE = \[\n([\s\S]*?)\];/);
  const files = core[1].split('\n').filter((l) => l.trim() && !/^\s*'src\//.test(l));
  write('sw.js', sw.replace(core[0], `const CORE = [\n${files.join('\n')}\n  'season.js',\n];`));
}
if (channel === 'preview') {
  edit('sw.js', "const CACHE = 'afterglass-season';", "const CACHE = 'afterglass-preview';");
  const m = JSON.parse(read('season.webmanifest'));
  Object.assign(m, { name: `${m.name} (preview)`, short_name: `${m.short_name} preview` });
  write('season.webmanifest', `${JSON.stringify(m, null, 2)}\n`);
}
console.log(`site: ${src} as ${channel} ${build} into ${out}`);
