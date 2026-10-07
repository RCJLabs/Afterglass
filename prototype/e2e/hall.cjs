// Round seven, phase 16: between keeps, in the page. A keep that held its first year is started over: the new keep
// begins with two of its dead in the glass, told in a toast and in the Book, and the Hall of Keepers keeps the first
// keep, its deed and its Book. The new keep's first season ends: the end panel and the recap card set it against the
// first keep's spring, and the Hall has its card. Today's keep shows the days played before.
const L = require('./lib.cjs');
const fails = [];
let seen = '';
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) {
    fails.push(what);
    if (seen) console.log(`     the page read: ${seen.slice(0, 1500)}`);
  }
};
const text = async (p) => {
  await p.waitForSelector('#sheet-body', { timeout: 2000 }).catch(() => {});
  await p.waitForTimeout(200);
  seen = (await p.$eval('#sheet-body', (e) => e.innerText).catch(() => '')).replace(/\s+/g, ' ');
  return seen;
};
const toasts = async (p) => (seen = (await p.$$eval('.toast', (ts) => ts.map((t) => t.innerText).join(' | ')).catch(() => '')).replace(/\s+/g, ' '));
// A keep put in slot 1 and continued, keeping whatever else the browser holds (the Hall) unless told to clear it.
const load = async (p, g, clear) => {
  await p.goto(`${L.BASE}/season.webmanifest`); // away from the game first, or it saves its own keep over this one as it goes
  await p.evaluate(([g, clear]) => {
    if (clear) localStorage.clear();
    localStorage.setItem('afterglass-season/prefs/v1', JSON.stringify({ introDone: true, guide: false }));
    localStorage.setItem('afterglass-season/slot/1/v1', g);
    localStorage.setItem('afterglass-season/slots/v1', JSON.stringify({ current: 1, slots: {} }));
  }, [g, clear]);
  await p.goto(L.URL);
  await p.waitForSelector('#title-continue', { timeout: 1500 }).then((el) => el.click()).catch(() => {});
  await p.waitForTimeout(600);
  await L.closeToasts(p);
};
const menuTab = async (p, tab) => {
  if (!(await p.$('#menu-tab-saves'))) {
    await L.closePanel(p);
    await L.openPanel(p, 'menu');
  }
  await p.click(`#menu-tab-${tab}`);
  return text(p);
};

(async () => {
  const browser = await L.launch();
  const { page: p } = await L.newPage(browser, 'phone');
  await p.goto(L.URL);
  // A keep the autopilot held through its first year (seed 2 does), at the year's end.
  const first = await p.evaluate(async () => {
    const { runSeasonAuto } = await import('./src/slice/autopilot.js');
    const s = runSeasonAuto(2, { seasons: 4 });
    if (s.phase !== 'end') throw new Error('seed 2 fell');
    s.alerts = [];
    return JSON.stringify(s);
  });
  await load(p, first, true);
  // Started over: the Hall takes it, and the new keep's first dead are two of its own.
  await menuTab(p, 'saves');
  await p.click('#slot-over-1');
  await p.click('#slot-yes-1');
  await p.waitForTimeout(500);
  let t = await toasts(p);
  const m = t.match(/Keep 1: a new keep\. (.+?), of your first keep, (?:is|are) in its glass\./);
  check(!!m, 'a toast names the dead come from the first keep');
  const names = m ? m[1].split(' and ') : [];
  await L.closeToasts(p);
  await L.closePanel(p);
  await L.openPanel(p, 'records');
  await p.click('#tab-book');
  t = await text(p);
  check(/From the keep before/i.test(t) && names.length > 0 && names.every((n) => t.includes(n)) && /Of your first keep\./.test(t) && /Came with you to this keep\./.test(t), 'the Book tells them as from the keep before, with their story');
  check(!/Garrick|Hesper/.test(t) || names.some((n) => /Garrick|Hesper/.test(n)), 'and Garrick and Hesper are not both there too');
  t = await menuTab(p, 'hall');
  check(/Your first keep/.test(t) && /Left standing in Winter, year 1/.test(t), 'the Hall of Keepers keeps the first keep, left standing');
  check(/Through the Long Night/.test(t) && /Done in your first keep/.test(t), 'with the deed it did');
  await p.click('[data-act="hall-open"]');
  t = await text(p);
  check(/Winter, year 1: The keep stands\./.test(t) && /The first season/i.test(t) && /Still in the glass/.test(t), 'opening it shows its card in words and its Book');
  await L.shot(p, 'hall-first');

  // The new keep played by the autopilot to just before its first season's end, then let run.
  const second = await p.evaluate(async () => {
    const { autoStep } = await import('./src/slice/autopilot.js');
    const g = JSON.parse(localStorage.getItem('afterglass-season/slot/1/v1'));
    const c = structuredClone(g);
    let n = 0;
    while (c.phase !== 'end' && c.phase !== 'over' && n < 2e6) {
      autoStep(c, 'balanced');
      n++;
    }
    for (let i = 0; i < n - 30; i++) autoStep(g, 'balanced');
    g.alerts = [];
    return JSON.stringify(g);
  });
  await load(p, second, false);
  await L.closePanel(p);
  const play = await p.$('#btn-play');
  if ((await play?.textContent()) !== 'Pause') await play?.click();
  await p.waitForFunction(() => /is over|The keep fell|has fallen/i.test(document.querySelector('#sheet-body')?.innerText || ''), null, { timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(400);
  await L.closeToasts(p);
  t = await text(p);
  check(/Against your first keep's spring, year 1: (\d+ deaths? (fewer|more)|as many deaths|\d+ days? (more|fewer)|as many days)\./.test(t), 'the end panel sets the season against the first keep\'s spring');
  await p.click('#card-make');
  await p.waitForSelector('#recap-img', { timeout: 5000 }).catch(() => {});
  const alt = await p.$eval('#recap-img', (e) => e.alt).catch(() => '');
  seen = alt;
  check(/Than my last keep: /.test(alt) && !/Days held/.test(alt), 'the recap card\'s first number compares, in place of the days held');
  await L.shot(p, 'hall-end');
  await p.waitForTimeout(1500); // the Hall's own copy of the card is drawn a moment after the season ends
  t = await menuTab(p, 'hall');
  check(/Your second keep/.test(t) && /In keep 1, at Spring, year 1/.test(t) && /Began with .+ in its glass, from the keep before/.test(t), 'the Hall has the second keep, still in its slot');
  check(/The dead go on/.test(t) && /Done in your second keep/.test(t), 'and the deed of beginning with the last keep\'s dead');
  await p.click('[data-act="hall-open"]');
  await p.waitForTimeout(200);
  check(!!(await p.$('img.hall-img')), 'its card kept as an image');
  await L.shot(p, 'hall-second');

  // Today's keep with a history: a day played before is listed.
  const { page: q } = await L.newPage(browser, 'phone');
  await q.goto(L.URL);
  await q.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('afterglass-season/hall/v1', JSON.stringify({ v: 1, count: 1, deeds: {}, keeps: [{ id: 'daily:2026-10-01', n: 1, first: 1, last: 1, daily: '2026-10-01', status: 'fell', where: 'Spring, year 1', seasons: [{ season: 1, title: 'Spring, year 1', stood: false, day: 4, deaths: 3, shades: 1 }], book: [], card: null }] }));
    localStorage.setItem('afterglass-season/prefs/v1', JSON.stringify({ introDone: true, guide: false }));
  });
  await q.goto(L.URL);
  await q.waitForTimeout(600);
  await q.click('#title-saves').catch(() => {});
  t = await text(q);
  check(/You've played it on one other day/.test(t) && /1 October 2026: fell in spring, year 1, 3 deaths/.test(t), "today's keep lists the days played before");
  const errs = L.errors.filter((e) => e.type === 'pageerror');
  check(!errs.length, `no page errors${errs.length ? `: ${JSON.stringify(errs)}` : ''}`);
  await browser.close();
  if (fails.length) process.exit(1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
