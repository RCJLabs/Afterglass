# Afterglass: design brainstorm (round three, September 2026)

The Mourning Glass concept from round two, renamed and worked through in depth. Open [`index.html`](index.html) in a browser for the pixel mockups: the day and night views, the dusk crossing, room close-ups, the sprite sheet, the palette lookup, and an interactive dawn-rite screen.

**Pitch.** You hold a keep on the Veil, the border between the living world and the Tain, the reflected world behind every mirror. By day the living build, craft and hold the walls. Anyone who dies inside the walls wakes at dusk in the Tain as a shade and works the night shift in the reflected keep. At dawn you decide which of the dead stay bound to your mirrors and which you let rest.

## Problems the design has to solve

| Problem | Proposed fix |
|---|---|
| Players get people killed on purpose | How someone dies decides what wakes: duty or old age make loyal shades, neglect makes Restless ones, killing your own makes Wraiths |
| Bad days spiral | Mirrors cap bound shades; extra dead wake Restless, and releasing them raises morale |
| The night becomes a chore | Different verbs at night (light, guide, ward, hold), and night-only outputs (dreams, essence, warnings) |
| Two economies double the scope | One set of room art: the Tain is a vertical flip plus a palette lookup; one day job and one night job per room |
| Upside-down rooms are hard to read | Silhouettes with glowing eyes, the camera slides down at night, the UI never flips; test early |
| Grief is heavy | Warm writing, names, funerals, peaceful releases, no gore |

## The cycle (about 10 minutes)

Dawn rite (paused) → day (build, craft, defend) → dusk crossing (the day's dead wake; place candles) → night (light, guide, ward, hold). Seasons shift the split: summer 6 min day / 2.5 min night, winter the reverse.

## Core systems

- **Mirrors:** hand mirror (1 shade), pier glass (2), great glass (4, shades can help by day), black mirror (scrying). Capacity caps the night roster. Covering a mirror at dawn releases its shade.
- **Death kinds:** Loyal (duty), Serene (old age), Pale (sickness), Restless (neglect), Wraith (killed by you), Stranger (a raider).
- **Traits invert at death:** Brave→Reckless, Devout→Bitter, Diligent→Tireless, Coward→Lurker, Gentle→Keening, Greedy→Hoarding, Stubborn→Anchored, Cheerful→Wistful.
- **Economy:** day makes candles, mirrors, remembrance and bodies; night makes essence, dreams, whispers and scrying.
- **Twin rooms:** every day room has a night twin (chapel → Choir of Echoes, quarters → Dreamwell, forge → Cold Forge…); storage rooms are empty and dark at night, which makes them the weak spots.

## Plan

Weeks 1–2 greybox two rosters and the rite; weeks 3–4 the night on its own; weeks 5–6 the pixel pass (upside-down vs flipped camera); weeks 7–10 one season as a vertical slice. My estimate (not measured): a vertical slice in about 10 weeks part-time, 1.0 in 12–18 months part-time.

## Name

Afterglass returned no game matches in a web search. Tainhold and Candlewake are clean backups. Names ending in "-glass" are common, so check trademarks before committing. Rejected: Lychgate (Lichgate: Tower Survivor), Stillwake (a Steam horror game), Duskward, Nightglass.

## Prototype

The weeks 1–2 greybox (two rosters and the rite) is in [`prototype/`](../../../prototype/README.md).
