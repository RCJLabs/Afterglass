const L = require('./lib.cjs');
(async () => {
  const browser = await L.launch();
  const { ctx, page: p } = await L.newPage(browser, 'phone');
  await L.loadState(p, 'state-caught.json');
  await L.closePanel(p);
  await L.closeToasts(p);
  const d = await p.evaluate(() => { const s = window.__season.keep; const x = s.shades.find((z) => z.grabbedBy); return x && { id: x.id, name: x.name, f: x.f, x: x.x, phase: s.phase, paused: true }; });
  console.log('held', JSON.stringify(d));
  if (!d) return browser.close();
  // The saved state has a candle on the spot already (the captor is lit, and lets go on the next tick): take it
  // away so the captor stands in the dark.
  const lit0 = await p.evaluate(() => { const s = window.__season.keep; const d = s.shades.find((z) => z.grabbedBy); const c = s.night.foes.find((f) => f.id === d.grabbedBy); s.night.candles = s.night.candles.filter((k) => !(k.f === c.f && Math.abs(k.x - c.x) < 20)); s.rev++; return s.night.candles.length; });
  // First, as it was: with the captor in light, a tap picks the shade (it's being freed) and sets nothing.
  await p.waitForTimeout(200);
  const n0 = await p.evaluate(() => window.__season.keep.night.candles.length);
  await p.click('#tool-candle');
  const pt = await p.evaluate(([f, x]) => window.__season.spot(f, x), [d.f, d.x]);
  await p.touchscreen.tap(pt.x, pt.y);
  await p.waitForTimeout(200);
  const r = await p.evaluate(() => ({ n: window.__season.keep.night.candles.length, sel: window.__season.selected, tool: window.__season.tool }));
  console.log(r.n === n0 + 1 ? 'ok   the Candle tool lights a held shade\'s spot' : 'FAIL no candle on the held shade', JSON.stringify(r));
  await p.touchscreen.tap(pt.x, pt.y);
  await p.waitForTimeout(200);
  const r2 = await p.evaluate(() => ({ n: window.__season.keep.night.candles.length, sel: window.__season.selected, tool: window.__season.tool }));
  console.log(r2.n === n0 + 1 && r2.sel ? 'ok   a second tap, still paused, picks it and sets no second candle' : 'FAIL a second tap on the caught shade', JSON.stringify(r2));
  if (r.n !== n0 + 1 || !(r2.n === n0 + 1 && r2.sel)) process.exitCode = 1;
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
