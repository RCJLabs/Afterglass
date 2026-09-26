# Afterglass greybox: weeks 1–2

The first playable slice of [Afterglass](../docs/brainstorm/round-3/README.md): two rosters and the dawn rite, in plain boxes and text. It exists to answer one question from the plan:

> **Does a death feel like a loss and a hire at once?**

The page records the answer. After each death, mark whether it felt like a loss, a hire, both or neither: at the rite, or later in the **Loss & hire** tab. The Playtest tab copies an export with your notes, the ledger and a full replay log.

## Run it

```sh
cd prototype
npm test                 # rules, determinism and a soak run (Node 20+, no dependencies)
npm run serve            # then open http://localhost:8080 (any static server works: npx serve .)
npm run bundle           # dist/afterglass-greybox.html, one file that also opens straight from disk
npm run balance -- 20 40 # autopilot report: 40 seeds x 20 days per policy
```

`index.html` loads ES modules, so it needs a web server; GitHub Pages works as is. The bundle has no such limit.

## What's in it

| File | Job |
|---|---|
| `src/data.js` | Rooms, causes, shade kinds, traits, mirrors, the starting cast and every tuning number |
| `src/sim.js` | The whole game as one JSON state. `step()` is one fixed tick (10 a second), `act()` is one player action. No DOM, no clock, no `Math.random` |
| `src/ui.js` | Renders the state into boxes and text; changes it only through `act()` |
| `src/autopilot.js` | A crude player for tests and balance runs |
| `test/sim.test.js` | 16 tests: each rule, replay, save and load, and a soak across 3 policies x 6 seeds x 25 days |
| `tools/balance.mjs` | Prints how the rules behave across seeds |
| `tools/bundle.mjs` | Inlines everything into one HTML file |

Everything is seeded and every action is logged, so `replay(seed, tuning0, actions)` rebuilds any session exactly, including one from a playtester's export.

## The cycle

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

## Where this goes beyond the design doc

The round-three page set the rules in outline. These are my calls to make them playable. Test them rather than trust them.

1. **Dread decays.** Read literally, "Keep: Dread +1" at every dawn with no decay reaches 5 within two days of holding three shades. I made the living bear some of the dead (1 per 3 living, plus 1 per priest).
2. **Funerals** are a crypt action at dusk, limited to one per priest. The doc said grief lasts "until funeral or release" without saying what a funeral is.
3. **Only raiders who die inside the walls wake.** That follows the pitch ("anyone who dies inside the walls"). Without it, raider bodies outnumbered your own dead about 14 to 8 per 20 days and crowded them out of the mirrors.
4. **Wraiths haunt** a staffed twin room: no work there that night, and half work in the day room above the next day. The Watch holds one per shade.
5. **Binding** overflow Restless for essence, **ward the gate**, the **Watch defense bonus**, the **Threshold** as a charge, and every **trait effect** are new.
6. **The inspector is a placeholder.** The Lantern Church proper is weeks 7–10.
7. **The cycle is compressed** to 90 seconds at 1×, against the doc's 10 minutes, so a test session covers 8–10 days.

## What the numbers say so far

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
- **Keeping is nearly free up to what the living can bear.** The design flaw: without fading, the keep/cover choice only bites at the margin, and covering is mostly a Dread valve. Fading (weeks 3–4) is the planned fix. Until then, raise `dread.perKeep` or `dread.livingPer` in Settings to test harsher numbers.
- **The Watch bonus may be too strong.** A dead Loyal guard gives about 75% of a living guard's defense and eats nothing.
- **Sickness and neglect deaths are rare for the autopilot**, which staffs the infirmary and the hearth immediately. A person will see more of them, which is what they're for.
- **Old age causes over 40% of your deaths** when shades are kept, so a fair share of the test rides on Serene shades.

## Not done

- No art, sound, save slots or offline service worker. The game saves at each dawn to this browser only.
- Candles, Creepers, fading, remembrance as a real economy, and the Cold Hearth all wait for weeks 3–4.
- Checked with the tests, the soak run and one scripted click-through in Chromium at desktop and phone widths. Not tested with a screen reader or in Safari.
