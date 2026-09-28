// Round seven's phone rules (phase 3): no control a phone shows under 44 px, and no text under 12 px, across
// the committed states and their panels, each opened twice so the folded explanations (phase 4) show too.
// Usage: node taps.cjs [label,label]
const L = require('./lib.cjs');
const only = process.argv[2] && process.argv[2] !== 'all' ? process.argv[2].split(',') : null;
const outName = process.argv[3] || 'taps';
const ALL = ['phase', 'people', 'build', 'records:book', 'records:log', 'records:days', 'menu:settings', 'menu:saves', 'menu:howto'];
// The committed states (e2e/states), each with the panels a phone shows in it.
const CASES = [
  ['day', 'day', ALL],
  ['raid-warned', 'raid-warned', ['phase']],
  ['raid-assault', 'raid-assault', ['phase']],
  ['fire', 'fire', ['phase']],
  ['visitor', 'visitwitch', ['phase']],
  ['dusk', 'hunters', ['phase', 'people']],
  ['night', 'actsnight', ['phase', 'people']],
  ['caught', 'caught', ['phase']],
  ['dawn', 'ask', ['phase']],
  ['season-end', 'review-end', ['phase', 'records:book', 'records:days']],
  ['rooms-day', 'rooms-day', ['phase', 'build']],
]
async function open(p, what) {
  const [panel, tab] = what.split(':');
  if (panel === 'build') {
    const b = await p.$('#btn-build');
    if (!b) return false;
    await b.click();
  } else if (!(await L.openPanel(p, panel))) return false;
  await p.waitForTimeout(200);
  if (tab) {
    const t = await p.$(panel === 'records' ? `#tab-${tab}` : `#menu-tab-${tab}`);
    if (!t) return false;
    await t.click();
    await p.waitForTimeout(200);
  }
  return true;
}
const kindOf = (x) => `${x.tag}${x.cls ? '.' + x.cls.split(' ')[0] : ''}${x.id ? '#' + x.id.replace(/[-_]?\d+.*$/, '').replace(/-(\w+)$/, '-*') : ''}`;
(async () => {
  const browser = await L.launch();
  const small = {};
  const tiny = {};
  let screens = 0, totalSmall = 0, totalCtl = 0;
  const note = (m, where) => {
    screens++;
    totalCtl += m.controls.shown;
    totalSmall += m.smallTargets.count;
    for (const x of m.smallTargets.list) {
      const k = kindOf(x);
      const e = (small[k] = small[k] || { n: 0, minW: 999, minH: 999, text: x.text, where });
      e.n++;
      e.minW = Math.min(e.minW, x.w);
      e.minH = Math.min(e.minH, x.h);
    }
    for (const [k, v] of Object.entries(m.tinyText.kinds)) {
      const e = (tiny[k] = tiny[k] || { n: 0, sample: v.sample, where });
      e.n += v.n;
    }
  };
  for (const [label, file, panels] of CASES) {
    if (only && !only.includes(label)) continue;
    const { ctx, page: p } = await L.newPage(browser, 'phone');
    await L.loadState(p, file);
    note(await L.measure(p, label), `${label}`);
    for (const what of panels) {
      await L.closePanel(p);
      await L.closeToasts(p);
      if (!(await open(p, what))) continue;
      note(await L.measure(p, `${label} ${what}`), `${label} ${what}`);
      // Phase 4: again, after closing, when the standing explanations have folded into a "?".
      await L.closePanel(p);
      await L.closeToasts(p);
      if (!(await open(p, what))) continue;
      note(await L.measure(p, `${label} ${what} again`), `${label} ${what} again`);
    }
    await ctx.close();
  }
  const rows = Object.entries(small).sort((a, b) => b[1].n - a[1].n);
  console.log(`screens ${screens}; controls ${totalCtl}; under 44 px ${totalSmall}`);
  for (const [k, e] of rows) console.log(`${String(e.n).padStart(5)}  ${k.padEnd(40)} min ${e.minW}x${e.minH}  "${e.text}"  (${e.where})`);
  console.log('--- text under 12 px');
  for (const [k, e] of Object.entries(tiny).sort((a, b) => b[1].n - a[1].n)) console.log(`${String(e.n).padStart(5)}  ${k}  "${e.sample}"  (${e.where})`);
  const errs = L.errors.filter((e) => !/fonts|ERR_CERT|ERR_TUNNEL|net::/.test(e.text));
  if (errs.length) console.log('ERRORS', JSON.stringify(errs, null, 1));
  const tinyN = Object.values(tiny).reduce((a, e) => a + e.n, 0);
  console.log(totalSmall || tinyN || errs.length ? `taps: FAILED (${totalSmall} controls under 44 px, ${tinyN} texts under 12 px)` : 'taps: all good');
  if (totalSmall || tinyN || errs.length) process.exitCode = 1;
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
