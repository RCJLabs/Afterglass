// Round seven, phase 15: a campaign that teaches, in the page. A campaign's first spring: the Build panel holds the
// Library and the Hall back for The Lantern Church. Its first year's end: the close card offers two helps for the
// next year, and closing on one begins The Ashen Host, told in full at its first dawn with what it brings, its goal
// and last year's help.
const L = require('./lib.cjs');
const fails = [];
let seen = '';
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) {
    fails.push(what);
    if (seen) console.log(`     the panel read: ${seen.slice(0, 1500)}`);
  }
};
const QUIET = { sickChance: 0, oldAgeChance: 0, raidDays: { 2: 0, 4: 0, 6: 0 }, fire: 0, weather: 0, firstInspection: 99, startFood: 999, startCandles: 99 };
// A campaign keep made in the page: on its first morning, or played to its first year's end.
const build = (p, end) =>
  p.evaluate(
    async ({ end, QUIET }) => {
      const { newSeason, step, act, yearsEnd } = await import('./src/slice/sim.js');
      const s = newSeason(5, { campaign: 1, ...QUIET });
      if (end) {
        s.season = 4;
        s.day = s.tuning.seasonDays;
        while (s.phase === 'day') step(s);
        if (s.dusk.step === 'crypt') act(s, { type: 'wake' });
        act(s, { type: 'startNight' });
        s.night.spawns = [];
        while (s.phase === 'night') step(s);
        if (!yearsEnd(s)) throw new Error('not at the year\'s end');
      }
      s.alerts = [];
      return JSON.stringify(s);
    },
    { end, QUIET },
  );
const load = async (p, g) => {
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
};
const text = async (p) => {
  await p.waitForSelector('#sheet-body', { timeout: 2000 }).catch(() => {});
  await p.waitForTimeout(200);
  seen = (await p.$eval('#sheet-body', (e) => e.innerText).catch(() => '')).replace(/\s+/g, ' ');
  return seen;
};

(async () => {
  const browser = await L.launch();
  let { page: p } = await L.newPage(browser, 'phone');
  await p.goto(L.URL);
  // The first spring: the Library and the Hall come with The Lantern Church.
  await load(p, await build(p, false));
  await p.click('#btn-build');
  let t = await text(p);
  check(/The Library and the Hall come with The Lantern Church, in the campaign's third year/.test(t), 'the Build panel holds the Library and the Hall back for year 3');
  check(!/id="raise-library"/.test(await p.$eval('#sheet-body', (e) => e.innerHTML).catch(() => '')), 'with no button to raise either');
  await L.closePanel(p);
  // The first year's end: two helps for the next year.
  const { page: q } = await L.newPage(browser, 'phone');
  await q.goto(L.URL);
  p = q;
  await load(p, await build(p, true));
  if (!(await p.$('#sheet-body'))) await L.openPanel(p, 'phase'); // a year's end opens it of itself
  t = await text(p);
  check(/The First Winter closes/i.test(t) && /Next comes year 2, The Ashen Host, with the siege/.test(t) && /visitors at the gate/.test(t), 'the close card says what the next year brings');
  check(/Raise the walls/.test(t) && /Cut a sally-port/.test(t) && !/Lay in stores/.test(t), 'two helps, and no goods now');
  await L.shot(p, 'campaign-close');
  await p.click('#close-sallyport');
  await p.waitForTimeout(400);
  await L.closeToasts(p);
  if (!(await p.$('#sheet-body'))) await L.openPanel(p, 'phase');
  t = await text(p);
  check(/The Ashen Host/i.test(t) && /Word has gone down the valley/.test(t), 'the next chapter told in full at its first dawn');
  check(/New this year: the siege, the Host's ladders, the Gatehouse and its Undergate, and visitors at the gate/.test(t), 'with what it brings');
  check(/The goal: to break the Host's siege with a sally/.test(t) && /From last year's close: cut a sally-port/.test(t), 'its goal, and last year\'s help');
  await L.shot(p, 'campaign-chapter');
  const errs = L.errors.filter((e) => e.type === 'pageerror');
  check(!errs.length, `no page errors${errs.length ? `: ${JSON.stringify(errs)}` : ''}`);
  await browser.close();
  if (fails.length) process.exit(1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
