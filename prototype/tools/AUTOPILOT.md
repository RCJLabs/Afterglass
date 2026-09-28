# The autopilot and its switches

`src/slice/autopilot.js` is a scripted player. It plays through `act()` only, so anything it does replays. The balance numbers in the design record come from it, through `tools/measure.mjs` (`npm run measure`).

## Plans

A plan is how it treats the dead, and for two of them, how it plays the night.

| Plan | What it does |
|---|---|
| `balanced` | Keeps shades while Dread allows, and aims low before an inspection. Reacts at night: a second fighter to each stair of the line for each tide, a ward on the line for the biggest tides when the essence is there, a fighter to meet a Maw. Moves a shade only along a lit floor. |
| `keeper` | Keeps every shade it can; funerals only for the dead that would wake wrong. |
| `mourner` | Holds every funeral it can, and covers shades whenever Dread climbs. |
| `double` | The balanced plan, but from the first Maw night it posts two fighters on each stair of the line and never moves anyone: the static answer the Maws are meant to break. |
| `idle` | Works the day and leaves the night alone: no candles, no posts. A baseline. |
| `human` | The balanced plan with a person's lapses (round seven, phase 6). It looks at the night every 3 seconds, not every second, so it reacts up to that late. On half of nights it looks away once, for 10 seconds, somewhere in the night. It doesn't read the forecast: it reinforces the line once a tide is in the Tain, never wards ahead of the biggest tides, and takes the first omen it's offered. At the gate it reacts every 2 seconds, not every half second. These numbers (`HUMAN` in the file) are guesses until playtest trails can set them, and its lapses are drawn from the keep's seed and the day, never the game's dice, so the keep plays the same underneath. `AP_HUMANEVERY` (ticks, 30), `AP_HUMANRAID` (ticks, 20), `AP_HUMANLAPSE` (the share of nights, 0.5), `AP_HUMANLAPSESECS` (10) and `AP_HUMANFORECAST=1` (it reads the forecast after all) set them, to find what each lapse costs. |

## Switches

Each is an environment variable, read once when the file loads, so a measurement sets it per run (`tools/measure.mjs` runs each in a process of its own). Unless it says otherwise, each is off by default and exists to measure what one piece of play is worth. `test/autopilot.test.js` checks that every switch the file reads is listed here.

### The night

| Switch | What it does |
|---|---|
| `AP_NOACTS=1` | Never uses the shades' acts. |
| `AP_DOUBLEACTS=1` | Lets Double use the acts too (it doesn't, as the line that never reacts). |
| `AP_ACTSONLY=stand,kindle` | Uses only the acts named. |
| `AP_NOERRANDS=1` | Leaves the night's echoes and relics alone. |
| `AP_LANTERNS=1` | Sends shades to echoes and relics with lanterns, when the store has 4 candles. |
| `AP_NOFREESLEEPER=1` | No candle to wake a sleepwalker. |
| `AP_RECKLESS=1` | Sends shades across the dark as the autopilot first did, without a lit way or a lantern. |
| `AP_LANTERNMOVE=1` | Lights a lantern for a move where the way is dark, if the store can spare a candle, rather than staying. |
| `AP_NOMOVE=1` | Never moves a shade at night to meet a Maw or a tide. |
| `AP_HYBRID=1` | Gives every plan Double's second fighter at each stair on Maw nights, reactions and all. |
| `AP_OMENPICK=first` or `worst` | Takes the first of two omens, or the one that costs most, instead of the one that costs least. |
| `AP_BELOW=1` | Also works the rooms below the line on the Choir's side, leaving the other side dark as the Unlit's way up. |
| `AP_WEEPGUARD=1` | Posts a fighter in the Weepers' room the night after a death. |
| `AP_DREAM=1` | Posts a worker to dream in the Dreamwell every night, under a candle of its own. |
| `AP_DROWN=ward`, `guard` or `none` | On rainy nights only wards the moat, only guards the mirrors, or does neither (the default does both, by rule). |
| `AP_DEEP=1`, `2` or `3` | Sends one shade down into the Deep to that depth every night but the new moon, and upgrades mirrors with the quicksilver. |
| `AP_ECLIPSE=ignore` | Leaves the eclipse be: the shades at last night's posts, no candles. |
| `AP_SIDE=1` | In the eclipse, posts each shade bonded to one of the living in the twin of that one's room. |
| `AP_HOLLOWGOAL=1` | Leaves the Hollow unwarded on spring's new moon in a campaign's fourth year, for the chapter's goal. |
| `AP_NOUGCANDLE=1` | Never lights the Undergate's mouth. |
| `AP_UGFREE=1` | Measuring only: a free candle for the Undergate's mouth, by a debug action (such a keep doesn't replay). |
| `AP_HUSH=1` | Hushes the night while shades stand in the dark with the Unlit close and no candle to spare; ends it when none do (round seven, phase 6). |
| `AP_COURT=1` | Seats the weakest fighter left in the Court of Shades, lit, on a night before a rite where one of the dead will ask (phase 6). |

### Dusk and dawn

| Switch | What it does |
|---|---|
| `AP_BLIND=1` | Plays as if nobody had a trait. |
| `AP_GRANT=1` | Grants every request of the dead. |
| `AP_REFUSE=1` | Refuses every request. |
| `AP_NOGATE=1` | Doesn't grant a Loyal shade the gate before a raid. |
| `AP_BIND=1` | Binds a Restless shade into a free mirror, when the essence can be spared beyond the new moon's reserve, rather than releasing it (phase 6). |

### The day

| Switch | What it does |
|---|---|
| `AP_RAIDPASSIVE=1` | Does nothing at the gate: the old autopilot under raids you fight. |
| `AP_TRIBUTE=1` | Also pays the Host off when a breach looks certain and the keep can spare it. |
| `AP_NOBAR=1`, `AP_NOPITCH=1`, `AP_NOBELL=1`, `AP_NOSHORE=1` | One part of the raid policy off: barring the stores, pitch, the bell, shoring the gate. |
| `AP_NOSALLY=1` | Waits a siege out rather than sallying. |
| `AP_NOHIDE=1` | Never hides a mirror from a crusade. |
| `AP_BREAK=1` | Breaks a mirror to stop a censure. |
| `AP_WHISPER=1` | Has a shade whisper to every trade someone works. |
| `AP_STEP=1` | Builds a great glass when it needs mirror room, and sends its shades through to work by day. |
| `AP_VISIT=default`, `first` or `kind:answer` | Leaves every visitor waiting to take the last answer; gives each the first; or gives one kind one answer and the rest their rule. |
| `AP_CURFEW=1` | Proclaims the curfew from the Hall once sleepwalkers or Weepers can come, unless the larder needs rationing (phase 6). |

### Building

| Switch | What it does |
|---|---|
| `AP_NOQUARTERS=1` | Never builds Quarters. |
| `AP_GATEEARLY=1` | Builds the Gatehouse fifth, before the ladders come, instead of last. |
| `AP_NOGATEHOUSE=1`, `AP_NOLIBRARY=1`, `AP_NOHALL=1` | Leaves that room out. |
| `AP_TALL=1` | Starts a new floor with every room, never filling a bare hall: the tallest keep its rooms make. |
| `AP_TALL=line` | Builds tall, but puts the Chapel in the line's floor's bare hall, where the shades holding the line sing in the Choir: building by choice. |

### The year's end and the campaign

| Switch | What it does |
|---|---|
| `AP_CLOSE=goods` | Closes each of a campaign's first four years on the goods, not the lasting help. |
| `AP_ENDING=seal`, `open` or `watch` | At the open year's end, or a campaign's fifth: seals the Veil, opens it, or takes your own place in the glass as The Keeper and plays on. Unset, the open year keeps the watch into a harder year. (Before round seven, phase 6, it acted only at a campaign's end.) |
