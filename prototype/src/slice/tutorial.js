// The tutorial keep: an ordinary keep whose first three days and nights go by a script (TUTORIAL in data.js),
// so the guide can teach one thing at a time in order. The same keep for everyone. Pure.

import { newSeason } from './sim.js';
import { TUTORIAL } from './data.js';

export const isTutorial = (s) => !!s?.tuning?.tutorial;

// A new tutorial keep. The player's own numbers from Settings carry over, as they do to any new keep.
export function newTutorial(tuning = {}) {
  return newSeason(TUTORIAL.seed, { ...tuning, tutorial: 1 });
}
