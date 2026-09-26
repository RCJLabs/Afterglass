# Afterglass

A side-view base-builder in development. You hold a keep on the Veil: by day the living build and hold the walls; anyone who dies inside them wakes at dusk as a shade and works the night in the reflected keep. At dawn you decide which of the dead stay.

**Play and read it:** https://rcjlabs.github.io/Base-Manager/

| Folder | What's there |
|---|---|
| [`prototype/`](prototype/README.md) | Playable greyboxes: weeks 1–2 (two rosters and the Rite) and weeks 3–4 (the night on its own), with tests and balance tools |
| [`docs/brainstorm/`](docs/brainstorm/) | The three design rounds: Five Keeps, Bone & Glass, and Afterglass |
| `index.html` | The landing page for the GitHub Pages site |

## Deploying

Every push to `main` runs the prototype tests and publishes the repository root to GitHub Pages (`.github/workflows/pages.yml`). Other branches and pull requests run the tests only (`.github/workflows/test.yml`). No build step: the pages are static files.

```sh
cd prototype && npm test   # Node 20+, no dependencies
```
