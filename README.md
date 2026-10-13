# Natto Cooking Game

A bilingual, touch-first Three.js cooking game for `https://wataryuu.com/natto/`.

The game is a static, build-free ES module application. It has no backend, analytics, account system, runtime CDN, or runtime API dependency.

## Setup and local development

```sh
npm ci
npm run vendor:sync
npm test
npm start
```

The development server listens on `http://127.0.0.1:4173/` by default. Runtime dependencies are copied into `vendor/`; the browser does not use a CDN.

## Architecture

Game rules live in pure ES modules under `src/core/`. Browser systems, Three.js rendering, station adapters, and semantic UI consume one JSON-serializable `GameState` without owning it. Three.js objects remain disposable projections of that state.

- `src/core/`: state transitions, scoring, and the 20 achievement rules.
- `src/stations/`: pure interaction models plus Three.js station projections.
- `src/scene/`: the fixed-camera kitchen, renderer lifecycle, and adaptive quality profiles.
- `src/systems/`: input ownership, localization, persistence, audio, and recovery.
- `src/ui/`: the semantic shell, results, and collection views.
- `tests/`: Node test-runner contracts for simulation and browser-independent behavior.

WebGL context loss pauses all cooking input, snapshots the exact serialized game state, and rebuilds disposable scene objects after restoration. Sustained slow frames reduce thread count, foam count, shadows, and finally render resolution; these visual changes never alter scoring state.

## Saved data and privacy

Unlocked titles and settings are stored only in this browser under `wataryuu.natto.save.v1`; the locale uses `wataryuu.natto.locale.v1`. No personal data is collected or transmitted. Clearing browser data, using private browsing, changing browsers, or moving to another device does not carry progress over. If storage is missing, blocked, corrupted, version-incompatible, or quota-limited, the game continues with session memory and does not overwrite corrupted source data.

## Static hosting

Serve the repository files without rewriting their paths. Runtime imports and file references are relative so the same tree works from the repository root and from `/natto/`. Do not publish `docs/`, `tests/`, development scripts, `node_modules/`, or package-manager metadata with the game runtime.

Before release, capture the actual rendered result scene in a real browser at the target composition and save it as `assets/images/ogp.jpg`. The HTML already references its final public URL; the checked-in SVG favicon is the only hand-authored image asset.

## Asset and license inventory

All kitchen geometry, materials, textures, effects, and sound are generated locally by the application from Three.js primitives, Canvas APIs, and Web Audio APIs. The SVG favicon is original project artwork. No downloaded model, texture, font, music, or sound-effect asset is used.

Three.js `0.186.0` is distributed under the MIT License. Its exact checked-in license is at `vendor/three/LICENSE`; the browser-readable inventory is in `licenses.html`.

## Verification

Run `npm run vendor:sync && npm test` after production changes. Release browser checks cover 375×812 and 1280×800 viewports, both locales, complete cooking routes, all titles, context recovery, storage fallback, accessibility preferences, local-only requests, replay object counts, transfer size, and frame rate.
