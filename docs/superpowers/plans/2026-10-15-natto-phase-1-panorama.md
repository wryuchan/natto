# Natto Phase 1 Panorama Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 現行の3ステーション切替型ゲームを、一つの3D調理台を見渡し、包丁・箸・鉢・食材を画面内で直接操作する日英対応の「調理台パノラマ」へ置き換える。

**Architecture:** GameState v2と純粋Reducerを調理結果の唯一の情報源にし、カメラ・ポインター所有権・進行中アニメーションは非永続の表示状態として分離する。`KitchenWorld`が`BoardArea`、`BowlArea`、`RiceArea`を常時配置し、`CameraRig`、`InteractionController`、`TransferAnimator`を合成する。Phase 0で追加した器factoryとモバイルレイアウト知見を再利用する。

**Tech Stack:** Vanilla ESM JavaScript、Three.js 0.186.0、Pointer Events、ResizeObserver/VisualViewport、CSS dynamic viewport units、Node.js built-in test runner、静的HTML、Firebase Hosting（親リポジトリ経由）

**Spec:** `docs/superpowers/specs/2026-10-14-natto-panorama-redesign.md` §3〜§12.4

## Global Constraints

- 3D Canvasは`100dvh`、`100svh`、`100vh`の順でfallbackし、Canvas外に切る・混ぜる・盛る・刻む・移すボタンやネギ量sliderを置かない。
- GameStateは`version: 2`、保存データは`version: 1`のままとし、プレイ途中のGameStateは永続化しない。
- 既存20称号ID、採点式、称号保存キー、言語保存キーを維持する。
- カメラ位置、focus、pointer owner、Three.js object、進行中animationはGameStateへ入れない。
- reducerだけがGameStateを変更し、不正・重複・順序違反イベントは元のstate objectをそのまま返す。
- 自動移送は完了時にだけ一度dispatchし、reset/context loss/rebuildで古い完了callbackを無効化する。
- Androidでは初期DPR上限1.5。2秒平均frame timeが33.3msを超えるたびに、2秒cooldownを挟み、糸→泡→影→DPR 1.0の順で一段ずつ下げ、自動では上げない。
- pointer ownershipは`pointercancel`、`lostpointercapture`、orientation change、backgroundへの`visibilitychange`で必ず解除する。
- 操作可能targetはfocusごとに絞り、投影時48 CSS px以上のhit proxyを持つ。画面左右端24 CSS px以内から始まる操作はpanにしない。
- `prefers-reduced-motion: reduce`ではcamera snapを即時、自動移送を150ms以下にする。
- `hosting/`は生成物なので編集しない。各Phase完了時に親リポジトリで`npm run hosting:prepare`を実行する。

## Review Focus

- 同じpointerがpanと道具操作を同時所有しないこと、cancel/回転/background復帰後に道具が指へ張り付かないこと（Task 3とTask 9のテスト）。
- animation中のreset/context loss/連打で古いcallbackがGameStateを後から変更しないこと（Task 4とTask 9のgenerationテスト）。
- ネギの極端な切り方（中央1回、境界値0.08、移送後区間、追加切断）でも使用量が増減逆転せず、表示区間と判定区間が一致すること（Task 1とTask 6のテスト）。
- 360×800・DPR 3・URLバー/回転/visual viewport変更後もfocusとraycast座標がずれず、すべての場所へ到達できること（Task 3/5/10）。
- 納豆なし・ネギだけ・卵入り・一部盛り・大量spillの各状態で、鉢/ご飯/こぼれの具材が二重表示または消失しないこと（Task 7/8のprojectionテスト）。

---

### Task 1: ネギ区間モデルとGameState v2 Reducer

**Files:**
- Create: `src/core/green-onion.js`
- Modify: `src/core/game-state.js`
- Modify: `src/core/state-machine.js`
- Modify: `src/stations/cut-model.js`
- Modify: `tests/state-machine.test.mjs`
- Modify: `tests/cut-model.test.mjs`
- Modify: `tests/fixtures/achievement-states.mjs`
- Modify: `tests/achievements.test.mjs`
- Modify: `tests/scoring.test.mjs`
- Modify: `tests/mix-model.test.mjs`
- Modify: `tests/serve-model.test.mjs`

**Interfaces:**
- Consumes: 既存`deriveNattoStage(progress)`、`scoreGame(state)`、`evaluateAchievements(state, scores)`。
- Produces: `SLICE_MAX_WIDTH = 0.08`、`deriveGreenOnion(cutPositions, transferredPieces)`、`eligibleOnionPieces(cutPositions, transferredPieces)`、GameState v2、v2 `reduceGameState`/`canApplyEvent`。

- [ ] **Step 1: ネギ区間の失敗テストを書く**

`tests/cut-model.test.mjs`に次を固定する。

```js
assert.equal(deriveGreenOnion([0.5], []).cutLength, 0);
assert.deepEqual(eligibleOnionPieces([0.04, 0.08, 0.5], []), [[0, 0.04], [0.04, 0.08]]);
assert.equal(deriveGreenOnion([0.04, 0.08], [[0, 0.04]]).usedAmount, 0.04);
```

`fineness = clamp01((0.10 - meanTransferredWidth) / 0.08)`とし、幅0.056で0.55、幅0.036で0.8となることを許容誤差`1e-9`でassertする。`uniformity = transferredPieces.length ? clamp01(1 - standardDeviation / meanWidth) : 0`とし、同幅2片は1、未移送は0とする。

- [ ] **Step 2: GameState v2と不変条件の失敗テストを書く**

`tests/state-machine.test.mjs`をv2形へ更新し、初期納豆locationが`bowl`、旧`station`/`elapsedMs`/`amount`/`inBowl`が存在しないことをassertする。仕様§11.1の全route、中央1切り使用量0、移送済み区間への再切断拒否、二重イベントのidentity維持、FINISH gateを別々のtestにする。

納豆は`NATTO_PROGRESS_PER_FULL_PASS = 0.1`として、`passCoverage`を0..1へclampし、`cutProgress += 0.1 * passCoverage`、`cutStage = deriveNattoStage(cutProgress)`をReducer内だけで算出する。

- [ ] **Step 3: 新規テストが旧state/event形式で失敗することを確認する**

Run: `node --test tests/state-machine.test.mjs tests/cut-model.test.mjs`

Expected: v2 fields/function不在でFAIL。

- [ ] **Step 4: `green-onion.js`とGameState v2を実装する**

piecesは`[0, ...cutPositions, 1]`の隣接区間。幅`<= 0.08`だけを輪切りとする。`cutLength`は全輪切り区間、`transferredLength`/`usedAmount`は`transferredPieces`、fineness/uniformityは移送済み輪切りだけから毎回再計算する。

- [ ] **Step 5: v2 event reducerを実装する**

`MOVE_NATTO_TO_BOARD`、`MOVE_NATTO_TO_BOWL`、2種類の`UPDATE_CUT`、`TRANSFER_GREEN_ONION`、既存調理event、`FINISH`、`RESET_RUN`を仕様§7.1/7.2どおり実装する。`SWITCH_STATION`、`TRANSFER_TO_BOWL`、`TRANSFER_TO_RICE`を削除する。

- [ ] **Step 6: 20称号fixtureと既存model testsをv2へ移す**

`tests/fixtures/achievement-states.mjs`の全fixtureをv2 fieldへ更新し、`PRIMARY_FIXTURES`と`SPECIAL_FIXTURES`の20 IDが従来どおり評価されることを維持する。採点・称号本体は、v2の派生値で不整合が出ない限り変更しない。

- [ ] **Step 7: core/model testsを通す**

Run: `node --test tests/state-machine.test.mjs tests/cut-model.test.mjs tests/scoring.test.mjs tests/achievements.test.mjs tests/mix-model.test.mjs tests/serve-model.test.mjs`

Expected: 全PASS。

- [ ] **Step 8: コミットする**

```bash
git add src/core/green-onion.js src/core/game-state.js src/core/state-machine.js src/stations/cut-model.js tests/state-machine.test.mjs tests/cut-model.test.mjs tests/fixtures/achievement-states.mjs tests/achievements.test.mjs tests/scoring.test.mjs tests/mix-model.test.mjs tests/serve-model.test.mjs
git commit -m "feat: introduce panorama game state"
```

### Task 2: 保存互換、新チュートリアル、日英copy

**Files:**
- Modify: `src/systems/persistence.js`
- Modify: `src/i18n/ja.js`
- Modify: `src/i18n/en.js`
- Modify: `tests/persistence.test.mjs`
- Modify: `tests/i18n.test.mjs`

**Interfaces:**
- Consumes: 保存key `wataryuu.natto.save.v1`、locale key、保存`version: 1`。
- Produces: boolean setting `panoramaTutorialSeen`、panorama menu/tutorial/status/errorの日英翻訳key。

- [ ] **Step 1: 前後互換の失敗テストを書く**

`tests/persistence.test.mjs`で、旧saveを読むと`panoramaTutorialSeen:false`が補完されること、新saveを未知key許容のPhase 0相当validatorで読めること、`updateSettings({ panoramaTutorialSeen:true })`だけがbooleanを保存すること、保存versionが1のままなことをassertする。

- [ ] **Step 2: 日英key parityの失敗テストを書く**

場所移動、完成、言語、遊び方、称号、restart、licenses、戻る、3ページtutorial、移送完了、完成可能、納豆なし、移送拒否理由、WebGL recoveryのkey集合がja/enで一致することをassertする。

- [ ] **Step 3: 対象テストが失敗することを確認する**

Run: `node --test tests/persistence.test.mjs tests/i18n.test.mjs`

Expected: setting/key不在でFAIL。

- [ ] **Step 4: settingと日英copyを追加する**

既存`tutorialSeen`は削除しない。未知のboolean settings keyを含むobjectを壊さず保持し、既知keyだけをdefault補完・更新する現行互換を維持する。

- [ ] **Step 5: 対象テストを通してコミットする**

Run: `node --test tests/persistence.test.mjs tests/i18n.test.mjs`

Expected: 全PASS。

```bash
git add src/systems/persistence.js src/i18n/ja.js src/i18n/en.js tests/persistence.test.mjs tests/i18n.test.mjs
git commit -m "feat: add panorama tutorial persistence and copy"
```

### Task 3: ジェスチャー、カメラfocus、pointer ownership、品質低下

**Files:**
- Create: `src/systems/gestures.js`
- Create: `src/world/camera-rig.js`
- Create: `src/world/interaction-controller.js`
- Modify: `src/scene/renderer.js`
- Modify: `tests/input.test.mjs`
- Modify: `tests/renderer-config.test.mjs`

**Interfaces:**
- Consumes: normalized pointer samples `{ pointerId, clientX, clientY, local, timeStamp }`、worldの`hitTest({ focus, sample })`と`applyPointerSample(phase, sample, owner)`。
- Produces: `classifyGesture(trace)`、`classifyKnifeStroke(trace)`、`isPanStartAllowed(clientX, viewportWidth)`、`focusFromCameraX(cameraX, snapXs)`、`createCameraRig(...)`、`createInteractionController(...)`、one-way quality monitor。

- [ ] **Step 1: しきい値境界の失敗テストを書く**

`tests/input.test.mjs`に、tap `<10px && <500ms`、drag `>=10px`、long hold `>=350ms && <10px`、knife `downY>=24px && abs(dx)<=0.6*downY && <=250ms`、左右24px edge exclusionを境界値の直前/一致/直後でassertする。

- [ ] **Step 2: focusと品質低下の失敗テストを書く**

`tests/renderer-config.test.mjs`で4つの固有`cameraX` snap値、各隣接距離の15%以内だけfocus確定、それ以外`none`をassertする。2秒平均`>33.3ms`でthreads→foam→shadows→DPR 1.0へ一段ずつ低下、各低下後2秒cooldown、自動upgradeなしもfake clockで固定する。

Android user agent/profileでは初期DPRが`min(devicePixelRatio, 1.5)`、その他では既存desktop上限を使うこともassertする。

- [ ] **Step 3: pointer ownership解除の失敗テストを書く**

owner確定後だけ`setPointerCapture`し、background dragはcameraRigだけへ渡ること、`pointercancel`/`lostpointercapture`/orientation/hiddenでownerとcaptureが消えること、owner中はpanしないことをassertする。

仕様§3.4のrouting matrixもstub worldで固定する。`overview`のarea/tool tapは所属snapへ移動するだけでdispatchしない、`none`のtapは無視、空背景dragはpan、focus中はそのfocusで有効なtargetだけがownerになり、pointer release時のpanは最近snapへ移動する。

- [ ] **Step 4: 新規テストがmodule未存在で失敗することを確認する**

Run: `node --test tests/input.test.mjs tests/renderer-config.test.mjs`

Expected: FAIL。

- [ ] **Step 5: 純粋gesture関数とCameraRigを実装する**

`CameraRig`は`cameraX`、現在snap key、focus、animationを所有する。`overview`を含む4つのsnapは固有Xを持ち、overviewだけcamera distance/FOVを広げる。release時は最近snapへ移動し、reduced motionでは即時確定する。

- [ ] **Step 6: InteractionControllerとone-way quality monitorを実装する**

focusが`none`ならtapを捨てdragだけpanへ渡す。focus別の有効targetだけraycast対象にし、ownerが決まったpointerだけcaptureする。rendererのquality profile変更はhit proxyや純粋判定値へ影響させない。

- [ ] **Step 7: 対象テストを通してコミットする**

Run: `node --test tests/input.test.mjs tests/renderer-config.test.mjs`

Expected: 全PASS。

```bash
git add src/systems/gestures.js src/world/camera-rig.js src/world/interaction-controller.js src/scene/renderer.js tests/input.test.mjs tests/renderer-config.test.mjs
git commit -m "feat: add panorama camera and pointer ownership"
```

### Task 4: 世代管理付きTransferAnimator

**Files:**
- Create: `src/world/transfer-animator.js`
- Create: `tests/transfer-animator.test.mjs`

**Interfaces:**
- Consumes: `requestFrame(callback)`、`cancelFrame(id)`、`now()`、`reducedMotion`。
- Produces: `createTransferAnimator(deps)`が返す`run({ durationMs, onUpdate, onComplete }): boolean`、`invalidate(): void`、`isBusy(): boolean`。

- [ ] **Step 1: generationとexactly-onceの失敗テストを書く**

正常完了で`onComplete`が1回、完了callback再実行でも1回、`invalidate()`後の旧frameで0回、busy中の2回目`run`がfalse、reduced motionで実時間150ms以下になることをfake RAFでassertする。

- [ ] **Step 2: module未存在で失敗することを確認する**

Run: `node --test tests/transfer-animator.test.mjs`

Expected: FAIL。

- [ ] **Step 3: animatorを実装する**

各`run`は開始generationを閉じ込め、完了時に現generation一致かつ未commitの場合だけ`onComplete`を呼ぶ。`invalidate()`はgeneration increment、frame cancel、busy解除を行い、commitしない。

- [ ] **Step 4: 対象テストを通してコミットする**

Run: `node --test tests/transfer-animator.test.mjs`

Expected: 全PASS。

```bash
git add src/world/transfer-animator.js tests/transfer-animator.test.mjs
git commit -m "feat: add generation-safe transfer animator"
```

### Task 5: 全画面Canvasと常時表示KitchenWorld

**Files:**
- Create: `src/world/kitchen-world.js`
- Create: `src/world/world-layout.js`
- Modify: `src/scene/kitchen.js`
- Modify: `src/main.js`
- Modify: `index.html`
- Modify: `styles/app.css`
- Modify: `tests/renderer-config.test.mjs`
- Modify: `tests/project-structure.test.mjs`

**Interfaces:**
- Consumes: Phase 0の`createVesselGeometry`、Task 3のCameraRig/InteractionController、Task 4のTransferAnimator。
- Produces: `WORLD_LAYOUT`、`createKitchenWorld(context)`、互換entry `createKitchenScene(canvas, options)`。worldは`renderState`、`hitTest`、`applyPointerSample`、`setSnap`、`getFocus`、`setQualityProfile`、`pause`、`resume`、`dispose`を持つ。

- [ ] **Step 1: world compositionとfullscreen契約の失敗テストを書く**

3 area groupが同時にsceneへ存在してvisible、旧station group/tabsがないこと、Canvasがdynamic viewport fallbackとsafe-areaを使うこと、`touch-action:none`/`overscroll-behavior:none`がgame領域だけに付くことをassertする。

overviewでは各areaとその中の道具・食材proxyが所属snapへだけ移動し、board/bowl/riceでは画面端に見える隣接areaのproxyが対応snapへ移動することをworld-level testでassertする。

- [ ] **Step 2: resize lifecycleの失敗テストを書く**

ResizeObserver、orientation、visualViewport resizeでrenderer/camera/hit projectionが更新され、listenerがdispose時に解除されることをfake event targetsでassertする。

- [ ] **Step 3: 現行3 station構成で失敗することを確認する**

Run: `node --test tests/renderer-config.test.mjs tests/project-structure.test.mjs`

Expected: FAIL。

- [ ] **Step 4: WORLD_LAYOUTとKitchenWorld骨格を実装する**

board/bowl/rice中心とcounter天板Yを一ファイルに集約する。各areaはこのtaskでは静的groupと48px proxy interfaceだけを持ち、動作はTask 6〜8で追加する。overview開始時に鉢を中央に大きく、左右areaの一部が見える構図を設定する。

- [ ] **Step 5: 全画面DOM/CSSとresizeを実装する**

旧station nav、alternative controls、onion slider、画面外finish/restartを削除する。結果/称号/dialogはCanvas上のoverlayとして残す。右上のmute/menuはTask 9のhookだけ用意する。

- [ ] **Step 6: 対象テストを通してコミットする**

Run: `node --test tests/renderer-config.test.mjs tests/project-structure.test.mjs`

Expected: 全PASS。

```bash
git add src/world/kitchen-world.js src/world/world-layout.js src/scene/kitchen.js src/main.js index.html styles/app.css tests/renderer-config.test.mjs tests/project-structure.test.mjs
git commit -m "feat: create continuous kitchen panorama"
```

### Task 6: BoardAreaの包丁、納豆、ネギ

**Files:**
- Create: `src/world/board-area.js`
- Modify: `src/world/kitchen-world.js`
- Modify: `src/stations/cut-model.js`
- Modify: `tests/cut-model.test.mjs`
- Modify: `tests/input.test.mjs`

**Interfaces:**
- Consumes: GameState v2、`WORLD_LAYOUT`、gesture classifiers、`eligibleOnionPieces`、TransferAnimator、dispatch。
- Produces: `createBoardArea(context)`の`group`、focus別`hitTargets`、`renderState(state)`、`applyPointerSample(...)`、`dispose()`。

- [ ] **Step 1: knifeと食材projectionの失敗テストを書く**

handle downでowner/capture、bladeがpointer投影点の画面上48px上へraycastされること、valid strokeだけ`UPDATE_CUT {ingredient:'natto', passCoverage}`またはonion positionを生成すること、cancelでstrokeを破棄しsafe positionへ戻すことをassertする。

- [ ] **Step 2: ネギmesh/hit intervalの失敗テストを書く**

表示meshとhit proxyが同じ`cutPositions`区間から生成され、幅`>0.08`は鉢移送tap対象外、未移送輪切りtapは`TRANSFER_GREEN_ONION`をanimation完了時だけdispatch、移送済み区間は再表示/再切断しないことをassertする。

- [ ] **Step 3: 納豆全量移送の失敗テストを書く**

board上の納豆tapが`MOVE_NATTO_TO_BOWL`をanimation完了時に一度だけdispatchし、reducer拒否またはanimation中断では確定表示を変えないことをassertする。

- [ ] **Step 4: テストがBoardArea未存在で失敗することを確認する**

Run: `node --test tests/cut-model.test.mjs tests/input.test.mjs`

Expected: FAIL。

- [ ] **Step 5: BoardAreaを実装する**

簡略化した3D手を包丁handleへ追従させ、手はhit/scoringに使わない。natto/onionの場所とcut stageは毎回GameStateから再投影し、sceneローカル状態を確定値にしない。

- [ ] **Step 6: 対象テストを通してコミットする**

Run: `node --test tests/cut-model.test.mjs tests/input.test.mjs`

Expected: 全PASS。

```bash
git add src/world/board-area.js src/world/kitchen-world.js src/stations/cut-model.js tests/cut-model.test.mjs tests/input.test.mjs
git commit -m "feat: add direct knife and board interactions"
```

### Task 7: BowlAreaの条件付き表示と直接調理

**Files:**
- Create: `src/world/bowl-area.js`
- Modify: `src/world/kitchen-world.js`
- Modify: `src/stations/mix-model.js`
- Modify: `tests/mix-model.test.mjs`
- Modify: `tests/renderer-config.test.mjs`

**Interfaces:**
- Consumes: GameState v2、Phase 0 vessel、existing `applyEggTap`/`amountFromCondimentHold`/`applyMixPath`、TransferAnimator、dispatch/announce。
- Produces: `createBowlArea(context)`と、natto plaque、chopsticks、egg、condimentsのfocus限定interaction。

- [ ] **Step 1: bowl content matrixの失敗テストを書く**

natto bowl→茶色い面、natto board/onion none→空、onion only→ネギ片のみで茶色なし、natto absent時のegg/condiments/chopsticks opacity低下と操作拒否status、egg/mix progressionのGameState再投影をassertする。

- [ ] **Step 2: 「まな板へ」札と移送条件の失敗テストを書く**

条件成立時のnatto tapだけ札を表示し、札tapがcamera board移動+移送animation後に`MOVE_NATTO_TO_BOARD`を一度dispatchすることをassertする。別target tap、pan、focus changeで札が消えること、5条件それぞれの拒否statusも個別にassertする。

- [ ] **Step 3: 箸・卵・調味料の失敗テストを書く**

箸dragの円運動が`UPDATE_MIX`、卵2tapが`ADD_EGG`、container long holdが`ADD_CONDIMENT`を生成し、bowl body tapはno-op/dragはpanになることをassertする。

- [ ] **Step 4: BowlArea未存在で失敗することを確認する**

Run: `node --test tests/mix-model.test.mjs tests/renderer-config.test.mjs`

Expected: FAIL。

- [ ] **Step 5: BowlAreaを実装する**

threads/foam/yolk/colorはmixing stateへ同期し、quality profileはcapacityだけを下げる。簡略手を箸へ追従させる。reducerが拒否した操作ではsceneを確定変更しない。

- [ ] **Step 6: 対象テストを通してコミットする**

Run: `node --test tests/mix-model.test.mjs tests/renderer-config.test.mjs`

Expected: 全PASS。

```bash
git add src/world/bowl-area.js src/world/kitchen-world.js src/stations/mix-model.js tests/mix-model.test.mjs tests/renderer-config.test.mjs
git commit -m "feat: add direct bowl cooking interactions"
```

### Task 8: RiceAreaの複数回盛り付け、spill、完成札

**Files:**
- Create: `src/world/rice-area.js`
- Modify: `src/world/kitchen-world.js`
- Modify: `src/stations/serve-model.js`
- Modify: `tests/serve-model.test.mjs`
- Modify: `tests/renderer-config.test.mjs`

**Interfaces:**
- Consumes: GameState v2、Phase 0 vessel、existing `applyPourSample`/`deriveServingVisual`、dispatch/announce。
- Produces: `createRiceArea(context)`、複数回`UPDATE_SERVE`、`FINISH` plaque、具材を反映したspill projection。

- [ ] **Step 1: serve routeとprojectionの失敗テストを書く**

鉢dragが`UPDATE_SERVE`だけを生成し、複数回で`transferredRatio`が減らないこと、最初の正量transfer後に「いただきます」が表向き、0のままではhidden/disabled、plaque tapで`FINISH`を生成することをassertする。

- [ ] **Step 2: 量保存とspill具材の失敗テストを書く**

ご飯上量と鉢残量が反比例し、spill visualに投入済みnatto/onion/eggが含まれ、未投入具材を出さないことをassertする。rice focus cameraで両器のbounding boxesがfrustum内にあることも固定する。

- [ ] **Step 3: RiceArea未存在で失敗することを確認する**

Run: `node --test tests/serve-model.test.mjs tests/renderer-config.test.mjs`

Expected: FAIL。

- [ ] **Step 4: RiceAreaを実装する**

簡略手を鉢へ追従させ、pointer releaseで現stateへ再投影する。自動FINISHは行わず、plaqueまたはTask 9のmenuだけがFINISHを発火する。

- [ ] **Step 5: 対象テストを通してコミットする**

Run: `node --test tests/serve-model.test.mjs tests/renderer-config.test.mjs`

Expected: 全PASS。

```bash
git add src/world/rice-area.js src/world/kitchen-world.js src/stations/serve-model.js tests/serve-model.test.mjs tests/renderer-config.test.mjs
git commit -m "feat: add direct serving and finish plaque"
```

### Task 9: 重ねメニュー、controller統合、復旧

**Files:**
- Modify: `src/ui/shell.js`
- Modify: `src/app-controller.js`
- Modify: `src/main.js`
- Modify: `src/systems/recovery.js`
- Delete: `src/stations/cut-station.js`
- Delete: `src/stations/mix-station.js`
- Delete: `src/stations/serve-station.js`
- Modify: `index.html`
- Modify: `styles/app.css`
- Modify: `src/i18n/ja.js`
- Modify: `src/i18n/en.js`
- Modify: `tests/shell.test.mjs`
- Modify: `tests/results.test.mjs`
- Modify: `tests/recovery.test.mjs`
- Modify: `tests/project-structure.test.mjs`

**Interfaces:**
- Consumes: Task 2 copy/settings、KitchenWorld `setSnap/getFocus/renderState/invalidateTransfers`、v2 reducer。
- Produces: 右上mute/menu、keyboard対応menu、live status、3ページtutorial、GameState v2 controller/recovery。

- [ ] **Step 1: shell/menuの失敗テストを書く**

常時表示buttonがmute/menuの2つだけ、menuにboard/bowl/rice、finish、language、tutorial、collection、restart、licenses、wataryuu.comがあること、全controlが44×44以上、keyboard focusがopen/closeで復帰することをassertする。旧station/alternative/onion/finish外部controlがないこともassertする。

- [ ] **Step 2: controllerとlive regionの失敗テストを書く**

menu locationがGameStateを変えず`scene.setSnap`だけを呼ぶこと、finish gate、`panoramaTutorialSeen`保存、移送完了/拒否/完成可能の日英announce、restart確認、食材移動とfinishに確認dialogが出ないことをassertする。

- [ ] **Step 3: recoveryの失敗テストを書く**

context lossでinput pause+animator invalidate、restoreでworld全再構築、確定GameState再投影、直前snap復元、旧animation非commitをassertする。audio/localStorage failure fallbackも既存テストを維持する。

WebGL初期化失敗時は日英の説明と再読み込み操作をCanvas overlayへ表示し、再試行可能であることも既存startup/recovery testへ追加する。

- [ ] **Step 4: 対象テストが旧shell/controllerで失敗することを確認する**

Run: `node --test tests/shell.test.mjs tests/results.test.mjs tests/recovery.test.mjs`

Expected: FAIL。

- [ ] **Step 5: overlay shellとcontrollerを実装する**

menuはDOM overlay、Canvas結果/称号/dialogより下のz-orderにする。`prefers-reduced-transparency`で不透明化する。direct cookingのkeyboard代替は追加せず、場所移動・完成・設定・称号・restartをkeyboardで完結させる。

- [ ] **Step 6: recovery/mainをv2 worldへ接続する**

旧`switchStation`/greenOnion slider/irreversible transfer confirmation pathsを削除し、scene event候補はcontroller dispatchを通す。reset/rebuild時は必ずTransferAnimator generationを進める。

新しいAreaテストへ置換済みの旧3 station実装とimportを削除し、runtimeから独立scene切替コードが残っていないことをproject structure testで固定する。

- [ ] **Step 7: 対象テストを通してコミットする**

Run: `node --test tests/shell.test.mjs tests/results.test.mjs tests/recovery.test.mjs`

Expected: 全PASS。

```bash
git add src/ui/shell.js src/app-controller.js src/main.js src/systems/recovery.js src/stations/cut-station.js src/stations/mix-station.js src/stations/serve-station.js index.html styles/app.css src/i18n/ja.js src/i18n/en.js tests/shell.test.mjs tests/results.test.mjs tests/recovery.test.mjs tests/project-structure.test.mjs
git commit -m "feat: integrate panorama menu and recovery"
```

### Task 10: End-to-end受け入れ、性能、公開準備

**Files:**
- Create: `docs/validation/2026-10-15-natto-phase-1.md`
- Modify: 必要な場合のみTask 1〜9の所有ファイル

**Interfaces:**
- Consumes: Task 1〜9の完成物。
- Produces: 対応ブラウザ、Android実機、性能、日英、全主要route、親hosting生成の検証証跡。

- [ ] **Step 1: 全ユニットテストを実行する**

Run: `npm test`

Expected: 0 failures。20称号fixture、state route、gesture/focus/generation、persistence interopが含まれることをtest名一覧で確認する。

- [ ] **Step 2: desktopとmobile実ブラウザの全routeを確認する**

Run: `npm start`

375×812、360×800 DPR 3、1280×800で、粒納豆、ひきわり、paste、ネギだけ追加、卵かけご飯、少量盛り、大量spillを日英それぞれ確認する。各snapで器全体、48px hit area、pan/owner排他、cancel復帰、menu keyboard操作、licenses/resultsを記録する。

- [ ] **Step 3: viewport/recovery/reduced motionを確認する**

URLバー表示/非表示、縦横回転、visual viewport resize、background復帰、WebGL context loss/restore、`prefers-reduced-motion`、`prefers-reduced-transparency`を実ブラウザで確認する。

- [ ] **Step 4: 性能低下を確認する**

Chrome DevToolsで360×800、DPR 3、CPU 4× slowdownを設定し、quality degradation後2秒区間の平均が30fps以上であること、低下順、cooldown、upgradeなしをPerformance記録とともに残す。desktopは60fps目標を記録する。

- [ ] **Step 5: Android実機で主要routeを確認する**

使用端末のメーカー・機種名、Android版、Chrome版、viewport、DPRを必ず記録する。端24pxのOS戻るgesture、URLバー、回転、knife/chopsticks/bowl、完成までを確認する。

- [ ] **Step 6: 親リポジトリ生成を検証する**

Run from `/Users/apple/Project/wataryuu`: `npm run hosting:prepare`

Expected: exit 0。生成物`hosting/`はnatto source commitに含めない。

- [ ] **Step 7: 検証記録をコミットする**

```bash
git add docs/validation/2026-10-15-natto-phase-1.md
git commit -m "docs: record panorama acceptance validation"
```

- [ ] **Step 8: 最終レビューと公開を行う**

`superpowers:requesting-code-review`で仕様§3〜§12の全体レビューを行い、指摘修正後にStep 1〜6を再実行する。親リポジトリの`deploy`スキルと`docs/DEPLOY.md`に従い、ユーザー承認済みの変更だけを公開し、`https://wataryuu.com/natto/`で粒納豆route、ひきわりroute、日英切替、称号保存のproduction smoke testを行う。
