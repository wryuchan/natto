# Natto Cooking Game

A bilingual, touch-first Three.js cooking game for `https://wataryuu.com/natto/`.

## Development

```sh
npm install
npm run vendor:sync
npm test
npm start
```

The development server listens on `http://127.0.0.1:4173/` by default. Runtime dependencies are copied into `vendor/`; the browser does not use a CDN.

## Architecture

Game rules live in pure ES modules under `src/core/`. Browser systems, rendering, stations, and semantic UI consume a shared JSON-serializable game state without owning it.

