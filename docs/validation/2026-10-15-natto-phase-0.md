# Phase 0 validation — 2026-10-15

## Automated checks

- `npm test`: exit 0; 145 tests passed, 0 failed, 0 skipped, 0 todo.
- `git diff --check`: exit 0; no output.
- `npm start`: the sandboxed attempt exited 1 with `listen EPERM` on `127.0.0.1:4173`. The approved local-server retry started successfully and served this worktree at `http://127.0.0.1:4174/`.

## Browser checks

- Browser selected by the local browser runtime: Google Chrome.
- Installed browser version: `Google Chrome 155.0.8059.40`.
- Browser-reported device pixel ratio: 1 at all three viewport overrides.
- `tab.dev.logs({ levels: ["error", "warning"], limit: 100 })` after the run returned an empty list.

### 1280 × 800

- Measured viewport: 1280 × 800.
- Canvas client box: 1000 × 394 px, from y=68 to y=462; computed height `394px`; backing buffer 1000 × 394.
- Document client height and scroll height were both 800 px.
- The header `ライセンス` link navigated to `http://127.0.0.1:4174/licenses.html`. The page identified `Three.js 0.186.0` and exposed the checked-in `./vendor/three/LICENSE` link.
- Toggling the locale changed the heading from `納豆調理ゲーム` to `Natto Cooking Game` and changed the station/action labels to English.
- Three vertical knife drags were made from y=284 to y=250 at x=656, x=685, and x=714, covering the visible left, center, and right scallion positions. The rendered scallion row visibly changed from six broad pieces to more, narrower subdivisions after the drags.
- The button route completed: `Chop natto` → `Move natto to bowl` → confirmation → `Mix` → `Mix in a circle` → `Serve` → `Serve over rice` → confirmation → `Finish` → confirmation.
- Before serving, both the mixing bowl and rice bowl were fully inside the canvas frame. After transfer, the mixing bowl visibly contained natto.
- The result view displayed `Homestyle Natto Rice`, overall 68, Cutting 92, Mixing 48, Flavor balance 40, and Presentation 91.
- The result `Licenses` link navigated to `http://127.0.0.1:4174/licenses.html`.

### 375 × 812

- Measured viewport: 375 × 812.
- Canvas client box: 351 × 365.3984375 px, from y=172 to y=537.3984375; computed height `365.398px`.
- Initial document scroll height was 871 px for an 812 px client height. The keyboard controls occupied y=605.3984375 through y=649.3984375, and the Finish button occupied y=758.7890625 through y=802.7890625.
- Opening the Mix station before transfer showed an empty bowl. After the natto transfer, opening Mix showed the bowl filled with natto.
- The same button route and all three confirmation gates completed at this viewport. The result again displayed `Homestyle Natto Rice`, overall 68, with the same four component scores.
- At the Serve station, the mixing bowl and rice bowl were both fully visible inside the canvas frame.

### 360 × 800

- Measured viewport: 360 × 800.
- Root font size: 16 px, so `max(16rem, 45svh)` was `max(256px, 360px)` = 360 px.
- Canvas client box: 336 × 360 px, from y=172 to y=532; computed height and computed minimum height were both `360px`.
- Initial document scroll height was 879 px for an 800 px client height. The keyboard controls occupied y=600 through y=657.984375.
- A browser scroll reached y=79.5 (reported maximum 79). At that position Finish occupied y=687.875 through y=731.875 and Start over occupied y=743.875 through y=787.875, fully inside the viewport.

## Hosting preparation

- From `/Users/apple/Project/wataryuu`, `npm run hosting:prepare` ran in the sandbox and exited 1 before regeneration with `EPERM: operation not permitted, unlink '/Users/apple/Project/wataryuu/hosting/404.html'`.
- A request to rerun the same command with permission to replace the parent repository's generated `hosting/` tree was not authorized in this session. No successful hosting generation was observed, and no generated hosting output was added to the natto commit.

## Pending validation

- **PENDING — physical Android Chrome:** no physical Android device was available in this session. Manufacturer/model, Android version, Chrome version, viewport, devicePixelRatio, URL bar shown/hidden, portrait/landscape rotation, scallion edge cutting, empty-bowl rendering, and serving framing remain unverified on hardware.
- **PENDING — parent hosting generation:** rerun `/Users/apple/Project/wataryuu` `npm run hosting:prepare` with explicit authorization for replacement of the parent `hosting/` tree, and record an exit-0 result.
- Firebase Hosting publish and public-URL smoke testing were not performed.
