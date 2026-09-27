# Afterglass prototypes

Playable slices of [Afterglass](../docs/brainstorm/round-3/README.md). Each tests one question from the plan and records the answer as you play. The first two are greyboxes in plain shapes and text; the pixel pass is the first art; the season slice joins all three.

| Page | Plan | Question |
|---|---|---|
| [`index.html`](index.html) | Weeks 1–2: two rosters and the Rite | Does a death feel like a loss and a hire at once? |
| [`night.html`](night.html) | Weeks 3–4: the night on its own | Is the night fun without the day? |
| [`pixel.html`](pixel.html) | Weeks 5–6: the pixel pass | Can players read the Tain on a phone? |
| [`season.html`](season.html) | Weeks 7–10: one season | Do people want to play a second season? |

All four are live on GitHub Pages at https://rcjlabs.github.io/Base-Manager/ (every push to `main` runs the tests and deploys).

## Run it

```sh
cd prototype
npm test                        # 113 tests: rules, replay, building, traits, save and load, save slots, sound cues, soak runs, the pixel quiz, the people sprites, colour-blind eyes, the app's file list (Node 20+, no dependencies)
npm run serve                   # then open http://localhost:8080, /night.html, /pixel.html or /season.html (any static server works)
npm run bundle                  # dist/afterglass-greybox.html, -night, -pixel and -season.html: single files that open from disk
npm run balance -- 20 40        # weeks 1-2 autopilot report: 40 seeds x 20 days per policy
npm run balance:night -- 8 30   # weeks 3-4 autopilot report: 30 seeds x 8 nights per plan
npm run balance:season -- 100 1 # weeks 7-10 autopilot report: 100 seeds x 1 season per plan (try 200 2 for season 2)
npm run icons                   # redraws the season's app icons into icons/ (they're committed; only needed when the art changes)
```

The pages load ES modules, so they need a web server; GitHub Pages works as is. The bundles have no such limit. A bundle can't install as an app: it drops the manifest and never registers the service worker.

## Files

| File | Job |
|---|---|
| `src/data.js`, `src/night-data.js` | Content and every tuning number for each greybox |
| `src/sim.js`, `src/night.js` | Each game as one JSON state. `step()` / `stepNight()` is one fixed tick (10 a second); `act()` / `actNight()` is one player action. No DOM, no clock, no `Math.random` |
| `src/ui.js`, `src/night-ui.js` | Render the state and change it only through the act functions |
| `src/autopilot.js`, `src/night-autopilot.js` | Crude players for tests and balance runs |
| `src/px/` | The pixel pass: `kit.js` (palette and drawing primitives from the round-three mockups), `lut.js` (the palette lookup and dithered light), `scene.js` (geometry, cameras, the quiz), `draw.js` (the art) |
| `src/pixel-ui.js` | The pixel page: day, crossing, night and the readability test |
| `src/slice/` | The season slice: `data.js` (content, tuning and the traits), `geo.js` (the geometry of any keep the player builds: floors, stairs, light, routes and cameras), `sim.js` (the whole season as one state), `autopilot.js`, `draw.js` (the art, built on `src/px/`), `people.js` (the living and the dead as pixel figures), `book.js` (the Book of the Dead's pages), `saves.js` (the save slots, and loading a keep from a file), `sound.js` (every sound, made with Web Audio as it plays), `threats.js` (the black mirror: tonight's threats, read at dusk) |
| `src/slice-ui.js` | The season page |
| `sw.js`, `season.webmanifest`, `icons/` | The installable season: the service worker that keeps it playable offline, the manifest, and the icons `tools/icons.mjs` draws |
| `test/` | 16 weeks 1–2 tests, 15 night tests, 8 pixel tests, 39 season tests, 13 for traits, 11 for the save slots, 6 for sound, 10 for the black mirror, 7 for breaking mirrors, 7 for fire, 3 for the people sprites, 1 for colour-blind eyes and 2 for the installable app, including soak runs |
| `tools/` | Balance reports, the single-file bundler and the icon drawer |

Everything is seeded and every action is logged, so `replay()` (in `src/sim.js` and `src/slice/sim.js`) and `replayNight()` rebuild any session exactly, including one from a playtester's export.

## Weeks 7–10: one season

The vertical slice: seven days in one keep, ending on the night of the new moon, when the Hollow rises. The weeks 1–2 day, the weeks 3–4 night and the weeks 5–6 art run as one game, with raids that escalate, fire by day, Maws from night 3, and the Lantern Church's first inspection. The keep starts as two rooms, the Hearth and the Crypt, and you build the rest a room at a time. The question is **do people want to play a second season?** The page asks it when the season ends (or the keep falls), with a box for why, and saves the answer in the playtest export. It installs as an app and plays offline.

**Problems it has already shown.** From autopilot runs (100 seeds for one season, 200 for two), scripted runs in Chromium and my own reading of the rules. Nobody else has played it yet.

1. **The doubled line no longer wins. The night collapsed onto the line's floor instead; that's fixed in part.** The `double` plan posts two fighters on each stair up to the Veil on every Maw night and never moves anyone. It used to be the best plan. Two changes ended that, all figures over 200 seeds:
   - **Maws that break what a line leaves bare** (problem 2). On the original four-floor keep they reversed the doubled line's lead over two seasons. It used to finish 133 second seasons against the balanced plan's 116; with the new Maws it was 116 against 123.
   - **An autopilot that stopped making two mistakes.** On a keep built from two rooms the doubled line still won, 174 second seasons against 138. The balanced plan was pulling reinforcements across a dark floor during each tide, and posting shades in rooms below the line's floor, out where the tides and the Maws come up. Fixing either helped (over 100 seeds, 72 second seasons became 79 and 81), and fixing both levelled it. The doubled line now finishes 179 second seasons and the balanced plan 176, within noise. On the four-floor keep the balanced plan is ahead, 179 against 171. The Hollow gap closed with the same two fixes: it gets through in 25 of the balanced plan's 99 finished first seasons, down from 65 of 95.
   - **What that exposed.** The best play, reacting or not, kept nearly everyone on the line's floor and worked the rooms there. Below it only the Choir's essence was worth a shade's risk at night: my autopilot leaves the Cold Forge, the Silvering, the Wick Room and the Threshold unworked whenever they're below the line, and did better for it. So on a built-up keep most twin rooms' night jobs didn't matter.
   - **Traits put the doubled line ahead again, and it was my autopilot again.** With traits, Double led the balanced plan by 13–15 second seasons in about 190 on the two-room start. Almost all of it was one night: the balanced plan lost 14 of its 180 second new moons, Double 1. The balanced plan warded the line against the last tides of nights 5 and 6. That spent the essence it then needed to ward the stairs against the Hollow: it reached the new moon's dusk with 32 essence against Double's 47, and the Hollow got through 50 times against 14. It now keeps enough to ward every stair before it wards a tide. The Hollow then got through 11 times in 179.
   - **Settled over 1,000 seeds.** On the two-room start the balanced plan finished 932 of the 982 second seasons it reached (94.9%) and Double 938 of 990 (94.7%): a tie, so the lead of 10 in 200 was noise. With the Unlit going around lights (next) and fire by day, over 200 seeds Double finishes 183 second seasons of 200 and the balanced plan 173 of 196, about 1.5 standard errors apart. On the four-floor keep the balanced plan leads, 180 of 198 against 177 of 199.
   - **Why the night collapsed, and a partial fix.** A room lit below the line stood alone across the Unlit's way up. A candle lights 40 of a room's 48 steps, and the way up runs between stairs through the middle of each room, so no candle there can stay off it. A Creeper cut off by the line gnawed the first light on its shortest way, so one shade in a room below took a whole tide. With my autopilot working every room below the line, its shades there lost 10 memory a season on night 6 to Creepers catching them at their own posts, their candles gnawed out. The line-only plan's shades below the line, the Choir's singers, lost 0.2.
     - **What didn't work** (balanced plan, 200 seeds, second seasons of about 197 reached, against 185 for line-only play): paying for the risk, with up to double the night's work a floor down (171–172) or a day bonus for rooms worked through the night (173–175, against 189–190 for line-only play with the same bonus); retreating to the line for each tide (172); holding the line a floor lower (93 and 103, of about 180 reached).
     - **What did:** where the Unlit gnaw. They now take any dark way up, however long, and gnaw only a light that bars every way (`goAround`, a switch in Settings, on by default). Balanced plan, 600 seeds, second seasons, working the rooms below the line on the Choir's side of the keep (`AP_BELOW=1`) against line-only play, measured before fire by day:

       | | Line only, before | One side below, before | Line only, now | One side below, now |
       |---|---|---|---|---|
       | Two-room start | 564 of 591 | 493 of 581 | 557 of 592 | 546 of 591 |
       | Four-floor keep | 577 of 599 | 567 of 598 | 570 of 600 | 556 of 597 |

     - **What it means.** On the two-room start, working below the line cost 10.6 points of second seasons (6 standard errors). Now it costs 1.7, and on the four-floor keep 1.9, where it already cost 1.5. Pooled, that's about 2 points at 1.8 standard errors: probably a small real cost. So working below the line is now a near-even trade on both keeps instead of a clear mistake on the built one, but it doesn't pay. The rule may also make the game about a point harder (1 standard error on each keep).
   - **Guarding the line: tried, and switched off.** With `lineGuard` on in Settings, a shade in the light of a candle that reaches the foot of a stair up to the Veil guards the line: it fights and keeps the Watch, but does no other work, and a room on that floor has to be worked under a candle of its own, away from the stair. With the autopilot as it was, on the two-room start (60 seeds), it took the balanced plan from 92% of first seasons to 73% and its raids held from 91% to 72%. Its essence fell from 53 a season to 10: its line holder in the Choir stopped singing, and its other singer spent each tide crossing the floor to the far stair. I'd guess the lost essence was lost gate wards and so lost raids, but the raid log doesn't record wards. The doubled line went from 98% to 95%. Without the Watch exception it was 45% against 92%, and building a Granary on the line's floor instead of the Chapel made both plans worse again (50–52% and 72–85%).
2. **Maws break rooms now, and the haunting costs Dread, not work.** The design doc's Maws break twin rooms, and a broken twin haunts its day room. Mine now do that: a Maw that stands in a room for 12 seconds breaks it, and nobody works there for the rest of the night. I first had nobody work in the haunted day room the next day. On the four-floor keep, with the autopilot as it was, that decided seasons through one room: the Wick Room broken on night 6 left too few candles for the new moon, and the balanced plan's finished first seasons fell from 95% to 67%. Even letting them work at 75% cost 10 seasons in 100, so the new moon is on a knife-edge for candles, a flaw of its own. A broken room now costs 1 Dread at dawn (`dreadPerBroken`), and the day room is haunted in name and picture only. `hauntWork` in Settings brings the lost work back.
3. **The two-room start is balanced for my autopilot's build order, and it's sensitive to that order.** Building a Barracks, then a Chapel, then a Chandlery, the balanced plan finishes 99% of first seasons. With the Chandlery before the Chapel it finished 30% at one point, with the autopilot as it was then, because where the Chapel lands decides whether its singer stands on the line's floor or alone below it. A person's order is untested. To make the start playable:
   - rooms cost 6 stone, not 8;
   - a keep starts with 8 stone, not 4, so the first room goes up at once;
   - six of the eight living start in the Yard, since their rooms don't exist yet.

   Older saves keep the four floors they started with, and still replay.
4. **Maws take 8 seconds to climb out of their rift.** In a keep of one or two floors the line stands at the rifts' mouths. In the first two-room runs every plan lost the Veil by night 4 on the seed I traced, where a Maw spawned beside the line's candle and tore it down three times before anyone could move. The rise is a warning (a message, and the clock pauses) and a window to answer it. I added it together with the change to staffing, so its effect alone isn't measured.
5. **My autopilot plays better than it did, so its numbers aren't comparable with earlier ones.** The reacting plans now:
   - pull a second fighter to each stair for each tide, only from that stair's own room, and send it back after;
   - ward the line's stairs for the last tide of nights 5 and 6 when they have the essence;
   - post nobody below the line's floor at night, except in the Choir (`AP_BELOW=1` also works the rooms below the line on the Choir's side of the keep, leaving the other side dark);
   - keep enough essence to ward every stair against the Hollow before warding a tide;
   - read traits: the Brave to the gate and Cowards to the Yard, the Devout, Gentle and Greedy to the jobs they're best at, Wistful shades to rest and Hoarding ones to sing, and at dawn cover whichever shade is worth least per point of Dread. `AP_BLIND=1` plays as if nobody had a trait.

   Every plan stands guards only on raid days (the rest quarry) and builds in a fixed order. Without the tide reaction and the wards, the balanced plan finished 86% of first seasons on the two-room start.
6. **Both seasons may be too easy.** With the autopilot playing sensibly, every plan finishes 95–100% of first seasons. On the two-room start the balanced plan finishes 88% of the second seasons it reaches (173 of 196), the keeper 80% (156 of 194), the mourner 87% (173 of 198) and Double 92% (183 of 200), each about ±5. Fire by day took each of them down 5 to 14 second seasons (problem 13). A first-timer will do worse than a script that knows the rules, but by how much is unknown. If people come near these numbers, the game needs to be harder. Raids, Creeper counts and the Hollow are ×1.2 a season (`hardness`); Maws stay as they were (`mawHardness` 1), since a stronger Maw hurts a player who answers it more than one who stacks the line. The target, harder than season 1 but not a coin flip, is my guess at "harder but fair", and every knob is in Settings.
7. **The Hollow gets through about one new moon in twenty, one in four for the mourner.** It reaches the Veil in 4 of the balanced plan's 98 finished first seasons, is driven back in 16 and withdraws at dawn in 78. It was 25 before the autopilot kept essence for it (problem 1). The mourner, with fewer shades, lets it through in 24 of 98, and the doubled line in 7 of 100.
8. **Traits don't yet make the rite a choice, as far as the autopilot can tell.** Keep or cover was a Dread valve: shades were interchangeable, and the living bore most of what you kept. Traits make each shade different, and `AP_BLIND=1` runs the autopilot as if nobody had a trait, so I could measure whether reading them pays. Balanced plan, 200 seeds, two seasons, second seasons finished:
   - **Reading traits:** 173 of 196. **Blind:** 172 of 192. Within noise, as it was before fire (182 of 198 against 185 of 195) and before the Unlit went around lights (178 of 193 against 175). At a harsher Dread (one borne per 4 living), 171 against 172.
   - **A claim I got wrong.** I first measured a lead of about 10 for reading traits under the harsher Dread, and made that Dread the default. The lead came from the autopilot's new-moon mistake (problem 1) and vanished once that was fixed. The harsher Dread made every plan finish a few points fewer second seasons and didn't clearly widen the gaps between them, so it's back to one per 3 (`dreadLivingPer`, in Settings).
   - **My first traits failed another way.** Cheerful and Wistful eased Dread and most living traits were pure gains, so every plan got easier. They're now trade-offs, and roughly neutral: 178 second seasons of 193 with traits against 181 of 194 without.
   - **What traits do change** is which shade costs what: a Bitter one 3 Dread, a Hoarding one candles, a Reckless one its memory. Whether that changes what people choose, or how the rite feels, is for the playtest.
9. **Shades are hard to find in the dark.** They're 6 by 12 pixel silhouettes (18 by 36 CSS pixels at 3×) with a faint glow, and the Unlit show only their eyes. In the default reflection camera they hang upside down, as the Tain does; the flipped camera shows them upright.

   **Colour blindness, checked in simulation only.** The risk I'd listed, Creeper red against Stranger green, turned out to be the lesser one: a Stranger is a horned, glowing silhouette with eyes at head height, and a Creeper is two dots near the floor. The worse problem was that red eyes on a dark night all but vanish with protanopia or deuteranopia, and a Creeper in the dark is nothing but its eyes. Each Unlit eye now has a pale glint over the red that stays bright whatever the colour vision (a test checks its contrast in four simulations), so a Creeper reads as two small upright marks. A gnawing Creeper's eyes still say so only by turning orange, which shows as a brighter olive to someone who can't see red. None of this has been checked by a colour-blind player.
10. **On a phone, the panels cover most of the castle.** Dusk and dawn open a sheet over about two-thirds of the screen. Close it to look, or play on a wider screen, where the panel is a drawer beside the castle.
11. **The guide, the crossing and the Book are untested with people.**
    - **The guide** is 13 cards of my text, each shown once, when its moment first comes. The first raid, the first night, the Church, the first Maw and the new moon pause the clock. Whether a newcomer can play from the cards alone is the question.
    - **The crossing** adds about 5 seconds to each dusk. A tap, space or Enter skips it, and reduced motion turns it off. A tap on the castle while it runs only skips it.
    - **The Book's pages** are sentence templates filled from the ledger, so their shapes will repeat within a few seasons.
12. **Breaking a mirror doesn't pay when it's used blindly.** Measured with the keeper plan, which never covers and so meets a censure about once a season. Two seasons, 100 seeds; `AP_BREAK=1` breaks the smallest mirror that stops each censure:

    | | Mirrors broken | Censures | Sickness deaths | Second seasons |
    |---|---|---|---|---|
    | Never breaks | 0 | 1.11 | 1.88 | 86 of 99 |
    | Breaks to stop every censure | 0.72 | 0.38 | 2.11 | 80 of 99 |
    | The same, with no bad luck | 0.73 | 0.36 | 1.84 | 84 of 99 |

    Breaks replace censures one for one and inspections don't come more often. Without the bad luck, breaking is about even with a censure; the extra sickness makes it a little worse. Over 200 seeds it was 158 second seasons against 170, milder bad luck (1.5×) 160, and two Dread off per shade 156. It should pay when the censure would carry off more shades, or better ones, than you'd free. My autopilot fills its mirrors evenly, so that case never comes up, and a person's choice of which shades to lose is untested. The balanced plan never needs it.
13. **Fire makes both seasons harder, and adds only a few deaths when it's fought at once.** The autopilot sends the Yard to every fire the moment it starts, and rings the bell if the fire is still gaining. Two seasons, 200 seeds, second seasons finished, with fire off and on:

    | | Balanced | Double | Keeper | Mourner |
    |---|---|---|---|---|
    | Fire off | 182 of 198 | 188 of 198 | 170 of 197 | 183 of 195 |
    | Fire on | 173 of 196 | 183 of 200 | 156 of 194 | 173 of 198 |

    That's about 2 fires a season, fewer than one in twenty burning into the night, and 0.14–0.18 deaths in them per two seasons. Deaths of every kind rise by 0.2–0.5 per two seasons. My first version had only the Yard to send, and most Yards were empty once rooms were built, so half the fires burned all day and a scorched Hearth meant a hungry keep. The bell fixed that. How many deaths fire brings for a slower player, and so how many more choices at the rite, is for the playtest.
12. **Installing has limits I can't test here.** I checked it in Chromium only: it's installable, every file is cached, and it plays with the server gone.
    - Safari on an iPhone has no install prompt, so the page says Share, then Add to Home Screen. I haven't checked whether iOS honours full screen.
    - Google Play, as a Trusted Web Activity, needs Digital Asset Links at `https://rcjlabs.github.io/.well-known/assetlinks.json`. That's the root of the domain, which a project site like this can't serve. Without it the app shows a URL bar. The fix is an `rcjlabs.github.io` repository or a custom domain.
    - The worker goes to the network first on every load, so a deploy shows at once. On a slow connection, though, the app waits for the network before it falls back to its copy.
13. **Building is a first pass.**
    - **The numbers are guesses:** 6 stone a room, three workers a room, 2 stone a day from each mason, 8 to start, and one floor to start. All are in Settings.
    - **A small keep has a short Tain.** With one floor, the rifts and the mirrors share it and the line is two candles between them. With two, the line's stairs stand 4 pixels from the rifts. Each floor you build puts another floor between the rifts and the line.
    - **Stair placement nearly made building a trap.** My first stairs for a built floor came up mid-room, where the candle lighting that room also lights the stair's top. Creepers then gnaw that candle from the floor below, where no shade in the light can reach them. A built floor's stairs now come up by the walls. The rule underneath is old: a candle that lights any stair's top can be gnawed from below, and players can still walk into it with their own candles.
    - **Rooms go up in order:** into the top floor's bare hall, else as a new floor. There's no choosing a slot and no tearing a room down, and the keep tops out at 11 floors.

**How a season plays**

- **The screen.** The castle fills the window at the largest whole-pixel scale that fits: 3× on a 390-pixel phone, up to 6× on a desktop. By day it's the keep on its lake. From dusk to dawn it's the dark keep above the Veil with the Tain below it, the keep's reflection, where the night happens. The camera slides between the two.
  - **The HUD** on top shows the phase, the clock, play and speed, the stores, Dread and the Veil.
  - **The bar** at the bottom holds the tools for the moment (Candle, Move, Ward, Hush, Flip, or the phase's next step). It also opens four panels: this phase (Day, Crossing, Dusk, Night, Rite or Season), People, Records, and the Menu. Panels are a sheet from the bottom on phones and a drawer on the right on wide screens. They open by themselves when a decision is waiting, at the crypt, the rite and the season's end.
  - **Zoom and pan.** Pinch or the mouse wheel zooms in whole-pixel steps toward your fingers or the pointer, from 1× to 10×. Dragging pans, and a tap still acts, since it's judged on release. The +, − and Fit buttons at the right edge do the same. Panning stays near the castle and resets when day turns to night.
  - **Keys:** space, 1, 2 and 4 for time; C, M, W, H and V for the tools; + and − to zoom, 0 to fit, arrows to pan; K, P and R for the panels; L for room names; S for sound; Esc closes a panel, or opens the Menu when none is open.
- **People** are 6 by 12 pixels (10 for the young, 11 and stooped for the old). They're dressed by their job: the guard in a helm and crimson tabard with a spear, the priest in a hood and robe, the cook in a cap and apron, the healer marked with a red cross. Hair, beard and skin come from each name. By day each works a station in their room and now and then walks a few steps. The shades are the same bodies as dark silhouettes with glowing eyes; their feet thin into a wisp, and the Loyal wear a helm, the Serene a hood and Strangers horns.
- **Day** (60 s at 1×). Eight living, and at first only the Hearth to work in: two cook, and the other six quarry stone in the Yard until their rooms are built. A job needs its room. The Chandlery makes the night's candles, the Chapel's priests hold funerals and bear Dread, and thanks to a Granary, raiders who break in take only half as much food. Raids come on days 2, 4 and 6 at strength about 4, 7 and 11 (±1.5). War banners go up over the turrets when one is on the road. Sickness, old age and an empty larder kill as before, and a newcomer arrives every second day. Jobs are in People; pick a name there, then tap a room on the castle, or use the job list. A room a Maw broke the night before is haunted for the day: a cold light and one of the dead drifting through it.
- **Fire** (by day). On about 3 days in 10 (twice as often in a broken mirror's bad luck) a Hearth or a Forge catches fire at some hour. The Day panel opens on it and the clock pauses.
  - Its heat grows 10% a second, and everyone working in the room fights it, taking off 4% each. So a Hearth's two cooks lose, slowly, and the room does no work while it burns.
  - **Send the Yard** puts the masons on it, which costs only their stone. **Ring the bell** sends everyone well, and stops all work while it burns.
  - Fighting it can kill: each fighter's chance is 2% a second times the heat squared, and those who die in it die on duty and wake Loyal.
  - At full heat it catches a room beside it or over or under it every 10 seconds. A fire still burning at dusk scorches its room: nobody works there the next day.
  - Keeps from before fire play on without it (`fire` in Settings, under Advanced).
- **Building** (by day). The keep starts as its ground floor, the Hearth and the Crypt, with 8 stone. Masons in the Yard quarry 2 stone a day each; they work on the roof. The Build list (the bar's Build button, or B) shows what 6 stone raises and where it goes. A room goes into the top floor's bare hall, or starts a new floor on top with a bare hall beside it. Each room holds three workers, so a second Barracks lets more guards stand. You can build any of the original rooms but the Crypt, as many as you like, and two new ones:
  - **the Forge.** Its smiths add 1 defense each. Its twin, the Cold Forge, makes grave-steel: a shade who forges through half the night makes every shade fight 25% harder the next night.
  - **the Cellar.** It keeps half the candles and glass from raiders who break in. Its twin, the Hollow Cellar, is a dark weak spot.

  By night, whatever was built last is the Tain's deepest room, beside the rifts, and the Creepers' climb is a floor longer. The camera fits the taller keep, down to 3× on a desktop; on a phone it stays at 3× and you pan up.
- **Dusk** (paused). The crossing:
  1. The sun sets over the keep and its lights go out.
  2. At the crypt you choose funerals, then wake the dead. Their souls sink through the Veil into the Waking Room of the Tain, or rise away for a funeral.
  3. The camera follows them down.
  4. You set candles, post shades on the Tain (reflected or flipped upright) and begin. The Dusk panel lists when tonight's tides are due. On the two dusks before the new moon it also says what warding every stair against the Hollow will cost, against the essence in store, so it isn't spent on the tides first.

     **The black mirror**, in the Dusk panel, reads the night from what you've set so far. Tonight's spawns are rolled when the day ends, so it can say exactly:
     - where each rift's tide will go: the light it will gnaw, a mirror left open, or a shade it will catch in the dark on its way;
     - where the candle hunters go, if that's elsewhere, and how many may seep up and in which rooms;
     - what a Maw would make for, and the Hollow's way on the new moon with the wards on it;
     - how big each tide is, and tomorrow's raid (rolled when the day begins, so a range) against the gate as it's manned now.

     The same ways are drawn on the Tain while you place: chevrons marching up each rift's way, an ✕ where they'll gnaw, a ring on a mirror they'll reach, a ! over a shade they'll catch, a sparser pink way for candle hunters, orange brackets on the Maw's mark, and violet for the Hollow. Shapes differ as well as colours, and with less motion nothing marches. It asks the Creepers' own planner, so it's exact for the moment it's read; once the night begins, candles burn down and shades move. Settings can hide the ways.
- **Night** (120 s at 1×). The weeks 3–4 engine on this keep's Tain: a floor of twin rooms for each floor you've built, 2 stairs between each pair of floors, 2 rifts in the deepest floor, 2 mirrors under the Veil. In a keep of one floor the rifts and the mirrors share it, and the line is two candles between them. Every twin room has its job for a lit shade at its post:
  - the Choir sings essence, and a shade that sings through half the night calms one Restless shade;
  - the Silvering makes glass;
  - the Wick Room saves candles for the next dusk;
  - the Threshold readies guidance, so the next sickness or neglect death wakes one kind better;
  - the Watch adds to tomorrow's defense;
  - the Cold Hearth halves fading.

  The Unlit take any dark way up, however long, and pass lit rooms by; only when every way up crosses light do they gnaw, at the light that bars the way (`goAround`, a switch in Settings). So a room worked below the line is safe from the tides while the other side of the keep stays dark, and the line takes the whole tide on that side. Light both sides and the rooms below take the gnawing, one shade each.

  Wraiths rise in the Waking Room and hunt; cutting one down banishes it for good. **Maws** come from night 3, one a night with the last tide, but none on the new moon. A Maw:
  - takes 8 seconds to haul itself out of its rift, and can be hit meanwhile;
  - weighs the candle barring the way to a mirror (worth three workers to it) against every twin room where the living work by day or the dead by night (worth their workers), counts every fighter at each and on the way there, and goes for the most worth for the least fight;
  - keeps to its choice once it's on that floor, or unless something else becomes worth twice as much, and shows it: brackets on the room, or a ring on the candle, and a note in the Night panel;
  - walks through light, tears a candle down, and breaks a room by standing in it for 12 seconds: nobody works there for the rest of the night, and the keep pays 1 Dread at dawn;
  - drains any shade beside it, and has 6 strength, so two shades fighting it cut it down fast and one Loyal shade can just about hold it;
  - is held below by a ward on a stair.
- **Dawn: the Rite** (paused). Keep or cover, release or bind, banish or leave, as in weeks 1–2. Fading happens, and names and remembrance can be bought, as in weeks 3–4. Each Veil crack from the night adds 1 Dread, and so does each room a Maw broke.
- **Breaking a mirror** (at any time, asked twice). Everyone in it goes free at once, as if covered: +1 remembrance each, and their bonded living at peace. Dread falls 1 for each, which covering can't do, so breaking one before noon can turn a censure into a warning. At night it frees a caught shade from the Creeper's grip, and a freed Wraith leaves the Tain. The mirror is lost, and the next 7 days are unlucky: sickness comes twice as often, carried into the next season if need be. The Day panel's mirrors have a Break button, the Rite opens a Break a mirror section by itself when the inspector is coming, and the Night panel offers it for a caught shade.
- **Day 5: the Lantern Church.** It is announced the dawn before, and it comes again the same day whenever Dread reaches 5. The inspector judges Dread at noon:

  | Dread | Verdict |
  |---|---|
  | 0–1 | Blessed: +3 candles and +2 remembrance |
  | 2–3 | Warned: a tithe (5 essence, else 5 remembrance, else 3 candles) and Dread −1 |
  | 4–5 | Censured: the fullest mirror is covered and carried off with its shades, and Dread drops to 2 |

  Vigils by day lower Dread at once.
- **Night 7: the new moon.** It brings fewer Creepers, no Maw, and the Hollow, which:
  - walks toward the nearest mirror whatever the light;
  - eats candles near it and drains shades beside it;
  - is held by a ward on a stair for 20 seconds, then breaks it;
  - can only be driven back by shades fighting it (+3 remembrance);
  - if it reaches the Veil, cracks it and takes one of the living, leaving no body to wake.
- **Traits.** Everyone living has one of eight, which helps or hinders at a job; death turns it over into what the shade does at night (round three's pairs). People, the crypt at dusk, the rite and the Book show them, and the guide explains them at the first dawn. They switch off in Settings, under Advanced (`traits`).

  | In life | By day | In death | At night |
  |---|---|---|---|
  | Brave | guards ×1.5; falls at the gate twice as often | Reckless | lunges further and fights ×2, but loses memory twice as fast |
  | Coward | guards ×0.5; never falls at the gate | Lurker | unseen by Creepers and Wraiths, so never caught; fights ×0.25 |
  | Devout | ×1.5 in the Chapel, ×0.8 anywhere else | Bitter | costs 3 Dread to keep; while it stays, wards cost a fifth |
  | Diligent | ×1.15 at any job | Tireless | works ×1.6, but never rests and never works as a twin |
  | Gentle | ×1.5 healing in the Infirmary; grieves harder (works ×0.6 while grieving, not ×0.8) | Keening | calms two Restless shades a night, wherever it stands |
  | Greedy | ×1.25 at the Glazier or the Chandlery, ×0.8 anywhere else | Hoarding | ×2 essence in the Choir, but pockets 2 candles every dusk while the store holds more than 4 |
  | Stubborn | sickness kills them half as fast | Anchored | fades half as fast |
  | Cheerful | never grieves | Wistful | resting the night through in the Cold Hearth, sends good dreams: the living work ×1.15 the next day |

  The cast has each trait once. A newcomer's comes from their name and the seed, not the random stream, so a seed plays the same raids and sickness with traits on or off. Older saves give everyone the trait their name draws.
- **The end.** A season summary, the question, and **Begin season 2**. The keep carries its living, shades, stores, mirrors and Dread into the next season, and the Veil starts whole. Raids, Creepers and the Hollow are ×1.2 stronger each season; Maws stay as they were.
- **Records.** The Book of the Dead has a page for everyone who has died in this keep, grouped by season. A page tells who they were, how they died and what they woke as, the nights they served and where, what they cut down, and how it ended. Records also holds the log, each day's numbers and the playtest export.
- **The Menu** pauses the season while it's open and plays on when it closes.
  - **Settings:** pausing for raids, the guide, the Tain reflected or upright, room names, the Unlit's ways at dusk, motion (as the device is set, less or full), sound, the keys, and installing. The playtest numbers are under Advanced. Numbers you haven't set there follow the current version: a save from an older one takes the new defaults when it loads, and says so. Starting a new keep keeps only the numbers you set.
  - **Saves:** three keeps, each saved as you play, listed with season, day, rooms, the living and the shades. Continue, New keep, Start over and Delete (the last two ask first). Export writes a keep to a file, and Load a file takes it back into any slot, on this device or another; it also takes a playtest export and replays it. The page opens the keep played last, and the single save from before slots becomes keep 1.
- **Sound and vibration.** Every sound is made as it plays, with Web Audio: there are no sound files, so nothing more to download or cache. The sim raises a cue for what happens (45 kinds: the phases, raids, deaths, wakings, candles set and going out, the Unlit seeping up and being cut down, Maws, the Hollow, cracks in the Veil, building, the rite), and the page plays it, panned to where it happened. Bells ring for the phases and the dead, glass for the mirrors and the Veil; the Unlit hiss, growl and crack. Under each phase lies a bed of sound: wind and water by day, a drone in the Tain at night that opens as the Unlit gather, a slow chord at dusk and at the rite. While the Hollow walks, a heartbeat quickens as it nears the mirrors. On Android phones, candles tick and raids, deaths, cracks and the Hollow vibrate.
  - Settings has sound on or off (also S), effects and ambience volume, vibration, and a list to hear what each sound means.
  - Sound starts with the first tap or key (browsers allow nothing sooner) and stops while the page is hidden.
  - The cues are a side channel: the rules never read them, a keep without a page listening never collects them, and saves drop them, so replays and the autopilot are unchanged (tested).
- **The guide.** The intro offers to begin with a guide or without. With it, a card above the bar explains each thing the first time it happens, and pulses the button or the spots on the Tain it means. Settings turns it off, or on again from the start.
- **Installing.** In Chrome, Edge and Samsung Internet, an Install button appears in the intro and in Settings; on an iPhone or iPad, use Share, then Add to Home Screen. Installed, it runs full screen from the home screen and plays offline after its first load: `sw.js` keeps a copy of every file it needs, and of the fonts. Only the season installs.

**Where this goes beyond the design doc.** These are my calls; test them rather than trust them.

1. **The Hollow's rules** are all mine. The round-three plan says only that the season ends in the Hollow.
2. **The Church's timing and verdicts** are mine; the doc set only "the Church's first inspection".
3. **The last keeper's dead.** The season opens with two shades already in the glass: Garrick, a Loyal guard and Osk's father, and Hesper, Serene and named. Without them, night 1 was lost every time, because nobody held the light.
4. **Tides.** Most Creepers come in waves, with one more wave every third night, instead of evenly through the night.
5. **Veil cracks heal one a dawn**, and each crack costs 1 Dread. Five open at once lose the keep, and a new season starts with none.
6. **The cycle is compressed:** a season is 21 minutes at 1× plus the paused phases, against the doc's much longer days.
7. **The Maws** now break twin rooms, as the doc has them, but they arrive on night 3 of the first season rather than the second, a ward on a stair holds them, and their haunting costs Dread rather than work (problem 2). Weighing targets, the climb out of the rift and the candle they can also tear down are mine.
8. **The Book of the Dead, the guide and installing** come from the [round-four brainstorm](../docs/brainstorm/round-4/README.md), not the design doc. The crossing follows the pixel pass's, cut from about 10 seconds to about 5 and made skippable.
9. **Building's rules are mine.** The doc says only "carve rooms into the keep's cross-section; every room you build has a twin in the Tain", and lists stone among the day's resources. These are my choices:
   - starting from the ground floor alone, the Hearth and the Crypt;
   - stone and masons as the cost;
   - three workers a room;
   - rooms going on top only;
   - the Forge's defense and grave-steel as numbers (the doc's Cold Forge makes grave-steel "that harms the Unlit");
   - what the Cellar keeps.

   The doc's Library, Quarters, Hall and Gatehouse aren't built.
10. **Breaking a mirror's rules are mine.** The doc says only that breaking a mirror frees everyone in it at once, in an emergency, and that its room then has seven seasons of bad luck. The slice's mirrors aren't in rooms, so the keep carries the bad luck, for seven days rather than seasons. What the bad luck does (sickness twice as often), the Dread it lifts, and that it can be done at any time are my choices.
11. **Fire's rules are mine.** The doc lists fire as a day threat that starts in forges and hearths and spreads through wooden rooms, answered by stone rooms and water barrels. The slice's rooms have no materials and there are no barrels, so the answer is hands: the room's own workers, the Yard, or the bell. The chances, the heat, the danger and scorching are my numbers.
10. **Traits: the pairs and their night effects are the doc's; the rest is mine.** The day effects of the living traits are mine; the doc gives only the night side. So are all the numbers, and Bitter's cost in Dread, which comes from my round-four note. Wistful's "better dreams in the Dreamwell" became a day's better work, because there's no Dreamwell yet. A Reckless shade lunges and hits harder rather than charging into the dark: my first version left the light, got caught, and killed less than an ordinary shade. Hoarding leaves the last 4 candles because taking 2 of a store's last 2.5 lost a keep on its first night.

**What the numbers say so far.** From `npm run balance:season -- 100 1`, on the two-room start. Every plan but Idle builds in the same order (a Barracks, a Chapel, a Chandlery, a Glazier, an Infirmary, a second Barracks, a Forge, a Granary, a Cellar), stands guards only on raid days, holds the stairs to the Veil, relights candles, and posts nobody below the line's floor at night except in the Choir. All but Double and Idle pull a second fighter to each stair for each tide from that stair's own room, ward the line for the last tide of nights 5 and 6 when the essence is there, and send help against a Maw. The first three differ in how they treat the dead; Double treats them like Balanced.

| | Balanced | Keeper (never covers) | Mourner (every funeral, covers to keep Dread at 1) | Double (two fighters per stair on Maw nights, never moves anyone) | Idle (no candles, no posts) |
|---|---|---|---|---|---|
| Seasons finished | 98% | 95% | 98% | 100% | 0% |
| Lost on night 6 / 7 (and earlier) | 0 / 2 | 1 / 4 | 0 / 2 | 0 / 0 | all on night 1 |
| Your deaths per season | 3.7 | 3.8 | 3.9 | 3.5 | – |
| Raids held | 86% | 85% | 88% | 92% | – |
| Church: blessed / warned / censured | 100 / 0 / 0 | 79 / 5 / 24 (108 visits) | 100 / 0 / 0 | 100 / 0 / 0 | – |
| Shades lost at night per season | 0.8 | 0.9 | 0.9 | 0.8 | – |
| The Hollow, in finished seasons: reached the Veil / driven back / withdrew | 4 / 16 / 78 | 4 / 13 / 78 | 24 / 21 / 53 | 7 / 21 / 72 | – |

- **Raids with traits:** 86% held for the balanced plan, against 90% without them (and 58% before the two-room start). Traits first cut it to 75%. No one trait did it: Wil (a Coward) and Nell (Gentle) guarded at half strength, Tam (Devout) at ×0.8 off the Chapel, Ada (Brave) fell twice as often, which thinned the gate for the next raid, and the Greedy ate double. The Gentle's and the Greedy's costs now fall elsewhere: the Gentle grieve harder, and the Greedy work ×0.8 away from the Glazier and the Chandlery. The Coward and the Brave keep theirs, since the gate is what they're about. Guards stand only on raid days, when every free hand goes to the Barracks.
- **Season 2** (200 seeds, two seasons): the balanced plan finishes 173 of the 196 second seasons it reaches (88%), the keeper 156 of 194 (80%), the mourner 173 of 198 (87%) and Double 183 of 200 (92%).
- **The original four-floor start** (`startFloors` 4 in Settings), same rules, 200 seeds and two seasons: every plan finishes 97–100% of first seasons. Of the second seasons they reach, the balanced plan finishes 180 of 198 (91%), the keeper 170 of 199 (85%), the mourner 157 of 195 (81%) and Double 177 of 199 (89%). Here the balanced plan leads.

## Weeks 5–6: the pixel pass

The first art, and a way to measure the plan's question: **can players read the Tain on a phone?** It is not connected to the greybox simulations yet; it draws a small keep and generated night scenes.

**Problems and risks it has already shown.** From building it and looking at it, not from anyone else playing it.

1. **The phone fits the Tain at 3× only if it gets the whole width.** The pixel keep is 112 pixels wide, so 3× is 336 CSS pixels. A 390-pixel phone fits that only without page padding; with ordinary margins it drops to 2×, and at 2× the sprites are 8 by 16 CSS pixels. The page now gives the stage full width on phones. The real game will need a camera that pans across a wider keep at the same 3×.
2. **The first candlelight was too dim to read the rooms.** Light that fades straight from the flame leaves one bright pixel and a dark room. It now holds full brightness near the flame (`LIGHT.gain`) and reaches 20 pixels. Whether that is still too dark on a real phone is what the test is for.
3. **Shades are pure silhouettes.** They show against lit walls; in the dark, only their eyes do. That is the round-three design, and it makes eye colour and shape carry a lot.
4. **Red and green eyes are a colour-blindness risk.** Creepers have red eyes and Stranger shades green ones. For players with red-green colour blindness, only shape separates them: Creepers are low and wide, shades tall. Worth changing before the art goes further.

**What's in it**

- **Four room pairs:** Chapel and Choir of Echoes, Granary and Hollow Granary, Hearth and Cold Hearth, Crypt and Waking Room. They cover the crossing (the Crypt), the night's one job (the Choir), resting (the Cold Hearth) and a weak spot (the empty Hollow Granary).
- **The palette lookup.** The Tain is the day art recoloured, never redrawn. Each colour's brightness picks a step on an 8-step violet ramp, and warm lights take the brightest step. Each twin adds one detail: echo rings, emptied stores, a cold blue fire, a glowing slab.
- **Dithered candlelight:** a 4×4 Bayer pattern and four light bands, in the palette.
- **The dusk crossing,** about 10 seconds: sunset, lights out, Ada's soul through the Veil into the Waking Room, the camera sliding down, candles and shades coming up.
- **Two night cameras.** Reflection is the Tain as the world has it, under the Veil and upside down. Flipped is the same picture turned over to read upright; with that camera, the crossing ends by turning.
- **The readability test:** 12 timed tap questions at phone scale, each type once per camera in a random order. The types are find a room, the shade in the dark, the caught shade, the room with no candle, the Creeper, and counting the shades in the Choir. Every generated question has exactly one right answer; the tests check this over 300 seeds per type. Results show accuracy and median time per camera, ask which camera felt easier, and copy as JSON with the screen size and scale.

**Read with care:** one run is 12 taps, and the first run includes learning the rooms. Compare several people, or later runs.

## Weeks 3–4: the night on its own

A standalone night mode. There is no day: each dawn simply brings 6 candles, 1 remembrance and 0–2 newly dead shades. Nights run 150 seconds at 1×.

**Design problems it has already surfaced.** These come from autopilot runs and my own reading of the rules; none of it is a playtest.

1. **The map had a winning static setup.** Every route to the Veil passes through the two stairs up to the top floor. Light those, park two shades there, and nothing gets through without the player doing anything. The greybox answers with the design's own line, "Creepers snuff candles": half of them now hunt the nearest light instead of the mirrors. The real map still needs more ways up, or Creeper goals that aren't the Veil.
2. **Gnawing stacks with no limit.** A crowd at one edge eats a fresh candle in seconds, and that is where most sudden leaks come from. It may be the fun part or the unfair part; `gnawRate` is in Settings.
3. **Holding had to be automatic.** With fighters striking only what stood next to them, the night was all repositioning. Shades standing in light now step to whichever edge of that light is under attack. That is my reading of the Hold verb, not the doc's.
4. **Wards redirect rather than delete.** A sealed rift sends its Creepers to another rift, and with all three sealed they seep up in the dark instead. The first version deleted them, and one cheap ward erased a third of a night.

**How the night works**

- **The Tain** is the keep flipped: the Veil and its three mirrors at the top, the Deep with three rifts at the bottom, and five floors of twin rooms between, joined by eight stairs.
- **Candles** light a span of their own room. The radius shrinks from 3.5 to 2 tiles as a candle burns through the night. Rifts drink light, so nothing right next to one is ever lit.
- **Creepers** climb from the rifts. They can't enter light or use a stair with light at either end. Blocked, they gnaw the light's edge; left alone, they catch shades in the dark and drain 4 memory a second. From night 2, some seep up in rooms left fully dark. Each one that reaches a mirror cracks the Veil, and 5 cracks lose the keep (dawn mends one). There are 5 on night 1 and 2 more each night.
- **Shades** in light defend it. Loyal shades fight hardest, Serene ones sing best, and memory weakens both (strength is 40% to 100% of full with memory). Singers in a lit Choir of Echoes make essence; resting in a lit Cold Hearth halves the night's fading.
- **The player's verbs** are Candle (6 a night), Guide (shades walk; the dark between is dangerous), Ward (5 essence seals a stair or a rift until dawn) and Hush (Creepers ignore shades, but nobody sings or fights).
- **Dawn** takes 10 memory from every shade, half for a named or rested one. A shade at 0 is gone. Remembrance names a shade (3, halves fading for good), remembers one (1, +15 memory), or comes from covering a mirror (+2 for releasing its shade).
- **The test.** At each dawn you rate the night from 1 (a chore) to 5 (gripping). The Nights tab lists each night's numbers, including how many actions you took, since a long night with few actions suggests it asked nothing of you.

**What the numbers say so far.** From `npm run balance:night -- 8 30`. The best crude plan, holding the two top stairs, loses no mirror on night 1. Crossings rise to about 2 a night by night 5, and most runs end during nights 5–6. None of the three plans holds all 8 nights. A person who reacts should last longer; how much longer is the point of playing it.

**Not in this greybox:** Maws, Weepers, the Hollow and the Drowned; night effects for traits; the Wick Room and other twin jobs besides the Choir; joining the night to the weeks 1–2 day.

## Weeks 1–2: two rosters and the Rite

After each death, mark whether it felt like a loss, a hire, both or neither: at the rite, or later in the **Loss & hire** tab. The Playtest tab copies an export with your notes, the ledger and a full replay log.

### The cycle

**Day** (60 s at 1×). Eight living work five rooms: Hearth (food), Glazier (glass for mirrors), Chapel (remembrance and funerals), Barracks (defense) and Infirmary (cures). Raids from day 2, sickness, old age and an empty larder kill people. A newcomer arrives every second day.

**Dusk** (paused). Each body in the crypt wakes as a shade if a mirror has room. How someone died decides the kind:

| Cause | Kind | Works at |
|---|---|---|
| Duty (guards, or anyone cut down in a breach) | Loyal | 100%, ×1.5 on the Watch |
| Old age | Serene | 100%, ×1.5 in the Choir |
| Sickness | Pale | 60% |
| Neglect (starved) | Restless | can't work; turns Wraith after 3 nights |
| Killed on your order | Wraith | hostile |
| A raider killed inside the walls | Stranger | 80%, no bonds |

Mirrors cap the night roster (hand mirror 1, pier glass 2, great glass 4; you start with 3). The dead beyond capacity wake Restless. Instead of waking, a body can get a funeral: one per priest, 1 remembrance, and the bonded are at peace. Traits invert at death (Brave becomes Reckless, and so on), each with one small effect.

**Night** (30 s at 1×). Shades work the twin rooms: Silvering (glass), Choir of Echoes (essence, calms Restless), Watch of the Dead (holds Wraiths, and leftover strength adds to tomorrow's defense) and Threshold (the next sickness or neglect death wakes one kind better). A shade starts at the twin of the room it worked in life.

**Dawn: the Rite** (paused, and the save point). Keep or cover each shade; release, leave or bind the Restless; banish or leave the Wraiths.

- **Dread** moves each dawn by: kept shades (Bitter ones count double) + unreleased Restless + 2 per Wraith − what the living bear (1 per 3 living, plus 1 per priest) − vigils (3 remembrance each).
- **At Dread 5** an inspector covers your fullest mirror and takes its shades (Anchored shades stay). Dread drops to 2.
- **Bonds.** A death leaves the bonded partner grieving (×0.8) until a funeral or a release (at peace: ×1.1 for 3 days). A kept shade posted to the twin of its partner's room is twinned: both ×1.25.
- **Essence** pays for warding the gate (+4 defense), binding an overflow Restless into a freed mirror (it wakes as its true kind) and banishing Wraiths.

### Where this goes beyond the design doc

The round-three page set the rules in outline. These are my calls to make them playable. Test them rather than trust them.

1. **Dread decays.** Read literally, "Keep: Dread +1" at every dawn with no decay reaches 5 within two days of holding three shades. I made the living bear some of the dead (1 per 3 living, plus 1 per priest).
2. **Funerals** are a crypt action at dusk, limited to one per priest. The doc said grief lasts "until funeral or release" without saying what a funeral is.
3. **Only raiders who die inside the walls wake.** That follows the pitch ("anyone who dies inside the walls"). Without it, raider bodies outnumbered your own dead about 14 to 8 per 20 days and crowded them out of the mirrors.
4. **Wraiths haunt** a staffed twin room: no work there that night, and half work in the day room above the next day. The Watch holds one per shade.
5. **Binding** overflow Restless for essence, **ward the gate**, the **Watch defense bonus**, the **Threshold** as a charge, and every **trait effect** are new.
6. **The inspector is a placeholder.** The Lantern Church proper is weeks 7–10.
7. **The cycle is compressed** to 90 seconds at 1×, against the doc's 10 minutes, so a test session covers 8–10 days.

### What the numbers say so far

From `npm run balance -- 20 40`, 40 seeds x 20 days per autopilot policy. The autopilot plays by crude rules, so these describe the rules, not good play.

| | Keep all | Cover all | Keep what the living bear |
|---|---|---|---|
| Keeps fallen by day 20 | 0% | 0% | 0% |
| Your dead | 6.6 | 10.3 | 6.6 |
| of which duty / old age / sickness | 3.6 / 3.0 / 0.1 | 7.5 / 2.7 / 0.2 | 3.7 / 2.9 / 0.1 |
| Raider bodies in your crypt | 2.0 | 5.6 | 2.1 |
| Inspector visits | 2.0 | 0 | 0.2 |
| Shades held at dawn | 3.3 | 0 | 2.7 |

- **Keeping pays.** Kept shades roughly halve raid deaths through the Watch bonus and warded gates. That is the "hire" half of the test showing up in the numbers.
- **Keeping is nearly free up to what the living can bear.** The design flaw: without fading, the keep/cover choice only bites at the margin, and covering is mostly a Dread valve. Fading, now in the night greybox, is the planned fix once the two halves are joined. Until then, raise `dread.perKeep` or `dread.livingPer` in Settings to test harsher numbers.
- **The Watch bonus may be too strong.** A dead Loyal guard gives about 75% of a living guard's defense and eats nothing.
- **Sickness and neglect deaths are rare for the autopilot**, which staffs the infirmary and the hearth immediately. A person will see more of them, which is what they're for.
- **Old age causes over 40% of your deaths** when shades are kept, so a fair share of the test rides on Serene shades.

## Not done

- The sounds are mine and nobody has heard them yet but a meter. Each was rendered offline in Chromium and its level set by measurement: alarms at -16 dBFS over their loudest 400 ms, events at -20, small sounds at -27 and beds at -30, measured above 300 Hz (roughly what a phone speaker plays) unless the full range is over 6 dB louder. Whether they sound good, or wear thin over a season, needs ears. Not tried on a real phone; on an iPhone the silent switch may mute them. Vibration works only where the browser allows it (Chrome on Android, and so the Play Store app); iPhones and iPads don't.
- The earlier prototypes have no sound. The season has three save slots; the other prototypes save one game each. All save to this browser only, and on `rcjlabs.github.io` they share its storage (about 5 MB) with any other RCJLabs page. Only the season installs and plays offline.
- A playtest export replays through the rules of the version that loads it. One from an older version can come out differently or fail to load (the page says why); a save file, from Export in Saves, loads as it was.
- The earlier prototypes stay as they were: the weeks 1–2 night is abstract, the night greybox has no day, and the pixel pass draws generated scenes. The season slice is the only one that runs day and night together.
- Not in the season: Weepers, the Drowned, fire by day, and the Library, Quarters, Hall and Gatehouse. Rooms can't be torn down or placed in a slot of your choosing.
- Checked with the tests, the soak runs and scripted click-throughs in Chromium at desktop and phone widths, including the bundled season file, the guide, the installed app with its server gone, and saves from the previous version. Not tested on a real phone, in Safari, or with a screen reader. The night stages and the pixel test are pointer-only. The season's pinch zoom was tested with synthetic touch events, not real fingers, and the Install button with a synthetic install prompt.
