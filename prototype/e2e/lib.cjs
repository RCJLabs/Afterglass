// Shared helpers for the browser checks (round seven, phase 6): Playwright, where the page is served, the saved
// keeps the checks start from, and the measurements they share. The checks drive the real page in Chromium, at
// phone and desktop sizes; `npm run e2e` serves the page and runs them all (run.mjs).
const fs = require('fs');
const os = require('os');
const path = require('path');

// Playwright: the project's own install (CI installs it), else the machine's global one.
function loadPlaywright() {
  for (const where of ['playwright', process.env.PLAYWRIGHT_MODULE, '/opt/node22/lib/node_modules/playwright'].filter(Boolean)) {
    try {
      return require(where);
    } catch {}
  }
  throw new Error('Playwright is not installed: npm i --no-save playwright, then npx playwright install chromium');
}
const playwright = loadPlaywright();
const { chromium } = playwright;

const BASE = process.env.E2E_BASE || 'http://localhost:8099';
const URL = `${BASE}/season.html`;
const STATES = path.join(__dirname, 'states');
const OUT = process.env.E2E_OUT || path.join(os.tmpdir(), 'afterglass-e2e');
fs.mkdirSync(path.join(OUT, 'shots'), { recursive: true });
const state = (name) => fs.readFileSync(path.join(STATES, `${name}.json`), 'utf8');

const VIEWPORTS = {
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  desktop: { viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 },
};

const errors = [];
function watchErrors(page, tag) {
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errors.push({ tag, type: m.type(), text: m.text().slice(0, 300) });
  });
  page.on('pageerror', (e) => errors.push({ tag, type: 'pageerror', text: String((e && e.stack) || e).slice(0, 500) }));
  page.on('requestfailed', (r) => errors.push({ tag, type: 'requestfailed', text: `${r.url()} ${r.failure()?.errorText}` }));
}

async function launch() {
  return chromium.launch({ args: ['--disable-dev-shm-usage'] });
}
async function newPage(browser, kind, extra = {}) {
  const ctx = await browser.newContext({ ...VIEWPORTS[kind], ...extra });
  const page = await ctx.newPage();
  watchErrors(page, kind);
  return { ctx, page };
}

async function closeToasts(p) {
  for (const t of await p.$$('.toast button[data-act="toast-close"]')) await t.click().catch(() => {});
}

// A saved keep (e2e/states) put in slot 1 and continued.
async function loadState(p, name, prefs = { introDone: true, guide: false }) {
  const g = state(name.replace(/^state-|\.json$/g, ''));
  await p.goto(URL);
  await p.evaluate(([g, prefs]) => {
    localStorage.clear();
    localStorage.setItem('afterglass-season/prefs/v1', JSON.stringify(prefs));
    localStorage.setItem('afterglass-season/slot/1/v1', g);
    localStorage.setItem('afterglass-season/slots/v1', JSON.stringify({ current: 1, slots: {} }));
  }, [g, prefs]);
  await p.goto(URL);
  await p.waitForSelector('#title-continue', { timeout: 1500 }).then((el) => el.click()).catch(() => {});
  await p.waitForTimeout(600);
  await closeToasts(p);
}

async function fresh(p) {
  await p.goto(URL);
  await p.evaluate(() => localStorage.clear());
  await p.goto(URL);
  await p.waitForTimeout(800);
}

// What a screen shows: its controls under 44 px and its text under 12 px (the phone rules of round seven,
// phase 3), and the panel's place.
async function measure(p, label) {
  return p.evaluate((label) => {
    const shown = (el) => {
      if (!el || !el.isConnected || el.closest('[hidden]')) return false;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const SEL = 'button, [role=button], a[href], input, select, textarea, summary, label.btn';
    const target = (el) => {
      if (el.matches('input[type=checkbox], input[type=radio]')) {
        const lab = el.closest('label') || (el.id && document.querySelector(`label[for="${el.id}"]`));
        if (lab) return lab.getBoundingClientRect();
      }
      return el.getBoundingClientRect();
    };
    const ctl = [...document.querySelectorAll(SEL)].filter(shown).filter((el) => !el.classList.contains('visually-hidden'));
    const small = [];
    for (const el of ctl) {
      const r = target(el);
      if (r.width < 44 || r.height < 44) small.push({ id: el.id || '', tag: el.tagName.toLowerCase(), cls: String(el.className || '').slice(0, 30), text: (el.innerText || el.value || el.getAttribute('aria-label') || '').trim().slice(0, 28), w: Math.round(r.width), h: Math.round(r.height) });
    }
    const tiny = {};
    let tinyCount = 0;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      if (!n.textContent.trim()) continue;
      const el = n.parentElement;
      if (!shown(el)) continue;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs < 12) {
        tinyCount++;
        const key = `${fs}px ${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).split(' ')[0] : ''} (${el.closest('[id]')?.id || ''})`;
        tiny[key] = tiny[key] || { n: 0, sample: n.textContent.trim().slice(0, 30) };
        tiny[key].n++;
      }
    }
    return { label, controls: { shown: ctl.length }, smallTargets: { count: small.length, list: small.slice(0, 80) }, tinyText: { count: tinyCount, kinds: tiny } };
  }, label);
}

async function shot(p, name, full = false) {
  const f = path.join(OUT, 'shots', `${name}.png`);
  await p.screenshot({ path: f, fullPage: full });
  return f;
}
async function openPanel(p, id) {
  const b = await p.$(`#open-${id}`);
  if (!b) return false;
  await b.click();
  await p.waitForTimeout(250);
  return !!(await p.$('#sheet-body'));
}
async function closePanel(p) {
  const c = await p.$('#sheet-close');
  if (c) await c.click();
  await p.waitForTimeout(150);
}

module.exports = { playwright, chromium, BASE, URL, STATES, OUT, state, VIEWPORTS, errors, launch, newPage, loadState, fresh, measure, shot, openPanel, closePanel, closeToasts, watchErrors };
