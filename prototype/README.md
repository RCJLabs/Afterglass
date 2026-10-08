# Afterglass: the season

The game: a keep on the Veil, held by the living by day and by the dead in its reflection by night, for a season, a year, or a five-year campaign. It began as round three's weeks 7–10 slice, the last of four prototypes; the other three are in [the archive](../docs/archive/prototypes/README.md).

**Play it:** the release is at https://rcjlabs.github.io/Afterglass/prototype/season.html, and main's preview at https://rcjlabs.github.io/Afterglass/preview/prototype/season.html (the root README says how each is deployed).

This file is the manual: how to run it, what's where, how a season plays, and what the numbers say. Its history is in [HISTORY.md](HISTORY.md): the design record of problems 1 to 60, which the text here cites by number, the design calls, and the notes on the first three prototypes (split out in round seven's phase 19).

## Run it

```sh
cd prototype
npm test                        # the unit tests, on Node 20+ with no dependencies: the rules, replay, the golden keeps, saves, the Hall, the page's modules
npm run serve                   # then open http://localhost:8080/season.html (any static server works)
npm run e2e                     # the browser checks, in Chromium (they need Playwright: e2e/run.mjs says how)
npm run measure -- --only plans # the balance tables (tools/measure.mjs; with --readme it writes them into this file)
npm run balance:season -- 100 1 # an older autopilot report: 100 seeds x 1 season per plan
npm run bundle                  # dist/afterglass-season.html: one file that opens from disk (esbuild, through npx)
npm run site                    # the site as Pages publishes it, into ../_site (esbuild, through npx)
npm run icons                   # redraws the app icons into icons/ (they're committed; only needed when the art changes)
```

The page loads ES modules, so it needs a web server; GitHub Pages works as is. The single file has no such limit, but can't install as an app: it drops the manifest and never registers the service worker.

**Playtesting** (round six's playtest kit, below): send a tester https://rcjlabs.github.io/Afterglass/prototype/season.html?test=Name (the name only labels their file). They play the tutorial and are asked to play on to the season's end, answer a few questions there, can take a two-minute picture test of the Tain, and send the session back (problem 48). Watch it at https://rcjlabs.github.io/Afterglass/prototype/season.html?watch, or from the Menu, under Saves.

## Files

| File | Job |
|---|---|
| `src/slice/` | The season slice: `data.js` (content, tuning and the traits), `geo.js` (the geometry of any keep the player builds: floors, stairs, light, routes and cameras), `sim.js` (the whole season as one state), `autopilot.js`, `draw.js` (the art, built on `src/px/`), `people.js` (the living and the dead as pixel figures), `book.js` (the Book of the Dead's pages), `saves.js` (the save slots, and loading a keep from a file), `sound.js` (every sound, made with Web Audio as it plays), `threats.js` (the black mirror: tonight's threats, read at dusk), `recap.js` (what a season's recap card says), `card.js` (the card as an image), `daily.js` (today's keep: a seed from the date), `tutorial.js` (the tutorial keep), `howto.js` (How to play, in the keep's own numbers) and `watch.js` (the replay viewer: a playtest export played back on a timeline, its moments and the tester's trail marked), `alerts.js` (what each kind of alert does in the page, problem 49), `quiz.js` (the glass test, problem 48) |
| `src/page/` | The page, a module to each part (round seven, phase 19): `state` (storage, preferences, the keep in play), `hud`, `day`, `dusk` and `dawn` (the panels), `records` (the rosters, the records and the Menu), `playtest` and `watch` (the playtest kit), `stage` (the castle and its camera), `screen` (the installed app, the page's sections, the main screen), `guide` (the guide and the tutorial), `clock` (the frame loop), `keeps` (starting, playing and keeping keeps), `acts` (what each button does) and `input` |
| `src/slice-ui.js` | Loads the page's modules, in order |
| `src/data.js`, `src/rng.js`, `src/px/kit.js`, `src/px/lut.js` | From the earlier prototypes and still the season's: the names, the seeded random numbers, the palette and drawing primitives, and the Tain's colour lookup |
| `src/build.js`, `src/slice/keys.js` | The build and its channel, which `tools/site.mjs` stamps in as it builds the site, and the storage keys the channel decides |
| `fonts/` | The game's three typefaces, hosted with it, and their licences |
| `sw.js`, `season.webmanifest`, `icons/` | The installable season: the service worker that keeps it playable offline, the manifest, and the icons `tools/icons.mjs` draws |
| `test/` | The unit tests, on Node's own runner |
| `test/golden/` | Keeps saved by older builds, replayed on today's rules by `test/golden.test.js` (problem 49) |
| `e2e/` | The browser checks: the page itself in Chromium at phone and desktop sizes, run by `npm run e2e` and the Browser workflow (and on the bundled site, with `E2E_ROOT`), with the saved keeps they start from in `e2e/states/` (problem 49) |
| `tools/` | `measure.mjs` (the balance tables in this file, problem 49), `AUTOPILOT.md` (the autopilot's plans and switches), `site.mjs` (the published site), `bundle.mjs` (the single file), `words.mjs` (the words a player reads, counted), `balance-season.mjs` (an older report) and `icons.mjs` (the icon drawer) |

Everything is seeded and every action is logged, so `replay()` (in `src/slice/sim.js`) rebuilds any session exactly, including one from a playtester's export.

## How a season plays

- **The main screen.** The game opens on it, over the keep as it stands, and the Menu's Main menu leads back to it; the clock stands still under it. Continue goes back to the keep you were playing, and says where it stands. Learn to play starts the tutorial (or goes back to one under way), New game makes a keep (the open year or a campaign, Gentle to Hard, and the guide or not), and Today's keep plays the day's keep; each goes in a free slot, and with all three in use it asks which keep to replace. Saves, How to play and Settings open the Menu at that tab, over it. A tester's link, a reload part way through a test, and the replay viewer skip it. Escape steps back, and from the main list back to the keep.
- **The screen.** The castle fills the window at the largest whole-pixel scale that fits: 3× on a 390-pixel phone, up to 6× on a desktop. By day it's the keep on its lake. From dusk to dawn it's the dark keep above the Veil with the Tain below it, the keep's reflection, where the night happens. The camera slides between the two.
  - **The HUD** on top shows the phase, the clock, play and speed, the stores, Dread and the Veil; on a phone, food, candles, Dread and the Veil, and the rest behind More. From dusk to dawn the tide clock runs under it, naming its next mark, and by day the emergency strip sits under it when something won't wait (problem 46).
  - **The bar** at the bottom holds the tools for the moment (Candle, Move, Ward, Hush, Flip, or the phase's next step). It also opens four panels: this phase (Day, Crossing, Dusk, Night, Rite or Season), People, Records, and the Menu. Panels are a sheet from the bottom on phones (the Dusk panel half the height, so the Tain shows above it) and a drawer on the right on wide screens. They open by themselves when a decision is waiting, at the crypt, the rite and the season's end. Back closes them.
  - **Zoom and pan.** Pinch or the mouse wheel zooms in whole-pixel steps toward your fingers or the pointer, from 1× to 10×. Dragging pans, and a tap still acts, since it's judged on release. The +, − and Fit buttons at the right edge do the same. Panning stays near the castle and resets when day turns to night.
  - **Keys:** space, 1, 2 and 4 for time; C, M, W, H and V for the tools; + and − to zoom, 0 to fit, arrows to pan; K, P, R and B for the panels; L for room names; S for sound; Esc closes a panel, or opens the Menu when none is open. From dusk to dawn the arrows move a cursor over the Tain instead, a floor at a time up and down as the screen shows them (Shift and the arrows pan). Enter does there what a tap would with the tool in hand, [ and ] pick the shades in turn, and the line above the bar says where the cursor is and what Enter will do. Esc or a tap puts it away. In the Records and Menu tabs the arrows, Home and End go along the tabs.
- **People** are 6 by 12 pixels (10 for the young, 11 and stooped for the old). They're dressed by their job: the guard in a helm and crimson tabard with a spear, the priest in a hood and robe, the cook in a cap and apron, the healer marked with a red cross. Hair, beard and skin come from each name. By day each works a station in their room and now and then walks a few steps. The shades are the same bodies as dark silhouettes with glowing eyes; their feet thin into a wisp, and the Loyal wear a helm, the Serene a hood and Strangers horns.
- **Difficulty.** A new keep is Gentle, Standard or Hard, chosen under New game on the main screen or in the Menu under Saves (problem 30). Today's keep and the tutorial are always Standard. Beside it, **Custom rules** (problem 45) change six of its numbers (the cracks that break the Veil, the Creepers added each night, the Host's strength, food and candles to start, and how much harder each year starts) and which of nine parts of the game are in it (visitors, fire, weather, omens, errands, the eclipse, generations, the Church's escalation and the Deep), and one help, auto-relight (on in Gentle, problem 50), with a button back to the difficulty's own rules. A new keep keeps them as its own, Saves says so, and Settings says which the keep is.
- **Day** (60 s at 1×). Eight living, and at first only the Hearth to work in: two cook, and the other six quarry stone in the Yard until their rooms are built. A job needs its room. The Chandlery makes the night's candles, the Chapel's priests hold funerals and bear Dread, and thanks to a Granary, raiders who break in take only half as much food. Raids come on days 2, 4 and 6 (below). Sickness, old age and an empty larder kill as before, and a newcomer arrives every second day. Jobs are in People; pick a name there, then tap a room on the castle, or use the job list. A room a Maw broke the night before is haunted for the day: a cold light and one of the dead drifting through it.
- **Raids** (by day). The Ashen Host is sighted in the morning of days 2, 4 and 6 and reaches the gate a little after noon, at strength about 4, 7 and 11 (±1.5), ×1.2 harder each season. War banners go up over the turrets.
  - **Guards muster** (round seven, phase 10). A guard counts in full only after 2.5 hours of the day's clock at the post (a Barracks or the Gatehouse: 12.5 seconds at 1× in spring, 16 in summer, 9 in winter), and for that share before, still rising at the gate; whoever leaves the post starts again from nothing. The Host is sighted about three and a half hours before it reaches the gate. So they're posted while the Host is on the road, or before, and their work stops while they stand there. A new keep's first guards have stood their posts. The Day panel and the call-outs say what the guards posted will add once they've taken their places, and People marks those still taking the post (`muster` in Settings, under Advanced).
  - **The Forge's arms** (phase 10). By day a Forge's smiths make arms, 1 a day each, kept up to one for each guard's post. At the gate each arm makes a guard 1 stronger, as far as the guard has mustered, and each raid at the gate breaks a quarter of those in use, one at least. Smiths no longer stand at the gate themselves. The HUD's More and Work today show the arms (`forgeArms`).
  - **From the sighting:** guards in the Barracks, a ward on the gate (essence), or two new choices. **Pay them off**, 1.5 food and half a candle per point of their strength: they turn back, but the season's raids after it come ×1.25 harder, or the next season's if it was the season's last (problem 44). **Bar the stores**: the Hearth, the Chandlery and the Glazier stop while the Host is at the gate, and a breach carries off half as much.
  - **At the gate** the clock pauses, and the strip under the HUD has pitch and the bell (the Day panel has the rest). Each second the Host is stronger than your defense, the gate gives; if it still stands when their time is up (15 seconds at 1×), they fall back. **Pitch**, 2 candles, takes 1.5 off their strength. **Stone**, 2, shores the gate up by a quarter. **The bell** brings everyone well onto the walls at half a guard each, and stops their work. Whoever is on the walls can fall, the danger shared among them, and the bell's hands are the likelier to.
  - **After a breach** the guards can go after them, each with a one-in-five chance of not coming back. They take back a share of what was carried off as great as their own strength, mustered and armed, against the Host's, a tenth to nine in ten; before phase 10, half, however many went (`guardsGoOut`).
  - The fight shows on the castle: the Host at the east wall with a ram, cracks as the gate gives, pitch from the battlements, and the defenders along the wall walk. Keeps from before this keep the old raid, decided at a throw (`raidFight` in Settings, under Advanced).
- **Fire** (by day). On about 3 days in 10 (twice as often in a broken mirror's bad luck) a Hearth or a Forge catches fire at some hour. A Forge nobody works is cold, and doesn't catch (phase 10, `coldForge`): before, half of year 2's fires broke out in the autopilot's empty Forges. The Day panel opens on it and the clock pauses.
  - Its heat grows 10% a second, and everyone working in the room fights it, taking off 4% each. So a Hearth's two cooks lose, slowly, and the room does no work while it burns.
  - **Send the Yard** puts the masons on it, which costs only their stone. **Ring the bell** sends everyone well, and stops all work while it burns.
  - Fighting it can kill: each fighter's chance is 2% a second times the heat squared, and those who die in it die on duty and wake Loyal.
  - At full heat it catches a room beside it or over or under it every 10 seconds. A fire still burning at dusk scorches its room: nobody works there the next day (from a keep's second year, two days unless masons mend it: see A keep that grows).
  - Keeps from before fire play on without it (`fire` in Settings, under Advanced).
- **Visitors at the gate** (by day, round six). On about half of days, from a keep's third day (problem 47), someone comes to the gate at some hour, and on a fifth of those a second. The Day panel shows who, a line on who they've come about (the couple, the brother in your glass, the body in the sack), each answer with what it costs and gives, and the hour they stop waiting, with a bar running down. The clock pauses when one comes, the panel button has a dot, and the toast opens the panel. Left waiting a quarter of a day, or still waiting at dusk, a visitor takes the last answer. Twenty kinds, each only when there's a reason for it:
  - **Trade:** a glass peddler (6 food for 4 glass), a chandler's widow (6 food, or 3 glass, for 4 candles), a grain barge (4 glass for 10 food), a journeyman mason (4 food, or 2 glass, for 8 stone), a mirror-seller (8 food, or 4 glass, for a hand mirror) and a cooper (3 glass, and until the season ends fire comes half as often). The prices in glass are phase 10's (`payInKind`): food is what runs short, and glass what piles up.
  - **Shelter:** pilgrims running ahead of a raid (two more of the living, who stand the gate that day, +2 defense), a burnt-out family (6 food, since they come in starving: a man, his old mother and his small daughter; sent on, Dread +1), the plague cart (two more, both sick, and a third of the time one of yours catches it; turned away, Dread +1), and a deserter from the Host (one more, Brave, and the Host's next raid comes ×1.2 harder for him).
  - **The dead:** a grave-robber caught with the day's dead (hanged, he wakes Restless at dusk; let go, he takes a body with him, and it never wakes), a knight asking after a brother serving in your glass as a Stranger (released, the knight leaves 6 glass and 1 remembrance; kept, he joins the Host and its next raid comes ×1.25 harder), a wandering priest (2 food, and one more funeral tonight) and a necromancer (a Restless shade bound into a free mirror as a Loyal one, for 1 Dread).
  - **The keep:** a wedding of two who have no one (4 food; they wed, and everyone is at peace until dusk), a bard (2 food, 1 remembrance, and whoever grieves is at peace), the Church's almoner (5 food, or prayers for 2 remembrance, Dread −1), a physician (4 glass, and everyone sick is cured), the lord's reeve (6 food, or 3 glass, and his riders stand with you when the Host next comes, +3 defense) and a hedge-witch (3 glass, and tonight's candles burn ×0.75 as fast; or handed to the Church, Dread −1, and she curses the keep: that night's candles burn ×1.25 as fast, `curseBurn`, where before round seven's phase 11 a Weeper came).
  - What an answer leaves behind (riders promised, a raid made harder, barrels, a charm, a curse) shows in the Day panel until it comes, and the black mirror's forecast of tomorrow's raid counts it. A knight or a deserter answered while that day's raid is still on the road changes that raid. The Book of the Dead tells of a hanged grave-robber and of a body carried off. Visitors come from their own random stream, so a keep meets the same raids, sickness and Unlit with them or without until an answer changes something. Keeps from before have none (`visitors` in Settings, under Advanced).
- **Hard answers, and the years' visitors** (round seven, phase 14, problem 57). Cards in the Day panel like a visitor's, each behind a rule under Advanced in Settings, off for keeps from before.
  - **Cruelty** (`cruelty`): four happenings inside the keep, each about one of the living, at most one a day, from a stream of their own. One answer kills them on your order: they wake at dusk a Wraith ("killed on your order", in the Book), which hunts the Tain every night until banished at the rite and costs 2 Dread every dawn. A traitor's lantern, on 1 in 10 days the Host comes: hanged, the raid comes ×0.8; locked up, they do no work the rest of the day; let be (the answer if none), they open the postern and the raid comes ×1.25. The plague-bearer, on 3 in 10 days of summer's plague while someone is sick in a crowded keep: walled in the Crypt, no one else falls sick that season. The Hollow's price, on a third of new moons from the keep's second year (not the Long Night): paid, the Hollow stays in the Deep tonight. A witch-hunter, on 4 in 10 days at Dread 3 or more with an inspection two days off or nearer, once an inspection: given up, Dread −2. Refusing, the answer if none (but for the traitor), costs nothing.
  - **The years' visitors** (`yearVisitors`): from the keep's third year to its tenth, each year brings one who has never come before, once, from its summer's third day on the first day the gate is open (not in the campaign, whose years have their chapters). The lord's levy (year 3: send the two who came last, and the lord's riders stand at the next raid, +4 defense; buy them off, 8 glass; or refuse him, and the Host's next raid comes ×1.2), a chronicler (4: let him read your Book, +4 remembrance and Dread +1), pilgrims to your dead (5: +6 food and 2 remembrance, and every shade loses 10 memory), an envoy of the Host (6: 10 food and 5 glass, and no raid for the rest of the season), a bishop of the Lantern (7: 6 remembrance, Dread −1, and the Church judges the keep a Dread kinder the rest of the year), a claimant (8: 10 glass, or his men set fire to a room), a keeper without a keep (9: a Loyal shade, its memory whole, joins a mirror with room), and the founding feast (10: 10 food, every shade +25 memory, and everyone at peace until dusk).
  - The guide's card says, the first time a hard answer waits, what the cruel one costs.
- **The Library, the Hall and the Gatehouse** (round six). Three more rooms to build, each with its twin. The Library and the Hall can be built from a keep's first summer (problem 47).
  - **The Library** (by night, the Archive of the Dead). Its scholars make 1 lore a day each toward one study at a time, begun in the Day panel for its remembrance, and a lit shade posted in the Archive adds lore by night. A study finished is the keep's for good. Eight of them, each 2 to 4 remembrance and 3 to 5 lore: Tallow-craft (candles and lanterns burn ×1.25 as long), Ward-lore (a ward costs 2 essence less), Pitch-craft (pitch takes twice as much off the Host), the old rites (one kind of shade, chosen when you begin, acts twice a night), Silvering (mirrors take a quarter less glass), Herb-lore (healers cure twice as many), Masonry (a room costs 2 stone less) and Hollow-lore (a ward holds the Hollow on half the essence, and twice as long with none).
  - **The Hall** (by night, the Court of Shades). One decree a season, proclaimed in the Day panel and standing until the season ends: rationing (everyone eats three-quarters as much, and sickness comes half as often again) or a levy (+3 defense at every raid, for 2 food a day). The curfew (nobody sleepwalks and the Weepers give no nightmares, and everyone works ×0.9) went in round seven's phase 11 (`curfew`, problem 54). A lit shade seated in the Court through half the night has one of the dead's requests heard free at the next rite: granted, it costs nothing, and refused, it isn't held against the keep.
  - **The Gatehouse** (by night, the Undergate). It stands at the gate, on the ground floor, and a keep has one, so building it means moving a room up first (Rearrange, in Build). Its gate guards give 3 defense each, against a Barracks guard's 2. From the second season the Host brings ladders: one goes up every 4 seconds at the gate, and each left standing adds 0.5 to the Host, unless a gate guard is on the Gatehouse's walls to throw them down. From the second season too its twin faces the Deep: on about one night in four the Undergate stirs, and one Creeper of each tide comes up it, under the Veil and behind the line, instead of at a rift, and makes for the mirrors. A candle at its mouth, at the room's outer end, keeps it shut while it burns, and they come up at a rift instead; so does a ward. The Dusk panel says how many are coming and has the ward, and the black mirror shows their ways.
  - Keeps from before have none of them (`library`, `hall`, `gatehouse` in Settings, under Advanced).
- **A keep that grows** (round seven, phase 12, problem 55). What a keep can still spend on, and what still goes wrong, once it stands. Each is a rule under Advanced in Settings, off for keeps from before.
  - **Repairs** (`repairs`), from a keep's second year: a room a Maw broke stays haunted 2 dawns, a Dread at each, and a burned room dead 2 days, unless masons mend it for 2 stone. The gate keeps what an assault took off it, a quarter after a breach, and mends a quarter a day of itself, or a quarter for 2 stone. The Day panel's Repairs card says how long each has and mends it.
  - **More living** (`bedsHold`): the keep holds as many as it has beds, 12 at least.
  - **Floors 8 to 11** (`highStone`, `lampworks`): a room above the seventh floor costs 3 stone more for each floor above it. From the eighth the Lampworks can be raised: its lampwrights turn a glass a day into 3 candles each, and its twin, the Lamp Gallery, is lit every night by a lamp that burns till dawn unless the Unlit put it out. Until the keep stands that high, the Build panel says so in a line.
  - **The great-glass hall** (`glassHalls`): a mirror for eight, built for 60 glass or grown from a great glass for 8 quicksilver and 20 glass. The newly dead are bound into it first, and fade there half as fast.
  - **Second ranks** (`studyTiers`): once a study is learned the Library offers its second rank, for twice the remembrance and lore: candles ×1.5, wards 3 essence less, pitch ×3, the old rites' kind acting three times a night, mirrors at half the glass, healers ×3, rooms 3 stone less, the Hollow held on a third of the essence.
  - **Standing wards** (`standingWard`, `veilWard`), from a keep's first summer: by day, essence wards a rift, the moat or the Undergate every night left in the season, at 60% of a night's ward each; or the Veil itself, which then breaks at one crack more until the season ends, for 40 essence, each more as much again.
  - **The year's trouble** (`troubles`, `troubleRite`): from the second year of the open year (and of a campaign kept on past its ending), each year brings one of eight, drawn for the keep, none twice until each has come: a hungry year (cooks make three-quarters), a year of the Host (raids a fifth harder), a year of the Church (it judges a Dread worse), the Deep rising (as a campaign's fourth year), a wet year (rain twice as often), plague (sickness twice as often), Maws (from every season's first night, not its third) and a dry year (fires half as often again). The Day panel says which, and once a season a rite in the Chapel (15 remembrance) halves it until the season ends.
- **Mirrors in rooms** (round seven, phase 13, problem 56). Each mirror hangs in a room of the keep, and where it hangs changes the night. A rule under Advanced in Settings (`mirrorRooms`), off for keeps from before.
  - One mirror to a room, named for it: the Crypt pier glass. A new keep's pier glass, with the last keeper's dead, hangs in the Crypt, and its hand mirror in the Hearth. A new mirror hangs where the Maws come least: a room nobody works by day or night (the Crypt, a Granary, a Cellar), then a bare hall, then the worked room nearest the Veil. By day each mirror's row in the Day panel hangs it elsewhere, shades and all, two mirrors changing places; a mirror in a bare hall hangs on in the room raised there, and in the bare hall a room torn down leaves.
  - A shade whispers through its mirror to whoever works the room it hangs in, and a great glass's shades step through into its room (The dead by day, below, as it was before).
  - A mirror with a shade in it is a door between its room and the room's twin. From a keep's second season (`doorsFrom`), a Maw that breaks the twin of a room where a door hangs comes through it: the Veil cracks (`doorCracks`, 1), as when the Unlit cross at the Veil, and the Maw is gone from the Tain. Maws come for work, the room's workers by day or the dead posted in its twin by night, never for a door itself (`mawDoor`, 0).
  - Turned to the wall, by day or at dusk, a mirror is no door, and nobody whispers or steps through it; its shades sit out every day and night until it's turned back, and nobody new wakes in it. The Day panel's mirror rows turn one, and on a night a Maw rises the Dusk panel's Doors card lists every door, with a turn for each.
  - The newly dead wake in the safest mirror with room: a great-glass hall first, as before, then the one hung where the Maws come least, the nearest the Veil of those.
  - The black mirror says when tonight's Maw is headed for a room where a door hangs, and the guide's card says so on the first such night. By night each mirror shows in its room's twin, a door glowing and a turned one showing its back.
- **The dead by day.** A shade can whisper its old trade, the job it had in life, to whoever works it now. They work ×1.25, one whisperer to a trade, and the shade loses 8 memory at dusk (nothing on a day nobody worked the trade). A shade in a great glass (30 glass, 4 places) can instead step through and work a room in person, as one more worker at its night strength, for 8 memory. It takes a place in the room.
  - The named pay half, and a trait that changes fading changes this too. A shade spent to nothing fades at dusk.
  - People sets it for each shade, and it holds day after day until changed. The Day panel lists who helps and what it will cost them, and the castle shows them pale among the living.
  - Keeps from before this have it off (`whispers` in Settings, under Advanced).
- **Building** (by day). The keep starts as its ground floor, the Hearth and the Crypt, with 8 stone. Masons in the Yard quarry 2 stone a day each; they work on the roof. The Build panel (the bar's Build button, or B) shows what 6 stone raises and where: into any bare hall, or as a new floor on top with a bare hall beside it, each place with where its twin will stand by night (under the Veil, on the line's floor, under the line, or by the rifts) and what that means. Each room's row says what it does by day; what it is by night is behind a "?", and in the tutorial's first three days only the five rooms it teaches are listed, with the rest behind another (problem 47). The line's floor, one below the Veil's, is worked by the shades holding the line as they hold it, so it's the place for a Chapel: they sing in its Choir. Below the line the tides climb through, and a shade working there needs a candle of its own. Each floor raised on top makes the Unlit climb farther (problem 36). With no choice made, a room goes into the top floor's bare hall, else starts a new floor. Each room holds three workers, so a second Barracks lets more guards stand. You can build any of the original rooms but the Crypt, as many as you like, and three new ones:
  - **the Forge.** Its smiths make arms by day, one for each guard's post (phase 10); before, they added 1 defense each at the gate. Its twin, the Cold Forge, makes grave-steel: a shade who forges through half the night makes every shade fight 25% harder the next night.
  - **the Cellar.** It keeps half the candles and glass from raiders who break in. Its twin, the Hollow Cellar, is a dark weak spot.
  - **the Quarters.** The keep sleeps 8, and each Quarters 4 more; since phase 12 it holds as many living as it has beds, 12 at least, so a second Quarters makes room for 16. With more living than beds the crowded fall sick more often (the day's chance ×1.5), and the Day panel says so. Nobody works there. Its twin, the Dreamwell, is a second place for a shade to rest, as the Cold Hearth is (`dreamRest`, round seven's phase 11, problem 54). Before, a shade who dreamed there through half the night sent the living good dreams, and they worked ×1.1 the next day.

  By night, whatever is on the top floor is the Tain's deepest room, beside the rifts, and each new floor makes the Creepers' climb a floor longer. The camera fits the taller keep, down to 3× on a desktop; on a phone it stays at 3× and you pan up.
  - **Rearrange the keep**, in the Build panel: the keep floor by floor. Tear a room down for 3 of its 6 stone back, leaving a bare hall (the Crypt and your last Hearth stay; whoever works there beyond what the rest of its kind holds goes to the Yard). Or move it: it swaps places with any other room or bare hall, for 2 stone, its twin moving with it and its workers keeping their jobs. Both ask first, and both are by day.
- **Dusk** (paused). The crossing:
  1. The sun sets over the keep and its lights go out.
  2. At the crypt you choose funerals, then wake the dead. Their souls sink through the Veil into the Waking Room of the Tain, or rise away for a funeral.
  3. The camera follows them down.
  4. You set candles, post shades on the Tain (reflected or flipped upright) and begin. From the second dusk, As last night, at the top of the Dusk panel, puts the shades back at the posts the last night began with and lights its candles where they stood, as far as the store goes (wards you set yourself; problem 50). Dusk opens on Move, and until the night begins a tap on a candle or a ward takes it back whole; with Candle out, a tap on a shade in light picks it (problem 46). The Dusk panel lists when tonight's tides are due. On the two dusks before the new moon it also says what holding the Hollow off until dawn will take (the draw a second, and its time before dawn), against the essence in store, so it isn't spent on the tides first.

     **The black mirror**, in the Dusk panel, reads the night from what you've set so far. Tonight's spawns are rolled when the day ends, so it can say exactly:
     - where each rift's tide will go: the light it will gnaw, a mirror left open, or a shade it will catch in the dark on its way;
     - where the candle hunters go, if that's elsewhere, and how many may seep up and in which rooms;
     - what a Maw would make for, and the Hollow's way on the new moon with the wards on it;
     - how big each tide is, and tomorrow's raid (rolled when the day begins, so a range) against the gate as it's manned now.

     The same ways are drawn on the Tain while you place: chevrons marching up each rift's way, an ✕ where they'll gnaw, a ring on a mirror they'll reach, a ! over a shade they'll catch, a sparser pink way for candle hunters, orange brackets on the Maw's mark, and violet for the Hollow. Shapes differ as well as colours, and with less motion nothing marches. It asks the Creepers' own planner, so it's exact for the moment it's read; once the night begins, candles burn down and shades move. Settings can hide the ways. A tap on one of its lines brings the spot it's about into view.
- **Night** (120 s at 1×). The weeks 3–4 engine on this keep's Tain: a floor of twin rooms for each floor you've built, 2 stairs between each pair of floors, 2 rifts in the deepest floor, 2 mirrors under the Veil. In a keep of one floor the rifts and the mirrors share it, and the line is two candles between them. Every twin room has its job for a lit shade at its post:
  - the Choir sings essence (the store holds 100 at most; what's sung beyond that is lost), and a shade that sings through half the night calms one Restless shade;
  - the Silvering makes glass;
  - the Wick Room saves candles for the next dusk;
  - the Threshold readies guidance, so the next sickness or neglect death wakes one kind better;
  - the Watch adds to tomorrow's defense;
  - the Cold Hearth, and the Dreamwell, halve fading for a shade that rests there through half the night.

  The Unlit take any dark way up, however long, and pass lit rooms by; only when every way up crosses light do they gnaw, at the light that bars the way (`goAround`, a switch in Settings). So a room worked below the line is safe from the tides while the other side of the keep stays dark, and the line takes the whole tide on that side. Light both sides and the rooms below take the gnawing, one shade each. Each Creeper of a tide rises at the rift on the side whose stair up to the Veil has less fight standing in the light at its foot (a tie keeps its own rift), and the log says where the tide rises and whether that was why (`thinStair`, round seven's phase 7, problem 50): a second fighter set before the tide only sends it to the other stair.

  Wraiths rise in the Waking Room and hunt; cutting one down banishes it for good. **Maws** come from night 3, one a night with the last tide, but none on the new moon. A Maw:
  - takes 8 seconds to haul itself out of its rift, and can be hit meanwhile;
  - weighs the candle barring the way to a mirror (worth three workers to it) against every twin room where the living work by day or the dead by night (worth their workers), counts every fighter at each and on the way there, and goes for the most worth for the least fight;
  - keeps to its choice once it's on that floor, or unless something else becomes worth twice as much, and shows it: brackets on the room, or a ring on the candle, and a note in the Night panel;
  - walks through light, tears a candle down, and breaks a room by standing in it for 12 seconds: nobody works there for the rest of the night, and the keep pays 1 Dread at dawn;
  - drains any shade beside it, and has 6 strength, so two shades fighting it cut it down fast and one Loyal shade can just about hold it;
  - is held below by a ward on a stair.

  **Acts** (round six). Each shade has one act a night, paid in its memory, and memory is its strength (half the price for the named; a trait that changes fading changes it too):
  - a Loyal shade Stands: for 10 seconds the light it stands in can't be gnawed, smashed or eaten, and it strikes twice as hard (10 memory);
  - a Serene one Kindles: it renews the candle it stands in, or lights one at its feet in the dark, free (15);
  - a Pale one Passes unseen: for 15 seconds the Unlit pass it by, and it slips any grip (8);
  - a Stranger Lures: for 8 seconds the Unlit on its floor within 40 pixels come for it, into its light if it stands in one (12).

  Pick the shade and its act is on the bar, or press A; the Tain shows a Stand as a gold glow, a Lure as red rings, and a shade passing unseen drawn faint. Keeps from before this have none (`acts` in Settings, under Advanced).

  **Lanterns** (round six). A shade can carry a lantern, for half a candle from the store (a whole one before round seven's phase 7): a light of its own for 60 seconds, wherever it goes, so the Unlit can't catch it while it burns. Asked again, it sets the lantern down where it stands, as a candle. Pick the shade and press Lantern on the bar, or T.

  **The Veil** (round seven, phase 9). A mirror cracks once for each tide that reaches it: the rest of that tide through the same mirror spill into the keep above, each giving one of the living a nightmare at dawn, curfew or not. A Creeper out of its tide is a tide of its own, and the Drowned, a Maw and the Hollow crack it as before. Three cracks break it (four on Gentle), and a crack stays until the season ends (on Gentle one mends each dawn). Twenty seconds before a tide, the Veil strains if the stair of the line it will come up is dark or its candle won't last it. Once the store is out of candles, the Candle tool lights a **wisp** instead: a pale light for 6 essence, 40 seconds long, that holds as a candle does. Keeps from before this crack at every Creeper, break at five, mend one a dawn and have no wisps (`crackPerTide`, `cracksMax`, `crackHeal` and `wisp` in Settings, under Advanced).

  **Errands** (round six). The black mirror names each night's at dusk, and the Night panel says what's still out:
  - from night 2, one or two things turn up in the dark rooms below the line: an echo, a memory come loose (+20 memory to the shade that reaches it), or a relic (3 glass);
  - from night 3, on a fifth of nights (never the new moon), one of the living sleepwalks into the Tain at an hour the black mirror gives, out of the sleepers' twin, and makes for a rift at 1.2 pixels a second. A shade that reaches them walks them back to bed, and light wakes them: a candle where they are, or in their way. The Unlit that catch them in the dark hold them; held 8 seconds in all, or at a rift, they die in their sleep and wake Pale.

  The Tain shows an echo as a pale-blue shimmer, a relic as a silver glint, and a sleepwalker drawn faint, with a caught shade's bar while they're held. Keeps from before this have neither lanterns nor errands (`lanterns` and `errands` in Settings, under Advanced).

  **Omens** (round six). From night 2, on half of nights (never the new moon or the Long Night), the Dusk panel shows an omen that changes the night's shape:
  - a sealed rift: one rift is sealed, and every Creeper and Maw comes up the other;
  - a thin Veil: the first tide seeps up in rooms with no candle, and the Choir sings twice as loud;
  - the Hunt: one more Maw rises with the last tide, and each Maw cut down gives 3 essence;
  - still air: candles burn three quarters as fast, and the Unlit gnaw them twice as hard;
  - a blood moon: a third again as many Creepers come, and each one cut down gives 1 essence;
  - a restless Deep: the tides come twice as often, each half as big;
  - and four more from round seven's phase 14 (`moreOmens`, problem 57), which come only on half the nights that would have had none of the six (`moreOmenChance`), so on a quarter of all nights, and alone: a falling star, which lies tonight in the deepest dark below the line for the first shade to reach it, 9 glass; grave-cold, the Unlit a fifth slower and candles burning 15% faster; a lull in the Deep, a quarter of the night's Creepers staying down and the Choir singing half as loud; and the dead remember, every shade fighting a quarter harder and fading a quarter faster.

  On 40% of the dusks with one of the six the black mirror shows two of them, and you choose one before the night begins; until then the choice can change, and unchosen, the first comes. The black mirror and the ways on the Tain show the night with its omen in it. A sealed rift is drawn slabbed over, and a blood moon reddens the rifts. Omens come from their own random stream, so a keep meets the same raids and Unlit with them or without until an omen changes something. Keeps from before this have none (`omens` in Settings, under Advanced).

  **The tide clock** (round six). At night a strip under the top bar runs from dusk to dawn. It has a mark for each tide (red), each Maw (orange, taller), the Hollow (violet, taller), each of the Drowned (blue), a sleepwalker's hour (pale) and dawn (gold). Skip on the top bar, or N, runs the clock at 20 times the 1× pace to 2 seconds before the next mark, and stops the moment anything calls out. The Night panel says what the next mark is, and so does the clock itself.

  **Weepers** were cut in round seven's phase 11 (problem 54): `weepersMax` is 0, and Settings can bring them back. With it above 0 they come the night after a death: one for each of the day's dead, up to `weepersMax`, at some hour of the night. Each seeps up in the dark of the sleepers' twin, the Dreamwell, or the Cold Hearth before there are Quarters. One that weeps there 15 seconds gives one of the living a nightmare and sinks away, and they work at 60% the next day. A Weeper catches no one and gnaws nothing:
  - light burns it and turns it back, so a room lit wall to wall leaves it nowhere to weep;
  - a shade cuts it down (it has 1.5 strength);
  - a Keening shade on its floor sings it quiet for as long as it stays.

  The black mirror counts them at dusk and says whether their room has dark, and the Night panel says when one is weeping. Keeps from before them have neither Weepers nor beds (`dreamwell` in Settings, under Advanced).
- **Weather.** Each day and the night after it are clear, rainy or foggy, rolled a day ahead: the HUD's Sky shows today's and tomorrow's, and the Day panel says what tomorrow's rain will bring. Rain comes on about 30% of spring and autumn days, 15% of summer's and 5% of winter's, which is mostly fog; fog on 10%, 5%, 25% and 30%. The tutorial's three days are clear.
  - **Rain** slows the Yard to three quarters and damps fire: a fire is half as likely, and grows half as fast. It shows over the keep as a grey sky and rain.
  - **The Drowned** come up on a rainy night out of the moat's twin, at one end of the floor under the Veil, which is behind the line. One comes, and two from night 4, at any hour, all at the same end, but none on the new moon, which belongs to the Hollow (the Long Night has them, as it has a Maw). The Dusk panel names the end and the black mirror says when; on the Tain the water stirs there. They never take a stair: they make for the mirrors on that floor, and one that reaches a mirror cracks the Veil.
  - Light bars them, and burns them at half a Creeper's rate; they gnaw it twice as fast, so a lone candle lasts 30 seconds against one. They have 3 strength, so a shade in the light cuts one down in a few seconds.
  - A shade they catch in the dark is drained, as a Creeper drains it, and dragged 2 steps a second toward the moat. There it's pulled under and gone ("Dragged down into the moat's twin" in the Book). A candle dropped on it makes the Drowned let go, and the shade walks back to its post.
  - **A ward on the moat** (the Ward tool, then either end of the moat's twin, on a rainy night) keeps them under all night, for the price of any ward.
  - **Fog** clouds the black mirror: at dusk it shows how many come and when, but not their ways, and their ways aren't drawn on the Tain.
  - `weather` in Settings, under Advanced, turns it all off. A save from before it gets it when this version loads it, like any number you haven't set; the forecast starts at the next dawn, so the day it's loaded and the next are clear.
- **Generations** (from the second year). Each spring the living age: a child comes of age and can work, the young grow up, and an adult grows old 30% of the time; the unwed, young or grown, pair off 40% of the time. Each season a couple, neither old, has a child 35% of the time while the keep has room for them. Children don't work (People says so), answer no bell and shelter inside from a breach, but they starve first. The old die in their sleep as before, and wake Serene. The Book tells a child of the keep as born there. `generations` in Settings turns it off.
- **Dawn: the Rite** (paused). Keep or cover, release or bind, banish or leave, as in weeks 1–2. Fading happens, and names and remembrance can be bought, as in weeks 3–4. Each Veil crack from the night adds 1 Dread, and so does each room a Maw broke; each Creeper that spilled through a cracked mirror is a nightmare.
  - **The dead ask for things.** From its second night a shade in the glass asks one thing at the rite: a Loyal one to stand the gate by day (tomorrow's defense rises by its night strength, and it pays 8 memory at dusk, more for the Reckless), a Stranger a name (3 remembrance), a Pale one to be remembered (1 remembrance, +15 memory), and a Serene one, once its memory falls below 40, to be let go (its mirror is covered). Grant or refuse under its row. Granted, it asks no more; refused, it asks again three nights later, and refused twice it turns Restless and leaves its mirror. Bound back into one, it settles and asks no more. Keeps from before this have no requests (`requests` in Settings).
  - **The night in moments.** Under the night's numbers, up to three stills of the Tain from the moments that most decided it, in the order they came, each with its hour and what happened, and a ring where it happened. By weight: the Veil breaking, the Hollow tearing through, a shade lost, the first crack, a room a Maw broke, the Hollow driven back, a Maw tearing down a candle, the first shade caught, a Maw cut down, the first seep, and the biggest tide. The season's end shows the new moon's, and a lost keep how its last night went. They're drawn as you view the Tain, reflected or upright.
- **Breaking a mirror** (at any time, asked twice). Everyone in it goes free at once, as if covered: +1 remembrance each, and their bonded living at peace. Dread falls 1 for each, which covering can't do, so breaking one before noon can turn a censure into a warning. At night it frees a caught shade from the Creeper's grip, and a freed Wraith leaves the Tain. The mirror is lost, and the next 7 days are unlucky: sickness comes twice as often, carried into the next season if need be. The Day panel's mirrors have a Break button, the Rite opens a Break a mirror section by itself when the inspector is coming, and the Night panel offers it for a caught shade.
- **Down into the Deep** (at dusk). In the Dusk panel a shade can go down past the rifts instead of taking a post, to depth 1, 2 or 3. It's gone for the night: no light, no fighting, no work, and a glint of silver at a rift until dawn. It comes back with 1, 3 or 6 quicksilver, unless something down there catches it, 10%, 25% or 45% of the time (half as often for a Lurker): then it comes back 35 memory the poorer and empty-handed, or not at all. Never on the new moon: the Hollow is down there. Quicksilver upgrades a mirror where it hangs, its shades and all, from the Day panel: a hand mirror into a pier glass for 3 quicksilver and 4 glass, a pier glass into a great glass for 6 and 8. `deep` in Settings, under Advanced, turns it off.
- **Day 5: the Lantern Church.** It is announced the dawn before, and it comes again the same day whenever Dread reaches 5. The inspector judges the keep's ledger (round seven, phase 10, `churchLedger`): the Dread of every day since the Church last looked, as it stood at each dusk and at noon on the day, averaged and rounded. A keep that covers its way down to Dread 1 the night before is judged by the days before it too. Before phase 10 it judged the Dread at noon alone:

  | Dread | Verdict |
  |---|---|
  | 0–1 | Blessed: +3 candles and +2 remembrance |
  | 2–3 | Warned: a tithe (5 essence, else 5 remembrance, else 3 candles) and Dread −1 |
  | 4–5 | Censured: the fullest mirror is covered and carried off with its shades, and Dread drops to 2 |

  Vigils by day lower Dread at once.
  - **The Church's escalation.** A censure lays a silver embargo on the keep for 5 days: the Glazier makes no glass, and no mirror can be built or upgraded. A blessing lifts it, and so does a donation of 6 remembrance from the Day panel. Censured again while it stands, the keep is given to the Inquisition: an inquisitor inspects every day at noon for 3 days, the embargo standing with it, and takes no gifts. A blessing sends it away sooner. Keeps from before this have it off (`church` in Settings, under Advanced).
  - **The crusade.** Censured under the Inquisition, the keep is given up to a crusade: knights of the Lantern at the gate a little after noon two days later, at strength 13 in the first spring, growing each season as raids do (the day-6 raid is 11). The inquisitor inspects each noon until then, and a blessing calls it off. It's fought as a raid, with pitch, stone, the bell and a ward, but it takes no tribute and wants none of the stores. Held, the Church gives up, and the embargo and the Inquisition end. Broken in, the crusaders smash every mirror they can find, the shades in them go free, and Dread falls to 0. A mirror hidden from the Day panel before the day it comes can't be found by the crusaders or the inquisitor, but its shades sit out every day and night until the crusade is over. The crusaders come in the Church's white and gold. Keeps from before this have the Inquisition start its days over instead (`crusade` in Settings, under Advanced).
- **Night 7: the new moon.** It brings six in ten of a night's Creepers, in one tide more than night 6 (phase 8), no Maw, and the Hollow, which:
  - walks toward the nearest mirror whatever the light;
  - eats candles near it and drains shades beside it, except while a ward holds it: held, it spends itself on the ward and feeds on nothing (phase 8, problem 51);
  - is held by a ward on a stair while the ward draws on the essence (0.25 a second in the first year, more each year as the Hollow grows: ×1.06 a year, or ×1.1 through a campaign's five years and ×1.5 more from the Deep; Hollow-lore halves it), and for 20 seconds once the store is empty, then breaks it (problem 42). On its nights a stair's ward holds only the Hollow: the tides and the Maws climb past (phase 8);
  - can only be driven back by shades fighting it: +3 remembrance in the first year, and 3 more for each year after (phase 8);
  - if it reaches the Veil, cracks it and takes one of the living, leaving no body to wake.
  - Winter's is the Long Night: 1.5 winter nights long, with the Hollow and a Maw, and four in ten of a night's Creepers. From phase 8, four in ten of those are held back for a last great tide at about 00:30, after every other tide, at both rifts: said at dusk, marked on the tide clock, and called out when it rises, stopping the clock as the Hollow does (Settings).
- **Traits.** Everyone living has one of eight, which helps or hinders at a job; death turns it over into what the shade does at night (round three's pairs). People, the crypt at dusk, the rite and the Book show them, and the guide explains them at the first dawn. They switch off in Settings, under Advanced (`traits`).

  | In life | By day | In death | At night |
  |---|---|---|---|
  | Brave | guards ×1.5; falls at the gate twice as often | Reckless | lunges further and fights ×2, but loses memory twice as fast |
  | Coward | guards ×0.5; never falls at the gate | Lurker | unseen by Creepers and Wraiths, so never caught; fights ×0.25 |
  | Devout | ×1.5 in the Chapel, ×0.8 anywhere else | Bitter | costs 3 Dread to keep; while it stays, wards cost a fifth |
  | Diligent | ×1.15 at any job | Tireless | works ×1.6, but never rests and never works as a twin |
  | Gentle | ×1.5 healing in the Infirmary; grieves harder (works ×0.6 while grieving, not ×0.8) | Keening | calms two Restless shades a night, wherever it stands (and, where there are Weepers, sings those on its floor quiet) |
  | Greedy | ×1.25 at the Glazier or the Chandlery, ×0.8 anywhere else | Hoarding | ×2 essence in the Choir, but pockets 2 candles every dusk while the store holds more than 4 |
  | Stubborn | sickness kills them half as fast | Anchored | fades half as fast |
  | Cheerful | never grieves | Wistful | resting the night through in the Cold Hearth or the Dreamwell sends better dreams: the living work ×1.15 the next day |

  The cast has each trait once. A newcomer's comes from their name and the seed, not the random stream, so a seed plays the same raids and sickness with traits on or off. Older saves give everyone the trait their name draws.
- **The year.** The seasons run spring, summer, autumn and winter, and round again.
  - **Summer's** days are ×1.3 as long, and so is a day's work: what the rooms make and the healing. Its nights are ×0.75. It's plague season: when sickness comes to a crowded keep it takes one more for every 2 living beyond the beds, all at once. The Day panel says how many it would take as you sleep now.
  - **Midsummer's eclipse** (round six). Once a year, at noon on summer's day 4, the sun goes dark for 30 seconds and the Tain wakes while the day goes on: the living work and the day's raid comes to the gate while half a night's Creepers climb from the rifts in one tide. The morning's log and Day panel say when. When it comes the clock stops (as it does for raids, unless that's turned off in Settings), and the castle shows both halves at once, the keep above the Veil and the Tain below (at 2× on a phone). The bar has the Tain's tools beside Build.
    - The shades stand at their posts, and candles, moves, wards and acts work as at night. A tap above the Veil works on the keep, as by day.
    - A living person and their dead, the shade posted in the twin of the living one's room, work and fight ×2 while it lasts. One who stands beside their dead through half of it is at peace after, their grief over.
    - Anyone who dies in the dark, raiders who fall inside included, wakes at once where the crypt would have woken them, with no funeral. The Book of the Dead says so.
    - When the sun comes back, the Unlit left in the Tain burn away, candles at least half whole go back to the store, the shades' night work is credited, and the Veil's cracks count at the next rite with the night's.
    - No Maws, Hollow, Weepers, Drowned or Undergate come in it, and its Unlit come from a stream of their own. Keeps from before have none (`eclipse` in Settings, under Advanced).
  - **Autumn** is like spring, but for its siege. Unless its day-2 raid is paid off, the Host makes camp outside the walls the next morning, for 2 days. The gate is shut: nobody quarries in the Yard, and no one new can come. On day 3 the camp comes at the gate, at 0.6 of the day-2 raid, and day 4's raid comes as usual. The guards can sally out from the Day panel to break the camp: the odds are their defense over 1.5 times the camp's strength, from a tenth to nine in ten, and each guard has a one-in-five chance of not coming back. Broken, the Host scatters, the gate opens and the day's camp assault is off. The camp shows on the eastern hills.
  - **Winter's** days are ×0.7 and its nights ×1.35, longer than a candle burns, so the candles put by in summer carry it.
  - **The Long Night** replaces winter's new moon. It lasts 1.5 winter nights, with the Hollow, a Maw, a whole night's count of Creepers and one tide more. When it's over, the year is over.
  - **The year's end.** After the Long Night you choose how the year ends. Keep the watch: spring comes, easier than the winter was and `yearHardness` harder than the spring before (×1.06 on Standard; ×1.1 through a campaign's five years, and ×1.06 after its ending), and the note under Keep the watch says so (it said ×1.2, a season's growth, until problem 43). Take your own place in the glass: you wake as The Keeper (a keeper after the first, as The Second Keeper, and so on), a Loyal shade, named, Anchored and at full memory, in a free mirror or a new hand mirror, and weigh 2 shades' Dread at every rite, while a new keeper goes on into spring. Or seal the Veil (asked twice): every shade goes free, the Book of the Dead closes on "went free when the Veil was sealed", and the keep's story ends there; its recap card says so, and Saves shows it sealed.

  The HUD and the panels say which season it is and what it does, and the Dusk panel warns when the night will outlast a candle. The hills turn with the seasons and snow falls in winter. Keeps from before this play every season as spring (`year` in Settings, under Advanced, with `longNight` and `longNightCreepers`), and keeps from before the plague and the siege play without them (`plague`, `siege`).
- **The campaign** (round six). A new keep is the open year or a campaign, chosen under New game on the main screen or in the Menu under Saves, beside the difficulty. Today's keep and the tutorial are always the open year. A campaign is five years as five chapters: The First Winter, The Ashen Host, The Lantern Church, The Deep Rises and The Long Night. Each year's first dawn tells its chapter (since round seven's phase 15, in a few lines of its story, with what it brings), and the Day panel keeps it in view.
  - **What each year brings.** Each year brings its pressure. From year 2, the Host's autumn siege and its ladders, and the Gatehouse and its Undergate to meet them (the Build panel says so until then). From year 3, the Church's embargo, Inquisition and crusade after a censure; before, a censure takes the fullest mirror and its shades, and nothing more. From year 4, the Hollow is ×1.5 as hard to drive back and eats the light ×1.5 as fast, and the new moon brings ×1.5 its Creepers. Since round seven's phase 15 (`chapterSystems`, problem 58), more of the game comes with the chapters too, and none of it before: in year 2 the visitors at the gate (and the traitor's lantern and the plague-bearer); in year 3 the Library and the Hall (and the witch-hunter); in year 4 the way down into the Deep, errands below the line and omens (and the Hollow's price); in year 5 the eclipse. With no trader at the gate in its first year, a campaign's keep starts with 12 more candles (`campaignCandles`), its last keeper's. The years harden ×1.06 each (`campaignHardness`), as the open year's do (×1.1 before phase 15).
  - **Its goal,** worth 3 remembrance when met, each since phase 15 (`chapterGoals`) asking more than good play gives of itself: 20 candles put by as winter begins; the Host's siege broken with a sally in year 2; every inspection of year 3 blessed, with six of the dead or more in the glass at each; a mirror raised with quicksilver from the Deep in year 4; the last Long Night come through. Round six's, for keeps from before: every raid of year 2 held; no censure in year 3; the Hollow driven back on one of its nights in year 4. The Day panel says how it's going, and the year's end whether it was met. Through autumn, in a campaign or the open year, the Day panel also says how many candles winter will need beyond what the keep makes in it (phase 9, problem 52).
  - **Its close.** Years 1 to 4 end on a choice of two helps for the next year (`chapterCloses`, phase 15), one against its pressure and one toward its goal, and the close card names the next year's goal: raise the walls (the Host meets 2 more defense at every raid) or cut a sally-port (the guards sally out against a siege ×1.5 as strong, `sallyPort`); tithe to the Church (Dread −2, and the next year's first censure only a warning) or honour the dead (a kept shade weighs half its Dread at the rite, rounded up, `shrineDread`); arm the dead (grave-steel on every new moon) or chart the Deep (a shade sent down is caught half as often, `chartCatch`); bind the household (everyone living at peace for 7 days, their grief over) or lay by for the Long Night (winter's candles burn ×0.75 as fast, `tallowBurn`). Round six's, for keeps from before, set the help against goods now: lay in stores (20 food and 10 candles), keep the silver (12 glass), stock the Chandlery (15 candles), call in the keep's debts (4 remembrance and 20 food).
  - **The end.** After the fifth Long Night: seal the Veil or open it, each asked first, and the story ends; or keep the watch, taking your place in the glass as The Keeper, and play on with no more chapters. Each ending is told in a few lines when it's chosen (phase 15). Opened, the shades walk out of the glass into the keep, the Book of the Dead says so, and the badge, the recap card and Saves show the Veil open.
  - **A chapter lost** can be begun again from its first dawn, from the Lost panel: the keep is rebuilt by replaying its record to that dawn, so it plays the same until you choose otherwise. A keep begun on a build whose record no longer replays can't.
  - A campaign carries `campaign` in its numbers, as the tutorial carries `tutorial`, so a new build's numbers never turn it off, and Settings can't.
- **The end.** A season summary, the question (for a tester's keep, or with `?dev`: problem 45), and a button to begin the next season. The keep carries its living, shades, stores, mirrors and Dread into it, and the Veil starts whole. Raids, Creepers and the Hollow are ×1.2 stronger each season; Maws stay as they were.
  - **The recap card.** Make the card, at a season's end or when the keep falls, draws one image of it to share, 1080 by 1350. It shows the keep as it stands, drawn in whole pixels by the game's own art, and how the season went. Under that are six numbers (days held, deaths, shades in the glass, raids held, the Church, the Hollow) and up to three of the season's dead from the Book. Since round seven's phase 16 (problem 59), the first number sets the season against the same season of your last keep ("Than my last keep"; today's keep against the last day you played it, "Than 6 October 2026"): fewer or more deaths if both held, else days held. With nothing to set it against, it's days held, as before. The end panel says the same in words, under the season's summary: who died in it and the shades who served, by what they did. Share sends it through the system's share sheet where the browser can share images; Save image downloads it.
- **The Hall of Keepers** (round seven, phase 16, problem 59), in the Menu and on the main screen. Every keep you play is written in when a season of it ends, when it ends (sealed, opened or fallen), and when its slot goes to another keep (Start over, Delete, today's keep or the tutorial put in its place, a file loaded over it). It keeps how the keep ended or where it stands, each season's days and deaths, its last recap card (a small image, drawn a moment after the season ends, and its words if the image is ever given up for room) and its Book of the Dead. A keep is written in only once there's something to remember: a season played out, or someone dead. Today's keep is one keep a date, however often it's begun. The Hall keeps 40 keeps and the last 160 dead of a longer Book (everyone from before, then the best remembered); when the browser's storage runs short, the oldest cards' images go first, then the oldest keeps no slot holds, and a keep's own save comes before the Hall's images.
  - **Your last keep's dead.** A new keep's first dead come from the last keep you finished or left: two still in its glass when it ended, a Keeper who took their place there first, Loyal and Serene before the Pale, and otherwise those who served most. They keep their name, kind, trait and story (the Book tells it, under From the keep before, and goes on with this keep's), but take Garrick's and Hesper's memory and posts, and have no one living to be bonded to; one of the living who shares a name with them goes by another. A Keeper who comes this way is an ordinary shade, and the next to take the glass is the Second Keeper. If the last keep's Veil was sealed or opened, its dead went free, and Garrick and Hesper come; so they do in today's keep, which is the same for everyone, and the tutorial. New game says who will come, and the new keep's first toast and log say who did. The rule is `firstDead`, in the keep's own rules, so it replays.
  - **Deeds**: eleven, each done once across all your keeps, by whichever keep does it first, told in a toast and listed in the Hall: hold a first whole year; hold a season with no death; break a raid with a sally; raise a mirror with quicksilver; take your place in the glass; begin a keep with your last keep's dead; seal the Veil; open it; see a campaign to its ending; play today's keep on three days; hold one keep ten years.
- **Records.** The Book of the Dead has a page for everyone who has died in this keep, grouped by season. A page tells who they were, how they died and what they woke as, the nights they served and where, what they cut down, and how it ended. Records also holds the log and each day's numbers, and, for a tester's keep or with `?dev`, the playtest export.
- **The Menu** pauses the season while it's open and plays on when it closes.
  - **Settings:** pausing for raids, the guide, the Tain reflected or upright, room names, the Unlit's ways at dusk, motion (as the device is set, less or full), sound, the keys (not on a touch screen), installing, and which build this is. The rules' own numbers, under Advanced, show only with `?dev` (problem 45). Numbers you haven't set there follow the current version: a save from an older one takes the new defaults when it loads, and says so. Starting a new keep keeps only the numbers you set.
  - **Saves:** three keeps, each saved as you play, listed with season, day, rooms, the living and the shades. Continue, New keep, Start over and Delete (the last two ask first; since phase 16, the keep goes into the Hall of Keepers). Export writes a keep to a file, and Load a file takes it back into any slot, on this device or another; it also takes a playtest export and replays it. Watch a playtest is here with `?dev`. The page opens the keep played last, and the single save from before slots becomes keep 1. From its third year a keep's save holds only this year's and last year's days and actions (and every number set in Settings), so a keep years long stays about half a megabyte (problem 43); a keep that isn't a playtest saves only the last 600 events of its trail (problem 44); the Days tab then starts at last year, and its playtest export no longer replays.
  - **Today's keep**, at the top of Saves. Everyone who plays on the same date gets the same keep, from a seed made of the date by their own calendar, on the rules as they ship: your own numbers from Settings are set aside, and locked in it. It goes into an empty slot, or in place of the keep you're playing when there's none (it asks first), and Saves offers to continue it after. Its slot, its playtest export and its recap card name the day. Since phase 16 it lists the other days you played it (up to five, newest first: how far each got and its deaths), and its card sets it against the last of them. It turns over at the player's midnight, so players in different time zones reach each day's keep at different hours.
- **Sound and vibration.** Every sound is made as it plays, with Web Audio: there are no sound files, so nothing more to download or cache. The sim raises a cue for what happens (56 kinds: the phases, raids and the fight at the gate, fire and the bell, deaths, wakings, the dead set to help by day, candles set and going out, the Unlit seeping up and being cut down, Maws, Weepers and nightmares, the Hollow, the Long Night, cracks in the Veil, a mirror breaking, building, the rite), and the page plays it, panned to where it happened. Bells ring for the phases and the dead, glass for the mirrors and the Veil; the Unlit hiss, growl and crack. Under each phase lies a bed of sound: wind and water by day, a drone in the Tain at night that opens as the Unlit gather, a slow chord at dusk and at the rite. While the Hollow walks, a heartbeat quickens as it nears the mirrors. On Android phones, candles tick and raids, deaths, cracks and the Hollow vibrate.
  - Settings has sound on or off (also S), effects and ambience volume, vibration, and a list to hear what each sound means.
  - Sound starts with the first tap or key (browsers allow nothing sooner) and stops while the page is hidden.
  - The cues are a side channel: the rules never read them, a keep without a page listening never collects them, and saves drop them, so replays and the autopilot are unchanged (tested).
- **The tutorial.** The main screen offers it first (Learn to play), and Saves and How to play offer it too. It's a keep whose first three days go by a script, one lesson at a time, each in its moment. A card above the bar says what to do and pulses the button or the spots on the Tain it means; a lesson that asks you to do something clears when you've done it, or when you press Move on. Got it on a lesson that paused the clock starts it again. End the tutorial asks first (problem 47).
  - **Day 1:** Play, People and jobs, building a Barracks and putting two guards in it, then a Chandlery. At noon Maud, an old servant added for the tutorial, dies of old age. At dusk, her body in the crypt; the Tain; lighting the line and putting a shade in each light; posting Maud where a candle lets her work; the black mirror. Night 1 is one small tide from both rifts.
  - **Day 2:** a newcomer to give a job; a fire in the Hearth that kills no one; a raid of strength 5 that kills no one on the walls, fought at the gate, which always leaves one raider dead inside. With the mirrors full, the raider wakes Restless at dusk, and the rite is where to release it. Every dusk the line is set again.
  - **Day 3:** a Glazier and what glass makes, the Church's word of its visit and what Dread brings, a Chapel. Night 3 has a Maw at half strength.
  - **Until night 4** the Veil holds at one crack short and Dread stops at 4, so the Church can't censure the keep in its first three days. Sickness, old age and fire come only as the script says, and the Unlit don't seep up through dark rooms. From day 4 it's an ordinary season. Ending the tutorial early stops the lessons; the keep plays on as scripted.
  - A tutorial keep carries `tutorial` in its numbers, so it replays, and a new build's numbers never turn it off.
- **The guide.** It's on for a first keep, New game on the main screen has it as a choice, and Settings turns it on or off. With it, a card above the bar explains each thing the first time it happens, in any keep, and pulses the button or the spots on the Tain it means. The guide holds its cards back during the tutorial and counts the ones the tutorial taught as read. Settings turns it off, or on again from the start.
- **How to play**, in the Menu: every lesson as a short manual, from the day to the Long Night, in the keep's own numbers, so it stays true when they're changed in Settings.
- **The playtest kit** (round six). A tester needs one link, and their session comes back by hand: there's no server (problem 37).
  - **The tester link** is `season.html?test`, or `?test=Sam` to put a name on the file. It opens the tutorial in a keep of its own (the one in play if nothing has been done in it yet, else the first empty slot; with all three in use it asks to take the one in play) with a note: what the test is, about 20 minutes of tutorial and 20 more to the season's end, and what gets sent. When the tutorial ends the tester is asked to play on to the new moon (problem 48). At the season's end, when the keep falls, or when the tester presses Done testing in the Menu, the questions: what they're trying to do at night, whether the nights felt like a chore, whether a death felt like a loss or a hand for the night, how the grief felt, where they were confused or stuck, and whether they'd keep playing, and why; then the glass test, if they like. Send it back shares the session as a file through the device's share sheet where the browser shares files, and saves the file where it doesn't; Copy as text puts the same on the clipboard. The answers are kept as they're typed: closing them unsent says so, and a tester who comes back to an unsent session that had reached the questions is asked to send it, with the answers as they left them. Opening the link again carries on the same test.
  - **The glass test** (problem 48): eight stills of a small keep's Tain at night, four as the lake shows it and four upright, each asking one thing (one of the Unlit, the shade in the dark, the shade that's caught, how many of the Unlit). Each answer, right or wrong and how long it took, goes into the session with the camera the tester played in, and the viewer shows it per camera.
  - **What's sent** is the playtest export: the seed and every action, so the session replays exactly; each day's numbers and the ledger of the dead; the answers; and the trail. The trail is when the tester paused (and whether they did, the Menu did, an alert or a lesson), changed speed or skipped, opened a panel or a tab, picked a tool, met a lesson, had an action refused, sat 20 seconds or more with no input while the game stood still, or left the page, each with where in the game it happened and when on the clock, and the screen's size. Every keep keeps a trail (its last 4,000 events), so the Playtest tab in Records exports any keep the same way. The keep is also saved now when the page is hidden or closed, if anything was done in it since it was last saved or the clock was running; a page left alone doesn't write over a keep another tab saved.
  - **The replay viewer** is `season.html?watch`, or Menu, Saves, Watch a playtest: load the file, or paste the text. The session plays back in the page itself, day and night, on the tester's keep, at 1× to 16× (Space plays or pauses; 1, 2, 4 and 8 are speeds; ◀ and ▶, or [ and ], step between marks). A timeline in the bar shows each day and night, the game's moments above (deaths and a fall in red, cracks in pink, catches in amber, whatever else called out faintly) and the tester's below (pauses in blue, idle stretches and time away in violet, panels, lessons and refused actions faintly); a tap or a drag goes there. Passing a mark puts its words over the castle, and the viewer dwells a moment on the tester's waits and on each thing they did while the clock ran. The Session panel has who and when, the screen, their answers, and every mark to go to. The keep in play is saved first and comes back when you stop watching; nothing is saved while watching, and nothing in the session can be changed.
  - **A newer build may not replay an older session.** Playing it through once as it loads, the viewer checks every action and every day's numbers against the export, and says where they stop matching, if they do.
- **When something goes wrong** (problem 44). An error the game didn't expect stops it where it is, and nothing is saved after it, so the keep stays as it was last saved (a few seconds before, or when the phase last changed). A panel says so and offers the keep as a file, with what went wrong in it; this morning's keep, a spare saved as each day begins; and a reload. A keep that won't load is left in its slot and gets the same panel. Settings names the build (the commit it came from), and saves and exports carry it. A file loaded from outside is checked first: its numbers must be numbers, and a playtest export may replay only the player's own actions.
- **Installing.** Where the browser offers it (Chrome, Edge, Samsung Internet), an Install button appears on the main screen and in Settings. Where it doesn't, Install on this device, on the main screen, says what to do on that device: the browser's menu on Android, Share then Add to Home Screen in Safari on an iPhone or iPad, and, in another app's built-in browser, which can't install anything, to open the page in the phone's own browser first. Installed, it runs full screen from the home screen and plays offline after its first load: `sw.js` keeps a copy of every file it needs, and of the fonts. A launch waits at most 3 seconds for the network before its copy answers, and an error page or a redirect (a café's sign-in page) is never kept in place of a file (problem 44). Only the season installs.

## What the numbers say

**What the numbers say so far.** The first year of each plan, from `npm run measure` (`tools/measure.mjs`), which writes the tables below: they come from that file, not from hand (problem 49). The human plan is the balanced one with a person's lapses (`tools/AUTOPILOT.md`). Every plan but Idle builds in the same order (a Barracks, a Chapel, a Chandlery, a Glazier, an Infirmary, a second Barracks, a Quarters once the keep is crowded, a Forge, a Granary, a Cellar), stands guards only on raid days, holds the stairs to the Veil, relights candles, and posts nobody below the line's floor at night except in the Choir, and never has the dead help by day. All but Double and Idle send help against a Maw, and a second fighter to the line for each tide: since the tide goes for the thinner stair (problem 50), they hold one fighter to each stair until a tide is up, then send the nearest free fighter to the stair on the side it's climbing. They move a shade only along a lit floor: a shade whose way is dark stays where it is (problem 36). On the Hollow's nights they ward it at the foot of the keep, unless three fighters could cut it down in 15 seconds or the store can't hold it until dawn: then they hold it at the line's stair and drive it back there, and on the Long Night they keep a candle for each stair of the line back for its great tide and put a second fighter at each stair as it rises (problem 51). They also ward the line for the last tide of nights 5 and 6 when the essence is there, use the shades' acts by rule (problem 33), and fetch echoes and relics in a lull (problem 34). Every plan but Idle drops a candle on a sleepwalker who's caught or has reached the Deep's floor, of two omens takes the one that cost it least (problem 35), answers visitors at the gate by rule (problem 38), builds the Hall, the Library and the Gatehouse last, once its own rooms stand (problem 39), meets the eclipse as it meets a night (problem 40), in a campaign closes each chapter on the help rather than the goods (problem 41), and late in a season keeps back what holding the Hollow off until dawn will take (problem 42). The first three differ in how they treat the dead; Double treats them like Balanced.

<!-- measure:plans -->
| | Balanced | Human | Keeper | Mourner | Double | Idle |
|---|---|---|---|---|---|---|
| First season finished | 100% | 97% | 100% | 91% | 93% | 0% |
| **First year finished** | **72%** | **61%** | **46%** | **37%** | **62%** | **0%** |
| Lost in spring / summer / autumn / winter | 1 / 8 / 15 / 33 | 7 / 14 / 21 / 37 | 0 / 18 / 23 / 67 | 18 / 24 / 38 / 46 | 15 / 12 / 13 / 36 | 200 / 0 / 0 / 0 |
| Your deaths per season | 3.1 | 3.0 | 3.2 | 3.2 | 3.0 | 0.2 |
| Raids held | 98% | 98% | 98% | 97% | 98% | 100% |
| Church: blessed / warned / censured | 743 / 0 / 0 | 694 / 0 / 0 | 452 / 526 / 614 | 623 / 0 / 0 | 700 / 0 / 0 | 0 / 0 / 0 |
| Shades lost at night per season | 0.3 | 0.3 | 0.7 | 0.4 | 0.4 | 1.5 |
| The Hollow, in finished seasons: reached the Veil / driven back / withdrew | 2 / 175 / 532 | 9 / 156 / 486 | 2 / 129 / 502 | 27 / 108 / 399 | 3 / 17 / 622 | – |

The human plan finishes its first year on 121 of 200 seeds, against the balanced plan's 143: it loses 41 the balanced plan keeps and keeps 19 it loses. Median seasons finished of the first four: 4, against 4.

Generated by `npm run measure` on seeds 1–200, at build 5eb91c2, 2026-10-05.
<!-- /measure:plans -->

**The verbs the autopilot didn't use until round seven's phase 6** (problem 49), each switched on for the balanced plan and paired with it seed by seed (`tools/AUTOPILOT.md` says what each does):

<!-- measure:verbs -->
| Verb | What the autopilot does with it | Used, per keep | Finished | The balanced plan | Better on / worse on |
|---|---|---|---|---|---|
| Hush (`AP_HUSH`) | hushes while shades stand in the dark with the Unlit close and no candle to spare | 0.8 | 142 of 200 the first year | 143 | 1 / 1 |
| Bind (`AP_BIND`) | binds a Restless shade into a free mirror when the essence can be spared | 0.1 | 142 of 200 the first year | 143 | 1 / 1 |
| The curfew (`AP_CURFEW`, under its old rule) | proclaims the curfew once sleepwalkers can come; since phase 11 a Hall has no curfew | 1.1 | 132 of 200 the first year | 143 | 3 / 14 |
| The Court (`AP_COURT`) | seats a shade in the Court of Shades before a rite where one will ask | 1.2 | 128 of 200 the first year | 143 | 2 / 17 |
| Building by choice (`AP_TALL=line`) | builds tall, with the Chapel on the line’s floor | – | 155 of 200 the first year | 143 | 34 / 23 |
| The Keeper (`AP_ENDING=watch`) | takes its own place in the glass at the first year’s end | 0.7 | 122 of 200 two years | 120 | 5 / 1 |

Generated by `npm run measure` on seeds 1–200, at build 5eb91c2, 2026-10-05.
<!-- /measure:verbs -->

**The night: reacting against the static line** (round seven, phase 7, problem 50). Each plan's first year on today's rules, paired seed by seed with the plan named: Double at the same pace, or as the row says. Human is the balanced plan at a person's pace; Double at a person's pace has the same lapses. Only watching sets the night at dusk and does nothing in it.

<!-- measure:night -->
| Plan | First year finished | Paired with Double at the same pace, or as it says: better on / worse on (seeds) | Lost to the Veil / with everyone dead | Shades caught a night | Rooms broken / ruined in 10 nights | Cracks a season |
|---|---|---|---|---|---|---|
| Balanced: reacts | 285 of 400 | 92 / 60 | 107 / 8 | 0.1 | 2.6 / 0.0 | 0.3 |
| Balanced, never moving a shade at night (`AP_NOMOVE`) | 295 of 400 | 28 / 19 against Balanced | 97 / 8 | 0.1 | 2.7 / 0.0 | 0.3 |
| Double: two to a stair, never moves | 268 of 400 | – | 128 / 4 | 0.1 | 2.6 / 0.0 | 0.6 |
| Human: reacts, at a person’s pace | 263 of 400 | 99 / 66 | 131 / 6 | 0.3 | 2.7 / 0.0 | 0.4 |
| Double at a person’s pace (`AP_LAPSES`) | 242 of 400 | – | 155 / 3 | 0.3 | 2.6 / 0.0 | 0.7 |
| Balanced, set at dusk and then only watching (`AP_WATCH`) | 0 of 400 | 0 / 397 against Balanced | 400 / 0 | 0.9 | 1.9 / 0.0 | 3.0 |
| Human, with auto-relight (on in Gentle) | 295 of 400 | 73 / 29 against Human | 95 / 10 | 0.2 | 2.7 / 0.0 | 0.3 |
| Only watching, with auto-relight | 22 of 400 | 6 / 352 against Balanced | 367 / 11 | 0.6 | 1.8 / 0.0 | 2.0 |
| Balanced, never meeting the Hollow (`AP_MEETHOLLOW=off`) | 288 of 400 | 16 / 14 against Balanced | 106 / 6 | 0.1 | 2.6 / 0.0 | 0.3 |
| Human, never meeting the Hollow | 263 of 400 | 14 / 14 against Human | 130 / 7 | 0.3 | 2.7 / 0.0 | 0.4 |

Generated by `npm run measure` on seeds 1–400, at build 5eb91c2, 2026-10-05.
<!-- /measure:night -->

**The nights of a season** (round seven, phase 8, problem 51). For each night of the season, over each plan's first year: the Unlit it brought, and the actions the plan took in it and the call-outs it made (the page's alerts), a night on average. Where the Hollow rose, how its night ended.

<!-- measure:moon -->
| Night | Unlit | Balanced: actions / call-outs | Human: actions / call-outs |
|---|---|---|---|
| Night 1 | 8.2 | 2.8 / 1.1 | 3.0 / 1.3 |
| Night 2 | 11.3 | 4.6 / 2.3 | 4.7 / 2.5 |
| Night 3 | 15.3 | 6.2 / 7.8 | 6.0 / 8.1 |
| Night 4 | 18.0 | 6.1 / 8.1 | 5.7 / 8.4 |
| Night 5 | 21.3 | 6.2 / 7.9 | 6.0 / 8.4 |
| Night 6 | 24.2 | 6.5 / 8.1 | 5.9 / 8.7 |
| The new moon (spring to autumn) | 13.2 | 6.6 / 5.5 | 5.8 / 5.5 |
| The Long Night | 14.0 | 9.5 / 12.6 | 8.7 / 12.3 |

The Hollow, on the nights it rose (driven back / crossed the Veil / withdrew at dawn): Balanced 367 / 2 / 1054 of 1423; Human 335 / 13 / 989 of 1337. First year finished: Balanced 285 of 400; Human 263 of 400.

Generated by `npm run measure` on seeds 1–400, at build 5eb91c2, 2026-10-05.
<!-- /measure:moon -->

**The campaign's goals** (problems 51 and 58): each year's goal met, of the keeps that got as far as its judging (the first year's as winter begins, the others at the year's end), for each plan as it plays and playing for the goals (`AP_GOALS`), and the keeps that came through all five years. Then what each chapter brings: how many keeps met it before its year (none, if the chapters hold) and in it.

<!-- measure:campaign -->
| Year | Goal | Balanced: met / judged | Balanced, playing for it: met / judged | Human: met / judged | Human, playing for it: met / judged |
|---|---|---|---|---|---|
| 1: The First Winter | go into winter with 20 candles put by | 110 / 183 | 162 / 183 | 92 / 169 | 144 / 166 |
| 2: The Ashen Host | break the Host's siege with a sally | 95 / 147 | 151 / 153 | 67 / 117 | 120 / 121 |
| 3: The Lantern Church | come through every inspection this year blessed, with six of the dead or more in the glass | 40 / 143 | 115 / 147 | 31 / 110 | 107 / 116 |
| 4: The Deep Rises | raise a mirror with quicksilver from the Deep | 0 / 141 | 145 / 145 | 0 / 107 | 116 / 116 |
| 5: The Long Night | come through the last Long Night | 141 / 141 | 145 / 145 | 107 / 107 | 116 / 116 |
| Five years finished | | 141 of 200 | 145 of 200 | 107 of 200 | 116 of 200 |

| What a chapter brings | Its year | Balanced: before it / in it | Balanced, playing for it: before it / in it | Human: before it / in it | Human, playing for it: before it / in it |
|---|---|---|---|---|---|
| Visitors at the gate | 2 | 0 / 162 | 0 / 166 | 0 / 144 | 0 / 143 |
| The traitor's lantern | 2 | 0 / 110 | 0 / 111 | 0 / 96 | 0 / 94 |
| The plague-bearer | 2 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 1 |
| The Host's siege | 2 | 0 / 156 | 0 / 159 | 0 / 127 | 0 / 124 |
| Ladders at the gate | 2 | 0 / 163 | 0 / 167 | 0 / 147 | 0 / 143 |
| The Gatehouse | 2 | 0 / 142 | 0 / 149 | 0 / 123 | 0 / 124 |
| The Library | 3 | 0 / 146 | 0 / 150 | 0 / 113 | 0 / 117 |
| The Hall | 3 | 0 / 147 | 0 / 152 | 0 / 116 | 0 / 120 |
| The witch-hunter | 3 | 0 / 0 | 0 / 6 | 0 / 0 | 0 / 4 |
| The Church's embargo, Inquisition or crusade | 3 | 0 / 0 | 0 / 5 | 0 / 0 | 0 / 4 |
| Down into the Deep | 4 | 0 / 0 | 0 / 147 | 0 / 0 | 0 / 116 |
| Errands below the line | 4 | 0 / 142 | 0 / 146 | 0 / 109 | 0 / 116 |
| Omens | 4 | 0 / 142 | 0 / 147 | 0 / 110 | 0 / 116 |
| The Hollow's price | 4 | 0 / 98 | 0 / 107 | 0 / 83 | 0 / 91 |
| The eclipse | 5 | 0 / 141 | 0 / 145 | 0 / 107 | 0 / 116 |

Generated by `npm run measure` on seeds 1–200, at build e6f05e2, 2026-10-06.
<!-- /measure:campaign -->

**Between keeps** (round seven, phase 16, problem 59): each plan's first year, written into a Hall of its own and left; then another keep's first year on another seed, twice, once with the first keep's dead in its glass and once with Garrick and Hesper, paired. Then the recap card's numbers over every season of the first keeps: how often each shows its commonest value, so a number that nearly always says the same thing shows as near 100%; and the new keep's comparing number. Then the deeds a first year does (most need more than a year, or a campaign or today's keep, which these keeps aren't).

<!-- measure:keeps -->
| A first year, and the next keep’s | Balanced | Human |
|---|---|---|
| First keeps whose dead went on (of those, fell / left standing) | 185 of 200 (46 / 139) | 187 of 200 (66 / 121) |
| The dead that went on, by kind (loyal, serene, pale, stranger) | 140, 129, 65, 0 | 137, 122, 60, 0 |
| On those seeds, the next keep’s first year finished: with their dead / with Garrick and Hesper | 129 / 133 (28 better, 40 worse) | 127 / 122 (44 better, 35 worse) |
| Its deaths a year: with their dead / with Garrick and Hesper | 11.2 / 12.3 | 10.6 / 11.2 |
| Every next keep’s first year finished (no dead to hand on: Garrick and Hesper) | 136 of 200 | 137 of 200 |

| The recap card’s numbers: seasons showing each one’s commonest value | Balanced | Human |
|---|---|---|
| Days held | 93% (7 of 7) | 91% (7 of 7) |
| Deaths | 24% (3) | 25% (3) |
| Shades in the glass | 27% (4) | 27% (4) |
| Raids held | 72% (3 of 3) | 71% (3 of 3) |
| The Church | 97% (blessed) | 95% (blessed) |
| The Hollow | 70% (withdrew) | 68% (withdrew) |
| Than my last keep (the next keep’s, in place of days held) | 15% (as many deaths) | 16% (1 death fewer) |

| Deeds done in a first year | Balanced | Human |
|---|---|---|
| Through the Long Night: Hold a keep through its first whole year. | 143 of 200 | 121 of 200 |
| Not one lost: Hold a season in which no one dies. | 26 of 200 | 14 of 200 |
| Out of the gate: Break a raid with a sally. | 78 of 200 | 68 of 200 |
| Quicksilver: Raise a mirror with quicksilver from the Deep. | 0 of 200 | 0 of 200 |
| Your place in the glass: Take your own place in the glass at a year’s end. | 0 of 200 | 0 of 200 |
| The dead go on: Begin a keep with your last keep’s dead in its glass. | 0 of 200 | 0 of 200 |
| The Veil sealed: Seal the Veil, and set the dead free. | 0 of 200 | 0 of 200 |
| The Veil opened: Open the Veil at the end of a campaign. | 0 of 200 | 0 of 200 |
| Five years told: See a campaign to its ending. | 0 of 200 | 0 of 200 |
| Three mornings: Play today’s keep on three different days. | 0 of 200 | 0 of 200 |
| Ten winters: Hold one keep for ten years. | 0 of 200 | 0 of 200 |

Generated by `npm run measure` on seeds 1–200, at build f35f63c, 2026-10-07.
<!-- /measure:keeps -->

**The day** (round seven, phase 10, problem 53). Each plan over two years, by year: the day's actions other than jobs (visitors answered, wards, pitch, building, decrees and the rest), raids held at the gate, the guards' share of the hands on a raid day (what holding a raid costs in work), sallies against the autumn camp, visitors paid in glass or remembrance, the Forge's arms and the Church's verdicts. Under it, the same plans posting their guards only when the Host is at the gate.

<!-- measure:day -->
| Plan | Year | Keeps | Day actions other than jobs, a day | Raids held | Guards, of the hands on a raid day | Sallies won / made | Visitors paid in kind | Arms forged, a keep | Church: blessed / warned / censured |
|---|---|---|---|---|---|---|---|---|---|
| Balanced | 1 | 200 | 2.5 | 99% | 19% | 77 / 97 | 405 | 1.3 | 743 / 0 / 0 |
| Balanced | 2 | 141 | 2.8 | 100% | 20% | 35 / 40 | 282 | 8.2 | 517 / 1 / 0 |
| Human | 1 | 200 | 2.5 | 99% | 19% | 66 / 84 | 357 | 1.2 | 694 / 0 / 0 |
| Human | 2 | 121 | 2.8 | 99% | 19% | 34 / 39 | 241 | 7.5 | 437 / 0 / 0 |

Posting guards only when the Host is at the gate (`AP_JIT`), first year finished: Balanced 135 of 200 (against 143; better on 34, worse on 42), raids held 91%; Human 121 of 200 (against 121; better on 41, worse on 41), raids held 92%.

Generated by `npm run measure` on seeds 1–200, at build 5eb91c2, 2026-10-05.
<!-- /measure:day -->

**Ten years** (round seven, phase 12, problem 55). Each plan over ten years, by year, of the keeps still standing at its end: the days with a decision by day other than jobs (repairs, wards, studies, visitors, decrees, building and the rest), the stores left at the year's end, and the days essence stood at its cap. Glass and candles stop at about 110 and 72 because the autopilot stops making them there, not because they're spent; and the decisions counted here spend the stores, but don't yet decide whether a keep lasts (problem 55).

<!-- measure:long -->
| Plan | Year | Keeps | Days with a decision other than jobs | At the year’s end: glass, remembrance, candles, stone (medians) | Days essence was at its cap |
|---|---|---|---|---|---|
| Balanced | 1 | 75 | 93% | 30, 14, 4, 3 | 17% |
| Balanced | 2 | 64 | 93% | 42, 10, 20, 1 | 15% |
| Balanced | 3 | 63 | 92% | 71, 13, 28, 1 | 31% |
| Balanced | 5 | 62 | 86% | 109, 17, 72, 2 | 48% |
| Balanced | 10 | 62 | 91% | 110, 18, 72, 1 | 47% |
| Human | 1 | 64 | 91% | 30, 12, 3, 2 | 30% |
| Human | 2 | 50 | 94% | 39, 10, 16, 1 | 16% |
| Human | 3 | 48 | 90% | 77, 15, 31, 2 | 33% |
| Human | 5 | 48 | 88% | 110, 19, 72, 2 | 48% |
| Human | 10 | 48 | 91% | 110, 17, 72, 1 | 49% |

Generated by `npm run measure` on seeds 1–100, at build 5eb91c2, 2026-10-05.
<!-- /measure:long -->

**Where the mirrors hang** (round seven, phase 13, problem 56). Each plan's first year with its mirrors hung each way, paired seed by seed with the autopilot's own (a mirror with shades in it moved where the Maws come least), and the Maws that came through a door, a keep-season. A door lets a Maw through from a keep's second season.

<!-- measure:mirrors -->
| Where the mirrors hang | Balanced: first year finished | Better on / worse on | Maws through a door, a keep-season | Human: first year finished | Better on / worse on | Maws through a door, a keep-season |
|---|---|---|---|---|---|---|
| Where the Maws come least, by the autopilot’s own rule | 143 of 200 | – | 0.01 | 121 of 200 | – | 0.02 |
| The same, and a door the black mirror names turned to the wall at dusk (`AP_TURN=forecast`) | 143 of 200 | 1 / 1 | 0.00 | 121 of 200 | 4 / 4 | 0.00 |
| The same, and on a Maw night every door in a worked room under the line turned (`AP_TURN=deep`) | 132 of 200 | 4 / 15 | 0.00 | 111 of 200 | 5 / 17 | 0.00 |
| The fullest in worked rooms, nearest the Veil (`AP_HANG=worked`) | 132 of 200 | 0 / 11 | 0.08 | 113 of 200 | 1 / 11 | 0.09 |
| Each where it was built (`AP_HANG=none`) | 131 of 200 | 0 / 12 | 0.07 | 116 of 200 | 1 / 6 | 0.07 |
| The fullest deepest (`AP_HANG=deep`) | 50 of 200 | 3 / 107 | 0.50 | 34 of 200 | 6 / 102 | 0.43 |
| As before the phase: no mirror is a door (`mirrorRooms` 0) | 143 of 200 | 0 / 0 | 0.00 | 123 of 200 | 2 / 0 | 0.00 |

Generated by `npm run measure` on seeds 1–200, at build 5eb91c2, 2026-10-05.
<!-- /measure:mirrors -->

**What each year brings new** (round seven, phase 14, problem 57). Of each plan's keeps that played a year to its end, how many kinds of event each met for the first time that year, and how many met nothing new; then each plan's first year with the phase's three rules off, and taking the cruel answers, paired seed by seed with its own. What counts as a kind is in problem 57.

<!-- measure:events -->
| Year | Balanced: keeps | New kinds a keep | Met nothing new | Human: keeps | New kinds a keep | Met nothing new |
|---|---|---|---|---|---|---|
| 1 | 75 | 30.0 | 0 | 64 | 30.1 | 0 |
| 2 | 64 | 10.3 | 0 | 50 | 10.3 | 0 |
| 3 | 63 | 4.9 | 0 | 48 | 5.1 | 0 |
| 4 | 63 | 3.0 | 0 | 48 | 3.0 | 0 |
| 5 | 62 | 2.5 | 0 | 48 | 2.4 | 0 |
| 6 | 62 | 2.4 | 0 | 48 | 2.3 | 0 |
| 7 | 62 | 2.3 | 0 | 48 | 2.2 | 0 |
| 8 | 62 | 2.2 | 0 | 48 | 2.2 | 0 |
| 9 | 62 | 2.2 | 0 | 48 | 2.2 | 0 |
| 10 | 62 | 1.1 | 0 | 48 | 1.1 | 0 |

Kinds of event in the build: 70. Met by at least one keep in ten years: Balanced 63, Human 64; by none, `priest`, `necromancer`, `hunter`, `crusade`, `inquisition`.

| First year | Balanced: finished | Better on / worse on | Human: finished | Better on / worse on |
|---|---|---|---|---|
| The rules as they are | 75 of 100 | – | 64 of 100 | – |
| As before the phase (`cruelty`, `moreOmens` and `yearVisitors` 0) | 76 of 100 | 10 / 10 | 66 of 100 | 14 / 14 |
| Taking the cruel answer where it helps (`AP_CRUEL`) | 74 of 100 | 1 / 3 | 64 of 100 | 1 / 2 |

Generated by `npm run measure` on seeds 1–100, at build 5eb91c2, 2026-10-05.
<!-- /measure:events -->

- **Raids with traits** (before raids were fought): when traits went in, 86% held for the balanced plan, against 90% without them (and 58% before the two-room start). Traits first cut it to 75%. No one trait did it: Wil (a Coward) and Nell (Gentle) guarded at half strength, Tam (Devout) at ×0.8 off the Chapel, Ada (Brave) fell twice as often, which thinned the gate for the next raid, and the Greedy ate double. The Gentle's and the Greedy's costs now fall elsewhere: the Gentle grieve harder, and the Greedy work ×0.8 away from the Glazier and the Chandlery. The Coward and the Brave keep theirs, since the gate is what they're about. Guards stand only on raid days, when every free hand goes to the Barracks.
- **Season 2, a summer** (200 seeds, two seasons): the balanced plan finishes 184 of the 194 second seasons it reaches (95%), the keeper 181 of 193 (94%), the mourner 177 of 190 (93%) and Double 188 of 192 (98%).
- **The original four-floor start** (`startFloors` 4 in Settings), same rules, 200 seeds and two seasons: every plan finishes 93–97% of first seasons. Of the second seasons (summers) they reach, the balanced plan finishes 191 of 193 (99%), the keeper 183 of 186 (98%), the mourner 188 of 193 (97%) and Double 185 of 194 (95%). Before raids were fought the doubled line finished only 179 of 199 here, and the Weepers cost it most (problem 14).

## Not done

- The sounds are mine and nobody has heard them yet but a meter. Each was rendered offline in Chromium and its level set by measurement: alarms at -16 dBFS over their loudest 400 ms, events at -20, small sounds at -27 and beds at -30, measured above 300 Hz (roughly what a phone speaker plays) unless the full range is over 6 dB louder. Whether they sound good, or wear thin over a season, needs ears. Not tried on a real phone; on an iPhone the silent switch may mute them. Vibration works only where the browser allows it (Chrome on Android, and so the Play Store app); iPhones and iPads don't.
- The season saves to this browser only: its three keeps, the Hall of Keepers and its preferences. On `rcjlabs.github.io` they share the site's storage (about 5 MB) with any other RCJLabs page, and a preview build keeps its own, apart from the release's. Only the season installs and plays offline.
- A keep's playtest export replays only through its second year: from the third, its save holds its last two years of actions, not every one since the first day (problem 43). A campaign keeps them all until its ending, since a chapter begun again replays from the first day.
- A playtest export replays through the rules of the version that loads it. One from an older version can come out differently or fail to load (the page says why); a save file, from Export in Saves, loads as it was.
- Checked with the tests, the soak runs and scripted click-throughs in Chromium at desktop and phone widths, including the bundled season file, the guide, the installed app with its server gone, and saves from the previous version. Not tested on a real phone, in Safari, or with a screen reader. The night stages and the pixel test are pointer-only. The season's pinch zoom was tested with synthetic touch events, not real fingers, and the Install button with a synthetic install prompt.
