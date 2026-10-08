# Afterglass

A side-view base-builder in development. You hold a keep on the Veil: by day the living build and hold the walls; anyone who dies inside them wakes at dusk as a shade and works the night in the reflected keep. At dawn you decide which of the dead stay.

**Play and read it:** https://rcjlabs.github.io/Afterglass/

| Folder | What's there |
|---|---|
| [`prototype/`](prototype/README.md) | The game: the season (`season.html`), which installs as an app, with its tests, measurement, browser checks and design record |
| [`docs/brainstorm/`](docs/brainstorm/) | The design rounds: Five Keeps, Bone & Glass, Afterglass, After the Slice and the round-seven audit |
| [`docs/archive/prototypes/`](docs/archive/prototypes/README.md) | The weeks 1–2 and 3–4 greyboxes and the weeks 5–6 pixel pass, archived as they were |
| `index.html` | The landing page for the GitHub Pages site |

## Deploying

Releases come from tags, and main is a preview (round seven, phase 19; `.github/workflows/pages.yml`):

- **A push to `main`** runs the tests and publishes main at [`/preview/`](https://rcjlabs.github.io/Afterglass/preview/prototype/season.html). The preview keeps its keeps apart from the release's, and installs as an app of its own.
- **A tag `v*`** (`git tag v1.0.0 && git push origin v1.0.0`) publishes that commit at the root, as the release. Until the first tag, main is at the root.
- Each is built by `prototype/tools/site.mjs`: the season bundled into one script (`season.js`, by a pinned esbuild fetched as it builds), the build and channel stamped in, and a `version.json` the page checks to tell a player a newer build is ready.

Other branches and pull requests run the tests (`.github/workflows/test.yml`), and every push runs the browser checks, on the page and on the bundled site (`.github/workflows/browser.yml`).

The season's service worker (`prototype/sw.js`) goes to the network first, so a deploy reaches installed copies on their next load with a connection. A new file the season loads must be added to the worker's `CORE` list; the tests fail until it is.

```sh
cd prototype && npm test   # Node 20+, no dependencies
npm run site               # the release site, built into ../_site, as Pages builds it (needs npx)
```
