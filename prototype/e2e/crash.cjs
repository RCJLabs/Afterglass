// Phase 1 in the page: no policy violations, the build in Settings, and a crash mid-day: the clock stops,
// nothing more is saved, and the panel offers the file, this morning's spare and a reload.
const { chromium, BASE, OUT, state } = require('./lib.cjs');
const fs = require('fs');

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, acceptDownloads: true });
  const p = await ctx.newPage();
  const errors = [];
  const csp = [];
  p.on('console', (m) => { if (/Content Security Policy|Refused to/.test(m.text())) csp.push(m.text()); });
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(BASE + '/season.html');
  await p.evaluate(() => document.addEventListener('securitypolicyviolation', (e) => { window.__csp = (window.__csp || []).concat(`${e.violatedDirective} ${e.blockedURI}`); }));
  await p.evaluate((g) => {
    localStorage.clear();
    localStorage.setItem('afterglass-season/prefs/v1', JSON.stringify({ introDone: true, guide: false }));
    localStorage.setItem('afterglass-season/slot/1/v1', g);
    localStorage.setItem('afterglass-season/slots/v1', JSON.stringify({ current: 1, slots: {} }));
  }, state('dawn'));
  await p.goto(BASE + '/season.html');
  await p.evaluate(() => document.addEventListener('securitypolicyviolation', (e) => { window.__csp = (window.__csp || []).concat(`${e.violatedDirective} ${e.blockedURI}`); }));
  await p.waitForSelector('#title-continue', { timeout: 2000 }).then((el) => el.click()).catch(() => {});
  await p.waitForTimeout(600);
  // Settings shows the build.
  await p.click('#open-menu');
  await p.click('#menu-tab-settings');
  const build = await p.textContent('.settings .build');
  console.log('settings:', build.trim());
  await p.click('#sheet-close');
  // The rite, then the day: the morning's spare is kept.
  await p.click('#open-phase');
  await p.waitForTimeout(200);
  await p.click('#btn-day');
  await p.waitForTimeout(800);
  const spare = await p.evaluate(() => JSON.parse(localStorage.getItem('afterglass-season/spare/v1') || 'null'));
  console.log('spare:', spare && { n: spare.n, day: spare.save.day, phase: spare.save.phase });
  await p.click('#sheet-close').catch(() => {});
  // Run the clock a moment, and note what's saved.
  await p.keyboard.press('Space');
  await p.waitForTimeout(5600);
  const before = await p.evaluate(() => localStorage.getItem('afterglass-season/slot/1/v1'));
  // Break it: a rule that throws on the next step.
  await p.evaluate(() => { window.__season.keep.living = null; });
  await p.waitForTimeout(6500);
  const panel = await p.isVisible('#crash');
  const after = await p.evaluate(() => localStorage.getItem('afterglass-season/slot/1/v1'));
  const buttons = await p.$$eval('#crash button', (bs) => bs.map((x) => x.textContent));
  const text = panel ? (await p.innerText('#crash .crash-card')).replace(/\s+/g, ' ').slice(0, 300) : '';
  console.log('panel:', panel, buttons, '\n ', text);
  console.log('slot unchanged since the crash:', before === after, 'saved day', JSON.parse(after).day, JSON.parse(after).phase);
  await p.screenshot({ path: `${OUT}/shots/crash-phone.png` });
  // Export: a download with the crash in it.
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 3000 }), p.click('#crash-export')]);
  const file = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
  console.log('export:', dl.suggestedFilename(), 'crash:', file.crash && file.crash.message, 'build:', file.build);
  // Back to this morning: the spare goes into the slot and the page reloads to it.
  await Promise.all([p.waitForNavigation(), p.click('#crash-spare')]);
  await p.waitForTimeout(800);
  const back = await p.evaluate(() => JSON.parse(localStorage.getItem('afterglass-season/slot/1/v1')));
  const stillCrashed = await p.isVisible('#crash');
  console.log('after going back: day', back.day, back.phase, 't', back.t, 'crash panel', stillCrashed);
  const v = await p.evaluate(() => window.__csp || []);
  console.log('policy violations:', v.length ? v : 'none', csp.length ? csp : '');
  console.log('page errors (the forced one expected):', errors);
  const fails = [];
  if (!panel) fails.push('no crash panel');
  if (before !== after) fails.push('the slot was written after the crash');
  if (!file.crash) fails.push('the export has no crash in it');
  if (!(back.phase === 'day' && back.t === 0) || stillCrashed) fails.push(`going back didn't reload the morning (${back.phase} ${back.t})`);
  if (v.length || csp.length) fails.push('policy violations');
  if (errors.some((e) => !/living/.test(e))) fails.push(`unexpected page errors: ${errors.join(' | ')}`);
  console.log(fails.length ? `FAILED: ${fails.join('; ')}` : 'crash: all good');
  if (fails.length) process.exitCode = 1;
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
