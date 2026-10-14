# Natto Phase 0 Stabilization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 現行の3ステーション構成を維持したまま、Android ChromeのCanvas縮退、鉢内容物の誤表示、器と盛り付け構図、ネギ当たり判定、ライセンス導線を修正して先行公開する。

**Architecture:** 現行の`createKitchenScene`とstation adapter契約は変えず、Phase 1でも再利用する器生成関数とレイアウト契約だけを追加する。表示修正はGameStateを唯一の情報源とし、Phase 0では状態イベントや保存形式を変更しない。

**Tech Stack:** Vanilla ESM JavaScript、Three.js 0.186.0、CSS Grid、Node.js built-in test runner、静的HTML、Firebase Hosting（親リポジトリ経由）

**Spec:** `docs/superpowers/specs/2026-10-14-natto-panorama-redesign.md` §2、§6.1、§11.3、§11.5、§12.1、§12.4

## Global Constraints

- Phase 0ではGameState `version: 1`、保存データ`version: 1`、既存20称号ID、日英切替を維持する。
- `cut-station.js`、`mix-station.js`、`serve-station.js`のstation adapter契約を変更しない。
- 360×800前後のAndroid Chrome縦画面でCanvasを最低`max(16rem, 45svh)`確保し、残りのUIはページスクロールで到達可能にする。
- 鉢とお茶碗は内面・外面・縁・底を持つ厚みのある回転体にし、開いた`CylinderGeometry`だけでは表現しない。
- Phase 0で作る器ジオメトリとCanvasサイズ調整はPhase 1から再利用できる独立APIにする。
- `hosting/`は生成物なので編集しない。公開前に親リポジトリで`npm run hosting:prepare`を実行する。
- 実装完了の判定にはユニットテストと実ブラウザ確認の両方を必要とする。

## Review Focus

- URLバー表示・非表示や画面回転後も、Canvasが0pxまたは操作不能な高さへ縮まないこと（Task 1のCSS契約テストとTask 6の実機確認）。
- 納豆を鉢へ移した直後・再プレイ直後・復旧直後に、鉢の茶色い面がGameStateと逆にならないこと（Task 3のprojectionテスト）。
- 器の縁・内側・ご飯が正面カメラで隠れず、器が天板から浮かないこと（Task 2/3の形状テストとTask 6の画面確認）。
- ネギの見えている範囲を切っても無反応になる領域が残らないこと（Task 4の同一boundsテストと実操作確認）。
- ライセンスリンクがローカル相対URLで、ヘッダーと結果画面の両方からキーボードで到達できること（Task 5のDOMテスト）。

---

### Task 1: Android向けレイアウト縮退の修正

**Files:**
- Modify: `styles/app.css`
- Modify: `tests/project-structure.test.mjs`

**Interfaces:**
- Consumes: 現行DOMの`.app-shell`、`.game-stage`、`#game-canvas`。
- Produces: 狭い画面でCanvas最低高を保ち、本文を縦スクロール可能にするCSS契約。

- [ ] **Step 1: 失敗するCSS契約テストを書く**

`tests/project-structure.test.mjs`に「mobile shell keeps a playable canvas and allows document scrolling」を追加し、`styles/app.css`が以下を満たすことをassertする。

```js
assert.match(css, /@media\s*\(max-width:\s*34rem\)[\s\S]*min-height:\s*max\(16rem,\s*45svh\)/);
assert.doesNotMatch(mobileRule, /#game-canvas\s*\{[^}]*min-height:\s*0/);
assert.match(css, /\.app-shell\s*\{[^}]*min-height:\s*100svh/);
```

- [ ] **Step 2: テストが現状で失敗することを確認する**

Run: `node --test tests/project-structure.test.mjs`

Expected: 新しいmobile canvas契約でFAIL。

- [ ] **Step 3: `.app-shell`とmobile ruleを最小修正する**

`.app-shell`を固定`height: 100svh`から`min-height: 100svh; height: auto`へ変更し、狭い画面の`.game-stage, #game-canvas`を`min-height: max(16rem, 45svh)`にする。`body`/shellの縦方向overflowはブラウザ標準スクロールを許可し、横overflowだけを抑止する。

- [ ] **Step 4: CSS契約テストを通す**

Run: `node --test tests/project-structure.test.mjs`

Expected: PASS。

- [ ] **Step 5: コミットする**

```bash
git add styles/app.css tests/project-structure.test.mjs
git commit -m "fix: preserve mobile canvas height"
```

### Task 2: Phase 1でも再利用する厚み付き器ジオメトリ

**Files:**
- Create: `src/scene/vessels.js`
- Create: `tests/vessels.test.mjs`
- Modify: `src/stations/mix-station.js`
- Modify: `src/stations/serve-station.js`
- Modify: `src/stations/cut-station.js`
- Modify: `src/scene/kitchen.js`

**Interfaces:**
- Consumes: Three.js `LatheGeometry`と既存materials。
- Produces: `createVesselGeometry({ innerRadius, outerRadius, height, footRadius, segments = 48 }): THREE.LatheGeometry`。原点は器底中央、上端は`y === height`、形状は外側→縁→内側→内底→外底を閉じたprofileにする。

- [ ] **Step 1: 器形状の失敗テストを書く**

`tests/vessels.test.mjs`で、mixing bowlとrice bowlの2設定について、戻り値が`LatheGeometry`、position attributeが空でない、bounding boxの`min.y === 0`付近、`max.y === height`付近、profileが内径と外径の両方を含むことをassertする。無効な半径・高さは`RangeError`を投げることも固定する。

- [ ] **Step 2: 新規テストがmodule未存在で失敗することを確認する**

Run: `node --test tests/vessels.test.mjs`

Expected: `src/scene/vessels.js`を解決できずFAIL。

- [ ] **Step 3: `createVesselGeometry`を実装する**

器の厚みは`outerRadius - innerRadius`から得る。profileは底を閉じ、法線を生成し、`geometry.computeBoundingBox()`を行う。材質やMeshはこの関数に含めない。

- [ ] **Step 4: 既存3ステーションとplaceholderの器を置き換える**

mix bowl、serveのpouring bowl/rice bowl、cutのtransfer bowl、`createPlaceholderStation`の器に同じfactoryを使う。各Meshの底が天板のY座標に一致するよう、positionは器の底基準へ直す。既存name属性はテスト互換のため維持する。

- [ ] **Step 5: 形状と既存stationテストを通す**

Run: `node --test tests/vessels.test.mjs tests/cut-model.test.mjs tests/mix-model.test.mjs tests/serve-model.test.mjs tests/renderer-config.test.mjs`

Expected: 全PASS。

- [ ] **Step 6: コミットする**

```bash
git add src/scene/vessels.js src/stations/cut-station.js src/stations/mix-station.js src/stations/serve-station.js src/scene/kitchen.js tests/vessels.test.mjs
git commit -m "feat: add reusable closed vessel geometry"
```

### Task 3: 鉢内容物同期と盛り付け構図

**Files:**
- Modify: `src/stations/mix-station.js`
- Modify: `src/stations/serve-station.js`
- Modify: `src/scene/renderer.js`
- Modify: `tests/mix-model.test.mjs`
- Modify: `tests/serve-model.test.mjs`
- Modify: `tests/renderer-config.test.mjs`

**Interfaces:**
- Consumes: GameState v1の`ingredients.natto.inBowl`、`ingredients.egg.added`、`mixing`、`serving`。
- Produces: `mix-station.renderState(state)`が`natto-surface`、yolk、foam、threadsを状態だけから一意に投影すること。`getCameraDescriptor({ station: 'serve', width, height })`が鉢とお茶碗の両方を収める構図。

- [ ] **Step 1: 空の鉢と復帰状態の失敗テストを書く**

`tests/mix-model.test.mjs`に、`inBowl: false`で`natto-surface`/foam/threads/yolkが非表示、`inBowl: true`へ再投影すると表面が表示、再びfalseにすると消えるテストを追加する。これにより再プレイ・context recoveryも同じ`renderState`で保証する。

- [ ] **Step 2: 盛り付け構図と器の接地テストを書く**

`tests/serve-model.test.mjs`で`rice-bowl`と`pouring-bowl`のbounding box下端がcounter Yと一致し、riceが器の内側かつ縁より見える高さにあることをassertする。`tests/renderer-config.test.mjs`ではportrait/desktopのserve descriptorが両器の中心範囲を向くことをassertする。

- [ ] **Step 3: 新規テストが現状で失敗することを確認する**

Run: `node --test tests/mix-model.test.mjs tests/serve-model.test.mjs tests/renderer-config.test.mjs`

Expected: 表面visibilityまたはserve framingでFAIL。

- [ ] **Step 4: `renderState`とserve descriptorを修正する**

納豆が鉢にない場合は茶色いsurfaceとそれに従属するfoam/threads/yolkを必ず非表示にする。serve cameraのtarget/offsetをportraitとdesktopで調整し、鉢とお茶碗の全体がfrustum内へ入るようにする。接地影は既存shadow receiverへ落ちる位置に統一する。

- [ ] **Step 5: 対象テストを通す**

Run: `node --test tests/mix-model.test.mjs tests/serve-model.test.mjs tests/renderer-config.test.mjs`

Expected: 全PASS。

- [ ] **Step 6: コミットする**

```bash
git add src/stations/mix-station.js src/stations/serve-station.js src/scene/renderer.js tests/mix-model.test.mjs tests/serve-model.test.mjs tests/renderer-config.test.mjs
git commit -m "fix: synchronize bowl contents and serving framing"
```

### Task 4: ネギ表示と切断判定の座標共有

**Files:**
- Modify: `src/stations/cut-model.js`
- Modify: `src/stations/cut-station.js`
- Modify: `tests/cut-model.test.mjs`

**Interfaces:**
- Consumes: 現行board-local座標と`applyKnifeStroke(state, { ingredient, points })`。
- Produces: `GREEN_ONION_LAYOUT = Object.freeze({ minX, maxX, minY, maxY })`を`cut-model.js`からexportし、表示mesh配置と`CUT_INGREDIENT_BOUNDS.greenOnion`の両方が同じ値を使う。

- [ ] **Step 1: 表示と判定の共有boundsテストを書く**

`tests/cut-model.test.mjs`で、ネギmeshの全instance中心が`GREEN_ONION_LAYOUT`内にあり、両端を48 CSS px相当だけ広げたproxy/boundsが可視範囲を包含すること、可視ネギ左端・中央・右端を横切る3ストロークがいずれも切断を進めることをassertする。

- [ ] **Step 2: テストが共有定数未存在または右端判定で失敗することを確認する**

Run: `node --test tests/cut-model.test.mjs`

Expected: FAIL。

- [ ] **Step 3: layout定数から表示と判定を生成する**

固定instance位置と固定boundsの重複を除き、ネギ表示・切断領域・タップproxyを`GREEN_ONION_LAYOUT`から計算する。納豆領域とは重ねない。

- [ ] **Step 4: cut testsを通す**

Run: `node --test tests/cut-model.test.mjs`

Expected: 全PASS。

- [ ] **Step 5: コミットする**

```bash
git add src/stations/cut-model.js src/stations/cut-station.js tests/cut-model.test.mjs
git commit -m "fix: align scallion visuals and hit bounds"
```

### Task 5: ヘッダーと結果画面のライセンス導線

**Files:**
- Modify: `index.html`
- Modify: `src/i18n/ja.js`
- Modify: `src/i18n/en.js`
- Modify: `src/ui/results.js`
- Modify: `tests/i18n.test.mjs`
- Modify: `tests/results.test.mjs`
- Modify: `tests/project-structure.test.mjs`

**Interfaces:**
- Consumes: 既存`licenses.html`と`renderResults(root, model, callbacks)`。
- Produces: ヘッダーの静的`./licenses.html`リンク、`buildResultModel`の`copy.licenses`、結果actions内の同じローカルリンク。

- [ ] **Step 1: 日英copyとDOMの失敗テストを書く**

`tests/i18n.test.mjs`で`results.licenses`の日英キーを要求し、`tests/results.test.mjs`で結果DOMに`href="./licenses.html"`のリンクが1件あること、`tests/project-structure.test.mjs`でヘッダーにも同hrefがあることをassertする。

- [ ] **Step 2: 対象テストが失敗することを確認する**

Run: `node --test tests/i18n.test.mjs tests/results.test.mjs tests/project-structure.test.mjs`

Expected: 翻訳キーまたはリンク不在でFAIL。

- [ ] **Step 3: 2つのリンクと翻訳を実装する**

ヘッダーリンクはbutton同等の44×44 CSS px操作領域を持たせる。結果リンクは`renderResults`内のactionsへ追加し、日英表示を`buildResultModel`から渡す。新規タブ強制はしない。

- [ ] **Step 4: 対象テストを通す**

Run: `node --test tests/i18n.test.mjs tests/results.test.mjs tests/project-structure.test.mjs`

Expected: 全PASS。

- [ ] **Step 5: コミットする**

```bash
git add index.html src/i18n/ja.js src/i18n/en.js src/ui/results.js tests/i18n.test.mjs tests/results.test.mjs tests/project-structure.test.mjs
git commit -m "feat: link licenses from game and results"
```

### Task 6: Phase 0回帰検証、実機記録、公開準備

**Files:**
- Create: `docs/validation/2026-10-15-natto-phase-0.md`
- Modify: 必要な場合のみ、Task 1〜5の所有ファイル

**Interfaces:**
- Consumes: Task 1〜5の完成物。
- Produces: 再現可能なコマンド出力、ブラウザ/端末名、画面サイズ、合否を記録したPhase 0検証証跡。

- [ ] **Step 1: natto単体の全テストを実行する**

Run: `npm test`

Expected: 0 failures。

- [ ] **Step 2: ローカルサーバーでdesktop/mobileの主要ルートを確認する**

Run: `npm start`

Chrome系ブラウザの375×812と1280×800で、切る→鉢へ移す→混ぜる→盛る→完成、言語切替、結果→ライセンスを確認する。360×800ではCanvasの実測高さが`max(16rem, 45svh)`以上で、全操作UIへ縦スクロールできることを記録する。

- [ ] **Step 3: Android Chrome実機でP1〜P4を確認する**

使用端末のメーカー・機種名、Android版、Chrome版、viewport、devicePixelRatioを検証記録へ記入する。URLバー表示/非表示、縦横回転、ネギ左右端の切断、空鉢表示、盛り付け構図を確認する。

- [ ] **Step 4: 親リポジトリの生成を検証する**

Run from `/Users/apple/Project/wataryuu`: `npm run hosting:prepare`

Expected: exit 0。生成された`hosting/`は検証対象であり、natto source commitには含めない。

- [ ] **Step 5: 検証記録だけをコミットする**

```bash
git add docs/validation/2026-10-15-natto-phase-0.md
git commit -m "docs: record phase 0 validation"
```

- [ ] **Step 6: 公開前レビューとデプロイを実行する**

`superpowers:requesting-code-review`でPhase 0差分をレビューし、指摘反映後に全検証を再実行する。親リポジトリの`deploy`スキルと`docs/DEPLOY.md`に従い、ユーザー承認済みの対象だけをFirebase Hostingへ公開し、公開URL`https://wataryuu.com/natto/`で同じsmoke testを行う。
