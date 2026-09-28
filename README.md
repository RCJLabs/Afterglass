# Afterglass

A side-view base-builder in development. You hold a keep on the Veil: by day the living build and hold the walls; anyone who dies inside them wakes at dusk as a shade and works the night in the reflected keep. At dawn you decide which of the dead stay.

**Play and read it:** https://rcjlabs.github.io/Afterglass/

| Folder | What's there |
|---|---|
| [`prototype/`](prototype/README.md) | Playable prototypes: the weeks 1–2 and 3–4 greyboxes, the weeks 5–6 pixel pass and the weeks 7–10 one-season slice, with tests and balance tools |
| [`docs/brainstorm/`](docs/brainstorm/) | The three design rounds: Five Keeps, Bone & Glass, and Afterglass |
| `index.html` | The landing page for the GitHub Pages site |

## Deploying

Every push to `main` runs the prototype tests and publishes the repository root to GitHub Pages (`.github/workflows/pages.yml`). Other branches and pull requests run the tests only (`.github/workflows/test.yml`). No build step: the pages are static files.

The season (`prototype/season.html`) installs as an app. Its service worker (`prototype/sw.js`) goes to the network first, so a deploy reaches installed copies on their next load with a connection. A new file the season loads must be added to the worker's `CORE` list; the tests fail until it is.

```sh
cd prototype && npm test   # Node 20+, no dependencies
```
