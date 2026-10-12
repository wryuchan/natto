# Natto Game Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete bilingual, touch-first Three.js natto cooking game with four-axis scoring and a persistent 20-title collection.

**Architecture:** Keep simulation rules in pure ES modules and render those rules through a fixed-camera Three.js scene plus semantic DOM controls. The three stations share one serializable `GameState`; Three.js objects are projections of that state, never the source of truth. Runtime files are static and use a local import map, so the game works under `/natto/` without a production build or external CDN.

**Tech Stack:** JavaScript ES Modules, Three.js r186 (`three@0.186.0`), semantic HTML/CSS, Node.js built-in test runner, localStorage, Web Audio API.

**Spec:** `docs/superpowers/specs/2026-10-12-natto-game-design.md`

## Global Constraints

- Serve all runtime code, Three.js modules, imagery, and audio locally; no runtime CDN or API requests.
- Use relative URLs only so the same files work at `/` in development and `/natto/` in production.
- Treat 375×812 portrait as the primary mobile viewport and 1280×800 as the desktop verification viewport.
- Keep every primary DOM target at least 44 CSS px and account for all safe-area insets.
- Use Pointer Events with pointer capture; background station swipes require horizontal movement at least 1.4× vertical movement and at least 48 CSS px.
- Keep `GameState` JSON-serializable and free of DOM or Three.js objects.
- Support Japanese and English with precedence `?lang` → saved locale → browser locale; canonical remains `https://wataryuu.com/natto/`.
- Keep compressed initial transfer at or below 8MB and sustain at least 30fps on the agreed mid-range mobile test device.
- Support current and previous major iOS Safari, Android Chrome, desktop Chrome, Safari, and Edge at implementation time.
- Do not add authentication, analytics, ranking, cloud sync, PWA behavior, free-camera controls, gyroscope controls, rigid-body physics, fluid simulation, or arbitrary mesh cutting.

## Review Focus

- Malformed or out-of-order cooking events must leave state unchanged rather than corrupting an irreversible transfer; Task 2 pins this with transition-table tests.
- Pointer movement that starts on a utensil must never become a station swipe; Task 5 pins this with gesture-classification and pointer-ownership tests.
- Missing, blocked, quota-limited, or corrupted localStorage must fall back to session memory without blocking play; Task 4 pins each storage failure.
- Missing translation keys and long English copy must fall back safely and remain usable at 375px; Tasks 4 and 6 pin key parity and shell overflow checks.
- Asset failure or WebGL context loss must stop interaction, explain the problem, and restore from `GameState`; Task 11 pins recovery-controller behavior and browser smoke checks.

---

## File Structure

```text
natto/
├── AGENTS.md                         # Repository-specific working rules
├── README.md                         # Setup, test, run, architecture summary
├── package.json                      # Scripts and exact Three.js dev dependency
├── package-lock.json                 # Reproducible dependency lock
├── index.html                        # SEO, import map, semantic application shell
├── licenses.html                     # Runtime dependency and asset licenses
├── styles/
│   └── app.css                       # Responsive shell, overlays, results, a11y
├── scripts/
│   ├── static-server.mjs             # Local static development server
│   └── vendor-three.mjs              # Copies pinned Three.js runtime modules
├── vendor/three/                     # Generated local runtime files and LICENSE
├── assets/
│   └── images/                       # OGP image and UI imagery only
├── src/
│   ├── main.js                       # Composition root and startup
│   ├── app-controller.js             # Connects state, UI, renderer, persistence
│   ├── core/
│   │   ├── game-state.js             # State factory and immutable updates
│   │   ├── state-machine.js           # Legal and irreversible transitions
│   │   ├── scoring.js                 # Four score calculations
│   │   └── achievements.js            # 14 primary + 6 special title rules
│   ├── i18n/
│   │   ├── ja.js                      # Japanese strings
│   │   └── en.js                      # English strings
│   ├── systems/
│   │   ├── audio.js                   # Procedural Web Audio effects and mute
│   │   ├── i18n.js                    # Locale resolution and interpolation
│   │   ├── input.js                   # Pointer ownership and normalized gestures
│   │   ├── persistence.js             # Versioned save adapter and memory fallback
│   │   └── recovery.js                # Asset/WebGL failure state and restoration
│   ├── scene/
│   │   ├── renderer.js                # Three.js lifecycle and quality profile
│   │   ├── kitchen.js                 # Shared counter, lights, camera, rice bowl
│   │   └── materials.js               # Procedural warm materials and textures
│   ├── stations/
│   │   ├── cut-model.js               # Pure cutting rules
│   │   ├── cut-station.js             # Cutting meshes and raycast mapping
│   │   ├── mix-model.js               # Pure egg/condiment/mixing rules
│   │   ├── mix-station.js             # Mixing meshes and visual interpolation
│   │   ├── serve-model.js             # Pure pour and placement rules
│   │   └── serve-station.js           # Serving meshes and visual interpolation
│   └── ui/
│       ├── shell.js                    # Tabs, dialogs, tutorial, settings
│       ├── results.js                  # Scores, title reveal, replay/share
│       └── collection.js               # Locked hints and unlocked title history
└── tests/
    ├── project-structure.test.mjs
    ├── state-machine.test.mjs
    ├── scoring.test.mjs
    ├── achievements.test.mjs
    ├── i18n.test.mjs
    ├── persistence.test.mjs
    ├── input.test.mjs
    ├── shell.test.mjs
    ├── cut-model.test.mjs
    ├── mix-model.test.mjs
    ├── serve-model.test.mjs
    ├── results.test.mjs
    └── recovery.test.mjs
```

### Task 1: Repository Foundation and Local Three.js Runtime

**Files:**
- Create: `AGENTS.md`
- Create: `README.md`
- Create: `package.json`
- Create: `package-lock.json`
- Create: `index.html`
- Create: `styles/app.css`
- Create: `src/main.js`
- Create: `scripts/static-server.mjs`
- Create: `scripts/vendor-three.mjs`
- Create: `licenses.html`
- Create: `tests/project-structure.test.mjs`
- Generate: `vendor/three/three.module.js`
- Generate: `vendor/three/LICENSE`

**Interfaces:**
- Consumes: Approved design spec only.
- Produces: `npm test`, `npm start`, `npm run vendor:sync`; browser import map entry `three`; a loadable application shell at `/index.html`.

- [ ] **Step 1: Write the failing repository contract test**

In `tests/project-structure.test.mjs`, assert that:

- `package.json` pins `three` to exactly `0.186.0` and exposes `test`, `start`, and `vendor:sync` scripts.
- `index.html` contains Japanese default metadata, canonical `https://wataryuu.com/natto/`, an import map pointing to `./vendor/three/three.module.js`, and no `http://` or `https://` runtime script/import URL.
- every local `src`, `href`, and import-map target in `index.html` resolves to an existing file.
- `licenses.html` names Three.js and links to its local license text.

- [ ] **Step 2: Run the contract test and verify failure**

Run: `node --test tests/project-structure.test.mjs`

Expected: FAIL because the project files and vendored runtime do not exist.

- [ ] **Step 3: Create the project foundation and vendor script**

Create the listed files, run `npm install --save-dev --save-exact three@0.186.0`, and implement `scripts/vendor-three.mjs` to copy only `build/three.module.js` and `LICENSE` from the installed package. Use the parent site's static server implementation as the pattern, adding `.webp`, `.glb`, `.mp3`, `.ogg`, and `.wasm` MIME types even if the first version does not use all of them. Keep the initial `src/main.js` limited to marking the shell as ready.

- [ ] **Step 4: Generate the vendor files and run the foundation checks**

Run: `npm run vendor:sync && npm test`

Expected: the vendor script reports the pinned Three.js version and all foundation tests PASS.

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md README.md package.json package-lock.json index.html styles src/main.js scripts vendor licenses.html tests/project-structure.test.mjs
git commit -m "chore: scaffold static Three.js game"
```

### Task 2: Serializable Game State and Irreversible State Machine

**Files:**
- Create: `src/core/game-state.js`
- Create: `src/core/state-machine.js`
- Create: `tests/state-machine.test.mjs`

**Interfaces:**
- Consumes: no runtime dependencies.
- Produces: `createInitialGameState(): GameState`, `reduceGameState(state: GameState, event: GameEvent): GameState`, `canApplyEvent(state: GameState, event: GameEvent): boolean`, and frozen enums `STATIONS`, `PHASES`, `NATTO_STAGES`.

- [ ] **Step 1: Write failing state and transition tests**

Cover these exact cases in `tests/state-machine.test.mjs`:

- `createInitialGameState()` deep-equals the version-1 shape in the spec and survives `JSON.parse(JSON.stringify(state))`.
- `SWITCH_STATION` allows `cut`, `mix`, and `serve` in `cooking` but not in `result`.
- `TRANSFER_TO_BOWL` moves only the named available ingredient, records its amount, and is idempotent on repetition.
- `TRANSFER_TO_RICE` requires bowl contents and confirmation, sets an irreversible serving flag, and rejects further ingredient mutation.
- `FINISH` is rejected before any rice transfer and accepted afterward.
- invalid events, malformed amounts, and out-of-order events return the original state object unchanged.
- `RESET_RUN` returns a fresh run without touching external achievement data.

- [ ] **Step 2: Run the transition tests and verify failure**

Run: `node --test tests/state-machine.test.mjs`

Expected: FAIL because the state modules do not exist.

- [ ] **Step 3: Implement immutable state creation and transition reduction**

Use plain objects and arrays only. Accept a closed `GameEvent` union documented in JSDoc: `SWITCH_STATION`, `UPDATE_CUT`, `TRANSFER_TO_BOWL`, `ADD_EGG`, `ADD_CONDIMENT`, `UPDATE_MIX`, `TRANSFER_TO_RICE`, `UPDATE_SERVE`, `FINISH`, and `RESET_RUN`. Validate all external numeric payloads with `Number.isFinite()` and clamp normalized fields to `0..1`.

- [ ] **Step 4: Run the state tests**

Run: `npm test`

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/game-state.js src/core/state-machine.js tests/state-machine.test.mjs
git commit -m "feat: add cooking game state machine"
```

### Task 3: Four-Axis Scoring and All 20 Title Rules

**Files:**
- Create: `src/core/scoring.js`
- Create: `src/core/achievements.js`
- Create: `tests/fixtures/achievement-states.mjs`
- Create: `tests/scoring.test.mjs`
- Create: `tests/achievements.test.mjs`

**Interfaces:**
- Consumes: `GameState`, `NATTO_STAGES` from Task 2.
- Produces: `scoreGame(state): Scores`, `scoreRange(value, idealMin, idealMax, hardMin, hardMax): number`, `ACHIEVEMENTS`, and `evaluateAchievements(state, scores): { primaryId: string, specialIds: string[] }`.

- [ ] **Step 1: Write failing scoring tests**

Assert the spec's exact boundaries:

- whole natto with no green onion yields cutting score `92` (`95×0.7 + 85×0.3`, rounded).
- paste receives natto base `30`, while whole and hikiwari each receive `95`.
- egg-free mixing is ideal at progress `0.55..0.72`; egg mixing is ideal at `0.68..0.84`.
- soy sauce ideal ranges are `2.5..4.8ml` without egg and `3.5..5.8ml` with egg.
- mustard `0..1.2g` and green onion `0..0.40` remain valid high-score ranges.
- perfect serving requires transfer `0.88..1`, coverage `0.40..0.78`, center offset `<=0.18`, spill `<=0.05`.
- every score and overall is an integer in `0..100`; worsening one out-of-range input cannot improve its owning score.

- [ ] **Step 2: Run scoring tests and verify failure**

Run: `node --test tests/scoring.test.mjs`

Expected: FAIL because scoring exports do not exist.

- [ ] **Step 3: Implement range scoring and the four weighted axes**

Use linear falloff between an ideal edge and its hard limit, clamp every component, and round only the final axis values and overall. Keep the four exported score functions separately testable: `scoreCutting`, `scoreMixing`, `scoreTaste`, and `scoreServing`.

- [ ] **Step 4: Write failing achievement reachability and priority tests**

Create one named fixture per title from the representative states in specification sections 11.2 and 11.3. Assert:

- all 14 normal fixtures select their intended primary ID, including `tamago_kake_gohan` and `coarse_cut_devotee`.
- `fermentation_master` outranks every other matching primary title.
- `tamago_kake_gohan` is reachable only with egg, minimal mixing, at least `0.88` transfer, and no more than `0.10` spill.
- `coarse_cut_devotee` requires the `coarse` stage and cannot unlock for whole, hikiwari, or paste states.
- `homestyle_bowl` is the fallback only after a valid finish.
- all six special IDs unlock independently and can unlock together, including `scallion_mountain` at onion amount `>=0.65` and `serving_disaster` at spill ratio `>=0.35`.
- no title references locale-dependent display text.

- [ ] **Step 5: Implement the title registry and evaluator**

Each `ACHIEVEMENTS` entry must contain `id`, `kind`, `priority`, and a pure `matches(state, scores)` predicate. Sort only primary achievements by descending priority; preserve a stable declaration order for special achievements.

- [ ] **Step 6: Run scoring and title tests**

Run: `npm test`

Expected: all tests PASS, including 20 reachable titles.

- [ ] **Step 7: Commit**

```bash
git add src/core/scoring.js src/core/achievements.js tests/fixtures tests/scoring.test.mjs tests/achievements.test.mjs
git commit -m "feat: add scoring and title rules"
```

### Task 4: Bilingual Copy and Versioned Browser Persistence

**Files:**
- Create: `src/i18n/ja.js`
- Create: `src/i18n/en.js`
- Create: `src/systems/i18n.js`
- Create: `src/systems/persistence.js`
- Create: `tests/i18n.test.mjs`
- Create: `tests/persistence.test.mjs`

**Interfaces:**
- Consumes: `ACHIEVEMENTS` IDs and `Scores` from Task 3.
- Produces: `resolveLocale({ query, saved, navigatorLanguage }): "ja"|"en"`, `createTranslator(locale): (key, params?) => string`, `SAVE_KEY`, `LOCALE_KEY`, `createPersistence(storage): PersistenceAdapter`, and `createMemoryPersistence(): PersistenceAdapter`.

- [ ] **Step 1: Write failing locale and copy tests**

Assert:

- valid query locale wins over saved and browser values.
- invalid query falls through to saved locale, then `navigator.language`, then English.
- Japanese and English export identical flattened key sets.
- every achievement ID has `name` and locked `hint` keys in both languages.
- missing Japanese copy falls back to English and calls the injected warning sink once.
- interpolation escapes unknown placeholders and never returns `undefined`.

- [ ] **Step 2: Run i18n tests and verify failure**

Run: `node --test tests/i18n.test.mjs`

Expected: FAIL because locale modules do not exist.

- [ ] **Step 3: Implement the locale registry and all approved copy**

Include shell labels, tutorial, irreversible confirmations, results, score names, errors, save disclosure, reset confirmation, title names/hints, ARIA labels, SEO strings, and share strings. Use `Intl.DateTimeFormat(locale)` for unlocked dates.

- [ ] **Step 4: Write failing persistence tests**

Use fake storage adapters to assert:

- valid version-1 data round-trips under `wataryuu.natto.save.v1`.
- unlocking updates `unlockedAt` once but replaces best overall and per-axis scores only with higher values.
- malformed JSON, unknown versions, thrown reads, thrown writes, and quota errors switch to memory storage without throwing.
- reset clears achievements and settings only after the caller's confirmed action.
- persisted IDs and scores are locale-independent.

- [ ] **Step 5: Implement persistence with memory fallback**

Return an adapter with `load()`, `recordResult(result)`, `updateSettings(partial)`, and `reset()` methods. Validate loaded shapes before use and expose `mode: "local"|"memory"` for the save disclosure UI.

- [ ] **Step 6: Run all tests**

Run: `npm test`

Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/i18n src/systems/i18n.js src/systems/persistence.js tests/i18n.test.mjs tests/persistence.test.mjs
git commit -m "feat: add bilingual copy and local progress"
```

### Task 5: Pointer Ownership and Gesture Classification

**Files:**
- Create: `src/systems/input.js`
- Create: `tests/input.test.mjs`

**Interfaces:**
- Consumes: station identifiers from Task 2.
- Produces: `normalizeLocalPoint(clientPoint, rect): {x:number,y:number}`, `classifyBackgroundSwipe(sample): "previous"|"next"|null`, `amountFromHold(elapsedMs, ratePerSecond, max): number`, and `createPointerRouter({ canvas, hitTest, handlers }): PointerRouter`.

- [ ] **Step 1: Write failing gesture tests**

Assert:

- 48px horizontal movement with horizontal dominance `>=1.4` classifies in the correct direction.
- 47px, vertical-dominant, interactive-start, multi-pointer, canceled, and already-owned gestures return `null`.
- an owned utensil drag never emits a station swipe.
- normalized points are stable across 375×812 and 1280×800 rectangles.
- hold quantity depends on elapsed milliseconds, not sample count or frame rate.

- [ ] **Step 2: Run input tests and verify failure**

Run: `node --test tests/input.test.mjs`

Expected: FAIL because the input module does not exist.

- [ ] **Step 3: Implement the pointer router**

Use one active pointer, call `setPointerCapture()` after a successful hit test, route all later samples to that owner, and release ownership on `pointerup`, `pointercancel`, loss of capture, or recovery mode. Make hit testing an injected function so the router has no Three.js dependency.

- [ ] **Step 4: Run all tests**

Run: `npm test`

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/systems/input.js tests/input.test.mjs
git commit -m "feat: add touch-safe gesture routing"
```

### Task 6: Responsive App Shell, Tutorial, and Station Navigation

**Files:**
- Modify: `index.html`
- Modify: `styles/app.css`
- Create: `src/ui/shell.js`
- Create: `src/app-controller.js`
- Modify: `src/main.js`
- Create: `tests/shell.test.mjs`

**Interfaces:**
- Consumes: state reducer (Task 2), translator and persistence (Task 4), pointer router (Task 5).
- Produces: `deriveShellModel(state, settings, locale): ShellModel`, `createShell(root, callbacks): ShellView`, and `createAppController(dependencies): AppController`.

- [ ] **Step 1: Write failing shell-model and static-markup tests**

Assert:

- three station tabs expose translated labels, active state, and disabled state from `ShellModel`.
- switching locale changes all model copy but preserves the same `GameState` reference.
- the first run shows a two-page tutorial; a saved `tutorialSeen` setting suppresses it.
- irreversible actions request the correct confirmation unless `skipIrreversibleConfirmations` is true.
- `index.html` includes live regions, dialog labels, focusable 44px controls, safe-area CSS variables, `lang`, and no fixed-width element wider than 375px.
- the English longest-copy fixture does not set `white-space: nowrap` on buttons or dialog copy.

- [ ] **Step 2: Run shell tests and verify failure**

Run: `node --test tests/shell.test.mjs`

Expected: FAIL because the shell and controller do not exist.

- [ ] **Step 3: Implement the DOM shell and controller boundary**

Keep Three.js rendering behind an injected `scene` dependency with `setStation`, `renderState`, `pause`, and `resume` methods. The DOM shell owns tabs, language, mute, help, tutorial, confirmations, finish action, and status announcements. Move focus into an opened dialog and restore it to the opener on close.

- [ ] **Step 4: Run unit tests and browser shell smoke check**

Run: `npm test && npm start`

Expected: tests PASS; at `http://127.0.0.1:4173/`, the shell loads with no console errors, all controls remain visible at 375×812 and 1280×800, and language switching does not reset the active station.

- [ ] **Step 5: Commit**

```bash
git add index.html styles/app.css src/main.js src/app-controller.js src/ui/shell.js tests/shell.test.mjs
git commit -m "feat: add bilingual responsive game shell"
```

### Task 7: Three.js Kitchen and Fixed-Camera Station Framework

**Files:**
- Create: `src/scene/renderer.js`
- Create: `src/scene/kitchen.js`
- Create: `src/scene/materials.js`
- Create: `tests/renderer-config.test.mjs`
- Modify: `src/app-controller.js`

**Interfaces:**
- Consumes: local Three.js import map (Task 1) and `GameState` (Task 2).
- Produces: `selectQualityProfile(capabilities): QualityProfile`, `createKitchenScene(canvas, options): KitchenScene`, and station adapter contract `{ id, group, hitTest, applyPointerSample, renderState, dispose }`.

- [ ] **Step 1: Write failing renderer-configuration tests**

Assert:

- device pixel ratio is capped at `2` and at `1.5` for the low profile.
- shadow, thread, foam, and antialias settings degrade in that exact order.
- portrait and desktop camera descriptors frame the active work surface without changing game coordinates.
- renderer resize uses the canvas client size and never the window dimensions directly.
- render-state projection never mutates `GameState`.

- [ ] **Step 2: Run renderer tests and verify failure**

Run: `node --test tests/renderer-config.test.mjs`

Expected: FAIL because scene modules do not exist.

- [ ] **Step 3: Implement the warm procedural kitchen scene**

Use primitives and procedural Canvas textures for the wood counter, cutting board, ceramic bowl, rice, utensils, ingredient containers, and soft lighting. Keep one renderer and one scene; switch station groups and tween fixed camera descriptors. Do not add OrbitControls, physics, or downloaded third-party models.

- [ ] **Step 4: Verify rendering and lifecycle**

Run: `npm test && npm start`

Expected: all tests PASS; the empty kitchen renders at all three stations with stable framing, no WebGL warnings, no network requests outside localhost, and no object-count growth after 20 station switches.

- [ ] **Step 5: Commit**

```bash
git add src/scene src/app-controller.js tests/renderer-config.test.mjs
git commit -m "feat: render fixed-camera kitchen stations"
```

### Task 8: Cutting Station Simulation and Visual States

**Files:**
- Create: `src/stations/cut-model.js`
- Create: `src/stations/cut-station.js`
- Create: `tests/cut-model.test.mjs`
- Modify: `src/scene/kitchen.js`

**Interfaces:**
- Consumes: station adapter contract (Task 7) and `UPDATE_CUT` / `TRANSFER_TO_BOWL` events (Task 2).
- Produces: `applyKnifeStroke(cutState, stroke): CutUpdate`, `deriveNattoStage(progress): NattoStage`, `scoreOnionCuts(cuts): {fineness,uniformity}`, and `createCutStation(context): StationAdapter`.

- [ ] **Step 1: Write failing cutting-model tests**

Assert:

- knife strokes outside the board or ingredient bounds do nothing.
- repeated strokes progress natto monotonically through `whole → coarse → hikiwari → paste` at declared thresholds `0.18`, `0.52`, and `0.96`.
- stroke spacing controls onion uniformity independently of cut count.
- pointer sample frequency does not change the outcome for the same geometric stroke.
- a transferred ingredient rejects further cuts.

- [ ] **Step 2: Run cutting tests and verify failure**

Run: `node --test tests/cut-model.test.mjs`

Expected: FAIL because cutting modules do not exist.

- [ ] **Step 3: Implement cutting rules and visuals**

Represent onion segments and natto beans with `InstancedMesh`; update instance transforms and swap the natto arrangement at stage thresholds. Raycast the knife and ingredient against board-local planes, then dispatch only normalized strokes to the pure model.

- [ ] **Step 4: Verify tests and station interaction**

Run: `npm test && npm start`

Expected: tests PASS; touch and mouse strokes visibly chop only the intended ingredient, whole and hikiwari remain attainable, paste appears only after deliberate over-cutting, and transfer to the bowl cannot be undone.

- [ ] **Step 5: Commit**

```bash
git add src/stations/cut-model.js src/stations/cut-station.js src/scene/kitchen.js tests/cut-model.test.mjs
git commit -m "feat: add interactive cutting station"
```

### Task 9: Mixing Station, Egg, Condiments, Threads, and Foam

**Files:**
- Create: `src/stations/mix-model.js`
- Create: `src/stations/mix-station.js`
- Create: `tests/mix-model.test.mjs`
- Create: `src/systems/audio.js`
- Modify: `src/app-controller.js`

**Interfaces:**
- Consumes: `ADD_EGG`, `ADD_CONDIMENT`, `UPDATE_MIX` events (Task 2), input hold timing (Task 5), station adapter (Task 7).
- Produces: `applyEggTap(eggState, target): EggUpdate`, `amountFromCondimentHold(kind, elapsedMs): number`, `applyMixPath(mixing, points, elapsedMs): MixingUpdate`, `createMixStation(context): StationAdapter`, and `createAudioSystem(options): AudioSystem`.

- [ ] **Step 1: Write failing mixing-model tests**

Assert:

- the first valid rim tap cracks the egg and the second opens it; taps elsewhere do nothing.
- condiment amounts are identical for equal elapsed time at 30fps and 60fps sample sequences.
- circularity derives from bowl-local points and is rotation-direction agnostic.
- progress, aeration, and stability stay in `0..1` and do not change on stationary input.
- egg presence changes the ideal progress used by scoring but never rewrites previous mixing samples.
- egg yolk remains visibly intact through `mixing.progress <= 0.20` and blends progressively above that threshold, matching `tamago_kake_gohan` eligibility.
- after transfer to rice, egg, condiment, and mixing events are rejected.

- [ ] **Step 2: Run mixing tests and verify failure**

Run: `node --test tests/mix-model.test.mjs`

Expected: FAIL because mixing modules do not exist.

- [ ] **Step 3: Implement mixing rules, staged visuals, and procedural effects**

Animate egg crack/open states, use button hold duration for condiments, and interpolate surface color, foam instances, and capped thread curves from `GameState`. Generate short chopping, crack, pour, stir, and result effects with Web Audio oscillators/noise after the first user gesture; provide mute and no-audio fallback.

- [ ] **Step 4: Verify tests and station interaction**

Run: `npm test && npm start`

Expected: tests PASS; egg, condiment quantity, threads, foam, and mute respond consistently at both viewports, the low-mix egg route visibly preserves the yolk, and no sound starts before a user gesture.

- [ ] **Step 5: Commit**

```bash
git add src/stations/mix-model.js src/stations/mix-station.js src/systems/audio.js src/app-controller.js tests/mix-model.test.mjs
git commit -m "feat: add egg seasoning and mixing simulation"
```

### Task 10: Serving Station and Finish Flow

**Files:**
- Create: `src/stations/serve-model.js`
- Create: `src/stations/serve-station.js`
- Create: `tests/serve-model.test.mjs`
- Modify: `src/app-controller.js`

**Interfaces:**
- Consumes: `TRANSFER_TO_RICE`, `UPDATE_SERVE`, `FINISH` events (Task 2) and station adapter (Task 7).
- Produces: `applyPourSample(serving, sample): ServingUpdate`, `deriveServingVisual(serving): ServingVisual`, and `createServeStation(context): StationAdapter`.

- [ ] **Step 1: Write failing serving tests**

Assert:

- pour direction, distance, and held milliseconds determine center offset, coverage, and transferred ratio.
- identical elapsed time produces identical transfer at different sample rates.
- transferred ratio never exceeds `1`; spill ratio stays in `0..1`.
- a centered moderate pour can satisfy all four perfect serving ranges.
- returning to cut or mix after serving does not permit mutation of bowl contents.
- finish remains unavailable until some natto reaches the rice and requires explicit confirmation.

- [ ] **Step 2: Run serving tests and verify failure**

Run: `node --test tests/serve-model.test.mjs`

Expected: FAIL because serving modules do not exist.

- [ ] **Step 3: Implement serving rules and staged mesh deformation**

Use bowl-local drag to derive tilt and a rice-local landing point. Reveal and deform a bounded set of natto surface patches instead of simulating fluid. Project spill onto a separate counter patch so it is visible and scoreable.

- [ ] **Step 4: Verify tests and full cooking loop**

Run: `npm test && npm start`

Expected: tests PASS; the player can complete cut → mix → serve with backward station navigation but cannot reverse either ingredient transfer.

- [ ] **Step 5: Commit**

```bash
git add src/stations/serve-model.js src/stations/serve-station.js src/app-controller.js tests/serve-model.test.mjs
git commit -m "feat: add serving and finish flow"
```

### Task 11: Results, Collection, Replay, and Share Text

**Files:**
- Create: `src/ui/results.js`
- Create: `src/ui/collection.js`
- Create: `tests/results.test.mjs`
- Modify: `index.html`
- Modify: `styles/app.css`
- Modify: `src/app-controller.js`

**Interfaces:**
- Consumes: `scoreGame`, `evaluateAchievements` (Task 3), translator and persistence (Task 4).
- Produces: `buildResultModel(state, previousSave, locale): ResultModel`, `buildCollectionModel(save, locale): CollectionModel`, `buildShareText(result, locale, url): string`, `renderResults(root, model, callbacks)`, and `renderCollection(root, model, callbacks)`.

- [ ] **Step 1: Write failing result and collection tests**

Assert:

- result model exposes all four numeric scores, overall, one primary title, and zero or more newly unlocked special titles.
- locked titles expose only silhouette state and translated hint, never the title name.
- unlocked titles expose translated name, best overall, best per-axis scores, and locale-formatted unlock date.
- switching locale changes display copy but not achievement IDs, scores, or dates.
- Japanese and English share text include title, overall, canonical URL, and no undefined placeholder.
- replay creates a fresh `GameState` while preserving saved collection data.

- [ ] **Step 2: Run results tests and verify failure**

Run: `node --test tests/results.test.mjs`

Expected: FAIL because result modules do not exist.

- [ ] **Step 3: Implement result reveal, collection, reset, replay, and Web Share/X fallback**

Display four labeled scores as both values and accessible bars. Use `navigator.share` only when available and user-invoked; otherwise open an encoded X intent URL. Require confirmation before collection reset and announce success in a live region.

- [ ] **Step 4: Verify tests and both locales in browser**

Run: `npm test && npm start`

Expected: tests PASS; title unlock, persistence after reload, locked hints, locale switch, replay, reset confirmation, and share fallback all work at both target viewports.

- [ ] **Step 5: Commit**

```bash
git add src/ui/results.js src/ui/collection.js src/app-controller.js index.html styles/app.css tests/results.test.mjs
git commit -m "feat: add results and title collection"
```

### Task 12: Recovery, Performance Degradation, SEO Assets, and Final Game Verification

**Files:**
- Create: `src/systems/recovery.js`
- Create: `tests/recovery.test.mjs`
- Create: `assets/images/ogp.jpg`
- Modify: `index.html`
- Modify: `styles/app.css`
- Modify: `README.md`
- Modify: `licenses.html`
- Modify: `src/app-controller.js`
- Modify: `src/scene/renderer.js`

**Interfaces:**
- Consumes: complete game and serializable `GameState` from prior tasks.
- Produces: `createRecoveryController({ scene, shell, rebuild }): RecoveryController`, final metadata and share image, and a verified release candidate.

- [ ] **Step 1: Write failing recovery tests**

Assert:

- asset failure pauses input and returns translated retry state containing the failed asset ID.
- `webglcontextlost` prevents default handling, pauses rendering, and preserves the exact serialized `GameState`.
- `webglcontextrestored` rebuilds the scene from that state and resumes only after a successful render.
- repeated failure stays in an actionable error state rather than looping.
- performance degradation changes thread count, foam count, shadows, then resolution in that order and never changes scoring state.

- [ ] **Step 2: Run recovery tests and verify failure**

Run: `node --test tests/recovery.test.mjs`

Expected: FAIL because recovery behavior does not exist.

- [ ] **Step 3: Implement recovery and final metadata**

Connect browser context events, renderer quality sampling, translated error overlays, and retry. Capture the actual rendered result scene for `assets/images/ogp.jpg`; set page-specific title, description, canonical, robots, Open Graph, Twitter card, theme color, and favicon links. Document setup, architecture, saved-data limits, asset origins, and license inventory.

- [ ] **Step 4: Run automated verification**

Run: `npm run vendor:sync && npm test`

Expected: all tests PASS with no warnings or skipped tests.

- [ ] **Step 5: Run end-to-end browser verification**

Run: `npm start`

Verify at 375×812 and 1280×800:

- Japanese and English complete playthroughs.
- particle/mesh counts do not grow across five replays.
- all network requests are local and return 200.
- no console errors occur.
- all primary targets are at least 44px.
- reduced motion, mute, tutorial, confirmations, save fallback, reset, and sharing work.
- the four route fixtures (whole/no egg, whole/egg, hikiwari/no egg, hikiwari/egg) each achieve at least 85 overall.
- each of the 20 titles unlocks using its documented representative state.
- compressed initial transfer is at most 8MB and the agreed mobile test device sustains at least 30fps.

- [ ] **Step 6: Commit**

```bash
git add src/systems/recovery.js src/app-controller.js src/scene/renderer.js tests/recovery.test.mjs index.html styles/app.css assets/images/ogp.jpg README.md licenses.html
git commit -m "feat: complete resilient natto cooking game"
```

### Task 13: Whole-Branch Review and Push-Ready Audit

**Files:**
- Modify only files required by confirmed review findings.

**Interfaces:**
- Consumes: all prior tasks and the design spec.
- Produces: reviewed `main` branch ready to push and integrate as a submodule.

- [ ] **Step 1: Run the complete verification suite from a clean checkout state**

Run: `npm ci && npm run vendor:sync && npm test && git status --short`

Expected: all tests PASS and only intentionally generated, tracked vendor files remain unchanged.

- [ ] **Step 2: Request an independent whole-branch review**

Review against the design spec, with special attention to all Global Constraints and Review Focus entries. Reject scope expansion and style-only churn.

- [ ] **Step 3: Fix only correctness, requirement, accessibility, performance, or maintainability findings that affect release**

For each fix, add or strengthen a failing regression test before changing production code.

- [ ] **Step 4: Repeat automated and browser verification**

Run: `npm test && npm start`

Expected: all tests PASS and the two target viewports pass the Task 12 checklist.

- [ ] **Step 5: Commit review fixes if any**

```bash
git add <reviewed-files>
git commit -m "fix: address natto game review findings"
```

- [ ] **Step 6: Confirm push readiness**

Run: `git status --short --branch && git log --oneline --decorate -10`

Expected: clean `main`, all implementation commits present, and no parent-repository changes mixed into the game repository.
