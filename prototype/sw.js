// The season's service worker: it lets the installed app open with no connection.
// The season's own files go to the network first, so a deploy shows on the next load, and fall back to
// the copy cached at install or on the last visit that reached the network. Since round seven's phase 19
// the fonts are among them (fonts/), so nothing comes from anywhere else. The other prototypes in this
// folder load their own files as if there were no worker.
// CORE must list every file season.html needs; test/pwa.test.js checks it against the page.

// A preview build (tools/site.mjs) keeps a cache of its own, so the release's and the preview's never meet.
const CACHE = 'afterglass-season';
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
  'src/page/state.js',
  'src/page/hud.js',
  'src/page/day.js',
  'src/page/dusk.js',
  'src/page/dawn.js',
  'src/page/records.js',
  'src/page/playtest.js',
  'src/page/watch.js',
  'src/page/stage.js',
  'src/page/screen.js',
  'src/page/guide.js',
  'src/page/clock.js',
  'src/page/keeps.js',
  'src/page/acts.js',
  'src/page/input.js',
  'src/slice/book.js',
  'src/slice/people.js',
  'src/slice/saves.js',
  'src/slice/sound.js',
  'src/slice/threats.js',
  'src/slice/recap.js',
  'src/slice/hall.js',
  'src/slice/keys.js',
  'src/slice/card.js',
  'src/slice/daily.js',
  'src/slice/tutorial.js',
  'src/slice/howto.js',
  'src/slice/watch.js',
  'src/slice/quiz.js',
  'src/slice/alerts.js',
  'src/build.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
  'icons/favicon-32.png',
  'fonts/fonts.css',
  'fonts/alegreya-sc-500.woff2',
  'fonts/alegreya-sc-700.woff2',
  'fonts/atkinson-hyperlegible-400.woff2',
  'fonts/atkinson-hyperlegible-400-italic.woff2',
  'fonts/atkinson-hyperlegible-700.woff2',
  'fonts/spline-sans-mono.woff2',
];
const HERE = new URL('./', self.location).pathname;
const OURS = new Set(CORE.map((p) => HERE + p));

self.addEventListener('install', (e) => {
  const core = caches.open(CACHE).then((c) => c.addAll(CORE.map((p) => new Request(p, { cache: 'reload' }))));
  e.waitUntil(core.then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      // The Google Fonts copies kept before phase 19 are no longer needed. The release's and a preview's caches
      // share the site, so neither touches the other's.
      .then((keys) => Promise.all(keys.filter((k) => k === 'afterglass-fonts').map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (OURS.has(url.pathname)) e.respondWith(networkFirst(e, url.pathname));
  }
});

// Keep a copy without holding up the response; a failed write (a full quota) only means no fresh copy.
const keep = (e, cache, key, res) => {
  try {
    e.waitUntil(cache.put(key, res.clone()).catch(() => {}));
  } catch {
    // The event is over (the cached copy answered first): the copy is only a courtesy.
  }
};
// How long a launch waits on the network for a file it has a copy of (round seven's audit: a weak connection
// hung the launch). The fetch goes on after the copy answers, and refreshes it for next time.
const DEADLINE = 3000;
// Only a whole, direct answer from our own site is ours: a 404, a server error, or a captive portal's page
// reached by a redirect is not, so it's never cached and the copy answers instead.
const good = (res) => res && res.ok && !res.redirected && res.type === 'basic';

async function networkFirst(e, path) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(path);
  // Revalidate rather than trust the HTTP cache, so every file on a load comes from the same deploy.
  const net = fetch(new Request(e.request, { cache: 'no-cache' })).then((res) => {
    if (good(res)) keep(e, cache, path, res);
    return res;
  });
  if (!hit) return net; // nothing cached yet: the network's answer, whatever it is
  e.waitUntil(net.catch(() => {})); // let the fetch finish, and refresh the copy, after the copy answers
  const late = new Promise((r) => setTimeout(() => r(null), DEADLINE));
  let res = null;
  try {
    res = await Promise.race([net, late]);
  } catch {
    return hit; // offline
  }
  return good(res) ? res : hit;
}
