// Round seven, phase 14: events toward sixty, in the page. A keep on a day the Host comes, with a traitor's
// lantern waiting: the Day panel shows it as in the keep, says who it's about and what each answer costs, and
// locking them up locks them up. Then a year's visitor at the gate: the lord's levy, in the third year.
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
// A keep built in the page with the given card waiting, come just now.
const build = (p, kind) =>
  p.evaluate(async (kind) => {
    const { newSeason, step } = await import('./src/slice/sim.js');
    const traitor = kind === 'traitor';
    const s = newSeason(5, { visitors: 1, visitorChance: 0, fire: 0, sickChance: 0, oldAgeChance: 0, raidDays: traitor ? { 1: 8, 2: 0, 4: 0, 6: 0 } : { 2: 0, 4: 0, 6: 0 }, traitorChance: traitor ? 1 : 0 });
    if (!traitor) {
      s.season = 10; // the third year's summer
      s.day = 3;
      s.visitors = [{ id: 'v10.3.0', kind, at: s.t + 1, until: s.t + 1 + Math.round(0.25 * 600), here: false, done: null }];
    }
    const v = s.visitors.find((x) => x.kind === kind);
    for (let i = 0; i < 2e4 && !v.here; i++) step(s);
    s.alerts = [];
    return JSON.stringify(s);
  }, kind);
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
  await load(p, await build(p, 'traitor'));
  const v = await p.evaluate(() => window.__season.keep.visitors.find((x) => x.kind === 'traitor'));
  const name = await p.evaluate((id) => window.__season.keep.living.find((x) => x.id === id).name, v.named);
  await L.openPanel(p, 'phase');
  let t = await text(p);
  check(/in the keep/i.test(t) && /A traitor's lantern/.test(t) && t.includes(`${name} is caught at it.`), `the card is in the keep, about ${name}`);
  check(/Hang them from the wall/.test(t) && /wake at dusk a Wraith/.test(t) && /Lock them up/.test(t) && /Let it pass/.test(t), 'each answer says what it costs');
  await p.click(`#visit-${v.id.replace(/\./g, '\\.')}-lock`);
  await p.waitForTimeout(300);
  const after = await p.evaluate((id) => {
    const k = window.__season.keep;
    const q = k.living.find((x) => x.id === id);
    return { job: q ? q.job : 'gone', locked: q?.locked, done: k.visitors.find((x) => x.kind === 'traitor').done };
  }, v.named);
  check(after.done === 'lock' && after.job === null && !!after.locked, `locked up (${JSON.stringify(after)})`);
  await L.shot(p, 'events-traitor');
  await L.closePanel(p);
  // A year's visitor, in a page of its own.
  const { page: q } = await L.newPage(browser, 'phone');
  await q.goto(L.URL);
  p = q;
  await load(p, await build(p, 'levy'));
  await L.openPanel(p, 'phase');
  t = await text(p);
  check(/at the gate/i.test(t) && /The lord's levy/.test(t) && /Send two/.test(t) && /Buy them off/.test(t), "the lord's levy at the gate, in the third year");
  await L.shot(p, 'events-levy');
  const errs = L.errors.filter((e) => e.type === 'pageerror');
  check(!errs.length, `no page errors${errs.length ? `: ${JSON.stringify(errs)}` : ''}`);
  await browser.close();
  if (fails.length) process.exit(1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
