// The installed app, the page's sections and toasts, the main screen and Back.

import { dayKey, dayText } from '../slice/daily.js';
import { TICKS_PER_SEC, DAY_ROOMS, TWINS, BUILDABLE } from '../slice/data.js';
import { roomsOf, lightMap, MAX_FLOORS } from '../slice/geo.js';
import { lastKeep, heirsOf } from '../slice/hall.js';
import { summary } from '../slice/saves.js';
import { jobCount, nextSlot, defense, dayTicks, nightTicks, byId, fmt, bareHalls, tainPlace, raiseCost, buildSpot, NEW_ROOMS, arrived, roomReady, brought, spotFloor, HIGH_ROOMS, cracksOf } from '../slice/sim.js';
import { isTutorial } from '../slice/tutorial.js';
import { BUILD } from '../build.js';
import { prefs, savePrefs, saves, hall, crashed, s, K, ui, bump, running, eclipseNow, toast } from './state.js';
import { esc, plural, upper, listOf, floor1, PH, clockText, shadeStatus, nextMarkText, hudHTML, stripText, SHEET_NAME, barHTML, showHint, once, aside, markRead } from './hud.js';
import { assaultText, fireTrend } from './day.js';
import { phaseHTML } from './dawn.js';
import { rosterHTML, keepLine, SLOT_NUMS, dailyHeld, tutorialHeld, startTutorial, startDaily, menuHTML, recordsHTML } from './records.js';
import { trail, tabOf, answered, freeSlot, testHTML } from './playtest.js';
import { watchHTML } from './watch.js';
import { hudEl, barEl, layout, drawnLabels, halfSheet, draw, setDrawnLabels } from './stage.js';
import { showCoach } from './guide.js';
import { endSkip } from './clock.js';
import { waiting, SLOT_IDS, heirsNow, playSlot, newKeep, customPicker, campaignPicker, presetPicker, untouched } from './keeps.js';

/* ---------------------------------------------------------------- the installed app */

// The season installs as an app where the browser allows it (season.webmanifest, sw.js). Chrome, Edge and
// Samsung Internet offer an install prompt the page can hold and show from its own button; Safari on an
// iPhone or iPad installs only from Share, Add to Home Screen, so there the page says so. The bundled
// single-file build has no manifest, so it neither registers the worker nor offers to install.
const INSTALLABLE = !!document.querySelector('link[rel="manifest"]') && 'serviceWorker' in navigator && /^https?:$/.test(location.protocol);
const IOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const installed = () => matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches || navigator.standalone === true;
export let installPrompt = null;
export const setInstallPrompt = (v) => (installPrompt = v);
if (INSTALLABLE) {
  const register = () => navigator.serviceWorker.register('sw.js').catch(() => {});
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register);
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installPrompt = e;
    bump();
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    toast('Installed. The season opens from your home screen or app list now, and plays offline.', 'day');
    bump();
  });
}
// Where the browser offers no prompt, what to do instead. Another app's built-in browser can't install
// anything, and on Android it can't always be told apart from Chrome, so the Android line says so too.
const ANDROID = /android/i.test(navigator.userAgent);
const IN_APP = /; wv\)|FBA[NV]|Instagram|Line\/|MicroMessenger|Snapchat|TikTok|musical_ly/i.test(navigator.userAgent);
function installHelp() {
  if (IN_APP) return "This is another app's built-in browser, which can't install anything. Open the page in your phone's own browser (the app's menu has Open in browser), then install it there.";
  if (IOS) return 'On an iPhone or iPad, in Safari: tap Share, then Add to Home Screen.';
  if (ANDROID) return 'In Chrome: the ⋮ menu, then Install app (or Add to home screen). Other browsers have Install or Add to home screen in their menu. If the menu has neither, the page is open inside another app: choose Open in Chrome first.';
  return 'In Chrome or Edge: the install icon at the right of the address bar, or the menu, then Install. In Safari on a Mac: File, then Add to Dock.';
}
export function installHTML(where) {
  if (!INSTALLABLE) return '';
  if (installed()) return where === 'settings' ? '<p class="hint">Running as an installed app. It plays offline.</p>' : '';
  if (installPrompt) return `<div class="row"><button class="btn" id="btn-install-${where}" data-act="install">Install the app</button><span class="hint">Full screen, from your home screen, and it plays offline.</span></div>`;
  if (where === 'title' && !ui.installHelp) return '<button class="btn sm title-link" id="btn-install-help" data-act="install-help">Install on this device</button>';
  return `<p class="hint${where === 'title' ? ' title-install' : ''}" id="install-help-${where}">${esc(installHelp())}${where === 'settings' ? " Installed, it opens full screen from your home screen and plays offline. If it's installed already, open it from there." : ''}</p>`;
}

// A newer build (round seven, phase 19): the page asks the site's version.json (tools/site.mjs writes it) for
// the build deployed, when it opens, when it comes back into view, and every half hour; if it isn't this one, a
// toast says so once, and the main screen and the Menu offer to reload, saving the keep first. A checkout
// ('dev') has no version.json, and never asks.
export let newerBuild = null;
async function checkVersion() {
  if (BUILD === 'dev' || newerBuild || !/^https?:$/.test(location.protocol)) return;
  try {
    const res = await fetch('version.json', { cache: 'no-store' });
    if (!res.ok) return;
    const v = await res.json();
    if (typeof v.build !== 'string' || v.build === BUILD) return;
    newerBuild = v.build;
    toast('A new version of the game is ready. Reload from the main screen or the Menu to play it; your keep is saved first.', 'day');
    bump();
  } catch {
    // Offline, or the site is between deploys: ask again later.
  }
}
checkVersion();
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) checkVersion();
});
setInterval(checkVersion, 30 * 60 * 1000);
export function updateHTML() {
  if (!newerBuild || ui.watch) return '';
  return '<div class="card update" id="update-card"><p>A new version of the game is ready.</p><div class="row"><button class="btn sm primary" id="btn-update" data-act="update">Reload to play it</button><span class="hint">Your keep is saved first.</span></div></div>';
}

/* ---------------------------------------------------------------- the page */

// Building: what stone buys, and where (round five): choose among the bare halls and a new floor on top,
// then what; below, the keep floor by floor, where any room can be torn down or moved.
// A room in the build list in a line (round seven, phase 4): what it does by day, and its twin by night (folded
// under one "?"). The rooms in full are in How to play. The tutorial's list is the rooms its lessons use.
const TUT_ROOMS = ['barracks', 'chandlery', 'hearth', 'glazier', 'chapel'];
const BRIEF = {
  barracks: () => [`Guards, ${DAY_ROOMS.barracks.rate} defense each.`, 'the Watch: adds to tomorrow’s defense.'],
  chandlery: () => [`Chandlers, ${DAY_ROOMS.chandlery.rate} candles a day each.`, 'the Wick Room: saves candles.'],
  hearth: () => [`Cooks, ${DAY_ROOMS.hearth.rate} food a day each.`, 'the Cold Hearth: a shade rests there.'],
  forge: () => [s.tuning.forgeArms ? `Smiths, ${DAY_ROOMS.forge.rate} arm a day each, for the guards.` : `Smiths, ${DAY_ROOMS.forge.rate} defense each.`, 'the Cold Forge: grave-steel for the next night.'],
  cellar: () => ['Keeps half the candles and glass from raiders.', 'a dark, empty room.'],
  chapel: () => ['Priests: remembrance, funerals, and Dread borne.', 'the Choir: sings essence.'],
  glazier: () => [`Glaziers, ${DAY_ROOMS.glazier.rate} glass a day each, for mirrors.`, 'the Silvering: makes glass.'],
  infirmary: () => ['Healers cure one sick a day each.', 'the Threshold: gentler deaths.'],
  granary: () => ['Keeps half the food from raiders.', 'a dark, empty room.'],
  quarters: () => [`Beds for ${s.tuning.quartersBeds}.`, s.tuning.dreamRest ? 'the Dreamwell: a shade rests there.' : 'the Dreamwell: good dreams.'],
  library: () => ['Scholars study, for the keep’s lore.', 'the Archive: speeds the study.'],
  hall: () => ['One decree a season.', 'the Court: hears the dead’s requests.'],
  gatehouse: () => [`Gate guards, ${DAY_ROOMS.gatehouse.rate} defense each; stands at the gate.`, 'the Undergate.'],
  lampworks: () => [`Lampwrights, ${s.tuning.lampGlass} glass into ${DAY_ROOMS.lampworks.rate} candles a day each; from floor ${s.tuning.highFrom} up.`, 'the Lamp Gallery: lit without a candle.'],
};
function buildHTML() {
  const T = s.tuning;
  const G = K();
  const stone = s.res.stone || 0;
  const day = s.phase === 'day';
  const halls = bareHalls(s);
  const canTop = G.n < MAX_FLOORS;
  const places = [...halls.map((h) => h.id), ...(canTop ? ['top'] : [])];
  const def = nextSlot(s);
  if (!places.includes(ui.buildAt)) ui.buildAt = def ? (def.newFloor ? 'top' : def.id) : null;
  const floorNo = (f) => `floor ${G.n - f}${f === 0 ? ', the top' : f === G.veil ? ', the ground' : ''}`;
  const beside = (h) => G.floors[h.f].rooms.find(([id]) => id !== h.id);
  // What a place means by night: the line's floor is worked by the shades holding the line, as they hold it;
  // below the line the tides climb through, so a shade working there needs a candle of its own and risks
  // being caught; and each floor raised on top makes the Unlit's climb longer.
  const means = (G2, f) => (G2.n > 1 && f === G2.veil - 1 ? " The line's shades work its rooms: the place for a Chapel." : G2.n > 1 && f < G2.veil - 1 ? ' The tides climb through it: a shade working it needs its own candle.' : '');
  const place = (id) => {
    if (id === 'top') {
      const G2 = { ...G, n: G.n + 1, veil: G.n };
      return ['On top, a new floor', `By night, ${tainPlace(G2, 0)}.${means(G2, 0)} Each floor raised lengthens the Unlit's climb.`];
    }
    const h = halls.find((x) => x.id === id);
    const b = beside(h);
    return [`The bare hall on ${floorNo(h.f)}${b && b[3] !== 'empty' ? `, beside the ${DAY_ROOMS[b[3]].name}` : ''}`, `By night, ${tainPlace(G, h.f)}.${means(G, h.f)}`];
  };
  const radios = places
    .map((id) => {
      const [label, night] = place(id);
      return `<label class="place"><input type="radio" name="build-at" id="at-${id}" data-act="build-at" data-at="${id}"${ui.buildAt === id ? ' checked' : ''}><span><b>${esc(label)}</b><small>${esc(night)}</small></span></label>`;
    })
    .join('');
  const masons = jobCount(s, 'yard');
  const spot = ui.buildAt ? buildSpot(s, ui.buildAt) : null;
  const spotOf = spot || buildSpot(s); // where a room goes if no place is chosen
  const cost = raiseCost(s, spotOf);
  const can = day && !!spot && stone + 1e-9 >= cost;
  // The Gatehouse stands at the gate, on the ground floor.
  const atGateHere = spot && !spot.newFloor && spot.f === G.veil;
  // A room raised only high up (the Lampworks) waits in a note until the keep stands tall enough for it.
  const high = (type) => HIGH_ROOMS.includes(type) && G.n + 1 < T.highFrom;
  const offered = BUILDABLE.filter((type) => (!NEW_ROOMS.includes(type) || T[type]) && !high(type));
  const later = offered.filter((type) => !roomReady(s, type));
  const highNote = BUILDABLE.filter((type) => (!NEW_ROOMS.includes(type) || T[type]) && high(type)).map((type) => `<p class="note">The ${DAY_ROOMS[type].name} can be raised from floor ${T.highFrom} up: the keep stands ${G.n} high.</p>`).join('');
  const row = (type) => {
    const R = DAY_ROOMS[type];
    const have = roomsOf(G, type).length;
    const gate = type === 'gatehouse';
    const why = gate && !arrived(s, 2) ? 'It comes with the Ashen Host, in the campaign\'s second year.' : gate && have ? 'The keep has its Gatehouse.' : gate && !atGateHere ? 'Only on the ground floor: move a room up to free a hall there (Rearrange, below).' : '' || (HIGH_ROOMS.includes(type) && spotOf && spotFloor(G, spotOf) < T.highFrom ? `Only from floor ${T.highFrom} up: the keep stands ${G.n} high.` : '');
    const [by] = BRIEF[type]();
    return `<li class="build-row"><div><b>${esc(R.name)}</b>${have ? ` <small class="muted">you have ${have}</small>` : ''}<p class="note">${esc(by)}</p>${why ? `<p class="note bad">${esc(why)}</p>` : ''}</div>
      <button class="btn sm" id="raise-${type}" data-act="raise" data-room="${type}"${can && !why ? '' : ' disabled'}>Build, ${fmt(cost)} stone</button></li>`;
  };
  const ready = offered.filter((type) => roomReady(s, type));
  // The tutorial keeps to its own rooms, one thing at a time; the rest wait under More rooms.
  const tut = isTutorial(s) && !s.tut?.over && !s.tut?.off ? ready.filter((type) => TUT_ROOMS.includes(type) || roomsOf(G, type).length) : ready;
  const more = ready.filter((type) => !tut.includes(type));
  const rows = tut.map(row).join('');
  const moreRows = more.length ? aside('more-rooms', `<ul class="build-list">${more.map(row).join('')}</ul>`, `${more.length} more rooms`) : '';
  const twins = aside('twins', `<ul class="facts">${ready.map((type) => `<li><span>${esc(DAY_ROOMS[type].name)}</span><span>${esc(upper(BRIEF[type]()[1]))}</span></li>`).join('')}</ul>`, 'What each room is by night', 'dusk');
  // Round seven, phase 15: in a campaign the Library and the Hall come with The Lantern Church.
  const laterNote = later.length ? `<p class="note">${esc(listOf(later.map((type) => `the ${DAY_ROOMS[type].name}`)).replace(/^t/, 'T'))} ${later.some((type) => !brought(s, type)) ? `come${later.length === 1 ? 's' : ''} with The Lantern Church, in the campaign's third year` : `can be built from ${T.year && T.lateRoomsFrom === 2 ? 'summer' : `the keep's season ${T.lateRoomsFrom}`}`}.</p>` : '';
  return `<section class="build">
    <p>Stone <b data-live="stone">${floor1(stone)}</b>. ${masons ? `${esc(plural(masons, 'mason'))} in the Yard quarry ${fmt(masons * DAY_ROOMS.yard.rate)} a day.` : 'Nobody is quarrying: put someone in the Yard, in People, for 2 stone a day.'}</p>
    ${day ? '' : '<p class="note">Masons build by day.</p>'}
    <div class="card"><h3>Where</h3>${places.length ? `<div class="places">${radios}</div>` : '<p class="note">The keep can rise no higher, and there is no bare hall. Tear a room down to make one.</p>'}
      ${once('build', `<p class="note">Each room holds ${T.roomCap} workers, and by night is its twin in the Tain, upside down.</p>`, 'Rooms and their twins', 'day')}</div>
    <ul class="build-list">${rows}</ul>
    ${moreRows}
    ${laterNote}
    ${highNote}
    ${twins}
    ${rearrangeHTML()}
  </section>`;
}
// The keep floor by floor: tear a room down for part of its stone back, or move it (a swap with any other room
// or bare hall), both asked first.
function rearrangeHTML() {
  const T = s.tuning;
  const G = K();
  const day = s.phase === 'day';
  const stone = s.res.stone || 0;
  const back = Math.floor(T.roomStone * T.teardownBack);
  const name = (type) => (type === 'empty' ? 'Bare hall' : DAY_ROOMS[type].name);
  const burning = (id) => s.fires.some((f) => f.room === id);
  const moving = ui.moving && G.rooms[ui.moving] ? G.rooms[ui.moving] : null;
  const floors = G.floors
    .map((fl, f) => {
      const items = fl.rooms
        .map(([id, , , type]) => {
          let acts = '';
          if (ui.tearAsk === id) {
            acts = `<p class="note bad">Tear down the ${esc(name(type))}? ${back} stone comes back${DAY_ROOMS[type].out ? ', and whoever works there beyond what the rest can hold goes to the Yard' : ''}.</p><div class="row"><button class="btn sm primary" id="tear-yes-${id}" data-act="tear-yes" data-id="${id}">Tear it down</button><button class="btn sm" id="tear-no" data-act="tear-no">Cancel</button></div>`;
          } else if (moving) {
            if (moving.id !== id && !(moving.type === 'empty' && type === 'empty')) acts = `<button class="btn sm" id="move-to-${id}" data-act="move-to" data-id="${id}"${day && stone + 1e-9 >= T.moveStone && !burning(id) ? '' : ' disabled'}>${type === 'empty' ? 'Move it here' : 'Swap with this'}, ${T.moveStone} stone</button>`;
            else if (moving.id === id) acts = '<button class="btn sm" id="move-cancel" data-act="move-cancel">Cancel the move</button>';
          } else if (type !== 'empty') {
            const lastHearth = type === 'hearth' && roomsOf(G, 'hearth').length === 1;
            acts = `<button class="btn sm" id="move-${id}" data-act="move" data-id="${id}"${day && !burning(id) ? '' : ' disabled'}>Move</button>${type === 'crypt' || lastHearth ? '' : `<button class="btn sm" id="tear-${id}" data-act="tear" data-id="${id}"${day && !burning(id) ? '' : ' disabled'}>Tear down, +${back}</button>`}`;
          }
          return `<li class="kroom${moving?.id === id ? ' is-moving' : ''}"><span><b>${esc(name(type))}</b><small>${type === 'empty' ? 'Nothing yet' : `By night, the ${esc(TWINS[type].name)}`}</small></span><span class="row">${acts}</span></li>`;
        })
        .join('');
      return `<li class="kfloor"><span class="eyebrow">Floor ${G.n - f}${f === 0 ? ', the top' : f === G.veil ? ', the ground' : ''} · by night ${esc(tainPlace(G, f).replace(/, where.*$|, one below.*$|, under the line$|, above the line$/, ''))}</span><ul>${items}</ul></li>`;
    })
    .join('');
  return `<details class="card rearrange" data-keep="rearrange"${ui.open.rearrange || moving || ui.tearAsk ? ' open' : ''}><summary><b>Rearrange the keep</b></summary>
    <p class="note">${moving ? `Moving the ${esc(name(moving.type))}: choose where it goes. It swaps places with what's there.` : `Tear a room down for ${back} of its ${T.roomStone} stone back, leaving a bare hall; the Crypt and your last Hearth stay. Or move it: it swaps places with any other room or bare hall, for ${T.moveStone} stone. Whoever works there keeps their job, and its twin moves with it.`}</p>
    <ul class="kfloors">${floors}</ul></details>`;
}

const SHEETS = {
  build: ['Build', buildHTML],
  phase: [null, () => `<section class="phase ${PH[s.phase]}">${phaseHTML()}</section>`],
  people: ['People', rosterHTML],
  records: ['Records', () => `<section class="records">${recordsHTML()}</section>`],
  menu: ['Menu', () => `<section class="menu">${menuHTML()}</section>`],
  test: ['Playtest', testHTML],
  watch: ['Session', watchHTML],
};
function sheetHTML() {
  if (!ui.sheet) return '';
  const [title, body] = SHEETS[ui.sheet];
  return `<div class="gsheet-head"><span class="eyebrow" id="sheet-title">${esc(title || SHEET_NAME())}</span><button class="btn sm" id="sheet-close" data-act="sheet-close">Close</button></div>
    <div class="gsheet-body" id="sheet-body">${body()}</div>`;
}
/* ---------------------------------------------------------------- the main screen */

// The game opens on it, over the keep as it stands (but for a tester's link, a test not yet sent, or the
// replay viewer), and the Menu leads back to it: the keep being played, a new one (the open year or a
// campaign, its difficulty, the guide), the tutorial, today's keep, the Menu's tabs, and installing. The
// clock stands still under it.
const WHAT_STARTS = { new: 'the new keep', tutorial: 'the tutorial', daily: "today's keep" };
export const continuable = () => prefs.introDone || !untouched();
function titleMainHTML() {
  const go = continuable();
  const tut = tutorialHeld();
  const daily = dailyHeld();
  const item = (id, act, label, sub, primary = false, extra = '') => `<button class="btn${primary ? ' primary' : ''} title-go" id="${id}" data-act="${act}"${extra}><span>${label}</span><small>${esc(sub)}</small></button>`;
  return `${updateHTML()}${go ? item('title-continue', 'title-continue', 'Continue', `Keep ${saves.current}: ${keepLine(summary(s, Date.now()))}`, true) : ''}
    ${item('title-tutorial', 'title-start', tut ? 'Continue the tutorial' : 'Learn to play', tut ? `In keep ${tut}` : 'The tutorial: three days that teach, one thing at a time', !go, ' data-what="tutorial"')}
    ${item('title-new', 'title-view', 'New game', 'The open year or a five-year campaign, Gentle to Hard', false, ' data-view="new"')}
    ${item('title-daily', 'title-start', daily ? "Continue today's keep" : "Today's keep", `${dayText(dayKey())}: the same keep for everyone who plays today`, false, ' data-what="daily"')}
    <div class="title-row">
      <button class="btn" id="title-saves" data-act="title-tab" data-tab="saves">Saves</button>
      <button class="btn" id="title-hall" data-act="title-tab" data-tab="hall">Hall of Keepers</button>
      <button class="btn" id="title-howto" data-act="title-tab" data-tab="howto">How to play</button>
      <button class="btn" id="title-settings" data-act="title-tab" data-tab="settings">Settings</button>
    </div>
    ${installHTML('title')}`;
}
function titleNewHTML() {
  const n = freeSlot();
  return `<div class="title-card"><h2 class="title-h">A new keep</h2>
    ${campaignPicker('title')}
    ${presetPicker('title')}
    ${customPicker('title')}
    <label class="title-check" for="title-guide"><input type="checkbox" id="title-guide" data-act="guide-toggle"${prefs.guide ? ' checked' : ''}><span>The guide: a short card the first time each thing happens</span></label>
    <p class="hint">${n ? `It goes in keep ${n}.` : 'All three keeps are in use: next you choose which one it replaces.'}${heirsHint(n)}</p>
    <div class="row"><button class="btn primary" id="title-begin" data-act="title-start" data-what="new">Begin</button><button class="btn" id="title-back" data-act="title-back">Back</button></div></div>`;
}
// Who a new keep's first dead will be, if they come from the player's last keep (round seven, phase 16).
function heirsHint(n) {
  const heirs = n ? heirsNow(n) : heirsOf(lastKeep(hall, SLOT_IDS()));
  return heirs.length ? ` ${heirs.map((x) => x.name).join(' and ')}, of ${heirs[0].keep}, will be in its glass.` : '';
}
function titleReplaceHTML() {
  const what = WHAT_STARTS[ui.titleFor] || WHAT_STARTS.new;
  const rows = SLOT_NUMS().map((n) => {
    const m = n === saves.current ? summary(s, Date.now()) : saves.slots[n];
    const acts = ui.titleAsk === n
      ? `<p class="note bad">Keep ${n} goes into the Hall of Keepers, and can't be played on unless you exported it (Saves, then Export). Put ${what} in its place?</p><div class="row"><button class="btn sm primary" id="title-replace-yes" data-act="title-replace-yes" data-n="${n}">Replace keep ${n}</button><button class="btn sm" id="title-replace-no" data-act="title-replace-no">Cancel</button></div>`
      : `<div class="row"><button class="btn sm" id="title-replace-${n}" data-act="title-replace" data-n="${n}">Replace keep ${n}</button></div>`;
    return `<div class="kslot"><div class="kslot-head"><span class="eyebrow">Keep ${n}</span></div><p>${m ? esc(keepLine(m)) : 'Empty.'}</p>${acts}</div>`;
  }).join('');
  return `<div class="title-card"><h2 class="title-h">Which keep does ${esc(what)} replace?</h2><p class="hint">All three keeps are in use.</p><div class="kslots">${rows}</div>
    <div class="row"><button class="btn" id="title-back" data-act="title-back">Back</button></div></div>`;
}
function titleHTML() {
  if (!ui.title) return '';
  const body = ui.titleView === 'new' ? titleNewHTML() : ui.titleView === 'replace' ? titleReplaceHTML() : titleMainHTML();
  return `<div class="title-wrap">
    <div class="title-top"><h1 class="title-name" id="title-name">Afterglass</h1><p class="title-tag">A keep on the Veil. The living hold it by day; the dead hold its reflection by night.</p></div>
    <div class="title-menu" id="title-menu">${body}</div>
  </div>`;
}
export function openTitle(by = 'you') {
  if (ui.skip) endSkip();
  if (running() && !ui.paused) trail('pause', { by: 'title' });
  Object.assign(ui, { paused: true, rush: false, resume: false, title: true, titleView: null, titleFor: null, titleAsk: null, installHelp: false, titleBack: by === 'you' });
  closeSheet();
  showCoach(null);
  trail('panel', { name: 'title', ...(by === 'you' ? {} : { by }) });
  bump();
  requestAnimationFrame(() => document.querySelector('#title-menu .title-go')?.focus({ preventScroll: true }));
}
export function closeTitle() {
  if (!ui.title) return;
  Object.assign(ui, { title: false, titleView: null, titleFor: null, titleAsk: null });
  trail('close', { name: 'title' });
}
export function titleContinue() {
  closeTitle();
  if (waiting()) openSheet('phase', 'game');
  return bump();
}
export function titleView(view) {
  ui.titleView = view;
  ui.titleAsk = null;
  bump();
  requestAnimationFrame(() => document.querySelector('#title-menu button, #title-menu input')?.focus({ preventScroll: true }));
}
// A new keep, the tutorial or today's keep: where one is already under way, back to it; else into a free
// slot, or, with all three in use, the player chooses which one it replaces.
export function titleStart(what) {
  const held = what === 'tutorial' ? tutorialHeld() : what === 'daily' ? dailyHeld() : null;
  if (held) return held === saves.current ? titleContinue() : playSlot(held);
  const n = freeSlot();
  if (n) return startIn(what, n);
  ui.titleFor = what;
  return titleView('replace');
}
export function startIn(what, n) {
  prefs.introDone = true;
  savePrefs();
  if (what === 'tutorial') {
    prefs.guideSeen = {};
    return startTutorial(n);
  }
  return what === 'daily' ? startDaily(n) : newKeep(n);
}

const SECTIONS = { hud: hudHTML, bar: barHTML, title: titleHTML, sheet: sheetHTML };
const drawn = {};
let liveEls = [];
let barEls = [];
let drawnToasts = -1;

const LIVE = {
  heat: (id) => fireTrend(id),
  assault: () => assaultText(),
  estrip: () => stripText(),
  clock: () => clockText(),
  'eclipse-left': () => (eclipseNow() ? String(Math.max(0, Math.ceil((s.eclipse.to - s.t) / TICKS_PER_SEC))) : '0'),
  food: () => floor1(s.res.food),
  candles: () => floor1(s.res.candles),
  glass: () => floor1(s.res.glass),
  stone: () => floor1(s.res.stone || 0),
  arms: () => floor1(s.arms || 0),
  essence: () => floor1(s.res.essence),
  rem: () => floor1(s.res.remembrance),
  dread: () => String(s.dread),
  veil: () => String(s.cracks),
  tnext: () => nextMarkText(),
  defense: () => fmt(defense(s)),
  foes: () => String(s.night?.foes.length ?? 0),
  tocome: () => String(s.night?.spawns.length ?? 0),
  killed: () => String(s.night?.stats.killed ?? 0),
  't-ess': () => fmt(s.night?.stats.essence ?? 0),
  't-glass': () => fmt(s.night?.stats.glass ?? 0),
  mem: (id) => String(Math.max(0, Math.ceil(byId(s.shades, id)?.memory ?? 0))),
  lore: () => fmt(s.study?.lore ?? 0),
  status: (id) => {
    const d = byId(s.shades, id);
    return d ? shadeStatus(d, lightMap(K(), s.tuning, s.night?.candles || [])) : '';
  },
};
const BARS = {
  wfill: () => (ui.watch ? ui.watch.c.u / Math.max(1, ui.watch.idx.total) : 0),
  heat: (id) => s.fires?.find((f) => f.room === id)?.heat ?? 0,
  gate: () => Math.max(0, s.raid?.gate ?? 0),
  clock: () => (s.phase === 'day' ? s.t / dayTicks(s) : s.phase === 'night' ? s.t / nightTicks(s) : s.phase === 'dusk' ? 0 : 1),
  tclock: () => (eclipseNow() ? (s.t - s.eclipse.from) / (s.eclipse.to - s.eclipse.from) : s.phase === 'night' ? s.t / nightTicks(s) : 0),
  mem: (id) => (byId(s.shades, id)?.memory ?? 0) / 100,
  visit: (id) => {
    const v = s.visitors?.find((x) => x.id === id);
    return v && !v.done ? (v.until - s.t) / Math.max(1, v.until - v.at) : 0;
  },
};

export function render(alpha, now) {
  // A new room changes the keep's height, so the scale that fits it.
  if (layout.keep !== K().key) {
    layout.keep = K().key;
    layout();
    setDrawnLabels('');
  }
  const key = `${s.rev}|${ui.rev}`;
  let changed = false;
  for (const [id, html] of Object.entries(SECTIONS)) {
    if (drawn[id] === key) continue;
    const host = document.getElementById(id);
    const a = document.activeElement;
    if (a && host.contains(a) && a.matches('select, textarea, input:not([type="checkbox"]):not([type="radio"])')) continue;
    const focusId = a && host.contains(a) ? a.id : null;
    const scrolls = [...host.querySelectorAll('#sheet-body, #log, #days-wrap')].map((el) => [el.id, el.scrollTop, el.scrollLeft]);
    host.innerHTML = html();
    if (id === 'sheet') {
      host.hidden = !ui.sheet;
      host.className = `gsheet${ui.sheet ? ` is-${ui.sheet}` : ''}${halfSheet() ? ' is-half' : ''}`;
    }
    if (id === 'title') {
      host.hidden = !ui.title;
      host.parentElement.classList.toggle('is-title', !!ui.title);
    }
    for (const [sid, st, sl] of scrolls) {
      const el = document.getElementById(sid);
      if (el) {
        el.scrollTop = st;
        el.scrollLeft = sl;
      }
    }
    if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
    drawn[id] = key;
    changed = true;
  }
  if (changed) {
    liveEls = [...document.querySelectorAll('[data-live]')];
    barEls = [...document.querySelectorAll('[data-bar]')];
    showHint();
    syncBack();
    const hh = `${hudEl.offsetHeight}|${barEl.offsetHeight}`;
    if (hh !== layout.last) {
      layout.last = hh;
      layout();
    }
  }
  for (const el of liveEls) {
    const v = LIVE[el.dataset.live]?.(el.dataset.arg);
    if (v !== undefined && el.textContent !== v) el.textContent = v;
  }
  for (const el of barEls) {
    const f = BARS[el.dataset.bar];
    if (!f) continue;
    const w = `${(Math.max(0, Math.min(1, f(el.dataset.arg))) * 100).toFixed(1)}%`;
    if (el.style.width !== w) el.style.width = w;
  }
  srNight(now);
  if (drawnToasts !== ui.toastRev) {
    drawnToasts = ui.toastRev;
    document.getElementById('toasts').innerHTML = ui.toasts
      .map((t) => `<div class="toast ${t.tone}"><span>${esc(t.text)}</span><span class="row">${t.open ? `<button type="button" data-act="toast-open" data-id="${t.id}">Open</button>` : ''}<button type="button" data-act="toast-close" data-id="${t.id}">Close</button></span></div>`)
      .join('');
  }
  draw(alpha, now);
}

// The night in one line for a screen reader (round seven, phase 3), since the Tain is a picture: the Unlit out
// and to come, the Veil, and who is caught. Read out when any of that changes, at most every eight seconds,
// with the time; the clock alone going round isn't news.
const srEl = document.getElementById('sr-status');
const sr = { key: '', at: -Infinity };
function srNight(now) {
  const n = s.night;
  const on = n && (s.phase === 'night' || eclipseNow()) && !ui.watch && !ui.title;
  if (!on) {
    if (sr.key) srEl.textContent = sr.key = '';
    sr.at = -Infinity;
    return;
  }
  if (ui.paused || now - sr.at < 8000) return;
  const caught = s.shades.filter((d) => d.grabbedBy).map((d) => d.name);
  const key = `The Unlit: ${n.foes.length} out, ${n.spawns.length} to come. The Veil: ${s.cracks} of ${cracksOf(s)} cracked.${caught.length ? ` Caught in the dark: ${listOf(caught)}.` : ''}`;
  if (key === sr.key) return;
  sr.key = key;
  sr.at = now;
  srEl.textContent = `${clockText()}. ${key}`;
}

export function openSheet(name, by = 'you') {
  if (ui.sheet && ui.sheet !== name) markRead();
  if (name === 'menu' && running() && !ui.paused) {
    ui.paused = true;
    ui.resume = true;
    trail('pause', { by: 'menu' });
  }
  if (ui.sheet !== name) trail('panel', { name, ...tabOf(name), ...(by === 'you' ? {} : { by }) });
  ui.sheet = name;
  bump();
  requestAnimationFrame(() => document.getElementById('sheet-close')?.focus({ preventScroll: true }));
}
export function closeSheet() {
  markRead();
  const was = ui.sheet;
  if (was === 'test' && s.test && !s.test.sent && !ui.watch && (answered() || s.test.quiz?.results?.length) && !ui.testNote) toast('Your answers are kept. When you are done, Menu, then Done testing, sends them.', 'rite');
  ui.quiz = null;
  ui.testBack = false;
  ui.sheet = null;
  ui.confirmSlot = null;
  ui.slotMsg = '';
  ui.moving = null;
  ui.tearAsk = null;
  if (ui.resume) {
    ui.resume = false;
    if (running()) {
      ui.paused = false;
      trail('play', { by: 'menu' });
    }
  }
  if (was) trail('close', { name: was });
  bump();
  if (was) requestAnimationFrame(() => document.getElementById(`open-${was}`)?.focus({ preventScroll: true }));
}

/* ---------------------------------------------------------------- Back */

// Android's Back button, and the browser's (round seven, phase 3). While a panel, one of the main screen's
// lists, or the main screen opened from the keep is up, the page holds one step of the browser's history, so
// Back closes the topmost of them, as Escape does, instead of leaving the game. Closed any other way, the step
// is taken back out, so the next Back isn't spent on nothing.
const backStep = { held: false, skip: 0 };
const backable = () => !crashed && !!(ui.sheet || (ui.title && (ui.titleView || (ui.titleBack && continuable()))));
function syncBack() {
  const want = backable();
  if (want === backStep.held) return;
  try {
    if (want) history.pushState({ afterglass: 'back' }, '');
    else {
      backStep.skip++;
      history.back();
    }
    backStep.held = want;
  } catch {
    // A frame that won't let the page into its history: Back does what it always did.
  }
}
window.addEventListener('popstate', () => {
  if (backStep.skip) {
    backStep.skip--;
    return;
  }
  if (!backStep.held) return;
  backStep.held = false;
  trail('back');
  if (ui.sheet) closeSheet();
  else if (ui.title && ui.titleView) titleView(null);
  else if (ui.title && continuable()) titleContinue();
});
