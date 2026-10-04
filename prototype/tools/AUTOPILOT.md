# The autopilot and its switches

`src/slice/autopilot.js` is a scripted player. It plays through `act()` only, so anything it does replays. The balance numbers in the design record come from it, through `tools/measure.mjs` (`npm run measure`).

## Plans

A plan is how it treats the dead, and for two of them, how it plays the night.

| Plan | What it does |
|---|---|
| `balanced` | Keeps shades while Dread allows, and aims low before an inspection. Reacts at night: a ward on the line for the biggest tides when the essence is there, a fighter to meet a Maw, and a second fighter to the line for each tide. Where a tide goes for the thinner stair (round seven, phase 7), it holds one fighter to each stair until a tide is up, then sends the nearest free fighter to the stair on the side it's climbing, and everyone home after; before that, a second fighter to each stair around each tide's time. Moves a shade only along a lit floor. On the Hollow's nights (round seven, phase 8) it wards the Hollow at the foot of the keep, unless three fighters could cut it down in 15 seconds or the store can't hold it until dawn: then it lets it climb to the line, holds it at the line's stair and sends up to three fighters to drive it back (and, in a campaign's fourth year, until it has). Before the Long Night's great tide it keeps a candle back for each stair and braces the line. |
| `keeper` | Keeps every shade it can; funerals only for the dead that would wake wrong. |
| `mourner` | Holds every funeral it can, and covers shades whenever Dread climbs. |
| `double` | The balanced plan, but from the first Maw night it posts two fighters on each stair of the line and never moves anyone: the static answer the Maws are meant to break. |
| `idle` | Works the day and leaves the night alone: no candles, no posts. A baseline. |
| `human` | The balanced plan with a person's lapses (round seven, phase 6). It looks at the night every 3 seconds, not every second, so it reacts up to that late. On half of nights it looks away once, for 10 seconds, somewhere in the night. It doesn't read the forecast: it reinforces the line once a tide is in the Tain, never wards ahead of the biggest tides, and takes the first omen it's offered. At the gate it reacts every 2 seconds, not every half second. These numbers (`HUMAN` in the file) are guesses until playtest trails can set them, and its lapses are drawn from the keep's seed and the day, never the game's dice, so the keep plays the same underneath. `AP_HUMANEVERY` (ticks, 30), `AP_HUMANRAID` (ticks, 20), `AP_HUMANLAPSE` (the share of nights, 0.5), `AP_HUMANLAPSESECS` (10) and `AP_HUMANFORECAST=1` (it reads the forecast after all) set them, to find what each lapse costs. Since round seven's phase 8 it also looks at once, lapse or not, when something is called out that stops the page's clock (raids at the gate, catches, the Hollow, the great tide and the rest of `STOPS` in `src/slice/alerts.js`), as the page does by default; `AP_HUMANNOPAUSE=1` plays as if the clock never stopped. |

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
| `AP_WEEPGUARD=1` | Posts a fighter in the Weepers' room the night after a death. Since phase 11 there are none unless `weepersMax` is set. |
| `AP_DREAM=1` | Posts a worker to dream in the Dreamwell every night, under a candle of its own. Since phase 11 (`dreamRest`) it rests there. |
| `AP_DROWN=ward`, `guard` or `none` | On rainy nights only wards the moat, only guards the mirrors, or does neither (the default does both, by rule). |
| `AP_DEEP=1`, `2` or `3` | Sends one shade down into the Deep to that depth every night but the new moon, and upgrades mirrors with the quicksilver. |
| `AP_ECLIPSE=ignore` | Leaves the eclipse be: the shades at last night's posts, no candles. |
| `AP_SIDE=1` | In the eclipse, posts each shade bonded to one of the living in the twin of that one's room. |
| `AP_HOLLOWGOAL=1` | Leaves the Hollow unwarded on spring's new moon in a campaign's fourth year, for the chapter's goal. |
| `AP_NOUGCANDLE=1` | Never lights the Undergate's mouth. |
| `AP_UGFREE=1` | Measuring only: a free candle for the Undergate's mouth, by a debug action (such a keep doesn't replay). |
| `AP_HUSH=1` | Hushes the night while shades stand in the dark with the Unlit close and no candle to spare; ends it when none do (round seven, phase 6). |
| `AP_LAPSES=1` | Gives any plan the human plan's lapses (its pace and its looking away), to compare Double with the human at a person's pace. |
| `AP_COURT=1` | Seats the weakest fighter left in the Court of Shades, lit, on a night before a rite where one of the dead will ask (phase 6). |
| `AP_WATCH=1` | Sets the night at dusk and then does nothing in it: no relighting, no moves, no wards, no acts. The player who only watches, which reacting has to beat (phase 7). |
| `AP_NOTHIN=1` | Reinforces the line as before the tide went for the thinner stair: a second fighter to each stair around each tide's time, wherever it rises (phase 7). |
| `AP_RUINCANDLE=1` | Where a Maw left unmet ruins a room (`mawRuin`, off by default), lights a candle in the room to hold the ruin, when a fighter is on the way or the store can hold it until dawn with two to spare (phase 7). |
| `AP_LANTERNMAW=1` | Where a Maw left unmet ruins a room (`mawRuin`, off by default), takes a lantern to meet a Maw going for a room across the dark (phase 7). |
| `AP_MAWLINE=1` | Where a Maw left unmet ruins a room, also sends a fighter from the line to meet it, once no Creeper is still climbing, and brings it back after (phase 7). |
| `AP_NOBRACE=1` | Doesn't brace for the Long Night's last great tide. By default every plan keeps a candle for each stair of the line back until it rises, and the reacting plans send a second fighter to each stair from 8 seconds before it until it's spent, as the dusk and the tide clock say when (phase 8). |
| `AP_NOWISP=1` | Never lights a wisp. By default, with the store out of candles at night, every plan lights a wisp at a dark stair of the line from essence the new moon won't want (late in a season, what holding the Hollow off until dawn will take stays back) (round seven, phase 9). |
| `AP_MEETHOLLOW=off` | Wards the Hollow at the foot of the keep all night, as before round seven's phase 8. By default the reacting plans let it climb to the line, hold it at the line's stair and send up to three fighters to drive it back, when the store can't hold it at the foot until dawn or three fighters could cut it down in 15 seconds (`need+weak:15`); `=1` always does, `=need` and `=weak` (or `weak:10`) only then. |
| `AP_LUREHOLLOW=1` | On the new moon, where the Hollow hunts lanterns (`hollowLure`, off by default), gives the strongest shade off the line a lantern and keeps it at the far end of the Hollow's floor, up a stair when cornered, to lead it away from the mirrors (phase 7). |

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
| `AP_JIT=1` | Posts guards only when the Host is at the gate: everyone works until then, every hand it can spare goes into the Gatehouse and the Barracks, and back to work after. The play round seven's audit found cost nothing; with guards mustering (round seven, phase 10) it holds fewer raids. By default every plan posts its spare hands at dawn on a raid day; with muster, once the Host is sighted it wards the gate first if the essence is there, then posts just enough more guards, counting those still taking their places, from the work it can best spare (the Yard first, the Hearth last), and keeps everyone posted until the Host is gone. |
| `AP_NOARMS=1` | Never staffs the Forge for arms. By default, on a day with no raid, once the keep is built, while the store is short of one arm for each guard's post, every plan sends spare hands to the Forge, as many as it holds (round seven, phase 10). |
| `AP_LEDGERBLIND=1` | Keeps Dread low only on the eve of an inspection, as before the Church kept a ledger. By default, with the ledger, every plan but the keeper holds Dread at 1 through the days before a season's first inspection, and gives the almoner alms from Dread 1 rather than 2 (round seven, phase 10). |
| `AP_DREADLOW=1` | Holds Dread at 1 through the days before a season's first inspection, as with the ledger, when the keep has no ledger (to measure what that answer is worth apart from the rule). |
| `AP_NOHIDE=1` | Never hides a mirror from a crusade. |
| `AP_BREAK=1` | Breaks a mirror to stop a censure. |
| `AP_WHISPER=1` | Has a shade whisper to every trade someone works. |
| `AP_STEP=1` | Builds a great glass when it needs mirror room, and sends its shades through to work by day. |
| `AP_VISIT=default`, `first` or `kind:answer` | Leaves every visitor waiting to take the last answer; gives each the first; or gives one kind one answer and the rest their rule. |
| `AP_CURFEW=1` | Proclaims the curfew from the Hall once sleepwalkers or Weepers can come, unless the larder needs rationing (phase 6). Since phase 11 only under `curfew: 1`, which measure.mjs sets for its row. |

### Building

| Switch | What it does |
|---|---|
| `AP_NOQUARTERS=1` | Never builds Quarters. |
| `AP_GATEEARLY=1` | Builds the Gatehouse fifth, before the ladders come, instead of last. |
| `AP_NOGATEHOUSE=1`, `AP_NOLIBRARY=1`, `AP_NOHALL=1` | Leaves that room out. |
| `AP_TALL=1` | Starts a new floor with every room, never filling a bare hall: the tallest keep its rooms make. |
| `AP_TALL=line` | Builds tall, but puts the Chapel in the line's floor's bare hall, where the shades holding the line sing in the Choir: building by choice. |
| `AP_NOGROW=1` | Stops at its build list, as before phase 12: no second Hearth or Chandlery for a growing household, and no more Quarters once the keep is full. |
| `AP_NOMEND=1` | Mends nothing a Maw broke or a fire burned, nor the gate, and keeps no stone for it (to measure what mending is worth, phase 12). |
| `AP_NOLAMP=1` | Raises no Lampworks, however high the keep and however much glass it holds (phase 12). |
| `AP_NOGLASSHALL=1` | Builds no great-glass hall (phase 12). `AP_NOHALL` is the Hall, the room. |
| `AP_NOTWO=1` | Stops the Library at the first rank of each study (phase 12). |
| `AP_NOVEIL=1` | Never wards the Veil for the season (phase 12). |
| `AP_NORITE=1` | Holds no rite against the year's trouble (phase 12). |
| `AP_STAND=none` or `rift` | Sets no standing wards, the Veil's included; or, after the Undergate and a wet season's moat, one on the right-hand rift too (phase 12). By default it sets them with essence the store would spill. |
| `AP_HANG=worked`, `deep` or `none` | Where the mirrors hang (phase 13). By default the fullest hangs in the room that draws the Maws least (one nobody works by day or night), the nearest the Veil of those, and so on, the empty ones last; `worked` hangs the fullest in worked rooms nearest the Veil, `deep` the fullest deepest, and `none` leaves each where it was built (to measure what the place is worth). |
| `AP_TURN=forecast` or `deep` | Turns doors to the wall at dusk (phase 13), which by default it never does: `forecast` a door the black mirror says tonight's Maw is headed for, once the posts and candles are set; `deep`, on a Maw night, every door in a worked room two floors or more below the Veil (not on the new moon). |

### The year's end and the campaign

| Switch | What it does |
|---|---|
| `AP_CLOSE=goods` | Closes each of a campaign's first four years on the goods, not the lasting help. |
| `AP_ENDING=seal`, `open` or `watch` | At the open year's end, or a campaign's fifth: seals the Veil, opens it, or takes your own place in the glass as The Keeper and plays on. Unset, the open year keeps the watch into a harder year. (Before round seven, phase 6, it acted only at a campaign's end.) |
