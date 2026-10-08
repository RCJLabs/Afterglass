// The build this page came from, so a save, an export or a crash report can say which it was, and its channel:
// 'release' (deployed from a tag), 'preview' (main, deployed beside it) or 'dev' (a checkout). tools/site.mjs
// writes both as it builds the site (.github/workflows/pages.yml); a checkout says 'dev'.
export const BUILD = 'dev';
export const CHANNEL = 'dev';
