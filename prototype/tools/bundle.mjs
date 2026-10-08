// The season as one HTML file that opens straight from disk (browsers refuse module imports over file://) and can
// be published as a single page: its stylesheets, fonts and favicon inline, and its modules bundled by a pinned
// esbuild (fetched by npx as it runs; the game itself has no dependencies) into one inline script. Since round
// seven's phase 19 it bundles only the season: the older prototypes are in docs/archive/prototypes.
// Usage: node tools/bundle.mjs [out.html] [--fragment]
//   --fragment  omit <!doctype>, <html>, <head>, <body> for hosts that wrap the page themselves.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ESBUILD = 'esbuild@0.24.2';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const fragment = args.includes('--fragment');
const out = resolve(root, args.find((a) => !a.startsWith('--')) || 'dist/afterglass-season.html');

let html = readFileSync(resolve(root, 'season.html'), 'utf8');
const script = html.match(/<script type="module" src="([^"]+)"><\/script>/);
if (!script) throw new Error('bundle: season.html has no module script');
const js = execFileSync('npx', ['--yes', ESBUILD, resolve(root, script[1]), '--bundle', '--format=iife', '--target=es2020', '--minify-whitespace', '--minify-syntax', '--legal-comments=none'], { encoding: 'utf8', maxBuffer: 64 << 20 });

// Stylesheets inline, and the fonts they name inline in them.
const inlineCss = (href) => readFileSync(resolve(root, href), 'utf8').replace(/url\(([^)]+\.woff2)\)/g, (_, f) => `url(data:font/woff2;base64,${readFileSync(resolve(root, dirname(href), f)).toString('base64')})`);
html = html.replace(/<link rel="stylesheet" href="(?!https?:)([^"]+)">/g, (_, href) => `<style>\n${inlineCss(href)}</style>`);
// One file can't be an installable app: drop the manifest (the page then skips its service worker too)
// and the home-screen icon, and carry the favicon inline.
html = html.replace(/<link rel="(manifest|apple-touch-icon)"[^>]*>\s*/g, '');
// Its code is inline, so the page's Content Security Policy (script-src 'self') would block it: drop it too.
html = html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>\s*/i, '');
html = html.replace(/<link rel="icon" href="(?!https?:|data:)([^"]+)"/g, (_, href) => `<link rel="icon" href="data:image/png;base64,${readFileSync(resolve(root, href)).toString('base64')}"`);
html = html.replace(script[0], () => `<script>\n${js.replace(/<\/script/gi, '<\\/script')}</script>`);

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
console.log(`${relative(process.cwd(), out)}: ${(html.length / 1024).toFixed(1)} KB${fragment ? ' (fragment)' : ''}`);
