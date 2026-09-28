// Phase 3c: the Dusk panel on a phone leaves the Tain in view, its lines bring their spot into view, and the
// emergency strip shows the Host at the gate, a fire, a visitor and raiders on the road.
const L = require('./lib.cjs');
const fails = [];
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fails.push(what); };
(async () => {
  const browser = await L.launch();
  {
    const { ctx, page: p } = await L.newPage(browser, 'phone');
    await L.loadState(p, 'state-hunters.json');
    await L.closePanel(p);
    await L.closeToasts(p);
    await p.click('#open-phase');
    await p.waitForTimeout(500);
    const m = await p.evaluate(() => {
      const hud = document.querySelector('#hud').getBoundingClientRect();
      const sheet = document.querySelector('#sheet').getBoundingClientRect();
      const bar = document.querySelector('#bar').getBoundingClientRect();
      const first = document.querySelector('#sheet-body .card, #sheet-body details');
      return { tain: Math.round(sheet.top - hud.bottom), sheet: Math.round(sheet.height), free: Math.round(bar.top - hud.bottom), half: document.querySelector('#sheet').classList.contains('is-half'), firstIs: first?.className, ways: document.querySelectorAll('.scry .way').length };
    });
    check(m.half && m.tain >= m.free * 0.45, `the Dusk panel takes half: ${m.sheet} px of ${m.free}, the Tain keeps ${m.tain} px`);
    check(/scry/.test(m.firstIs || ''), `the black mirror comes first in it (${m.firstIs})`);
    check(m.ways > 0, `${m.ways} of its lines are taps`);
    await L.shot(p, '../../p3/dusk-half');
    // Each line: tap it, and its spot should end up inside the Tain's free part, ringed.
    const n = Math.min(m.ways, 4);
    for (let i = 0; i < n; i++) {
      const b = await p.$(`.scry .way >> nth=${i}`);
      const spot = await b.evaluate((e) => ({ f: Number(e.dataset.f), x: Number(e.dataset.x), text: e.innerText.slice(0, 60) }));
      await b.click();
      await p.waitForTimeout(400);
      const r = await p.evaluate(([f, x]) => {
        const pt = window.__season.spot(f, x);
        const hud = document.querySelector('#hud').getBoundingClientRect();
        const sheet = document.querySelector('#sheet').getBoundingClientRect();
        return { y: Math.round(pt.y), x: Math.round(pt.x), top: Math.round(hud.bottom), bottom: Math.round(sheet.top) };
      }, [spot.f, spot.x]);
      check(r.y > r.top && r.y < r.bottom && r.x > 0 && r.x < 390, `line ${i} ("${spot.text}…") brings floor ${spot.f} x ${spot.x} to ${r.x},${r.y}, between ${r.top} and ${r.bottom}`);
      if (i === 0) await L.shot(p, '../../p3/dusk-spot');
    }
    // Placing still works with the panel open: a tap on the Tain above it sets a candle.
    await p.click('#tool-candle');
    const before = await p.evaluate(() => window.__season.keep.night.candles.length);
    const free = await p.evaluate(() => { const s = window.__season.keep; const hud = document.querySelector('#hud').getBoundingClientRect(); const sheet = document.querySelector('#sheet').getBoundingClientRect(); for (let f = 0; f < 6; f++) for (const x of [12, 20, 30, 44, 64, 76, 90, 100]) { const pt = window.__season.spot(f, x); if (pt.y > hud.bottom + 10 && pt.y < sheet.top - 10 && !s.shades.some((d) => d.f === f && Math.abs(d.x - x) < 5)) return { f, x }; } return null; });
    if (free) {
      const pt = await p.evaluate(([f, x]) => window.__season.spot(f, x), [free.f, free.x]);
      await p.touchscreen.tap(pt.x, pt.y);
      await p.waitForTimeout(200);
      const after = await p.evaluate(() => window.__season.keep.night.candles.length);
      check(after === before + 1, `with the panel open, a tap on the Tain above it sets a candle (${before} → ${after})`);
    } else check(false, 'no free spot above the panel to tap');
    await ctx.close();
  }
  for (const [label, file, want] of [['assault', 'state-raid-assault.json', 'e-pitch'], ['fire', 'state-fire.json', 'e-yard'], ['visitor', 'state-visitwitch.json', 'e-answer'], ['road', 'state-raid-warned.json', 'e-open']]) {
    const { ctx, page: p } = await L.newPage(browser, 'phone');
    await L.loadState(p, file);
    await L.closePanel(p);
    await L.closeToasts(p);
    await p.waitForTimeout(200);
    const r = await p.evaluate(() => { const e = document.querySelector('.estrip'); return e && { cls: e.className, text: e.innerText.replace(/\n+/g, ' | '), ids: [...e.querySelectorAll('button')].map((b) => `${b.id}${b.disabled ? '(off)' : ''}`), h: Math.round(e.getBoundingClientRect().height), hud: document.querySelector('#hud').offsetHeight }; });
    check(!!r && r.ids.some((x) => x.startsWith(want)), `${label}: the strip shows ${r ? `"${r.text}" [${r.ids.join(' ')}], ${r.h} px, HUD ${r.hud} px` : 'nothing'}`);
    await L.shot(p, `../../p3/strip-${label}`);
    if (r) {
      await p.click('#e-open, #e-answer');
      await p.waitForTimeout(500);
      const o = await p.evaluate(() => ({ sheet: !document.querySelector('#sheet').hidden, strip: !!document.querySelector('.estrip'), card: (() => { const c = document.querySelector('#sheet-body .card.raid, #sheet-body .card.fire, #sheet-body .card.visit, #sheet-body .card.raid-road'); if (!c) return null; const b = document.querySelector('#sheet-body').getBoundingClientRect(); const k = c.getBoundingClientRect(); return Math.round(k.top - b.top); })() }));
      check(o.sheet && !o.strip && o.card !== null && o.card < 120, `${label}: More opens the Day panel at the card (${o.card} px from its top) and the strip stands aside`);
    }
    await ctx.close();
  }
  // The fire's button does what the panel's does.
  {
    const { ctx, page: p } = await L.newPage(browser, 'phone');
    await L.loadState(p, 'state-fire.json');
    await L.closePanel(p);
    await L.closeToasts(p);
    const before = await p.evaluate(() => window.__season.keep.living.filter((x) => x.fighting).length);
    const yard = await p.$('#e-yard:not([disabled])');
    if (yard) {
      await yard.click();
      await p.waitForTimeout(200);
      const after = await p.evaluate(() => window.__season.keep.living.filter((x) => x.fighting).length);
      check(after > before, `Send the Yard from the strip sends them (${before} → ${after} fighting)`);
    } else console.log('(no one in the Yard in this state)');
    await ctx.close();
  }
  const errs = L.errors.filter((e) => !/fonts|ERR_CERT|ERR_TUNNEL|net::/.test(e.text));
  if (errs.length) console.log('ERRORS', JSON.stringify(errs, null, 1));
  console.log(fails.length ? `${fails.length} FAILED` : 'strip and dusk sheet: all good');
  if (fails.length || errs.length) process.exitCode = 1;
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
