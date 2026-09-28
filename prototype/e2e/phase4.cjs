// Phase 4 in Chromium on a phone: the guide on by default, a standing explanation shown once and then folded,
// its "More in How to play", the rates, staging in Build, the lesson card's asking End, and Got it resuming.
const { chromium, BASE, OUT, state } = require('./lib.cjs');
(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const oks = [];
  const check = (ok, msg) => (ok ? oks : errors).push(msg);
  const fresh = async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    page.setDefaultTimeout(5000);
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    await page.goto(BASE + '/season.html');
    await page.evaluate(() => localStorage.clear());
    await page.goto(BASE + '/season.html');
    await page.waitForTimeout(500);
    return page;
  };
  const words = (t) => (t.match(/[A-Za-z0-9’'×.,:%\-]+/g) || []).length;
  const closeSheet = async (page) => { if (await page.isVisible('#sheet-close')) await page.click('#sheet-close'); await page.waitForTimeout(150); };
  try {
    // A new game, as a first-time player makes one.
    let page = await fresh();
    const K = (f, a) => page.evaluate(f, a);
    await page.click('#title-new');
    await page.waitForTimeout(200);
    check(await page.isChecked('#title-guide'), 'the guide is on at New game on a fresh device');
    await page.click('#title-begin');
    await page.waitForTimeout(600);
    if (await page.isVisible('#coach-ok')) await page.click('#coach-ok');
    await page.click('#open-phase');
    await page.waitForTimeout(250);
    const first = await page.textContent('#sheet');
    check(/The living work by day/.test(first) && !(await page.$('#sheet details.why[data-keep="why-day"]')), 'the Day panel explains the day in full the first time');
    check(/Food [\d.]+: the keep eats [\d.]+ a day and the Hearth makes [\d.]+\./.test(first), `the food rate: ${(first.match(/Food [^.]*\./) || [''])[0]}`);
    await closeSheet(page);
    check(await K(() => !!window.__season.keep.read?.day), 'closing the panel marks it read, in the keep');
    await page.click('#open-phase');
    await page.waitForTimeout(250);
    const second = await page.textContent('#sheet');
    check(!!(await page.$('#sheet details.why[data-keep="why-day"]')) && !(await page.isVisible('#sheet details.why[data-keep="why-day"] .why-body')), 'the second time it is a folded "?"');
    const sum = await page.$('#sheet details.why[data-keep="why-day"] > summary');
    const box = await sum.boundingBox();
    check(box.height >= 44, `the "?" is ${Math.round(box.height)} px tall`);
    console.log('day panel words: first', words(first), 'again', words(second));
    await sum.click();
    await page.waitForTimeout(150);
    check(await page.isVisible('#sheet details.why[data-keep="why-day"] .why-body'), 'a tap opens it');
    await page.click('#sheet details.why[data-keep="why-day"] [data-act="howto"]');
    await page.waitForTimeout(500);
    const at = await K(() => { const h = document.getElementById('howto-day'); const sh = document.getElementById('sheet'); if (!h) return null; const r = h.getBoundingClientRect(), q = sh.getBoundingClientRect(); return { top: Math.round(r.top), sheetTop: Math.round(q.top), sheetBottom: Math.round(q.bottom), tab: document.querySelector('#menu-tab-howto')?.getAttribute('aria-selected') }; });
    check(at && at.top >= at.sheetTop && at.top < at.sheetBottom - 40 && at.tab === 'true', `More in How to play opens its section in view: ${JSON.stringify(at)}`);
    await closeSheet(page);
    await page.click('#open-people');
    await page.waitForTimeout(250);
    const ppl = await page.textContent('#sheet');
    check(/\d+ of the \d+ the keep can shelter/.test(ppl), `People: ${(ppl.match(/\d+ of the \d+ the keep can shelter[^.]*\./) || [''])[0]}`);
    await closeSheet(page);
    await page.click('#btn-build');
    await page.waitForTimeout(250);
    const bld = await page.textContent('#sheet');
    check(/The Library and the Hall can be built from summer\./.test(bld), 'Build says the Library and the Hall come in summer');
    check(!/id="build-library"|id="build-hall"/.test(await page.innerHTML('#sheet')), 'no Library or Hall button in spring');
    await closeSheet(page);
    // Got it on a card that stopped the clock starts it again: run to night 1's card.
    for (let i = 0; i < 3 && (await page.textContent('#speed-next')).trim() !== '4×'; i++) await page.click('#speed-next');
    let resumed = null, tides = false;
    const t0 = Date.now();
    while (Date.now() - t0 < 150000 && (resumed === null || !tides)) {
      if (await K(() => window.__season.crossing)) await page.mouse.click(195, 200);
      if (await page.isVisible('#coach-ok')) {
        const txt = await page.textContent('#coach p');
        const before = (await page.textContent('#btn-play').catch(() => '')).trim();
        if (/strip under the top bar|tide clock/i.test(txt)) tides = true;
        await page.click('#coach-ok');
        await page.waitForTimeout(200);
        const after = (await page.textContent('#btn-play').catch(() => '')).trim();
        if (/^Play/.test(before) && (await K(() => ['day', 'night'].includes(window.__season.keep.phase)))) {
          resumed = /^Pause/.test(after);
          console.log('card that stopped the clock:', txt.slice(0, 60), '| before', before, '| after', after);
        }
        continue;
      }
      if (await page.isVisible('#bar-start')) { await closeSheet(page); await page.click('#bar-start'); }
      else if (await page.isVisible('#bar-wake')) { await page.click('#bar-wake'); await page.waitForTimeout(2600); await closeSheet(page); }
      else if (await page.isVisible('#bar-day')) { await closeSheet(page); await page.click('#bar-day'); }
      else {
        const txt = (await page.textContent('#btn-play').catch(() => '')).trim();
        if (/^Play/.test(txt) && !(await page.isVisible('#coach-ok'))) await page.click('#btn-play').catch(() => {});
      }
      await page.waitForTimeout(200);
    }
    check(resumed === true, `Got it on a card that stopped the clock runs it again (${resumed})`);
    check(tides, 'the tide clock card came on night 1');
    await page.close();

    // The tutorial's card: End asks first, and the skip says what it skips.
    page = await fresh();
    await page.click('#title-tutorial');
    await page.waitForTimeout(400);
    await page.click('#btn-play');
    await page.waitForTimeout(600);
    const labels = await page.$$eval('#coach button', (bs) => bs.map((b) => b.textContent));
    check(labels.includes('Skip this lesson') || labels.includes('Got it'), `lesson buttons: ${labels.join(', ')}`);
    await page.click('#coach-off');
    await page.waitForTimeout(150);
    check(/End the tutorial for good\?/.test(await page.textContent('#coach')) && (await page.isVisible('#coach-end-yes')), 'End the tutorial asks first');
    check(await page.evaluate(() => !window.__season.keep.tut?.off), 'asking ends nothing');
    await page.click('#coach-end-no');
    await page.waitForTimeout(150);
    check(await page.isVisible('#coach-off'), 'Keep going brings the lesson back');
    await page.click('#coach-off');
    await page.click('#coach-end-yes');
    await page.waitForTimeout(200);
    check(await page.evaluate(() => window.__season.keep.tut?.off === true), 'End it ends the tutorial');
    await page.close();
  } catch (e) {
    errors.push(`threw ${e.message.split('\n')[0]} at ${(e.stack.match(/p4check\.cjs:(\d+)/) || [])[1]}`);
  }
  await browser.close();
  console.log(oks.map((m) => `ok  ${m}`).join('\n'));
  console.log(errors.length ? errors.map((m) => `ERR ${m}`).join('\n') : 'no errors');
  if (errors.length) process.exitCode = 1;
})();
