# The older prototypes

Archived by round seven's phase 19, as they were, so the season's folder holds the season alone. Each still plays, and each still passes its own tests.

| Page | What it asked |
|---|---|
| [`index.html`](index.html) | Weeks 1–2 greybox: two rosters and the Rite. Does a death feel like a loss and a hire at once? |
| [`night.html`](night.html) | Weeks 3–4 greybox: the night on its own. Is the night fun without the day? |
| [`pixel.html`](pixel.html) | Weeks 5–6 pixel pass: first art. Can players read the Tain on a phone? |

Their design record is in [`prototype/HISTORY.md`](../../../prototype/HISTORY.md) (Weeks 1–2, Weeks 3–4 and Weeks 5–6), and their history in git, which kept it through the move.

- `style.css`, `night.css`, `src/data.js`, `src/rng.js`, `src/px/kit.js` and `src/px/lut.js` are copies of files the season still uses, as they were when the archive was made; the season's own copies have gone on changing.
- The pages use the game's fonts from `prototype/fonts/`.
- `npm test` here runs their tests (39); `npm run balance` and `npm run balance:night` run the greyboxes' balance tools. Neither is in CI any more.
