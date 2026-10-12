# Natto Publishing Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Register the finished natto game as a wataryuu.com submodule and publish only its runtime files at `https://wataryuu.com/natto/` with a top-page card and sitemap entry.

**Architecture:** The game remains owned by `git@github.com:wryuchan/natto.git` on `main`. The wataryuu parent repository pins it as a submodule, and `scripts/prepare-firebase.mjs` copies an explicit runtime allowlist into generated `hosting/natto/`; the parent page and sitemap provide discovery.

**Tech Stack:** Git submodules, Node.js file-copy script, Node.js built-in test runner, static HTML, Firebase Hosting preparation pipeline.

**Spec:** `docs/superpowers/specs/2026-10-12-natto-game-design.md` in the natto repository; parent rules in `AGENTS.md`, `.agents/skills/add-subsite/SKILL.md`, and `docs/DEPLOY.md`.

## Global Constraints

- Execute this plan from `/Users/apple/Project/wataryuu`, not from the nested game repository.
- Start only after the reviewed natto `main` commit is pushed to `git@github.com:wryuchan/natto.git`.
- Configure `.gitmodules` with `branch = main` and `ignore = all`.
- Never edit `hosting/`; it is generated only by `npm run hosting:prepare`.
- Copy only runtime files; exclude `docs`, `tests`, `scripts`, `node_modules`, package metadata, and development configuration.
- Keep the public URL exactly `https://wataryuu.com/natto/` and sitemap `lastmod` equal to the actual integration date.
- Do not deploy until the separate `deploy` skill is explicitly invoked for a deployment request.

## Review Focus

- A local-only natto commit must never be presented as publishable; Task 1 verifies the pinned commit exists on `origin/main`.
- Generated `hosting/natto/` must omit development and documentation files; Task 2 asserts an explicit allowlist and denylist.
- Relative game assets must resolve under `/natto/` rather than the domain root; Task 2 checks generated HTML and browser network requests.
- The top-page card, preview alt text, canonical URL, and sitemap must agree on the product name and path; Task 3 pins all four.
- Parent preparation must remain regression-safe for every existing subsite; Task 4 runs the complete parent test and visual review workflow.

---

### Task 1: Register and Pin the Natto Submodule

**Files:**
- Modify: `.gitmodules`
- Add gitlink: `natto`

**Interfaces:**
- Consumes: pushed natto `origin/main` commit from the game implementation plan.
- Produces: parent gitlink `natto` and `.gitmodules` entry using `git@github.com:wryuchan/natto.git`, branch `main`, ignore `all`.

- [ ] **Step 1: Verify the game commit is remotely available**

Run from the natto repository:

```bash
git status --short --branch
git rev-parse HEAD
git ls-remote origin refs/heads/main
```

Expected: clean local `main`, and local `HEAD` equals the remote `main` hash.

- [ ] **Step 2: Add the existing nested repository as a submodule**

From the parent repository, use the existing worktree when Git accepts it; otherwise move the clean game worktree aside temporarily, run `git submodule add -b main git@github.com:wryuchan/natto.git natto`, then restore only untracked local developer files that are explicitly needed. Do not delete or overwrite a dirty worktree.

- [ ] **Step 3: Pin submodule configuration**

Add `branch = main` and `ignore = all` to the natto entry and verify `git submodule status natto` reports the intended commit without a leading `+` or `-`.

- [ ] **Step 4: Commit**

```bash
git add .gitmodules natto
git commit -m "chore: add natto game submodule"
```

### Task 2: Copy Only Natto Runtime Files into Firebase Hosting

**Files:**
- Modify: `scripts/prepare-firebase.mjs`
- Modify: `tests/prepare-firebase.test.mjs`

**Interfaces:**
- Consumes: `natto/` submodule runtime layout.
- Produces: `copyNatto()` and generated `hosting/natto/` containing only `index.html`, `licenses.html`, `styles/`, `src/`, `vendor/`, and `assets/`.

- [ ] **Step 1: Extend the failing hosting preparation test**

After the existing preparation spawn, assert:

- all six runtime entries exist under `hosting/natto/`.
- `docs`, `tests`, `scripts`, `node_modules`, `package.json`, `package-lock.json`, `AGENTS.md`, and `README.md` do not exist there.
- generated `index.html` uses relative `./styles/`, `./src/`, `./vendor/`, and `./assets/` references and contains no runtime CDN URL.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `node --test tests/prepare-firebase.test.mjs`

Expected: FAIL because `hosting/natto/` is not generated.

- [ ] **Step 3: Implement `copyNatto()` with an explicit allowlist**

Follow `copyMahjongChampion()` and `copyKokushiPoi()` patterns. Add the function to the execution list after the other static subsites; do not use a recursive copy of the entire submodule root.

- [ ] **Step 4: Run the focused and full parent tests**

Run: `npm test && npm run hosting:prepare`

Expected: all tests PASS and preparation prints the normal success path.

- [ ] **Step 5: Commit**

```bash
git add scripts/prepare-firebase.mjs tests/prepare-firebase.test.mjs
git commit -m "feat: package natto game for hosting"
```

### Task 3: Add Top-Page Discovery and Sitemap Entry

**Files:**
- Modify: `index.html`
- Modify: `sitemap.xml`
- Create: `assets/site-previews/natto.png`
- Create: `tests/natto-publication.test.mjs`

**Interfaces:**
- Consumes: locally generated `hosting/natto/` and the final rendered game.
- Produces: one top-page service card, one real 16:9 game screenshot, and one sitemap URL.

- [ ] **Step 1: Write the failing publication metadata test**

Assert:

- `index.html` contains exactly one `href="./natto/"` service link.
- the card title is `納豆調理ゲーム`, its preview is `./assets/site-previews/natto.png`, and the alt text describes the visible cutting/mixing station rather than repeating the title.
- card metadata mentions `3D調理`, `称号コレクション`, and `日本語・English`.
- `sitemap.xml` contains exactly one `<loc>https://wataryuu.com/natto/</loc>` and `lastmod` equal to the integration date.
- `assets/site-previews/natto.png` exists and has nonzero size.

- [ ] **Step 2: Run the metadata test and verify failure**

Run: `node --test tests/natto-publication.test.mjs`

Expected: FAIL because the parent page, sitemap, and preview do not yet reference natto.

- [ ] **Step 3: Add the card and sitemap URL**

Follow the existing card structure without introducing new global card styles. Keep the card copy concise enough to avoid worsening the known mobile page-length backlog. Capture the actual desktop game render for `natto.png`; do not use a mockup.

- [ ] **Step 4: Run publication and parent tests**

Run: `npm test && npm run hosting:prepare`

Expected: all tests PASS and the preview is copied to `hosting/assets/site-previews/natto.png`.

- [ ] **Step 5: Commit**

```bash
git add index.html sitemap.xml assets/site-previews/natto.png tests/natto-publication.test.mjs
git commit -m "feat: feature natto game on wataryuu.com"
```

### Task 4: End-to-End Hosting and Visual Review

**Files:**
- Modify only files required by confirmed review findings.

**Interfaces:**
- Consumes: generated parent hosting package and all prior parent changes.
- Produces: reviewed, deploy-ready parent branch; deployment itself remains out of scope.

- [ ] **Step 1: Regenerate from a clean source state**

Run: `npm test && npm run hosting:prepare`

Expected: all tests PASS and `hosting/natto/` contains only the Task 2 allowlist.

- [ ] **Step 2: Serve the generated hosting directory**

Run from `hosting/`: `python3 -m http.server 8766`

Expected: `http://127.0.0.1:8766/natto/` and `http://127.0.0.1:8766/` both load with HTTP 200.

- [ ] **Step 3: Review mobile and desktop rendering and interactions**

At 375×812 and 1280×800, verify the parent card and the complete natto flow. Check all network requests, console messages, Japanese/English switching, title persistence, replay, share, and return navigation. Confirm there are no `/src`, `/vendor`, or `/assets` root-path requests escaping `/natto/`.

- [ ] **Step 4: Request an independent design review**

Have a fresh reviewer drive both viewports and report only correctness, usability, accessibility, responsive-layout, or requirement failures. Apply the project rule that UI approval requires rendered browser evidence.

- [ ] **Step 5: Fix confirmed findings with regression coverage and rerun verification**

Add a failing automated test where practical before each fix, rerun `npm test && npm run hosting:prepare`, and repeat the affected browser interaction.

- [ ] **Step 6: Commit review fixes if any**

```bash
git add <reviewed-files>
git commit -m "fix: address natto publishing review findings"
```

- [ ] **Step 7: Confirm deploy readiness without deploying**

Run: `git status --short --branch && git submodule status natto`

Expected: clean parent branch, natto pinned to the reviewed remote commit, and no manual `hosting/` edits staged.

When the user explicitly requests production publication, invoke the repository `deploy` skill and follow its remote-submodule safeguards before running Firebase deployment.
