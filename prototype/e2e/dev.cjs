const { chromium, BASE, OUT, state } = require('./lib.cjs');
const fs = require('fs');

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  const load = async (name, url = BASE + '/season.html', prefs = { introDone: true, guide: false }) => {
    await p.goto(BASE + '/season.html');
    await p.evaluate(([g, pr]) => {
      localStorage.clear();
      localStorage.setItem('afterglass-season/prefs/v1', JSON.stringify(pr));
      localStorage.setItem('afterglass-season/slot/1/v1', g);
      localStorage.setItem('afterglass-season/slots/v1', JSON.stringify({ current: 1, slots: {} }));
    }, [state(name), prefs]);
    await p.goto(url);
    await p.waitForSelector('#title-continue', { timeout: 2000 }).then((el) => el.click()).catch(() => {});
    await p.waitForTimeout(500);
    for (const t of await p.$$('.toast button[data-act="toast-close"]')) await t.click().catch(() => {});
  };
  const open = async (k) => {
    if (!(await p.isVisible('#sheet-body')) || (await p.getAttribute(`#open-${k}`, 'aria-pressed')) !== 'true') await p.click(`#open-${k}`);
    await p.waitForTimeout(250);
  };
  const phase = async () => {
    await open('phase');
    return p.innerText('#sheet-body');
  };
  const menu = async (tab) => {
    await open('menu');
    await p.click(`#menu-tab-${tab}`);
    await p.waitForTimeout(200);
  };
  // A player: the season's end, Records, Settings and Saves.
  await load('review-end');
  const end = await phase();
  const fails = [];
  const want = (ok, what) => { if (!ok) fails.push(what); };
  want(!/playtest question/i.test(end), 'a player sees the playtest question');
  console.log('player, season end has the playtest question:', /playtest question/i.test(end));
  await open('records');
  const tabs = await p.$$eval('.tabs .tab', (ts) => ts.map((x) => x.textContent));
  want(!tabs.some((t) => /Playtest/.test(t)), 'a player sees the Playtest tab');
  console.log('player, Records tabs:', tabs.join(' | '));
  await menu('settings');
  const set = await p.evaluate(() => ({ advanced: !!document.getElementById('advanced'), keys: getComputedStyle(document.querySelector('.settings .keys')).display, screens: (document.getElementById('sheet-body').scrollHeight / window.innerHeight).toFixed(2), build: document.querySelector('.settings .build')?.textContent }));
  want(!set.advanced, 'a player sees Advanced');
  console.log('player, Settings:', set);
  await menu('saves');
  const watchCard = !!(await p.$('#watch-load'));
  want(!watchCard, 'a player sees Watch a playtest');
  console.log('player, Saves has Watch a playtest:', watchCard);
  // New game with custom rules: 6 cracks, no weather.
  await p.click('#btn-title');
  await p.waitForTimeout(300);
  await p.click('#title-new');
  await p.waitForTimeout(200);
  await p.click('#custom-title > summary');
  await p.waitForTimeout(150);
  await p.evaluate(() => {
    const r = document.getElementById('custom-title-cracksMax');
    r.value = '6';
    r.dispatchEvent(new Event('input', { bubbles: true }));
    r.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await p.waitForTimeout(150);
  await p.click('#custom-title-weather');
  await p.waitForTimeout(150);
  const summ = await p.textContent('#custom-title > summary');
  await p.screenshot({ path: `${OUT}/shots/custom-rules.png`, fullPage: false });
  await p.click('#title-begin');
  await p.waitForTimeout(400);
  // All three slots may be in use: replace keep 2 if asked.
  if (await p.$('#title-replace-2')) { await p.click('#title-replace-2'); await p.click('#title-replace-yes'); await p.waitForTimeout(400); }
  const k = await p.evaluate(() => { const s = window.__season.keep; return { cracksMax: s.tuning.cracksMax, weather: s.tuning.weather, custom: s.custom, defaults: s.defaults && { cracksMax: s.defaults.cracksMax, weather: s.defaults.weather } }; });
  want(k.cracksMax === 6 && k.weather === 0 && k.custom, `custom rules not kept: ${JSON.stringify(k)}`);
  console.log('custom summary:', summ.trim(), '| new keep:', k);
  await menu('saves');
  const line = await p.$$eval('.kslot.is-here p b', (x) => x.map((e) => e.textContent));
  want(line.some((t) => /Custom rules/.test(t)), 'Saves does not say Custom rules');
  console.log('Saves line:', line);
  // The developer: ?dev brings the tools back.
  await load('review-end', BASE + '/season.html?dev');
  const devQ = /playtest question/i.test(await phase());
  want(devQ, 'the developer lost the playtest question');
  console.log('dev, season end has the playtest question:', devQ);
  await menu('settings');
  const adv = !!(await p.$('#advanced'));
  want(adv && !/\?dev/.test(p.url()), 'the developer lost Advanced, or ?dev stayed on the address');
  console.log('dev, Settings has Advanced:', adv, '| address now:', p.url());
  console.log('page errors:', errors);
  want(!errors.length, 'page errors');
  console.log(fails.length ? `FAILED: ${fails.join('; ')}` : 'dev: all good');
  if (fails.length) process.exitCode = 1;
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
