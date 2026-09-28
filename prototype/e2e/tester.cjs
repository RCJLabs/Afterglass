// The tester's link (round six's playtest kit, round seven's phase 5): the tutorial under ?test, played through its
// three days on a phone; at its end the play-on card; stopping there brings the questions; Copy as text gives
// the session, and the replay viewer shows the tester's choice and answers.
const { chromium, BASE, OUT } = require('./lib.cjs');
const dir = `${OUT}/shots/tester-`;
const only = process.argv[2];
(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const check = (ok, msg) => { if (!ok) errors.push(msg); };
  for (const [vw, vh, tag] of [[390, 844, 'phone']]) {
    if (only && only !== tag) continue;
    const page = await browser.newPage({ viewport: { width: vw, height: vh } });
    page.setDefaultTimeout(5000);
    page.on('pageerror', (e) => errors.push(`${tag} pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`${tag} console: ${m.text()}`); });
    await page.goto(BASE + '/season.html');
    await page.evaluate(() => localStorage.clear());
    await page.goto(BASE + '/season.html?test=Pat');
    await page.waitForTimeout(600);
    const coach = async () => ((await page.isVisible('#coach')) ? (await page.textContent('#coach p')) : '');
    const K = (f, a) => page.evaluate(f, a);
    const shot = (name) => page.screenshot({ path: `${dir}${tag}-${name}.png` });
    const closeSheet = async () => { if (await page.isVisible('#sheet-close')) await page.click('#sheet-close'); await page.waitForTimeout(100); };
    // Run the clock (pressing Play whenever it's paused) until cond holds.
    const until = async (cond, what, ms = 90000) => {
      const t0 = Date.now();
      while (!(await cond())) {
        if (Date.now() - t0 > ms) { errors.push(`${tag}: timed out waiting for ${what}; coach: ${await coach()}`); return false; }
        const txt = await page.textContent('#btn-play').catch(() => '');
        if (/Play/.test(txt) && (await page.isEnabled('#btn-play').catch(() => false))) await page.click('#btn-play', { timeout: 1000 }).catch(() => {});
        await page.waitForTimeout(100);
      }
      return true;
    };
    const lesson = (re, what, ms) => until(async () => re.test(await coach()), what, ms);
    const ok = async () => { await page.click('#coach-ok'); await page.waitForTimeout(150); };
    const tap = async (f, x) => {
      const p = await K(([f, x]) => window.__season.spot(f, x), [f, x]);
      await page.mouse.click(p.x, p.y);
      await page.waitForTimeout(150);
    };

    try {
    check(/play on to the season's end/.test(await page.textContent('#sheet')), `${tag}: the note doesn't mention playing on`);
    await page.click('#test-begin');
    await page.waitForTimeout(400);
    check(await K(() => window.__season.keep.tuning.tutorial === 1), `${tag}: not a tutorial keep`);
    check(await K(() => window.__season.keep.living.some((p) => p.name === 'Maud')), `${tag}: no Maud`);
    check(/tutorial keep/.test(await coach()), `${tag}: first lesson: ${await coach()}`);
    check(await page.$('#btn-play.is-coached'), `${tag}: Play not highlighted`);
    check(/Tutorial, day 1/.test(await page.textContent('#coach')), `${tag}: no tutorial label`);
    await shot('1-play');
    await page.click('#btn-play');
    await lesson(/Open People/, 'people lesson', 3000);
    await page.click('#btn-play'); // pause while we work, as a new player might
    await page.click('#open-people');
    await lesson(/raise a Barracks/, 'build lesson', 3000);
    await closeSheet();
    check(await page.$('#btn-build.is-coached'), `${tag}: Build not highlighted`);
    await page.click('#btn-build');
    await page.waitForTimeout(200);
    await page.click('#raise-barracks');
    await page.waitForTimeout(200);
    await closeSheet();
    await lesson(/Put two people in the Barracks/, 'guards lesson', 3000);
    await page.click('#open-people');
    await page.waitForTimeout(150);
    for (const name of ['Ada', 'Wil']) {
      const id = await K((n) => window.__season.keep.living.find((p) => p.name === n).id, name);
      await page.selectOption(`#job-${id}`, 'barracks');
      await page.waitForTimeout(100);
    }
    await closeSheet();
    await lesson(/Next, a Chandlery/, 'chandlery lesson', 3000);
    await shot('2-chandlery');
    // Speed up to Maud's death at noon: it pauses.
    await page.$eval('#speed-4', (b) => b.click()); // a phone shows one speed button that steps; this is the same
    await lesson(/Maud, the old servant, has died/, 'Maud lesson', 60000);
    check(/Play/.test(await page.textContent('#btn-play')), `${tag}: Maud's lesson didn't pause`);
    await shot('3-maud');
    await ok();
    // The Chandlery, when there's stone: build it and put Osk in it.
    await until(async () => (await K(() => window.__season.keep.res.stone)) >= 6 || (await K(() => window.__season.keep.phase)) !== 'day', 'stone for a Chandlery');
    if ((await K(() => window.__season.keep.phase)) === 'day') {
      await page.click('#btn-play').catch(() => {});
      await page.click('#btn-build');
      await page.waitForTimeout(150);
      await page.click('#raise-chandlery');
      await page.waitForTimeout(150);
      await closeSheet();
      await page.click('#open-people');
      const osk = await K(() => window.__season.keep.living.find((p) => p.name === 'Osk').id);
      await page.selectOption(`#job-${osk}`, 'chandlery');
      await closeSheet();
    }
    // Dusk: the Crossing.
    await until(async () => (await K(() => window.__season.keep.phase)) === 'dusk', 'dusk 1');
    await page.waitForTimeout(300);
    if (await K(() => window.__season.crossing)) { await page.mouse.click(vw / 2, 200); await page.waitForTimeout(300); }
    await closeSheet();
    await lesson(/Dusk\. Maud/, 'crypt lesson', 5000);
    check(await page.$('#bar-wake.is-coached'), `${tag}: Let them wake not highlighted`);
    await page.click('#bar-wake');
    await page.waitForTimeout(2600);
    await closeSheet();
    await lesson(/This is the Tain/, 'tain lesson', 8000);
    await shot('4-tain');
    await ok();
    await lesson(/Light the/, 'line lesson', 3000);
    check(await K(() => window.__season.tool === 'move'), `${tag}: dusk didn't open on Move`);
    await page.click('#tool-candle');
    for (const p of await K(() => window.__season.line)) await tap(p.f, p.x);
    await lesson(/Now a shade in each light/, 'guard lesson', 3000);
    await shot('5a-guard');
    const line = await K(() => window.__season.line);
    for (const [i, name] of ['Garrick', 'Hesper'].entries()) {
      const post = await K((n) => window.__season.keep.shades.find((d) => d.name === n).post, name);
      await page.click('#tool-move');
      await tap(post.f, post.x);
      await tap(line[i].f, line[i].x + (line[i].x < 56 ? 3 : -3));
    }
    await lesson(/Now Maud/, 'post lesson', 3000);
    await shot('5-post');
    // Move Maud to the Watch of the Dead, and light it.
    const room = await K(() => window.__season.room('barracks'));
    const maud = await K(() => window.__season.keep.shades.find((d) => d.name === 'Maud').post);
    // As the lesson says now: a candle in the room, then Move, Maud, and a spot in its light.
    await page.click('#tool-candle');
    await tap(room.f, room.x);
    await page.click('#tool-move');
    await tap(maud.f, maud.x);
    await tap(room.f, room.x + 4);
    await lesson(/Open the Dusk panel/, 'black mirror lesson', 3000);
    await page.click('#open-phase');
    await lesson(/Begin the night when you/, 'begin lesson', 3000);
    await closeSheet();
    const diag = await K(() => {
      const b = document.querySelector('#bar-start');
      const r = b.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      let n = 0;
      const mo = new MutationObserver(() => n++);
      mo.observe(document.getElementById('bar'), { childList: true, subtree: true });
      return new Promise((res) => setTimeout(() => { mo.disconnect(); res({ hit: hit && (hit.id || hit.className), sheet: !document.getElementById('sheet').hidden, n }); }, 1000));
    });
    console.log('diag', JSON.stringify(diag));
    await page.click('#bar-start');
    await lesson(/One small tide tonight/, 'night lesson', 30000);
    await shot('6-night');
    await ok();
    await until(async () => (await K(() => window.__season.keep.phase)) === 'dawn', 'dawn 1', 120000);
    await lesson(/Dawn: the rite/, 'rite lesson', 5000);
    await shot('7-rite');
    await ok();
    await lesson(/Death turns a trait over/, 'traits lesson', 3000);
    await ok();
    await lesson(/Begin day 2/, 'day 2 lesson', 3000);
    await page.click('#bar-day');
    await page.waitForTimeout(300);
    await closeSheet();
    // Day 2: the newcomer, the fire, the raid.
    await lesson(/has come to the gate/, 'newcomer lesson', 5000);
    const nc = await K(() => { const g = window.__season.keep; return g.living.find((p) => g.today.arrivals.includes(p.id)).id; });
    await page.click('#open-people');
    await page.selectOption(`#job-${nc}`, 'yard');
    await closeSheet();
    await lesson(/Fire in the Hearth/, 'fire lesson', 30000);
    await shot('8-fire');
    await page.click('#open-phase');
    await page.waitForTimeout(150);
    await page.click('[id^="fire-"]');
    await closeSheet();
    await lesson(/Raiders on the road/, 'raid lesson', 30000);
    await shot('9-raid');
    await ok();
    await lesson(/The Host is at the gate/, 'assault lesson', 30000);
    await page.click('#open-phase');
    await page.waitForTimeout(150);
    if (await page.$('#btn-pitch:not([disabled])')) await page.click('#btn-pitch');
    await shot('10-assault');
    await closeSheet();
    await lesson(/A raider who fell inside|They took the tribute/, 'after-raid lesson', 30000);
    await ok();
    await until(async () => (await K(() => window.__season.keep.phase)) === 'dusk', 'dusk 2');
    await page.waitForTimeout(300);
    if (await K(() => window.__season.crossing)) { await page.mouse.click(vw / 2, 200); await page.waitForTimeout(300); }
    await closeSheet();
    await lesson(/Every mirror is full|There is room in the mirrors/, 'full mirrors lesson', 5000);
    await shot('11-full');
    await page.click('#bar-wake');
    await page.waitForTimeout(2600);
    await closeSheet();
    await lesson(/Last night’s candles are gone/, 'relight lesson 2', 5000);
    await page.click('#tool-candle');
    for (const p of await K(() => window.__season.line)) await tap(p.f, p.x);
    await lesson(/hunt candles/, 'hunters lesson', 5000);
    await ok();
    await page.click('#bar-start');
    await until(async () => (await K(() => window.__season.keep.phase)) === 'dawn', 'dawn 2', 120000);
    if (await K(() => Object.keys(window.__season.keep.rite.asks || {}).length > 0)) {
      await lesson(/The dead ask for things/, 'request lesson', 5000);
      await shot('11b-ask');
      await ok();
    }
    if (await K(() => window.__season.keep.shades.some((d) => d.kind === 'restless'))) {
      await lesson(/Release the Restless shade/, 'release lesson', 5000);
      await ok();
    }
    await page.click('#bar-day');
    await page.waitForTimeout(300);
    await closeSheet();
    // Day 3: the Glazier, the Church, the Chapel.
    await lesson(/Mirrors hold the dead/, 'glazier lesson', 5000);
    await shot('12-glazier');
    await ok(); // Skip this
    await lesson(/The Lantern Church judges/, 'church lesson', 30000);
    await ok();
    await lesson(/Build a Chapel/, 'chapel lesson', 5000);
    await ok();
    await until(async () => (await K(() => window.__season.keep.phase)) === 'dusk', 'dusk 3');
    await page.waitForTimeout(300);
    if (await K(() => window.__season.crossing)) { await page.mouse.click(vw / 2, 200); await page.waitForTimeout(300); }
    await closeSheet();
    if (await page.$('#bar-wake')) { await page.click('#bar-wake'); await page.waitForTimeout(2600); await closeSheet(); }
    await lesson(/Last night’s candles are gone/, 'relight lesson 3', 5000);
    await page.click('#tool-candle');
    for (const p of await K(() => window.__season.line)) await tap(p.f, p.x);
    await until(async () => !/Last night’s candles/.test(await coach()), 'relight 3 done', 3000);
    await page.click('#bar-start');
    await lesson(/A Maw, weakened/, 'maw lesson', 120000);
    await shot('13-maw');
    await ok();
    await until(async () => (await K(() => window.__season.keep.phase)) === 'dawn', 'dawn 3', 120000);
    // Round seven, phase 5: a tester is asked to play on, not given the questions yet.
    await until(async () => page.isVisible('#test-playon'), 'the play-on card', 15000);
    await shot('14-playon');
    check(/That's the tutorial/.test(await page.textContent('#sheet')), `${tag}: play-on card text`);
    await page.click('#test-stop');
    await page.waitForTimeout(300);
    check(await K(() => window.__season.keep.test.playOn === false), `${tag}: stopping not recorded`);
    check(await page.isVisible('#test-send'), `${tag}: the questions didn't open on stopping`);
    await shot('15-questions');
    await page.fill('#test-night', 'Keep the candles lit where they come up.');
    await page.fill('#test-grief', 'Warm, mostly.');
    await page.click('#test-yes');
    await page.waitForTimeout(600);
    // The season's own question is the developer's: not in a test keep.
    await closeSheet();
    await page.click('#open-phase').catch(() => {});
    await page.waitForTimeout(200);
    check(!(await page.$('#ans-again')), `${tag}: the season panel still asks its own question`);
    await closeSheet();
    await page.click('#open-menu');
    await page.waitForTimeout(150);
    await page.click('#test-done');
    await page.waitForTimeout(200);
    await page.click('#test-copy');
    await page.waitForTimeout(500);
    const text = (await page.isVisible('#test-text')) ? await page.inputValue('#test-text') : '';
    check(text.length > 1000, `${tag}: no session text (${text.length})`);
    const x = text ? JSON.parse(text) : {};
    check(x.test?.playOn === false && x.test?.answers?.grief === 'Warm, mostly.', `${tag}: the export lacks the test's answers or choice`);
    // The viewer shows the choice and the answers.
    const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const w = await ctx2.newPage();
    w.on('pageerror', (e) => errors.push(`viewer pageerror: ${e.message}`));
    await w.goto(BASE + '/season.html?watch');
    await w.waitForTimeout(600);
    await w.click('#watch-load summary');
    await w.fill('#watch-text', text);
    await w.click('#watch-paste');
    for (let i = 0; i < 240 && !(await w.isVisible('.watch')); i++) await w.waitForTimeout(500);
    const panel = (await w.isVisible('.watch')) ? await w.textContent('.watch') : '';
    check(/chose to stop/.test(panel) && /Warm, mostly\./.test(panel) && /How did the grief/.test(panel), `${tag}: the viewer's session panel: ${panel.slice(0, 300)}`);
    await w.screenshot({ path: `${dir}16-viewer.png` });
    await ctx2.close();
    } catch (e) {
      errors.push(`${tag}: threw ${e.message.split('\n')[0]} at ${(e.stack.match(/\.cjs:(\d+)/) || [])[1]}; coach: ${await coach()}; phase ${await K(() => window.__season.keep.phase + ' ' + JSON.stringify(window.__season.keep.dusk))}`);
      await shot('fail');
    }
    await page.close();
  }
  await browser.close();
  console.log(errors.length ? errors.join('\n') : 'no errors');
  if (errors.length) process.exitCode = 1;
})();
