// The browser checks (round seven, phase 6): serves the page, runs each check in e2e/ in Chromium, one after
// another, and exits non-zero if any fails. `npm run e2e`, or `node e2e/run.mjs dusk quiz` for some of them.
// Needs Playwright and its Chromium: `npm i --no-save playwright` and `npx playwright install chromium`, or a
// machine-wide install.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const ROOT = normalize(join(HERE, '..'));
const PORT = Number(process.env.E2E_PORT || 8099);
// Quickest first; the tutorial and the tester's path each play three days through the page.
const ALL = ['crash', 'dev', 'trail', 'held', 'back', 'dusk', 'lastnight', 'longnight', 'veil', 'day', 'strip', 'quiz', 'phase4', 'taps', 'tutorial', 'tester'];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain' };

const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = normalize(join(ROOT, path.endsWith('/') ? `${path}index.html` : path));
  if (!file.startsWith(ROOT)) return res.writeHead(403).end();
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' }).end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});
await new Promise((ok) => server.listen(PORT, ok));

const pick = process.argv.slice(2);
const checks = pick.length ? ALL.filter((n) => pick.includes(n)) : ALL;
const results = [];
for (const name of checks) {
  const t0 = Date.now();
  const code = await new Promise((ok) => {
    const p = spawn(process.execPath, [join(HERE, `${name}.cjs`)], { env: { ...process.env, E2E_BASE: `http://localhost:${PORT}` }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    const timer = setTimeout(() => p.kill('SIGKILL'), 15 * 60 * 1000);
    p.on('exit', (c) => {
      clearTimeout(timer);
      process.stdout.write(`\n== ${name} (${Math.round((Date.now() - t0) / 1000)} s)\n${out.trim().split('\n').slice(-14).join('\n')}\n`);
      ok(c ?? 1);
    });
  });
  results.push({ name, ok: code === 0 });
}
server.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} of ${results.length} checks passed${failed.length ? `; failed: ${failed.map((r) => r.name).join(', ')}` : ''}.`);
process.exit(failed.length ? 1 : 0);
