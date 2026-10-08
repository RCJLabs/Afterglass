// Round seven, phase 19: the notice that a newer build is ready. On a checkout (build 'dev') the page never asks
// for version.json. On a site tools/site.mjs built (E2E_ROOT), when version.json names another build the page
// says so in a toast, offers Reload to play it on the main screen and in the Menu, and reloading keeps the keep.
const L = require('./lib.cjs');
const fails = [];
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) fails.push(what);
};

(async () => {
  const browser = await L.launch();
  const { page: p } = await L.newPage(browser, 'phone');
  let asked = 0;
  await p.route('**/version.json', (r) => {
    asked++;
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ build: 'newer-build', channel: 'release' }) });
  });
  // Every request the first load makes: its scripts, and anything from another site.
  const requests = [];
  p.on('request', (r) => requests.push({ url: r.url(), type: r.resourceType() }));
  await L.fresh(p);
  const here = new URL(L.URL).origin;
  const foreign = requests.filter((r) => !r.url.startsWith(here) && !r.url.startsWith('data:') && !r.url.startsWith('blob:'));
  check(!foreign.length, `the first load asks nothing of another site${foreign.length ? `: ${foreign.map((r) => r.url).join(', ')}` : ''}`);
  const scripts = [...new Set(requests.filter((r) => r.type === 'script').map((r) => r.url.slice(here.length)))]; // fresh() loads the page twice
  const build = await p.evaluate(async () => (await import('./src/build.js')).BUILD);
  const built = await p.evaluate(async () => (await fetch('season.html').then((r) => r.text())).includes('src="season.js"'));
  if (!built) {
    check(build === 'dev' && asked === 0, "a checkout never asks whether there's a newer build");
  } else {
    check(scripts.length === 1 && /season\.js$/.test(scripts[0]), `the built page loads one script${scripts.length === 1 ? '' : `, not ${scripts.length}: ${scripts.join(', ')}`}`);
    check(build !== 'dev' && asked > 0, `the built page (${build}) asks for version.json`);
    await p.waitForSelector('#update-card', { timeout: 3000 }).catch(() => {});
    const toasts = await p.$$eval('.toast', (ts) => ts.map((t) => t.innerText).join(' | ')).catch(() => '');
    check(/A new version of the game is ready/.test(toasts), 'a toast says a new version is ready');
    check(!!(await p.$('#title #update-card')), 'the main screen offers to reload');
    // Something to keep: begin the tutorial's keep, then reload from the Menu.
    await p.click('#title-tutorial');
    await p.waitForTimeout(500);
    await L.closeToasts(p);
    await L.openPanel(p, 'menu');
    check(!!(await p.$('#sheet-body #update-card')), 'and so does the Menu');
    const before = await p.evaluate(() => JSON.parse(localStorage.getItem('afterglass-season/slots/v1') || '{}').current);
    await Promise.all([p.waitForNavigation({ timeout: 5000 }).catch(() => null), p.click('#btn-update')]);
    await p.waitForTimeout(800);
    const after = await p.evaluate(() => {
      const ix = JSON.parse(localStorage.getItem('afterglass-season/slots/v1') || '{}');
      return { current: ix.current, tutorial: !!ix.slots?.[ix.current]?.tutorial };
    });
    check(after.current === before && after.tutorial, 'reloading keeps the keep that was being played');
  }
  const errs = L.errors.filter((e) => e.type === 'pageerror');
  check(!errs.length, `no page errors${errs.length ? `: ${JSON.stringify(errs)}` : ''}`);
  await browser.close();
  if (fails.length) process.exit(1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
