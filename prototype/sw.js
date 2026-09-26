// The season's service worker: it lets the installed app open with no connection.
// The season's own files go to the network first, so a deploy shows on the next load, and fall back to
// the copy cached at install or on the last visit that reached the network. Google Fonts come from the
// cache first (their files never change). The other prototypes in this folder load their own files as
// if there were no worker; they share the season's fonts, which are the same ones.
// CORE must list every file season.html needs, and FONT_CSS must be its fonts stylesheet; test/pwa.test.js
// checks both against the page.

const CACHE = 'afterglass-season';
const FONTS = 'afterglass-fonts';
const CORE = [
  'season.html',
  'style.css',
  'night.css',
  'season.css',
  'season.webmanifest',
  'src/slice-ui.js',
  'src/slice/data.js',
  'src/data.js',
  'src/slice/sim.js',
  'src/slice/geo.js',
  'src/rng.js',
  'src/slice/draw.js',
  'src/px/kit.js',
  'src/px/lut.js',
  'src/slice/book.js',
  'src/slice/people.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
  'icons/favicon-32.png',
];
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Alegreya+SC:wght@500;700&family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400&family=Spline+Sans+Mono:wght@400;600&display=swap';
const HERE = new URL('./', self.location).pathname;
const OURS = new Set(CORE.map((p) => HERE + p));

self.addEventListener('install', (e) => {
  const core = caches.open(CACHE).then((c) => c.addAll(CORE.map((p) => new Request(p, { cache: 'reload' }))));
  const fonts = Promise.race([cacheFonts(), new Promise((r) => setTimeout(r, 10000))]);
  e.waitUntil(Promise.all([core, fonts]).then(() => self.skipWaiting()));
});

// The first visit loads its fonts before this worker is in charge, so fetch the stylesheet and its Latin
// files now; otherwise the first launch without a connection falls back to system fonts. Best effort:
// if Google Fonts is out of reach, or its stylesheet changes shape, the app installs without them.
async function cacheFonts() {
  try {
    const cache = await caches.open(FONTS);
    const res = await fetch(FONT_CSS, { mode: 'cors' });
    if (!res.ok) return;
    const css = await res.clone().text();
    await cache.put(FONT_CSS, res);
    const files = [...css.matchAll(/\/\* latin \*\/\s*@font-face\s*\{[^}]*?url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map((m) => m[1]);
    await Promise.all([...new Set(files)].map(async (url) => {
      const r = await fetch(url, { mode: 'cors' });
      if (r.ok) await cache.put(url, r);
    }));
  } catch {
    // Offline or blocked: the fonts get cached the first time the page loads them through this worker.
  }
}

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('afterglass-') && k !== CACHE && k !== FONTS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (OURS.has(url.pathname)) e.respondWith(networkFirst(e, url.pathname));
  } else if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(cacheFirst(e));
  }
});

// Keep a copy without holding up the response; a failed write (a full quota) only means no fresh copy.
const keep = (e, cache, key, res) => e.waitUntil(cache.put(key, res.clone()).catch(() => {}));

async function networkFirst(e, path) {
  const cache = await caches.open(CACHE);
  let res;
  try {
    // Revalidate rather than trust the HTTP cache, so every file on a load comes from the same deploy.
    res = await fetch(new Request(e.request, { cache: 'no-cache' }));
  } catch (err) {
    const hit = await cache.match(path);
    if (hit) return hit;
    throw err;
  }
  if (res.ok) keep(e, cache, path, res);
  return res;
}

async function cacheFirst(e) {
  const cache = await caches.open(FONTS);
  const hit = await cache.match(e.request, { ignoreVary: true });
  if (hit) return hit;
  const res = await fetch(e.request);
  if (res.ok) keep(e, cache, e.request, res);
  return res;
}
