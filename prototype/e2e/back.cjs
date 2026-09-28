// Phase 3d: Back closes panels (and the main screen opened from the keep), a panel closed another way gives
// its step back, the tab lists take the arrow keys, and the night reads out in one line.
const L = require('./lib.cjs');
const fails = [];
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fails.push(what); };
(async () => {
  const browser = await L.launch();
  {
    const { ctx, page: p } = await L.newPage(browser, 'phone');
    await L.loadState(p, 'state-day.json');
    await L.closePanel(p);
    await p.waitForTimeout(300);
    const st = () => p.evaluate(() => ({ state: history.state, sheet: !document.querySelector('#sheet').hidden, title: !document.querySelector('#title').hidden, url: location.href }));
    let a = await st();
    check(!a.state && !a.sheet, `nothing open, no step held (${JSON.stringify(a.state)})`);
    await p.click('#open-people');
    await p.waitForTimeout(300);
    a = await st();
    check(a.sheet && a.state?.afterglass === 'back', 'People open: a step held');
    await p.evaluate(() => history.back());
    await p.waitForTimeout(400);
    a = await st();
    check(!a.sheet && !a.state && /season\.html/.test(a.url), `Back closes it and stays in the game (${a.url.slice(-20)})`);
    // Closed with its own button: the step goes back out.
    await p.click('#open-records');
    await p.waitForTimeout(300);
    await p.click('#sheet-close');
    await p.waitForTimeout(400);
    a = await st();
    check(!a.sheet && !a.state, `closed with Close, the step is taken back out (${JSON.stringify(a.state)})`);
    // Switching panels holds one step, and one Back closes it.
    await p.click('#open-people');
    await p.waitForTimeout(200);
    await p.click('#open-records');
    await p.waitForTimeout(300);
    await p.evaluate(() => history.back());
    await p.waitForTimeout(400);
    a = await st();
    check(!a.sheet && !a.state, 'People then Records: one Back closes the panel');
    // The main screen from the Menu: Back returns to the keep.
    await p.click('#open-menu');
    await p.waitForTimeout(300);
    const t = await p.$('[data-act="title-open"]');
    if (t) {
      await t.click();
      await p.waitForTimeout(400);
      a = await st();
      check(a.title && a.state?.afterglass === 'back', 'the main screen, opened from the keep, holds a step');
      await p.evaluate(() => history.back());
      await p.waitForTimeout(400);
      a = await st();
      check(!a.title, 'Back from it returns to the keep');
    } else check(false, 'no Main screen button in the Menu');
    // The tab lists: arrows go along the tabs, not the castle.
    await p.click('#open-records');
    await p.waitForTimeout(300);
    const first = await p.$('[role="tab"][aria-selected="true"]');
    const id0 = await first.getAttribute('id');
    await first.focus();
    await p.keyboard.press('ArrowRight');
    await p.waitForTimeout(300);
    const r = await p.evaluate(() => ({ sel: document.querySelector('[role="tab"][aria-selected="true"]')?.id, focus: document.activeElement?.id, idx: [...document.querySelectorAll('[role="tab"]')].map((x) => `${x.id}:${x.tabIndex}`) }));
    check(r.sel !== id0 && r.focus === r.sel, `ArrowRight on ${id0} opens ${r.sel}, focused (${r.idx.join(' ')})`);
    await p.keyboard.press('End');
    await p.waitForTimeout(300);
    const r2 = await p.evaluate(() => ({ sel: document.querySelector('[role="tab"][aria-selected="true"]')?.id, last: [...document.querySelectorAll('[role="tab"]')].at(-1).id }));
    check(r2.sel === r2.last, `End opens the last tab (${r2.sel})`);
    await ctx.close();
  }
  {
    // At launch on the main screen, no step is held: Back leaves, as it should.
    const { ctx, page: p } = await L.newPage(browser, 'phone');
    await L.fresh(p);
    const a = await p.evaluate(() => ({ state: history.state, title: !document.querySelector('#title').hidden }));
    check(a.title && !a.state, 'on the main screen at launch, no step held');
    await ctx.close();
  }
  {
    // The night status.
    const { ctx, page: p } = await L.newPage(browser, 'desktop');
    await L.loadState(p, 'state-p3night.json');
    await L.closePanel(p);
    await p.click('#btn-play');
    await p.waitForTimeout(1500);
    const a = await p.evaluate(() => ({ live: document.querySelector('#sr-status').getAttribute('aria-live'), text: document.querySelector('#sr-status').textContent, hint: document.querySelector('#stage-hint').getAttribute('aria-live') }));
    check(a.live === 'polite' && /The Unlit: \d+ out, \d+ to come\. The Veil: \d of \d cracked/.test(a.text), `the night status: "${a.text}"`);
    check(a.hint === 'polite', 'the hint is a live region');
    const h = await p.evaluate(() => [...document.querySelectorAll('#gres dd')].slice(2, 4).map((d) => d.textContent.replace(/\s+/g, ' ')));
    check(h.every((x) => /\d+\/\d of \d/.test(x)), `Dread and the Veil read as values: ${JSON.stringify(h)}`);
    await ctx.close();
  }
  const errs = L.errors.filter((e) => !/fonts|ERR_CERT|ERR_TUNNEL|net::/.test(e.text));
  if (errs.length) console.log('ERRORS', JSON.stringify(errs, null, 1));
  console.log(fails.length ? `${fails.length} FAILED` : 'back, tabs and the night status: all good');
  if (fails.length || errs.length) process.exitCode = 1;
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
