// The trail: a pause by hand, a panel opened, and both in the playtest export, with no page errors.
const { chromium, BASE, OUT, state } = require('./lib.cjs');
(async () => {
  const b = await chromium.launch();
  const errors = [];
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  p.setDefaultTimeout(5000);
  p.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/fonts|ERR_CERT|net::/.test(m.text())) errors.push(`console: ${m.text()}`); });
  await p.goto(BASE + '/season.html');
  await p.evaluate(() => localStorage.clear());
  await p.goto(BASE + '/season.html?dev'); // the Playtest tab is a developer's tool now (round seven)
  await p.waitForSelector('#title-continue', { timeout: 1500 }).then((el) => el.click()).catch(() => {});
  await p.click('#title-new');
  await p.click('#title-begin');
  await p.click('#btn-play');
  await p.waitForTimeout(1200);
  await p.click('#btn-play');
  await p.click('#open-people');
  await p.click('#sheet-close');
  await p.click('#open-records');
  await p.click('#tab-playtest');
  await p.click('#btn-show-export');
  const x = JSON.parse(await p.inputValue('#export'));
  const kinds = x.trail.map((e) => `${e.k}${e.by ? `:${e.by}` : ''}${e.name ? `:${e.name}` : ''}`);
  console.log('now', JSON.stringify(x.now), '| trail', kinds.join(' '));
  const ok = kinds.includes('pause:you') && kinds.includes('play:you') && kinds.includes('panel:people') && x.now.t > 0;
  console.log(ok && !errors.length ? 'trail: all good' : `trail: FAILED ${errors.join(' | ')}`);
  if (!ok || errors.length) process.exitCode = 1;
  await b.close();
})();
