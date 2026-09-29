// Round seven, phase 7: As last night, in the page. A dusk whose last night began with candles the store has
// back: the button is there, big enough for a thumb, and a press lights them where they stood.
const L = require('./lib.cjs');
const fails = [];
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fails.push(what); };
(async () => {
  const browser = await L.launch();
  const { page: p } = await L.newPage(browser, 'phone');
  // The hunters' dusk, with its candles taken back into the store and kept as last night's.
  const g = JSON.parse(L.state('hunters'));
  const spots = g.night.candles.filter((k) => !k.carrier).map((k) => [k.f, k.x]);
  g.res.candles += spots.length;
  g.night.candles = g.night.candles.filter((k) => k.carrier);
  g.lastDusk = { posts: g.shades.filter((d) => d.post).map((d) => [d.id, d.post.f, d.post.x]), candles: spots };
  await p.goto(L.URL);
  await p.evaluate((g) => {
    localStorage.clear();
    localStorage.setItem('afterglass-season/prefs/v1', JSON.stringify({ introDone: true, guide: false }));
    localStorage.setItem('afterglass-season/slot/1/v1', g);
    localStorage.setItem('afterglass-season/slots/v1', JSON.stringify({ current: 1, slots: {} }));
  }, JSON.stringify(g));
  await p.goto(L.URL);
  await p.waitForSelector('#title-continue', { timeout: 1500 }).then((el) => el.click()).catch(() => {});
  await p.waitForTimeout(600);
  await L.closeToasts(p);
  await L.openPanel(p, 'phase');
  const btn = await p.$('#btn-last');
  check(!!btn, 'the Dusk panel offers As last night');
  if (btn) {
    const box = await btn.boundingBox();
    check(box.width >= 44 && box.height >= 44, `a thumb's target (${Math.round(box.width)}×${Math.round(box.height)})`);
    const before = await p.evaluate(() => ({ store: window.__season.keep.res.candles, set: window.__season.keep.night.candles.length }));
    await btn.click();
    await p.waitForTimeout(300);
    const after = await p.evaluate(() => ({ store: window.__season.keep.res.candles, set: window.__season.keep.night.candles.length, last: window.__season.keep.actions.at(-1).a.type }));
    check(after.set === before.set + spots.length && Math.abs(after.store - (before.store - spots.length)) < 1e-9, `a press lights last night's ${spots.length} candles (${before.set} → ${after.set} set, store ${before.store} → ${after.store})`);
    check(after.last === 'asLastNight', `as an action, so it replays (${after.last})`);
    await L.shot(p, 'lastnight-phone');
  }
  const errs = L.errors.filter((e) => e.type === 'pageerror');
  check(!errs.length, `no page errors ${errs.length ? JSON.stringify(errs) : ''}`);
  console.log(fails.length ? `FAILED: ${fails.join('; ')}` : 'lastnight: all good');
  if (fails.length) process.exitCode = 1;
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
