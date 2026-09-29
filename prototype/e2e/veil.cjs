// Round seven, phase 9: a way back from the spiral, in the page. A night with the store out of candles: the
// Candle tool reads Wisp, and a tap at a dark stair of the line burns essence as a pale light there. And an
// autumn day: the Day panel says what winter will take in candles, and what the keep has.
const L = require('./lib.cjs');
const fails = [];
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fails.push(what); };
async function load(p, g) {
  await p.evaluate((g) => {
    localStorage.clear();
    localStorage.setItem('afterglass-season/prefs/v1', JSON.stringify({ introDone: true, guide: false }));
    localStorage.setItem('afterglass-season/slot/1/v1', g);
    localStorage.setItem('afterglass-season/slots/v1', JSON.stringify({ current: 1, slots: {} }));
  }, g);
  await p.goto(L.URL);
  await p.waitForSelector('#title-continue', { timeout: 1500 }).then((el) => el.click()).catch(() => {});
  await p.waitForTimeout(600);
  await L.closeToasts(p);
}
(async () => {
  const browser = await L.launch();
  const { page: p } = await L.newPage(browser, 'phone');
  await p.goto(L.URL);
  // The night: its spawns left out so nothing calls out, the line dark and the store out of candles.
  const g = await p.evaluate(async () => {
    const { newSeason, step, act } = await import('./src/slice/sim.js');
    const s = newSeason(5, {});
    while (s.phase === 'day') step(s);
    if (s.dusk.step === 'crypt') act(s, { type: 'wake' });
    act(s, { type: 'startNight' });
    s.night.spawns = [];
    s.night.candles = [];
    s.res.candles = 0;
    s.res.essence = 20;
    s.alerts = [];
    return JSON.stringify(s);
  });
  await load(p, g);
  await L.closePanel(p);
  const pause = await p.$('#btn-play');
  if ((await pause?.textContent()) === 'Pause') await pause.click();
  const label = await p.$eval('#tool-candle', (e) => e.textContent).catch(() => null);
  check(/^Wisp −6$/.test(label || ''), `out of candles, the Candle tool reads "${label}"`);
  const at = await p.evaluate(async () => {
    const { geo, lineSpots } = await import('./src/slice/geo.js');
    return lineSpots(geo(window.__season.keep))[0];
  });
  await p.click('#tool-candle');
  const pt = await p.evaluate(([f, x]) => window.__season.spot(f, x), [at.f, at.x]);
  await p.touchscreen.tap(pt.x, pt.y);
  await p.waitForTimeout(200);
  const r = await p.evaluate(() => {
    const s = window.__season.keep;
    return { wisps: s.night.candles.filter((c) => c.wisp).map((c) => ({ f: c.f, x: c.x })), essence: s.res.essence };
  });
  check(r.wisps.length === 1 && r.wisps[0].f === at.f && Math.abs(r.wisps[0].x - at.x) <= 2 && r.essence === 14, `a tap at the ${at.x < 56 ? 'left' : 'right'} stair lights a wisp there for 6 essence: ${JSON.stringify(r)}`);
  await L.shot(p, 'veil-wisp');
  // Autumn's fourth day, with a week of nights behind it that each burned 5 candles. A page of its own, since
  // the first saves its keep over the slot as it goes.
  const { page: q } = await L.newPage(browser, 'phone');
  await q.goto(L.URL);
  const a = await q.evaluate(async () => {
    const { newSeason } = await import('./src/slice/sim.js');
    const s = newSeason(5, { startFloors: 4 });
    s.season = 3;
    s.day = 4;
    s.days = [5, 6, 7].map((day) => ({ season: 2, day, made: { candles: 1 }, night: { candles: 5, wick: 0 } }))
      .concat([1, 2, 3].map((day) => ({ season: 3, day, made: { candles: 1 }, night: { candles: 5, wick: 0 } })));
    s.res.candles = 7;
    s.alerts = [];
    return JSON.stringify(s);
  });
  await load(q, a);
  await L.openPanel(q, 'phase');
  const text = (await q.$eval('#sheet-body', (e) => e.innerText).catch(() => '')).replace(/\s+/g, ' ');
  const said = text.match(/Winter, by this keep's last week: its nights will burn about (\d+) candles and it will make about (\d+), so it needs about (\d+) put by\. You have (\d+)\./);
  check(!!said && +said[4] === 7 && +said[3] > 7, `the Day panel says what winter will take: "${said?.[0]}"`);
  check(/A campaign's first year asks for 20 put by as winter begins/.test(text), 'and, in the open year, the campaign\'s goal beside it');
  await L.shot(q, 'veil-winter');
  const errs = L.errors.filter((e) => e.type === 'pageerror');
  check(!errs.length, `no page errors${errs.length ? `: ${JSON.stringify(errs)}` : ''}`);
  await browser.close();
  if (fails.length) process.exit(1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
