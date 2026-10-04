// Round seven, phase 13: mirrors in rooms, in the page. A keep with the pier glass and its two shades hung in the
// Chandlery, a worked room. By day the Day panel says where each mirror hangs and that the pier glass is a door,
// and hanging it in the Crypt from its row moves it there. At dusk on a Maw night the Dusk panel lists the doors,
// and turning one to the wall turns it.
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
// A keep built in the page, its pier glass hung in the Chandlery; at dusk (on night `night`) if asked.
const build = (p, dusk) =>
  p.evaluate(async (dusk) => {
    const { newSeason, step, act } = await import('./src/slice/sim.js');
    const s = newSeason(5, { visitors: 0, fire: 0, sickChance: 0, oldAgeChance: 0, raidDays: { 2: 0, 4: 0, 6: 0 } });
    s.res.stone = 99;
    act(s, { type: 'raise', room: 'chandlery', at: 'top' });
    act(s, { type: 'hang', id: s.mirrors.find((m) => m.type === 'pier').id, room: 'chandlery' });
    if (dusk) {
      s.day = 4; // a Maw night
      for (let i = 0; i < 2e5 && s.phase === 'day'; i++) step(s);
    }
    s.alerts = [];
    return JSON.stringify(s);
  }, dusk);
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
const keep = (p) => p.evaluate(() => window.__season.keep.mirrors.map((m) => ({ id: m.id, type: m.type, name: m.name, room: m.room, turned: !!m.turned })));

(async () => {
  const browser = await L.launch();
  let { page: p } = await L.newPage(browser, 'phone');
  await p.goto(L.URL);
  // By day.
  await load(p, await build(p, false));
  await L.openPanel(p, 'phase');
  let t = await text(p);
  check(/Chandlery pier glass/.test(t) && /A door: a Maw that breaks the Wick Room comes through it/.test(t), 'the pier glass hangs in the Chandlery, a door');
  check(/Empty, it is no door/.test(t), 'the empty hand mirror is no door');
  const pier = (await keep(p)).find((m) => m.type === 'pier');
  await p.selectOption(`#hang-${pier.id}`, 'crypt');
  await p.waitForTimeout(300);
  let ms = await keep(p);
  check(ms.find((m) => m.id === pier.id).room === 'crypt', `hung in the Crypt (${JSON.stringify(ms)})`);
  t = await text(p);
  check(/Crypt pier glass/.test(t), 'its name says where it hangs');
  await L.shot(p, 'mirrors-day');
  await L.closePanel(p);
  // At dusk on a Maw night, in a page of its own (leaving the first saves its keep over what's put in the slot).
  const { page: q } = await L.newPage(browser, 'phone');
  await q.goto(L.URL);
  p = q;
  await load(p, await build(p, true));
  await L.openPanel(p, 'phase');
  t = await text(p);
  check(/The doors/i.test(t) && /A Maw rises tonight/.test(t) && /Chandlery pier glass, opening on the Wick Room/.test(t), 'the Dusk panel lists the doors on a Maw night');
  const id = (await keep(p)).find((m) => m.type === 'pier').id;
  await p.click(`#turn-${id}`);
  await p.waitForTimeout(300);
  ms = await keep(p);
  check(ms.find((m) => m.id === id).turned, 'turning it to the wall turns it');
  t = await text(p);
  check(/turned to the wall, 2 shades sitting out/.test(t), 'the doors card says so');
  await L.shot(p, 'mirrors-dusk');
  const errs = L.errors.filter((e) => e.type === 'pageerror');
  check(!errs.length, `no page errors${errs.length ? `: ${JSON.stringify(errs)}` : ''}`);
  await browser.close();
  if (fails.length) process.exit(1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
