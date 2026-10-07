# Round seven: the whole game, audited, and twenty phases (September 2026)

You asked for a full audit of the game as it stands, from its systems to its screens, and twenty phases after it. This is both.

**Built so far.** Phases 1–4 (stabilise the shell and fix the bugs; the player's game, not the developer's; phone first; fewer words), phase 5's kit (play on to the season's end, the questions there, the glass test), phase 6 (measurement you can trust), and phases 7–16 (decisions after dusk; the new moon and the Long Night as climaxes; the Veil as a gauge; day decisions with teeth; cut what's only texture; something to grow into; mirrors in rooms; events toward sixty; a campaign that teaches; between keeps), in the design record as prototype/README.md's problems 44 to 59. Phase 5's playtest itself waits on testers. The rest wait. The audit below is as it was written, before them.

**How it was done.**
- I read the design record (prototype/README.md), rounds two to six, and the rules in the code.
- Six reviews ran side by side: the day, the night and progression, the page, the art and sound, the code, and round three's plan against the build.
- The page was driven in Chromium at phone size (390×844, touch) and desktop size (1366×768): 27 saved keeps, 73 screens each, 202 screenshots.
- Measurements used the autopilot, on top of the README's 100–400-seed tables:
  - the balanced plan and Double over 10–30 seeds for pacing, losses and the night;
  - scripted "lapses" and ablations, to see which night play matters.

**How to read it.**
- *Established* means seen in the code, a screenshot or a run; *judgement* is mine.
- Sizes are my estimates: S, M, L.
- Finding labels (D3, N2, U5…) let the phases point back to them.
- **Nobody but you has played this game, so every number is the autopilot's, not a person's.**

## In brief

**The problems first.**

1. **Nobody else has played it.** Round three put a test with people after each two-week block, and none has run.
   - In 80 commits over four days (25–28 September), the game went from a concept to 48 player actions, 259 tuning numbers, 33 tutorial lessons and 33 guide cards.
   - The whole of round three's cut list got built before its one question was asked: would people play a second season?
   - A third of the player's verbs are ones the autopilot never uses, so nothing is known about them.
2. **The night is decided at dusk.**
   - Nights are two-thirds of the clock, yet the balanced plan acts in 3.6% of a night's seconds.
   - Moving shades at night is worth nothing measurable: never moving comes through 120 whole years, moving 124.
   - The new moon, meant as the season's climax, is its quietest night. The Hollow withdrew on 129 of 129 and was never driven back.
   - Round three's worry, "the night becomes a chore", is the core loop's open problem.
3. **Keeps die of a slow spiral, and nothing says so.**
   - First-year losses come on ordinary winter nights, to Creepers at a dark line.
   - The keeps that fall are short of people from the first spring (6 living against 8) and short of candles by autumn.
   - In 20 keep-years, 7 of 7 keeps that entered winter with 13 candles or fewer fell, and 14 of 14 with 17 or more stood.
   - The Veil's five cracks give no warning. The balanced plan took no crack in 492 survived nights, and a losing night's five come within seconds.
4. **After the first year, nothing grows.**
   - The keep is finished by days 16–21 of its first year: 7 floors of a possible 11, with the Yard empty.
   - A keep holds 12 living at most.
   - Glass, remembrance and essence pile up. In year 2, 63% of the essence the Choir sings is lost past the store's cap.
   - Long play is the same keep against Unlit 6% stronger each year.
5. **On a phone, the game is read more than played.**
   - About 2,000 words and 60 new terms come before day 2.
   - A Day panel runs 326–636 words, and a quarter to a half of it is the same every day.
   - Panels cover the castle they describe.
   - 1,925 of the 1,949 controls are under 44 px.
   - Every dusk has a trap: a tap meant to pick a shade spends a candle, with no undo.
6. **The world doesn't show what happens.**
   - A kill, a lost shade and a breach have no visual moment; things just stop being drawn.
   - On a phone, the Host at the gate stands under the zoom buttons.
   - At night, the Loyal's eyes are the cold flames' cyan.
   - The tides that drive every night make no sound, and there's no music.
7. **The player's game still carries the developer's tools.**
   - Every season's end opens with "The playtest question".
   - Settings is 100 raw tuning numbers.
   - Standard is described as "the rules as they ship, and as the README measures them".
8. **The shell is fragile where the core is sound.**
   - One uncaught error stops the game, and autosave then writes the broken keep over the good one.
   - The page, 4,762 lines, has no tests.
   - Nothing records which build made a save.
   - The service worker waits on the network with no deadline.
   - The domain you pick for Google Play decides whether players' keeps follow them into the app.
9. **Five bugs** (section 7):
   - the Granary does nothing;
   - paying off the season's last raid costs nothing;
   - The Keeper can be taken again every year;
   - the page's trail isn't trimmed, so the save sizes I gave in problem 43 leave out up to 430 KB;
   - an imported export can put its own HTML into the replay viewer.

**What's strong, and worth building on.**

- **The premise holds together.**
  - Every death is a hire: how someone dies decides what they wake as.
  - The day builds the night's keep. Putting the Chapel on the line's floor is the biggest effect ever measured: +30 whole years.
  - The Tain reads as the keep's reflection.
- **The rules engine is sound.**
  - It is one deterministic state with a seeded stream per feature, and replays are exact.
  - 98.5% of its lines are covered by tests.
  - The black mirror forecasts the night exactly, from the Unlit's own planner.
- **The season has a shape.** Summer banks food, winter draws it down, and candles put by in summer carry the long nights.
- **Dawn tells the night's story**, through the night in moments, the Book of the Dead and the recap card.
- **It looks good.**
  - The day castle is furnished room by room, its people dressed by their work.
  - The Tain is the same art run through a violet palette.
  - The sunset and the eclipse are real set pieces.
  - A heartbeat quickens as the Hollow nears the mirrors.
- **It runs well.** 60 fps, no dependencies, no telemetry, and it plays offline.
- **The accessibility basics are in.** A whole dusk plays by keyboard, there's a less-motion setting, and the eyes read by shape as well as colour.
- **No verb kills your own**, so round three's worry about farming death is closed.

## The game at a glance

| | |
|---|---|
| The loop | Dawn rite (paused), day (60 s at 1×), dusk (paused), night (120 s). 7 days a season and 4 seasons a year. A year is 87 minutes of clock, 68% of it night. |
| Modes | The open year (each year ×1.06 harder); a five-chapter campaign; Gentle, Standard and Hard; today's keep; the tutorial |
| The day | 14 kinds of room, 13 of them buildable. 3 raids a season, with 7 tools at the gate. Fire, 20 visitors, 8 studies and 3 decrees. The Church: inspection, embargo, Inquisition, crusade. Plague in summer, siege in autumn, weather. Generations from year 2, and 8 trait pairs. |
| The night | 6 kinds of Unlit: Creepers, Maws, Wraiths, Weepers, the Drowned, the Hollow. Candles, moves, wards, hush and flip; 4 acts; lanterns; errands; 6 omens; the tide clock; the Deep; the eclipse. |
| The dead | 6 kinds by cause of death. Mirrors: hand, pier and great glass. The rite: keep, cover, release, bind, banish. Requests, names and the Book of the Dead. |
| Verbs | 48 action types, of which the autopilot uses 27 |
| Words | About 23,000 words of prose in the code. How to play is 4,195 words; there are 33 lessons and 33 guide cards. |
| Numbers | 259 tuning keys, 29 of them rule switches kept for old saves; 100 are shown in Settings |
| Code | The live game is 841 KB raw (about 257 KB gzipped), with no dependencies. 287 tests run in 55 s. |

## 1. Systems and gameplay

### The day

- **D1 (high): from the second year there is little left to decide by day.**
  - The keep is finished by day 16–21 of year 1: 7 floors and 14 rooms.
  - From the first winter the Yard is empty and no stone is made.
  - Every sink is a one-off: rooms, mirrors, the 8 studies.
  - Glass goes 4 → 32 → 84 over two years, remembrance 5 → 13 → 36.
  - Day actions other than jobs fall from 2.2–2.5 a day in year 1 to 1.2–1.7 in year 2.
- **D2 (high): year 1 brings about 15 day systems in five days.**
  - Day 1 brings building (13 kinds of room, and where they go matters at night) and visitors (20 kinds, from day 1 outside the tutorial).
  - Day 2 brings the raid and its 7 tools, newcomers, requests and nightmares.
  - Days 3–5 bring sickness, fire, rain, the Church's notice and inspection, old age and grief.
  - Summer brings ladders, the Gatehouse's rule, the eclipse, plague, decrees and studies; autumn brings the siege.
  - No guide card covers sickness, the larder, crowding, the siege or the 12-person cap.
  - The tutorial builds no Infirmary, and 1.4 people per keep die of sickness before the autopilot builds one.
- **D3 (high): guards cost nothing.**
  - A job can be changed at any moment, and defense matters only in the 15 seconds of an assault.
  - The clock stops when the Host reaches the gate, and the card says to move people to the Barracks.
  - So the best play is to work everyone until the pause, fill the Barracks, then send them back.
- **D4 (medium): the raid's seven tools come down to guards, a free ward and some pitch.**
  - 214 of 216 raids held.
  - The gate ward is free once essence sits at its cap, from the first summer.
  - Shoring is gone once stone runs out.
  - Paying off and pursuing were never used.
  - Barring the stores was used 0.6 times per keep.
- **D5 (medium): the Church is a scheduled gift for anyone who covers shades.**
  - The balanced plan was blessed at 69 of 70 inspections, and its Dread never passed 3.
  - The embargo, Inquisition and crusade only reach a keep that never covers.
- **D6 (medium): sallying and pursuit don't grow with who goes.**
  - A sally's odds count the whole keep's defense: the gate ward, the levy and the smiths as well as the guards who go out. So one guard and a ward reach the 90% cap against the first autumn's camp.
  - Pursuit recovers half the loot however many guards go, and each one risks 20%.
- **D7 (medium): visitors want food, the one thing that's short.** Food-priced offers were taken 36 times in 156; the glass-priced ones fared far better. Leaving a visitor waiting costs nothing measurable (problem 38).
- **D8 (medium): the Forge is dominated by day, and draws fire.**
  - A smith gives 1 defense and a guard 2, so the autopilot never staffs the Forge.
  - Fire picks a Hearth or a Forge at random: 51 of 132 fires broke out in the empty Forge, and in year 2 each is answered by the bell, which stops all work.
- **D9 (medium): the page never says what the keep eats.** Food made shows, but not what's eaten; with one Hearth, each winter nets −13 to −23. The 12-person cap that stops newcomers and births is shown only in How to play.
- **D10 (low): several choices are dominated.**
  - The curfew costs ×0.9 on all work to prevent nightmares worth about 2% of it.
  - Reading traits gains nothing measurable (problem 8).
  - The Library is used up by the end of year 2, and Masonry is learned after the last room is built.
- **Strengths.**
  - Building ties the day to the night, and the Build panel says what each place means by night.
  - Deaths stock the night: held raids still kill about 1.3 a season.
  - The seasonal larder makes a real arc.
  - Grief is a day cost for a night asset: a kept shade's kin grieve until it's covered or released.
  - Four systems measurably pay: Quarters against plague (+18 whole years), sallying (+12), visitors answered with care (+11) and the levy (+6).

### The night

- **N1 (high): the night's value is light, set at dusk.**
  - Balanced makes 5.3 actions a night and Double 2.6. Relights are 37% and 84% of them.
  - Balanced acts in 3.6% of a night's seconds. Its longest stretch without acting is a median of 54 seconds.
  - Doing nothing for 30 seconds around the last tide cost no cracks in 20 nights.
  - Keeping only the rule that relights the line lost none of 10 keeps on the night where no action at all lost 7.
  - Over two years, what matters is relights, candles dropped on the caught, Kindle and wards.
  - Moves are worth nothing measurable, lanterns are a loss, the omen choice is worth nothing to a plan that reacts, and hush is never used.
- **N2 (high): the Veil is a switch, not a gauge.**
  - Each Creeper through is one crack, and by autumn a tide is 6–10 Creepers, so one open stair at one tide empties the whole meter.
  - The balanced plan had no crack in 492 survived nights. All ten of its cracks came on its two losing nights; on one, all five came between 61 s and 66 s.
  - So the dawn healing and the Dread that hang on cracks almost never apply.
- **N3 (high): the finale is the quietest night.**
  - The new moon brings 14 Unlit against 24 on nights 5–6, and 2.6 call-outs against 6.0.
  - It takes about two ward taps from a store at a median of 93.
  - The Hollow's wards stand at the foot of the keep, so they also shut out the rifts' Creepers.
  - The campaign's year-4 goal, to drive the Hollow back, was met 0 times in 139.
- **N4 (medium): the Maw is a Dread tax, not a fight.** Of 307 Maws, 50% broke a room and 35% were cut down, and help was sent 0.05 times a night. A broken room costs 1 Dread, which the rite pays by covering a shade.
- **N5 (medium): dusk is the same taps every night.**
  - The autopilot makes 6.3 placement actions a dusk, more than the whole night after it, 28 times a year.
  - There's no "as last night"; the guide itself says the line is set again every dusk.
- **N6 (medium): the black mirror is exact but has little to say.** 2,221 of the 2,226 ways it drew ended at a gnawed candle, and fog costs nothing (problem 36).
- **N7 (medium): a third of the verbs are unmeasured.**
  - Never used: hush, bind, banish, lanterns, the Deep, breaking a mirror, whispers by day, paying off, pursuing, tearing down.
  - Never reached in long play: the Gatehouse's Undergate, the Court, the curfew and the old rites.
- **N8 (low): some systems are texture.**
  - Weepers bring 0.36 nightmares a night, which go ignored.
  - The Dreamwell and the Deep change nothing measurable.
  - The seep alert ("…It has no candle"), the second most frequent call-out, nudges candles below the line, where they rarely pay.
- **Strengths.**
  - Essence is a real trade between the day and the night in year 1: warding both line stairs every night cost 17 seasons of 80, because the gate went without.
  - The forecast stack is honest and deterministic: the black mirror, the ways on the Tain, the tide clock and Skip.

### Dusk, dawn and the dead

- **R1 (medium): the rite decides how many shades stay, not which.**
  - Which shade you keep doesn't matter to the autopilot (problem 8), but how many does: the balanced plan comes through 124 whole years, the keeper 89 and the mourner 40.
  - The dead's requests are the one choice that measurably pays: answered by rule, 86; granting everything, 78; refusing everything, 59.
- **R2 (medium): the mirror became a capacity slot.** Round three's mirror hung in a room, opened both ways and leaked when cracked. Now the Tain always has the same two mirrors, and whispers go by trade. Its most distinctive idea lives only in the rite.
- **R3 (low): The Keeper can be taken every year.** Each year's end adds another shade called "The Keeper" for 2 Dread; the action never checks for one already taken. See section 7.
- **Strengths.**
  - Deaths wake by their cause: duty makes the Loyal, old age the Serene, sickness the Pale, raiders Strangers.
  - Wraiths come only from neglect.
  - The night in moments, the Book of the Dead and the recap card give each season a story.

### Where keeps fall, and the pacing

- **P1 (high): first-year losses are a spiral from the first spring.**
  - Over 30 first years of the balanced plan, 8 keeps fell. 7 fell in autumn or winter (4 on winter's second night) and none at the Long Night.
  - Of the cracks in fallen keeps, 42 of 46 were Creepers.
  - The fallen keeps were behind from the end of their first spring, with a median of 6 living against 8 and Dread 2 against 0.
  - By the end of summer it was 6 living against 10, and 10 candles against 15½.
  - Traced, their candle store ran to 0–3 in winter, and on 6 of 7 losing nights there was nothing left to light.
  - Creeper counts ignore the keep's size, so nothing slows the spiral.
- **P2 (high): winter's threshold has no number on screen.**
  - Winter takes 32% of the keeps that reach it, against 5% or less for any other season.
  - A winter night is 162 s, longer than a candle's 120 s of wax.
  - The campaign's first goal, 20 candles into winter, names the real decider. The open year never says it.
- **P3 (medium): it's stop-start.**
  - The clock stops 1.95 times a day (a day is 60 s at 1×) and 1.05 times a night, and dusk and the rite wait on the player every day. That's about five stops in every three-minute cycle, one every 36 seconds of clock.
  - There are about six toasts in every day and six in every night.
  - A year's stops: 21 for Maws, 15 visitors, 25 for raids (sighted and at the gate), 8 inspections, 7.5 fires, 5 caught shades, 4 for the Hollow.
- **P4 (medium): the pace is three times round three's, and night-heavy.** Round three planned a cycle of about ten minutes, with six-minute summer days. The build has three-minute cycles, and the night is the longer half in every season.
- **P5 (judgement): difficulty is lopsided.**
  - The autopilot finishes 94–99% of first seasons and 62–70% of first years on Standard.
  - The year's shape (safe spring, deadly winter) is sound; what's missing is the warning (P2) and a way back (P1).

### Long play, the campaign, and between keeps

- **L1 (high): nothing binds after year 1** (D1 and problem 43).
  - In year 2, 63% of the essence the Choir sings is lost to the cap; it was 22% in year 1.
  - 7.9 of the 8 studies are learned by the end of year 2.
  - Mirrors have room for 8.5 shades for 4.4 shades held, so the Deep's quicksilver has nothing to buy.
- **L2 (medium): the campaign teaches little.**
  - It holds back only three pressures.
  - Year 4's goal can't be met by safe play.
  - The closing choices are worth +0.5 ± 2.9 whole years, and two of the four goals come of themselves.
  - Its years now harden faster than the open year's: ×1.1 against ×1.06.
- **L3 (medium): nothing carries from one keep to the next.**
  - Only preferences and the guide's cards persist.
  - A keep's Book of the Dead is gone when its slot is reused, and today's keep keeps no history.
  - Four of the recap card's six numbers are nearly constant for anyone competent: days held, raids held (99%), the Church (blessed 98 in 100) and the Hollow (withdrew).

## 2. The page: UI and UX

- **U1 (high): about 2,000 words and 60 terms before day 2.**
  - The tutorial takes 18 cards (668 words) and 41 actions to reach day 2's morning.
  - Along the way, People shows 249 words, Build 593, Dusk 184 and the Rite 218.
  - The HUD shows 11 stats from the first second.
  - A Day panel runs 326–636 words, and 25–54% of it repeats every day: the mirrors, the dead by day, quicksilver, the Church's thresholds. At 230 words a minute it takes 1.4–2.8 minutes to read, and a day is 60 seconds.
  - Day, People and Build don't pause the clock; only the Menu does.
- **U2 (high): a trap at every dusk.**
  - The tool resets to Candle at every dusk. Tapping a shade to pick it spends a candle, and no action takes one back.
  - In the test, two taps turned 5 candles into 3, with no toast, and the shade was never picked.
- **U3 (high): the phone is played through small targets.**
  - 1,925 of the 1,949 visible controls are under 44×44 px.
  - The rite's Keep, Cover, Name, Grant and Refuse, the visitor answers, and pitch, stone and the bell are all 30 px tall.
  - Settings rows are 19 px, and the HUD's labels are 10 px.
- **U4 (high): on a phone the panel hides the castle.**
  - With the Dusk panel open, about 50 px of the Tain shows. The black mirror starts two screens down, and the chevrons it describes are under the panel.
  - With a lesson card up as well, no castle shows at all.
  - The desktop drawer shows both side by side.
- **U5 (high for a store release): the playtest ships.**
  - Every season end, year end and fall opens with "The playtest question… Answer before you look at anything else", even in a keep's ninth season.
  - Records has a Playtest tab, and Saves has Watch a playtest.
- **U6 (medium-high): Settings is a tuning console.**
  - It has 100 raw number fields against 13 player preferences. 25 of them are switches typed as "1 on, 0 off".
  - There's no reset, and the Advanced section is 18 phone screens tall.
- **U7 (medium): New game leaves the guide off.** Only the tutorial turns the guide on, so a newcomer who taps New game gets no lesson cards at all.
- **U8 (medium): the lesson card's buttons work against the lesson.**
  - "End the tutorial" sits beside every card and ends it with no confirmation.
  - "Got it" on a card that paused the clock leaves the clock paused.
- **U9 (medium): emergencies queue in a fixed order.**
  - The Day panel always runs in the same order: season, weather, eclipse, fire, visitors, siege, then the raid.
  - With a fire and the Host at once, Pitch is 1.5 screens down on a phone.
  - A raid on the road shows only an 8 px dot on the Day button.
- **U10 (medium): the HUD is dense and partly unlabelled.**
  - It takes three rows of 10 px abbreviations (CAND, ESS, REM, LIV, SH).
  - Dread and the Veil are pips with no number.
  - The tide clock is never taught in the tutorial.
- **U11 (medium): screen readers get little.**
  - The canvas has one fixed sentence, and Dread and the Veil read as empty.
  - The keyboard cursor's hint isn't announced.
  - The arrow keys pan the castle instead of moving between tabs.
- **U12 (low-medium): small inconsistencies.**
  - "Slot" and "keep" are both used for a save.
  - "Skip" means three different things.
  - The legend says "dots march" where the lessons say "red chevrons".
  - "Begin summer" is only at the bottom of the Season panel.
  - The phase button has seven names.
  - The keyboard table shows on phones.
- **Strengths.**
  - The black mirror's plain, causal forecast recomputes as you place ("From the left rift, 4 Creepers will catch Sabe…"), and it reads by shape under colour blindness.
  - Dawn and the season's end give good feedback.
  - The tutorial's mechanics work: one lesson at a time, pulsing its target, cleared by doing it.
  - It holds 60 fps under a 4× CPU slowdown, with no errors and no overflow at 390 px.
  - A dusk plays by keyboard, focus returns where it came from, and less motion is honoured.

## 3. Art, animation and feel

- **A1 (high): hits, kills and losses have no visual moment.**
  - A Creeper cut down just loses its eye pair between two frames: no flash, puff or pose.
  - A named shade lost for good vanishes between two frames 200 ms apart.
  - After a breach, the Host is simply gone and two bodies pop onto the crypt floor.
  - The living who die by day just stop being drawn.
  - The only screen-level effect in the game is the Veil's 600 ms flash. There's no screen shake, no particles, and no hit, hurt or death frame anywhere.
  - A bell and a toast carry every loss, in a game whose question is whether a death feels like one.
- **A2 (high): on a phone, the Ashen Host is off-screen or under the zoom buttons.**
  - Its torches on the road and its camp are drawn east of what a phone shows.
  - At the assault, the mob and the ram stand under the +, − and Fit buttons (seen).
  - Where raiders do show, they're the pixel pass's 4×6 figures beside 6×12 defenders, and read as a smudge.
  - On a phone, the raid's whole story is the turret banners.
- **A3 (high): at night, friend and foe share eye colours.**
  - The Loyal's eyes are cyan, and so are the cold flames of the Cold Hearth, the Cold Forge and the Wick Room, drawn after the lighting.
  - The Drowned's mint is close to both.
  - A Wraith's white eyes match a Pale shade's.
  - In a fight, the bodies of shades and Creepers merge into one black mass. A faint violet halo is the only friendly mark.
  - At 3×, a Creeper is 21×9 px, with eyes of 3 px.
- **A4 (medium): the set dressing outshines the threats.**
  - The loudest shapes at night are the two pulsing red rifts, and the brightest warm light is the dark keep's decorative Hearth glow.
  - The Unlit are pairs of eye pixels, and the Hollow, the season's boss, is a dark blob about a shade's size.
  - One red (`#ff0044`) marks rifts, caught shades, a Maw's target, broken rooms, low memory, the Veil's flash, open ways, Creepers' eyes, and a friendly Stranger's Lure.
- **A5 (medium): transitions dissolve instead of landing.**
  - The crossing's souls are 2×3 px and vanish at the waterline, then a 900 ms crossfade runs over a camera that settles in 0.4 s. It reads as a double exposure, with the room labels jumping ahead of the picture.
  - The eclipse ends in a hard cut with a jump in scale, and the Unlit "burning away" is only a toast.
  - There's no sunrise: the rite sits over the night, and mornings look like noon.
- **A6 (medium): lasting damage is mostly invisible.**
  - The Veil's cracks are HUD pips; the mirrors never crack.
  - The gate's cracks are ten 1-px dots.
  - A lost keep looks unchanged.
  - The exception to keep: a room a Maw broke gets cracks down its wall, and is haunted the next day.
- **A7 (medium): seasons, weather and the moon barely read on a phone.**
  - The seasons differ only in the hills, and a phone shows about 27 px of hill each side.
  - Rain falls as sparse streaks, with fair-weather clouds still on the grey sky.
  - No rain or fog reaches the Tain, and no snow at night.
  - The moon is the same crescent every night, the new moon's included, so the countdown to the Hollow is text only.
- **A8 (medium): on a phone the play area is small.**
  - The HUD, the bar and the hint take 25–31% of the screen.
  - The two-room starting keep gets 7% of it, under about 210 px of empty sky.
  - Room labels cover a quarter of a room's height, and are cut off in the eclipse.
- **A9 (medium): the living are anonymous in the world.**
  - People, the Book and the rite show names but no faces.
  - A person you pick isn't highlighted on the castle, and grief is a single pixel.
  - The sprites differ per name, but a player can't match Ada to her figure, which works against the loss.
- **A10 (medium): the recap card and the shop window leave out the Tain.**
  - The card draws only the day keep, so no shades and no reflection. A fallen keep looks intact, a tall keep fills a quarter of its width, and generated names like "Ansel 2937" print on it.
  - The landing page has no images at all.
  - The title screen puts the menu over the lake, so the reflection is never seen before play.
  - The icon, the best single image of the game, is on neither.
- **A11 (medium-low, judgement): the default reflected camera costs readability.**
  - Helms, hoods and horns hang downward, and so do the candle flames. The upright view reads better.
  - The pixel pass's quiz, built to settle this, has never run.
- **A12 (low): smaller seams.**
  - The Maw's 8-second climb out of its rift is drawn as eyes in the rift's glow, so the night's best warning window has no art.
  - The raiders use the older figure.
  - Glows are flat translucent discs, where the lighting elsewhere is dithered and in palette.
  - The UI is a generic web UI, not round three's pixel-font kit.
  - The Weeper, a foe, is drawn in the pale blue of the friendly dead.
  - Animation is thin: 5 poses for the living, none to strike or be hurt, and 1–2 frames for the Unlit.
- **Strengths.**
  - **The day castle.** Furnished rooms, people dressed by their work, the lake's reflection: at 3× on a phone it's the game at its best.
  - **The Tain's look.** One set of art run through a violet palette, with colour saved for actors and lights. It holds even in the 32 px icon.
  - **The black mirror's marks and the tide clock.** They differ in shape as well as colour, and are the clearest warnings in the game.
  - **The people.** Outfits, hair and skin come from the name, and the stooped old and small children all read at 3×.
  - **The two set pieces:** the sunset, and the eclipse's dark sun over both halves.
  - **The night in moments,** which retells the night in the game's own art.

## 4. Sound

- **S1 (medium): the night's main rhythm is silent.**
  - The tides make no sound. The spawn loop cues seeps, Weepers, Maws, the Hollow and the Drowned, but not the Creepers' tides; a tide is heard only as the drone opening over about 1.5 s.
  - A light being gnawed and a candle about to die make no sound.
  - Holding the gate is silent after the first thud, because the ram sounds only while the gate is losing.
- **S2 (medium): some sounds are borrowed.**
  - A Stranger's Lure plays the raid horn, with the raid's vibration.
  - The ladders play the ram.
  - The sun's return after the eclipse plays the dawn chime.
  - Two cracks in the same moment sound once.
- **S3 (medium): there's no music, and only four beds.**
  - The four are wind and water by day, the night's drone, a dusk pad and a rite pad.
  - There's nothing for rain, fog, fire, the seasons or the Host at the gate.
  - The beds don't dip under alarms.
- **S4 (unknown): nobody has heard it.** Every level was set by a meter (the README's "Not done"). Whether it sounds good, or wears thin over a season, needs ears.
- **Strengths.**
  - 60 sounds made as they play, from 113 cue sites, with no files.
  - Measured levels, a limiter and a synthesised reverb.
  - Panning by position, rate limits and an 18-voice cap.
  - A drone that opens as danger rises.
  - A heartbeat that quickens as the Hollow nears the mirrors, the best piece of game feel in the build.
  - Vibration on 22 cues, and a list in Settings to hear every sound.

## 5. Code, tech and operations

- **T1 (high): one uncaught error freezes the game, then autosave writes the broken keep.**
  - The frame loop schedules its next frame on its last line, and nothing catches an error.
  - The 5-second autosave keeps running after the loop dies.
  - The sim is deterministic, so the saved state throws again on every reload.
  - Reproduced by nulling the night's foes mid-night: the loop stopped, and 5.6 s later the slot held the broken state.
- **T2 (high, and time-sensitive): the Google Play domain decides where saves live.**
  - Keeps live in the site's local storage.
  - A custom domain is a new origin: existing keeps and installed copies stay on the old one, and only export files move them.
  - An `rcjlabs.github.io` repo keeps the origin, so keeps carry into the app. But the asset links, and the ~5 MB of storage, are then shared with every RCJLabs site.
  - Nobody has a keep worth keeping yet, so switching now strands no one.
- **T3 (medium): the service worker can hang or serve errors.**
  - It fetches with no deadline, and falls back to its cache only when a fetch throws, so a 404 or 5xx reaches the page.
  - It caches any OK response, even a redirected one such as a captive portal's page.
  - Updates reach an installed copy on its next launch, with no word to the player, and the cache name never changes.
- **T4 (medium): the page has no tests in the repo.**
  - The rules are 98.5% covered, but `slice-ui.js`, all 4,762 lines, is never loaded by a test, and `card.js` isn't either.
  - The Chromium click-throughs the README cites ("Checked in Chromium") ran from session scratchpads, not the repo.
  - Under jsdom the page loads in 64 ms, and a probe opened every panel of eight keeps without an error.
- **T5 (medium): the page reacts to the exact English of log lines.**
  - Which alerts stop the clock or open a panel, the Veil's flash, and the replay viewer's marks are all regular expressions over the sim's 145 sentences. Rewording one silently removes a pause.
  - The same pattern blocks translation, with about 2,400 strings in code.
- **T6 (medium): old saves are held up by hand-written code.**
  - `upgrade()` has 29 near-identical lines that switch rules off for old saves. Its last line fills every other key with today's default, so a forgotten line silently turns a new rule on.
  - No real old export is committed as a test.
  - `SAVE_VERSION` is stuck at 1.
  - The sim uses `Math.pow`, which engines may round differently, so Safari could replay differently from Chrome. Only V8 is tested.
- **T7 (medium): saves have little headroom and no backup.**
  - Every keep keeps a trail of up to 4,000 page events, about 430 KB, and nothing trims it. My problem 43 figure of 470 KB for a fifteen-year save leaves it out.
  - The whole keep is written every 5 s while the clock runs.
  - There's no persistent-storage request and no previous copy.
  - Safari clears a site's storage after 7 days without a visit unless the game is on the Home Screen.
- **T8 (medium): imported files are trusted.**
  - One field of an export reaches the replay viewer's HTML unescaped; pasting a crafted one put an element into the page.
  - Imported tuning is written into Settings unvalidated.
  - Replays accept debug actions.
  - There's no Content Security Policy, and the playtest has you opening strangers' files.
- **T9 (medium): nothing records which build made a save.** Every push to main goes straight to players, installed copies included. A playtest file can't say which build it came from.
- **T10 (medium-low): `slice-ui.js` is one 4,762-line module.**
  - It runs on shared mutable state, with a 390-line, 136-case click handler.
  - Records rebuilds its HTML while the clock runs, 88 KB of it on a fifteen-year keep.
- **T11 (low-medium): the old prototypes are frozen but still carried.**
  - The greybox, night and pixel pages are 4,812 lines of JS and 39 tests, still deployed and linked.
  - The season still borrows the greybox's CSS and its names list.
- **T12 (low-medium): store readiness is half done.**
  - Done: the manifest, the icons (maskable too), offline play and safe-area insets.
  - Missing: screenshots, a privacy page, the Bubblewrap config, the asset links and a feature graphic.
  - The start URL sits under /prototype/.
  - Android Back leaves the app instead of closing a panel.
  - Google Fonts is fetched from Google.
- **T13 (low): tooling and docs.**
  - There's no linter or formatter.
  - The scripts behind the README's balance tables aren't in the repo; the autopilot reads 37 flags that no tool sets.
  - The README has drifted:
    - design calls 9, 15 and 18 say rooms and features aren't built that are;
    - it says 193 tests (there are 287) and 13 guide cards (there are 33);
    - the top-level README lists three design rounds of six.
- **Strengths.**
  - The rules engine is pure and deterministic: seeded streams per feature, no dates or `Math.random`, and sound cues the rules never read.
  - The save layer is testable and tested, including trimming.
  - No dependencies and no network calls; the playtest sends by share sheet.
  - The offline contract is tested.
  - The canvas is 112 px wide, scaled up.

## 6. Round three's plan against the build

| Planned | Now |
|---|---|
| A test with people after each two-week block | None run |
| A cycle of about 10 minutes; summer 6 min of day to 2.5 of night | 3 minutes, night-heavy all year |
| Mirrors hung in rooms, opening both ways | Capacity slots; the Tain has 2 fixed mirrors |
| 12 twin-room pairs | All built (14 day rooms) |
| Crafting from tallow, sand, silver, ore | Rooms make goods from nothing; no silver, timber or iron |
| One product per realm | Glass, candles, defense and lore come from both halves |
| About 60 events, cruelty events among them | About 40 kinds, 20 of them visitors; no cruelty events |
| 21 living in the mockups | At most 12 living, and 3–6 shades |
| The cut list: aging, the Court, the Drowned, the eclipse, 2 endings | All built |
| A premium game with a web demo and Play Billing | Not started; Google Play waits on the domain |

On round three's six problems to solve:
- **Farming death:** closed. Wraiths come only from neglect, and no verb kills your own.
- **Bad days spiralling:** built but not working (P1).
- **The night as a chore:** not solved (N1).
- **Scope:** the art held, but every cut item was built.
- **Upside-down readability and grief:** never tested.

## 7. Bugs found

| Bug | Where | Effect |
|---|---|---|
| The Granary does nothing | sim.js ~1035, 1129 | A breach always halves the food taken; no line checks for a Granary. data.js, How to play and the README all promise it; the autopilot spends 6 stone on one. |
| Paying off the last raid is free | sim.js 3800, 3321 | The ×1.25 penalty resets with the season, so paying off day 6's raid costs nothing, though the card says the next raid comes harder. |
| The Keeper, every year | sim.js `takeGlass` | No once-only check: each year's end can add another "The Keeper" for 2 Dread. |
| The trail isn't trimmed | slice-ui.js 1943 | Up to 4,000 events (~430 KB) ride in every save, outside `trimSave`; problem 43's sizes leave it out. |
| An export's HTML in the viewer | slice-ui.js ~2286 | A crafted playtest file puts its own markup in the page. |

## 8. What only people can answer

1. Would they play a second season? (The tester link runs only the three-day tutorial.)
2. Does a death feel like a loss and a hire at once?
3. What do they do at night, and is it a chore?
4. Does the Tain read on a phone? Do the black mirror's ways help?
5. Does the tutorial teach a stranger, and is day 4 a cliff?
6. Is keeping or covering a felt choice?
7. Do timed calls fit a phone: 15 s at the gate, a quarter of a day for a visitor?
8. Is the grief warm or heavy?
9. How do they build? The tall keep with the Chapel on the line's floor dominates, and a person's own build order is unmeasured.
10. Do ten years hold anyone?

## The twenty phases

Five stages:
- **Phases 1–4** make the game safe and readable enough to put in front of strangers.
- **Phases 5–6** learn from people, and from better measurement.
- **Phases 7–11** fix the core loop, in the order the playtest ranks them.
- **Phases 12–18** grow the game.
- **Phases 19–20** ship it.

The order matters more than the count. Most of 7–18 should wait for what phase 5 says.

| # | Phase | Stage | Size | Needs you |
|---|---|---|---|---|
| 1 | Stabilise the shell, and fix the bugs | Safe to show | S–M | The domain call |
| 2 | The player's game, not the developer's | Safe to show | S–M | |
| 3 | Phone first: touch, layout, the HUD and screen readers | Safe to show | M | |
| 4 | Fewer words: the first hour and the panels | Safe to show | M | |
| 5 | Playtest round one | Learn | S, plus calendar time | Testers |
| 6 | Measurement you can trust | Learn | M | |
| 7 | Decisions after dusk | Core loop | M–L | |
| 8 | The new moon and the Long Night as climaxes | Core loop | S–M | |
| 9 | The Veil as a gauge, and a way back from the spiral | Core loop | M | |
| 10 | Day decisions with teeth | Core loop | M | |
| 11 | Cut what's only texture | Core loop | M | Your yes on cuts |
| 12 | Something to grow into | Grow | L | |
| 13 | Mirrors in rooms | Grow | M–L | |
| 14 | Events toward sixty | Grow | M–L, in batches | |
| 15 | A campaign that teaches | Grow | M | |
| 16 | Between keeps | Grow | M | |
| 17 | Art, animation and feel | Grow | M | |
| 18 | Sound and music | Grow | M | Ears |
| 19 | Engineering for the long run | Ship | M | |
| 20 | Onto Google Play | Ship | M | Domain, Play Console, business model |

### Stage one: safe to show

**1. Stabilise the shell, and fix the bugs.** S–M. Answers T1–T3, T7–T9 and section 7.
- Wrap the frame loop. On an error:
  - stop saving;
  - offer "Export this keep" and "Reload";
  - keep the previous save as a spare.
- Fix the five bugs, each with a test:
  - the food loot halved only when there's a Granary, as promised;
  - the pay-off penalty carried to the next season;
  - The Keeper once per keeper;
  - the trail trimmed outside playtests;
  - export fields escaped.
- Validate imports, and add a Content Security Policy.
- Stamp the build (the commit) into the page, the saves and the exports.
- Give the service worker a 3-second deadline and treat non-OK or redirected responses as failures. Ask for persistent storage.
- **Your call, now:** the domain (T2). It decides where players' keeps live, and it's free to change only before anyone has a keep worth keeping.
- **Done when:**
  - an error thrown mid-night offers export and reload, and the last good save survives;
  - the five bugs have tests;
  - a playtest file names its build.

**2. The player's game, not the developer's.** S–M. Answers U5, U6 and T12.
- Only `?test` or `?dev` show:
  - the playtest question, the Playtest tab and Watch a playtest;
  - the 100 tuning numbers.
- New game offers "Custom rules": about six knobs (Veil cracks, Creepers, raids, food, season length, year hardness), a checklist of features, and a reset.
- Describe Standard for a player, not for the README.
- **Done when:**
  - a new player sees no word of playtests or the README;
  - Settings fits on one phone screen.

**3. Phone first: touch, layout, the HUD and screen readers.** M. Answers U2–U4, U9–U11 and T12's Back button.
- 44 px targets under a coarse pointer.
- Safe Tain input:
  - dusk starts on Move;
  - a tap on a shade always picks it;
  - a candle or ward set this dusk can be taken back, recorded as an action so replays hold.
- A half-height dusk sheet on phones, listing the black mirror's lines; a tap on one centres the Tain on its spot.
- An emergency strip under the HUD: the Host at the gate, a fire or a waiting visitor, with its countdown and its two or three buttons.
- A lighter HUD:
  - Food, Candles, "Dread 2/5" and "Veil 0/5" always shown, the rest behind a tap;
  - nothing under 12 px;
  - the next tide mark labelled.
- Android Back closes panels.
- The screen-reader gaps: Dread and Veil as values, the cursor hint and a one-line night status as live regions, tab keys that work.
- **Done when:**
  - no control on a phone is under 44 px;
  - the dusk trap can't happen;
  - the Tain stays in view while the forecast is read.

**4. Fewer words: the first hour and the panels.** M. Answers U1, U7, U8, D2 and D9.
- Each standing explanation shows once per keep, then folds into a "?" that opens How to play.
- Panels put what's happening now first.
- The guide is on for a player's first keep.
- The lesson card:
  - "End the tutorial" asks first;
  - "Got it" resumes the clock it stopped;
  - "Skip this" becomes "Skip this lesson".
- Stage year 1:
  - no visitors before day 3;
  - the Library and the Hall from summer;
  - cards for sickness, the larder, crowding and plague, the siege, grief and the 12-person cap;
  - the tide clock taught on night 1.
- Show rates: "eats 11 a day, makes 12", "11 of 12 the keep can shelter".
- **Done when:**
  - the words before day 2 are halved, to about 1,000;
  - an ordinary Day panel is under 250 words.

### Stage two: learn

**5. Playtest round one.** S of work, plus calendar time and your testers. Answers section 8, and ranks phases 7–18.
- Three to five people who've never seen the game, on their own phones (one iPhone at least), through `?test`.
- Make the session reach the season's end:
  - a prompt to play on after the tutorial;
  - the question asked there;
  - answers kept as a draft, with a nudge to send, so quitting doesn't lose the session.
- Add round three's readability quiz, and fold in the questions it never asked: a loss and a hire, the night as a chore, the tone of the grief.
- Watch every session in the replay viewer.
- **Done when:** five sessions are back and boiled down to what confused, what bored and what landed, and phases 7–18 are re-ranked by it.

**6. Measurement you can trust.** M. Answers N7, T4–T6 and T13.
- Commit the measurement scripts (years, paired seeds, medians), document the autopilot's 37 flags, and generate the README's tables from them.
- Add a "human" plan: reaction delays, missed relights, no forecast reading. `lapse.mjs` from this audit is its seed.
- Give the autopilot the verbs it never uses: hush, bind, The Keeper, the curfew, the Court, the Gatehouse, building by choice.
- Headless page tests under jsdom, in CI.
- Commit real old exports as golden replays.
- Replace the 29 `upgrade()` lines with a dated table and a test.
- Alert kinds instead of matching words: `say()` gets a kind, and the page keys pauses and marks on it.
- **Done when:**
  - the README's tables come from a committed tool;
  - page tests run in CI;
  - the human plan's first-year survival is known.

### Stage three: the core loop

**7. Decisions after dusk.** M–L. Answers N1, N4 and N5.
- Make reacting pay, with problem 36's own levers:
  - tides that go for the thinner stair;
  - a Maw's broken room that costs more the longer it stands unmet;
  - lanterns at half a candle;
  - a Hollow that hunts lanterns.
- "As last night" at dusk.
- An optional auto-relight on Gentle.
- **Done when:**
  - a reacting plan beats Double by more than the noise over 400 seeds;
  - testers' "what do you do at night" is something other than "watch".

**8. The new moon and the Long Night as climaxes.** S–M. Answers N3 and L2.
- A Hollow ward holds only the Hollow; the rifts' Creepers still come.
- Driving it back pays something the later years can spend.
- The Long Night gets a set piece: a last great tide, and its own sound (phase 18).
- Fix the campaign's year-4 goal.
- **Done when:**
  - the new moon asks the most decisions of any night, not the fewest;
  - the Hollow is driven back on a measurable share of nights.

**9. The Veil as a gauge, and a way back from the spiral.** M. Answers N2, P1 and P2.
- Count cracks per mirror per tide. The rest of a tide spills into the next day's harm: nightmares, a room's lost work.
- "The Veil strains" when a line candle will be out at the next tide.
- From autumn, "winter needs about N candles; you have M", and the campaign's candle goal in the open year.
- A way back for a shrinking keep:
  - the night's pressure scaled to the keep's shades or living;
  - or alms and refugees;
  - or essence lighting a spot for one tide. Both traced losses still had 30 or more essence.
- **Done when:**
  - survived nights show cracks as warnings, so the meter moves before a loss;
  - first-year losses fall, and not by making Standard easier.

**10. Day decisions with teeth.** M. Answers D1 and D3–D9.
- Guards muster: a guard counts in full only after time at the post.
- Sallies and pursuits scale with who goes.
- Visitors priced in what piles up (glass, remembrance) as well as food.
- The Forge gets a day job, and an empty Forge can't burn.
- A Church that covering alone can't satisfy: judge a season's average Dread, or make each vigil dearer.
- **Done when:**
  - raids stop holding 99% of the time for free;
  - year-2 day actions are back to year 1's.

**11. Cut what's only texture.** M. Answers D10, N7, N8 and R1.
- After the playtest, cut or merge what measures as texture and what testers never mention:
  - the curfew;
  - the closing choices worth nothing;
  - the haunted-room message;
  - Weepers and the Dreamwell as they stand;
  - the Deep, if nobody goes down.
- One word for each thing.
- **Done when:** the tutorial, the guide and How to play are a quarter shorter, with no loss the autopilot or a tester can see.

### Stage four: grow

**12. Something to grow into.** L. Answers D1, L1 and problem 43.
- Recurring sinks:
  - repairs cost stone (after a breach, a fire, a Maw);
  - floors 8–11 with new twins;
  - great-glass halls;
  - second-tier studies;
  - season-long wards bought with essence;
  - more living with more Quarters.
- The open year rotates a new pressure each year.
- **Done when:** a ten-year keep still makes a day decision every day, and no store piles up unspent.

**13. Mirrors in rooms.** M–L. Answers R2, and round three's pillar.
- A mirror hangs in a room:
  - whispers and the great glass work that room;
  - an uncovered mirror in a twin a Maw breaks lets something through;
  - covering becomes a choice of where.
- **Done when:** where a mirror hangs changes the night.

**14. Events toward sixty.** M–L, in batches of about ten. Answers round three's plan and L1.
- Round three planned about sixty events; there are about forty.
- Add cruelty events, so a Wraith's "killed by you" path exists.
- Add events that change with the year, so long play keeps surprising, and more omens.
- **Done when:** there are sixty kinds, and a ten-year keep meets something new every year.

**15. A campaign that teaches.** M. Answers L2 and D2.
- Systems arrive with chapters: visitors, omens, the Deep, errands, the three new rooms.
- Closing choices that change the next year.
- A reachable year-4 goal.
- Writing for each chapter and ending.
- Ease the campaign's own years toward ×1.06.
- **Done when:** a newcomer meets nothing before its chapter, and the goals are met by play, not luck.

**16. Between keeps.** M. Answers L3.
- A Hall of Keepers: every keep's Book, its ending and its card, kept when its slot is reused.
- A new keep's first dead drawn from your last keep. The slice already starts with Garrick and Hesper.
- Today's keep with a history, and one number on the card that compares.
- A short list of deeds.
- **Done when:** starting a second keep feels like going on.

**17. Art, animation and feel.** M. Answers A1–A12.
- A hit-and-loss kit:
  - a strike pose for shades;
  - a puff when a Creeper dies, bigger for a Maw;
  - a shade lost for good rising as a soul while its mirror flickers;
  - the living falling before the body reaches the crypt;
  - dust and a splintering gate at a breach;
  - 2–3 px of shake for cracks, breaches, a Maw rising and the Hollow tearing through (none with less motion).
- A night readability pass:
  - cyan for shades only, so the cold flames go blue-white;
  - slit eyes for the Drowned and violet for Wraiths;
  - a rim on shades standing in light;
  - dimmer rifts, and a dimmer Hearth glow above the Veil;
  - a friendly colour for the Lure;
  - a red that means danger only.
- The Host framed on phones:
  - the day camera leans east during a raid or a camp;
  - the zoom buttons move to the left edge;
  - raiders drawn with the people's own figure.
- Draw the state:
  - cracks on the Veil and the mirrors until dawn;
  - a moon that wanes through the week, and reddens under a blood moon;
  - a gate that splinters;
  - a fallen keep with a shattered Veil.
- Transitions that land:
  - the camera follows the souls down, with no crossfade;
  - souls settle into their mirrors;
  - a sweep of light ends the eclipse;
  - dawn brightens the Tain;
  - the Maw's climb is drawn.
- Light by season and hour, with the colour lookup already built. Rain darkens the sky and reaches the Tain.
- Faces for names: each person's figure beside their name in People, the Book, the crypt and the rite, and a picked person highlighted on the castle.
- The Tain where the game is sold:
  - the recap card as the eclipse's split view, with the season's shades at their posts;
  - the icon and screenshots on the landing page;
  - the reflection on the main screen.
- The readability quiz (reflected or upright) runs in phase 5.
- **Done when:**
  - a kill, a loss and a breach each have a moment you can see;
  - testers tell friend from foe at night on a phone;
  - the Host is in view at every raid.

**18. Sound and music.** M, and ears. Answers S1–S4.
- Fill the gaps:
  - a panned swell for each tide;
  - a gnawing that quickens as a candle burns down, and a gutter when it's nearly out;
  - sounds of their own for the Lure, the ladders and the sun's return;
  - beds for rain, fog, fire and each season, and a battle bed while the Host is at the gate;
  - beds that dip under alarms.
- Music, kept small and synthesised like the rest:
  - a motif for dusk, the new moon and the Long Night;
  - a theme for the main screen;
  - a decision on whether the night's drone is its music.
- Ears: phase 5's testers listen on their phones' speakers and on headphones, and say what grates and what they missed.
- **Done when:**
  - every tide is heard;
  - a tester can tell by ear that a candle is failing;
  - nothing a player must act on is silent.

### Stage five: ship

**19. Engineering for the long run.** M. Answers T5, T10, T11 and T13.
- Split `slice-ui.js` along its sections, with a handler table for clicks.
- One bundle, and the three fonts hosted with the game.
- Tags deploy production, and main deploys a preview.
- A notice when an update is ready.
- Archive the old prototypes into docs.
- Split the README into a current manual and a history, and fix its drift.
- Log lines as keys and arguments, the groundwork for translation.
- **Done when:**
  - no page module is over about 800 lines;
  - production deploys from a tag;
  - the first load is one script and no third-party request.

**20. Onto Google Play.** M, plus your steps. Answers T2 and T12.
- With the domain settled in phase 1:
  - the asset links;
  - a Bubblewrap config, with the signing key kept out of git;
  - the store listing: screenshots, a feature graphic, a privacy page and the data-safety form.
- The business model, round one's premium with a web demo, or free with a one-time unlock through Play Billing.
- A staged rollout.
- **Done when:** the app is in closed testing, and keeps survive an update.

## What I'd do first

1. Phases 1–3, about two weeks of work.
2. Then phase 5 while phase 4 is built: fewer words help the testers, but the testers shouldn't wait for all of them.
3. Everything from phase 7 on waits for phase 5's answers.
4. The domain is the one decision to make now.

## What's checked

**Established:**
- the code, at f406cb4;
- the screenshots and page measurements (Chromium, headless, with fallback fonts; not a real phone);
- the autopilot runs cited: 10–30 seeds for this audit's own measurements, 100–400 in the README's.

**Judgement:**
- the severities;
- the phases, their order and their sizes;
- every "should".

**Unknown until people play:** everything in section 8.
