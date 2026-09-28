// Phase 3b: the dusk can't trap a phone player. Taps on shades pick them whatever the tool, a candle or a
// ward set this dusk comes back with a tap, a double tap doesn't take back what it just set, and dusk opens
// on Move.
const L = require('./lib.cjs');
const fails = [];
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fails.push(what); };
(async () => {
  const browser = await L.launch();
  const { ctx, page: p } = await L.newPage(browser, 'phone');
  await L.loadState(p, 'state-hunters.json');
  await L.closePanel(p);
  await L.closeToasts(p);
  const st = () => p.evaluate(() => { const s = window.__season.keep; return { candles: s.res.candles, set: s.night.candles.length, wards: s.night.wards.slice(), essence: s.res.essence, tool: window.__season.tool, selected: window.__season.selected }; });
  const tapAt = async (f, x) => { const pt = await p.evaluate(([f, x]) => window.__season.spot(f, x), [f, x]); await p.touchscreen.tap(pt.x, pt.y); await p.waitForTimeout(120); };
  const a = await st();
  check(a.tool === 'move', `a dusk loaded opens on Move (${a.tool})`);
  // The Candle tool on shades: one standing in light is picked, one in the dark is lit, and two taps never
  // spend two candles.
  const shades = await p.evaluate(() => window.__season.keep.shades.filter((z) => z.kind !== 'restless' && z.kind !== 'wraith').map((z) => ({ id: z.id, name: z.name, f: z.f, x: z.x })));
  const litOf = (d) => p.evaluate(async ([f, x]) => { const g = await import('./src/slice/geo.js'); const s = window.__season.keep; return g.isLit(g.lightMap(g.geo(s), s.tuning, s.night.candles), f, x); }, [d.f, d.x]);
  let lit = null, dark = null;
  for (const d of shades) { if (await litOf(d)) lit ||= d; else dark ||= d; }
  if (lit) {
    await p.click('#tool-candle');
    await tapAt(lit.f, lit.x);
    const b = await st();
    check(b.candles === a.candles && b.selected === lit.id && b.tool === 'move', `Candle out, a tap on ${lit.name}, in light, picks it and spends nothing (tool ${b.tool})`);
  } else console.log('(no shade in light at this dusk)');
  if (dark) {
    const c0 = await st();
    await p.click('#tool-candle');
    await tapAt(dark.f, dark.x);
    const c1 = await st();
    check(c1.candles === c0.candles - 1, `Candle out, a tap on ${dark.name}, in the dark, lights its spot (${c0.candles} → ${c1.candles})`);
    await tapAt(dark.f, dark.x);
    const c2 = await st();
    check(c2.candles === c1.candles, 'a quick second tap spends nothing more');
    await p.waitForTimeout(600);
    await tapAt(dark.f, dark.x);
    const c3 = await st();
    check(c3.candles === c0.candles, `a later tap takes that candle back whole (${c3.candles})`);
  } else console.log('(no shade in the dark at this dusk)');
  let b = await st();
  // A candle in an empty stretch, then taken back.
  const spot = await p.evaluate(() => { const s = window.__season.keep; const G = s.keep; const f = s.shades[0].f; const xs = [10, 20, 30, 40, 50, 62, 72, 82, 92, 102]; const busy = (x) => s.shades.some((z) => z.f === f && Math.abs(z.x - x) < 8) || s.night.candles.some((k) => k.f === f && Math.abs(k.x - x) < 8); return { f, x: xs.find((x) => !busy(x)) }; });
  await p.click('#tool-candle');
  await tapAt(spot.f, spot.x);
  b = await st();
  check(b.candles === a.candles - 1 && b.set === a.set + 1, `a tap in an empty stretch sets a candle (${b.set} set)`);
  await tapAt(spot.f, spot.x); // a quick second tap: a double tap, not a change of mind
  let c = await st();
  check(c.set === b.set, 'a quick second tap on the candle just set leaves it');
  await p.waitForTimeout(600);
  await tapAt(spot.f, spot.x);
  c = await st();
  check(c.candles === a.candles && c.set === a.set, `a tap on it later takes it back whole (candles ${c.candles})`);
  const toast = await p.$$eval('.toast', (e) => e.map((x) => x.innerText.split('\n')[0]));
  check(toast.some((t) => /back in the store/.test(t)), `and says so: ${JSON.stringify(toast)}`);
  // A ward, and lifting it.
  const stair = await p.evaluate(() => { const s = window.__season.keep; const st = s.keep ? null : null; return null; });
  const w = await p.evaluate(() => { const s = window.__season.keep; s.res.essence = Math.max(s.res.essence, 20); return true; });
  await p.click('#tool-ward');
  const target = await p.evaluate(() => { const s = window.__season.keep; const G = window.__season; return null; });
  const ws = await p.evaluate(() => { const s = window.__season.keep; const g = s.keep; return null; });
  // Find a stair through the geometry the page uses: the first stair's lower floor and x.
  const stairAt = await p.evaluate(async () => { const m = await import('./src/slice/geo.js'); const G = m.geo(window.__season.keep); const st = G.stairs[0]; return st ? { id: st.id, f: st.f, x: st.x } : null; });
  if (stairAt) {
    const e0 = (await st()).essence;
    await tapAt(stairAt.f, stairAt.x);
    let e = await st();
    check(e.wards.includes(stairAt.id) && e.essence < e0, `a tap on a stair with Ward seals it (essence ${e0} → ${e.essence})`);
    await tapAt(stairAt.f, stairAt.x);
    e = await st();
    check(!e.wards.includes(stairAt.id) && Math.abs(e.essence - e0) < 1e-9, `a second tap lifts it and gives the essence back (${e.essence})`);
  } else check(false, 'no stair in this keep to ward');
  // The taps are actions: they'd replay.
  const types = await p.evaluate(() => window.__season.keep.actions.slice(-6).map((x) => x.a.type));
  check(types.includes('uncandle') && types.includes('unward'), `recorded as actions: ${types.join(', ')}`);
  await L.shot(p, '../../p3/dusk-after');
  await ctx.close();
  // Dusk starts on Move when it comes, from a day.
  const { ctx: c2, page: q } = await L.newPage(browser, 'phone');
  await L.loadState(q, 'state-day.json');
  await L.closePanel(q);
  await q.evaluate(() => { const s = window.__season.keep; });
  for (let i = 0; i < 120 && (await q.evaluate(() => window.__season.keep.phase)) === 'day'; i++) {
    await L.closeToasts(q);
    await L.closePanel(q);
    if ((await q.getAttribute('#btn-rush', 'aria-pressed').catch(() => 'true')) !== 'true') await q.click('#btn-rush').catch(() => {});
    await q.waitForTimeout(700);
  }
  await q.waitForTimeout(300);
  check((await q.evaluate(() => window.__season.tool)) === 'move', 'a dusk reached from the day opens on Move');
  await c2.close();
  const errs = L.errors.filter((e) => !/fonts|ERR_CERT|ERR_TUNNEL|net::/.test(e.text));
  if (errs.length) console.log('ERRORS', JSON.stringify(errs, null, 1));
  console.log(fails.length ? `${fails.length} FAILED` : 'dusk: all good');
  if (fails.length || errs.length) process.exitCode = 1;
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
