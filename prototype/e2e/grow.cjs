// Round seven, phase 12: something to grow into, in the page. A keep in the spring of its second year: a room a
// Maw broke and one a fire burned out, the gate battered, a hungry year, a Library with every first rank
// learned. The Day panel says each, mending one costs its stone and lifts it, a standing ward is set, and the
// Build panel offers the Lampworks only from floor 8 up.
const L = require('./lib.cjs');
const fails = [];
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fails.push(what); };
(async () => {
  const browser = await L.launch();
  const { page: p } = await L.newPage(browser, 'phone');
  await p.goto(L.URL);
  const g = await p.evaluate(async () => {
    const { newSeason, step, act } = await import('./src/slice/sim.js');
    const { geo, roomsOf } = await import('./src/slice/geo.js');
    const s = newSeason(5, { visitors: 0, fire: 0, sickChance: 0, raidDays: { 2: 0, 4: 0, 6: 0 } });
    s.res.stone = 99;
    act(s, { type: 'raise', room: 'chapel', at: 'top' });
    // On into the keep's second year, its first morning, and a Library (built from the first summer).
    s.season = 5;
    act(s, { type: 'raise', room: 'library', at: 'top' });
    s.trouble = { id: 'hunger', year: 2 };
    for (let i = 0; i < 2e5 && s.phase !== 'day'; i++) {
      if (s.phase === 'dusk') {
        if (s.dusk.step === 'crypt') act(s, { type: 'wake' });
        act(s, { type: 'startNight' });
        s.night.spawns = [];
      } else if (s.phase === 'dawn') act(s, { type: 'beginDay' });
      else step(s);
    }
    const G = geo(s);
    const hearth = roomsOf(G, 'hearth')[0].id;
    const chapel = roomsOf(G, 'chapel')[0].id;
    s.haunted = [chapel];
    s.hauntLeft = { [chapel]: 3 };
    s.scorched = [hearth];
    s.burnLeft = { [hearth]: 2 };
    s.gate = 0.5;
    s.learned = ['masonry', 'tallow', 'wards', 'hollow', 'pitch', 'herbs', 'silvering', 'rites'];
    s.riteKind = 'loyal';
    Object.assign(s.res, { stone: 5, essence: 60, remembrance: 40 });
    s.alerts = [];
    return JSON.stringify(s);
  });
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
  const pause = await p.$('#btn-play');
  if ((await pause?.textContent()) === 'Pause') await pause.click();
  await L.openPanel(p, 'phase');
  const text = async () => (await p.$eval('#sheet-body', (e) => e.innerText).catch(() => '')).replace(/\s+/g, ' ');
  let t = await text();
  check(/Year 2: A hungry year: the harvest fails/.test(t), "the year's trouble");
  check(/The Chapel is haunted: 1 Dread at each of the next 2 dawns\./.test(t), 'a haunted room and the Dread it will cost');
  check(/The Hearth is burned out: nobody works there for 2 days\./.test(t), 'a burned-out room and how long');
  check(/The gate is 50% whole; it mends a quarter a day of itself\./.test(t), 'the battered gate');
  check(/Masonry II: a room costs 3 stone less; 8 lore/.test(t) && /Begin, 6 remembrance/.test(t), "a study's second rank, at twice the price");
  check(/Standing wards/i.test(t) && /Ward for the season, \d+ essence/.test(t), 'standing wards offered');
  // Mend the Chapel: 2 stone, and the haunting lifts.
  const chapel = await p.evaluate(() => window.__season.keep.haunted[0]);
  await p.click(`#mend-${chapel}`);
  await p.waitForTimeout(300);
  const after = await p.evaluate(() => ({ haunted: window.__season.keep.haunted.length, stone: window.__season.keep.res.stone }));
  check(after.haunted === 0 && after.stone === 3, `mending costs 2 stone and lifts the haunting (${JSON.stringify(after)})`);
  t = await text();
  check(!/The Chapel is haunted/.test(t), 'the Day panel no longer says it');
  // A standing ward on a rift.
  const before = await p.evaluate(() => window.__season.keep.res.essence);
  const btn = await p.$('[data-act="stand-ward"]');
  await btn.click();
  await p.waitForTimeout(300);
  const ward = await p.evaluate(() => ({ standing: window.__season.keep.standing, essence: window.__season.keep.res.essence }));
  check(ward.standing.length === 1 && ward.essence < before, `a standing ward is set for its essence (${JSON.stringify(ward)})`);
  await L.shot(p, 'grow-day');
  await L.closePanel(p);
  // The Build panel: the Lampworks only from floor 8 up.
  await p.click('#btn-build');
  await p.waitForTimeout(250);
  t = await text();
  check(/The Lampworks can be raised from floor 8 up: the keep stands \d high\./.test(t), 'the Lampworks, only from floor 8 up');
  const errs = L.errors.filter((e) => e.type === 'pageerror');
  check(!errs.length, `no page errors${errs.length ? `: ${JSON.stringify(errs)}` : ''}`);
  await browser.close();
  if (fails.length) process.exit(1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
