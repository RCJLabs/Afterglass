// Where the page keeps things in the browser (round seven, phase 19). A preview build keeps its own, under
// another name on the same site, so it never writes a keep in a form the release can't yet read, nor reads
// the release's keeps into a build that might change them.
import { CHANNEL } from '../build.js';

export const KEY = CHANNEL === 'preview' ? 'afterglass-preview' : 'afterglass-season';
