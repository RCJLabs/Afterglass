// Round seven, phase 8: the Long Night's last great tide, in the page. Winter's seventh dusk, made in the page
// from a fresh keep: the Dusk panel says when the great tide comes and how many, the tide clock marks it after
// every other tide, and when it rises the page calls it out and stops the clock.
const L = require('./lib.cjs');
const fails = [];
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fails.push(what); };
(async () => {
  const browser = await L.launch();
  const { page: p } = await L.newPage(browser, 'phone');
  await p.goto(L.URL);
  const g = await p.evaluate(async () => {
    const { newSeason, step } = await import('./src/slice/sim.js');
    const s = newSeason(5, {});
    s.season = 4; // winter, with the year on: its seventh night is the Long Night
    s.day = s.tuning.seasonDays;
    while (s.phase === 'day') step(s);
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
  if (await p.$('#bar-wake')) {
    await p.click('#bar-wake');
    await p.waitForTimeout(2600);
  }
  await L.openPanel(p, 'phase');
  const head = (await p.$eval('.ph-head', (e) => e.innerText).catch(() => '')).replace(/\s+/g, ' ');
  const said = head.match(/at (\d\d:\d\d) a last great tide of (\d+)/);
  check(/Tonight is the Long Night/.test(head) && !!said, `the Dusk panel says when the great tide comes, and how many: "${said?.[0]}"`);
  await p.click('#btn-start');
  await p.waitForTimeout(400);
  await L.closePanel(p);
  await L.closeToasts(p);
  const marks = await p.$$eval('.tclock .mk', (ms) => ms.map((m) => ({ kind: m.className.replace(/^mk mk-/, ''), at: parseFloat(m.style.left), title: m.title })));
  const great = marks.find((m) => m.kind === 'great');
  check(!!great && marks.every((m) => (m.kind !== 'tide' && m.kind !== 'maw') || m.at < great.at), `the tide clock marks it after every tide: ${marks.map((m) => m.kind).join(', ')}`);
  // On to just before it rises, the other spawns left out so that nothing else stops the clock first.
  const r = await p.evaluate(async () => {
    const s = window.__season.keep;
    const n = s.night;
    n.spawns = n.spawns.filter((x) => x.great);
    s.t = Math.min(...n.spawns.map((x) => x.at)) - 3;
    const play = () => document.querySelector('#btn-play');
    if (play()?.textContent === 'Play') play().click();
    for (let i = 0; i < 100 && !n.greatRose; i++) await new Promise((ok) => setTimeout(ok, 50));
    await new Promise((ok) => setTimeout(ok, 400));
    return { rose: !!n.greatRose, line: s.log.find((l) => l.kind === 'great-tide')?.text || null, button: play()?.textContent };
  });
  check(r.rose && /^The last great tide rises: \d+ Creepers at once/.test(r.line || ''), `it's called out when it rises: "${r.line}"`);
  check(r.button === 'Play', `and the clock stops for it (the button reads ${r.button})`);
  await L.shot(p, 'longnight-great');
  const errs = L.errors.filter((e) => e.type === 'pageerror');
  check(!errs.length, `no page errors${errs.length ? `: ${JSON.stringify(errs)}` : ''}`);
  await browser.close();
  if (fails.length) process.exit(1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
