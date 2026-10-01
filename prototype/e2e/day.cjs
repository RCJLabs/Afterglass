// Round seven, phase 10: day decisions with teeth, in the page. A keep on the morning of its first raid, the
// Host on the road and the gate short: the raid card says to post guards now, a guard posted shows in People as
// taking the post, and the defense to come is said. The Church's ledger before its first inspection, and a
// visitor who takes glass for what she'd take food for.
const L = require('./lib.cjs');
const fails = [];
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fails.push(what); };
(async () => {
  const browser = await L.launch();
  const { page: p } = await L.newPage(browser, 'phone');
  await p.goto(L.URL);
  const g = await p.evaluate(async () => {
    const { newSeason, step, act, isGuard } = await import('./src/slice/sim.js');
    const s = newSeason(5, { visitors: 1, fire: 0, sickChance: 0 });
    s.res.stone = 99;
    act(s, { type: 'raise', room: 'barracks' }); // a keep starts with no Barracks
    for (let i = 0; i < 2e5 && !(s.day === 2 && s.raid?.warned); i++) {
      if (s.phase === 'dusk') {
        if (s.dusk.step === 'crypt') act(s, { type: 'wake' });
        act(s, { type: 'startNight' });
        s.night.spawns = [];
      } else if (s.phase === 'dawn') act(s, { type: 'beginDay' });
      else step(s);
    }
    for (const p of s.living.filter(isGuard)) act(s, { type: 'assign', id: p.id, room: 'yard' });
    s.res.essence = 0; // no ward to make it up
    s.res.glass = 12;
    s.visitors.push({ id: `v${s.season}.${s.day}.9`, kind: 'chandler', at: s.t, until: s.t + 400, here: true, done: null });
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
  check(/Not enough\. Post guards now: each takes 2\.5 hours at the post to count in full\./.test(t), 'the raid card: post guards now, each takes 2.5 hours to count in full');
  check(/Pay her in glass/.test(t) && /costs 3 glass; gives 4 candles/.test(t), 'the chandler\'s widow takes glass as well as food');
  check(/Its ledger so far: Dread \d+(\.\d)? on average over \d+ days?, so \d+\./.test(t), "the Church's ledger so far, before its first inspection");
  // Post someone, in People.
  const who = await p.evaluate(() => {
    const s = window.__season.keep;
    return s.living.find((x) => x.age !== 'child' && x.job !== 'barracks' && !(x.sick > 0)).id;
  });
  await L.closePanel(p);
  await L.openPanel(p, 'people');
  await p.selectOption(`#job-${who}`, 'barracks');
  await p.waitForTimeout(300);
  const tag = await p.$eval(`#prow-${who}`, (e) => e.innerText).catch(() => '');
  check(/Taking the post/.test(tag), `People marks a guard taking the post: "${tag.replace(/\s+/g, ' ').slice(0, 80)}"`);
  await L.closePanel(p);
  await L.openPanel(p, 'phase');
  t = await text();
  check(/once the guards posted have taken their places/.test(t), 'the Day panel says what the guards posted will add');
  await L.shot(p, 'day-raid');
  const errs = L.errors.filter((e) => e.type === 'pageerror');
  check(!errs.length, `no page errors${errs.length ? `: ${JSON.stringify(errs)}` : ''}`);
  await browser.close();
  if (fails.length) process.exit(1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
