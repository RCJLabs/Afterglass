// The glass test on a phone: reach it through Done testing, shoot each question, and answer by tapping the
// figures (right on even questions, wrong on odd ones), checking each is judged as expected.
const { chromium, BASE, OUT, state } = require('./lib.cjs');
const dir = `${OUT}/shots/`;
(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const oks = [];
  const check = (ok, msg) => (ok ? oks : errors).push(msg);
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  page.setDefaultTimeout(5000);
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|fonts/.test(m.text())) errors.push(`console: ${m.text()}`); });
  await page.goto(BASE + '/season.html');
  await page.evaluate(() => localStorage.clear());
  await page.goto(BASE + '/season.html?test=Pat');
  await page.waitForTimeout(600);
  const note = await page.textContent('#sheet');
  check(/play on to the season's end/.test(note), 'the note says the test runs to the season’s end');
  await page.screenshot({ path: dir + 'q0-note.png' });
  await page.click('#test-begin');
  await page.waitForTimeout(300);
  await page.click('#open-menu');
  await page.waitForTimeout(200);
  await page.click('#test-done');
  await page.waitForTimeout(300);
  const qs = await page.$$eval('#sheet textarea[data-test]', (t) => t.map((x) => x.id));
  check(qs.length === 6, `questions: ${qs.join(', ')}`);
  await page.fill('#test-loss', 'Both, oddly.');
  await page.waitForTimeout(600);
  await page.click('#quiz-start');
  await page.waitForTimeout(300);
  for (let i = 0; i < 8; i++) {
    const q = await page.evaluate(() => window.__season.quiz);
    if (!q) { errors.push(`no question ${i}`); break; }
    await page.screenshot({ path: `${dir}q${i + 1}-${q.type}-${q.cam}.png` });
    const want = i % 2 === 0;
    if (q.type === 'count') {
      const n = want ? q.answer : q.answer === 1 ? 2 : 1;
      await page.click(`#quiz-n${n}`);
    } else {
      const f = q.figures.find((u) => (want ? q.answer.includes(u.id) : !q.answer.includes(u.id)));
      const box = await page.$eval('#quiz-img', (im) => { const r = im.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, nw: im.naturalWidth, nh: im.naturalHeight }; });
      await page.mouse.click(box.x + ((f.sx + 0.5) * box.w) / box.nw, box.y + ((f.sy + 0.5) * box.h) / box.nh);
    }
    await page.waitForTimeout(150);
    const fb = await page.textContent('.quiz-fb');
    check((want ? /Right/ : /Not that one/).test(fb), `q${i + 1} ${q.type} ${q.cam}: wanted ${want ? 'right' : 'wrong'}, got "${fb}"`);
    await page.waitForTimeout(800);
  }
  const Z = await page.evaluate(() => window.__season.keep.test.quiz);
  check(Z.done && Z.results.length === 8 && Z.results.filter((x) => x.right).length === 4, `results kept: ${Z.results.map((x) => `${x.type}/${x.cam}/${x.right}/${x.ms}`).join(' ')}`);
  check(/Done, thank you: 4 of 8 right/.test(await page.textContent('#sheet')), 'the questions say the test is done');
  await page.screenshot({ path: dir + 'q9-done.png', fullPage: false });
  // Closing unsent: the answers are kept, and coming back asks to send them.
  await page.click('#sheet-close');
  await page.waitForTimeout(300);
  check(/Your answers are kept/.test(await page.textContent('#toasts')), 'closing unsent says the answers are kept');
  await page.reload();
  await page.waitForTimeout(800);
  const back = (await page.isVisible('#sheet')) ? await page.textContent('#sheet') : '';
  check(/Welcome back/.test(back) && (await page.inputValue('#test-loss')) === 'Both, oddly.', 'a reload with unsent answers asks to send them, with the answers as left');
  await browser.close();
  console.log(oks.map((m) => `ok  ${m}`).join('\n'));
  console.log(errors.length ? errors.map((m) => `ERR ${m}`).join('\n') : 'no errors');
  if (errors.length) process.exitCode = 1;
})();
