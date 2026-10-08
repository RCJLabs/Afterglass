// Weeks 7–10 slice UI: one season in one keep. The castle fills the screen; a HUD sits on top, an action
// bar at the bottom, and everything else opens in a panel over the castle. Like the greyboxes it changes
// the game only through act(), so every session replays from its seed and action log.
//
// The page is in src/page/, a module to each part (round seven, phase 19). They load in this order: state
// first, which imports none of the others, so every part can use the keep, ui and the stores as it loads;
// input last, which starts the page.

import './page/state.js';
import './page/hud.js';
import './page/day.js';
import './page/dusk.js';
import './page/dawn.js';
import './page/records.js';
import './page/playtest.js';
import './page/watch.js';
import './page/stage.js';
import './page/screen.js';
import './page/guide.js';
import './page/clock.js';
import './page/keeps.js';
import './page/acts.js';
import './page/input.js';
