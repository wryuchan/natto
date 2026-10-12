# 納豆調理ゲーム 設計仕様

- 日付: 2026-10-12
- 状態: 承認済み
- リポジトリ: `git@github.com:wryuchan/natto.git`
- 公開予定URL: `https://wataryuu.com/natto/`

## 1. 目的

納豆、ネギ、醤油、からし、卵を自分の手で調理し、盛り付け済みのご飯へかけて完成させる短時間の3Dブラウザゲームを作る。プレイヤーは調理結果を4項目で評価され、さまざまな作り方を試して全20種類の称号を集める。

中心となる楽しさは、正解を一つに限定しない調理シミュレーションである。粒納豆とひき割り納豆、卵ありと卵なしのいずれにも高評価ルートを用意する。極端な調理には通常評価とは別の特殊称号を用意し、失敗も発見として楽しめるようにする。

## 2. 対象と成功条件

- スマートフォンの縦画面を主対象とし、PCのマウス操作にも対応する。
- 初見でも短いガイドだけで「切る・混ぜる・盛る」を完了できる。
- 1プレイはおおむね2〜5分で完結する。
- 操作結果が見た目と採点に一貫して反映される。
- 20称号をすべて実際の操作で獲得できる。
- 日本語と英語で同一のゲーム内容を遊べる。
- バックエンドや個人情報の送信なしで動作する。

## 3. スコープ

### 初版に含めるもの

- ネギと納豆を刻む操作
- 卵を鉢の縁で割って加える操作
- 醤油とからしの投入量調整
- 箸で納豆を混ぜる操作
- 盛り付け済みのご飯への盛り付け
- 4項目の採点と総合点
- 通常称号14種、特殊称号6種
- 称号コレクションとブラウザ内保存
- 日本語・英語切り替え
- 効果音、ミュート、操作ガイド
- X向け共有文の生成

### 初版に含めないもの

- ログイン、クラウド同期、ランキング
- 複数人プレイ
- 炊飯やご飯をよそう工程
- 完全な物理シミュレーション、流体シミュレーション、任意メッシュ切断
- ジャイロセンサーによる操作
- 3言語以上への翻訳
- PWA、オフラインキャッシュ

## 4. 技術方針

- Three.jsを使う静的Webアプリとする。
- ビルド不要のES Modules構成にし、Three.jsと必要なaddonsを `vendor/three/` に同梱する。
- すべてのimportとアセットURLは相対パスにし、`/natto/` 配下で動作させる。
- Three.jsのバージョンは実装開始時に固定し、ライセンスとバージョンを `licenses.html` とソース内のライセンス一覧へ記録する。
- DracoやKTX2は初期転送量または実測性能の改善に必要な場合だけ採用し、採用時はdecoderも同梱する。
- 採点、称号、状態遷移、保存、翻訳はThree.jsとDOMから分離した純粋なJavaScriptモジュールにする。
- DOMの操作UIとThree.jsのCanvasを分離し、ボタン、ダイアログ、タブ、結果表示にはセマンティックHTMLを使う。

## 5. 画面構成

### 5.1 共通UI

- 右上: 日本語・英語切り替え、ミュート、ヘルプ
- 下部: 「切る / 混ぜる / 盛る」のステーションタブ
- 完成可能時: 「完成」ボタン
- 初回: 2ページ以内の簡潔な操作ガイド
- 結果後: もう一度、称号一覧、Xでシェア、wataryuu.comへ戻る

すべての主要操作領域は44 CSS px以上とし、上下左右のsafe-areaを考慮する。英語表示で文言が長くなっても、ボタン内の折り返しや画面外へのはみ出しを起こさない。

### 5.2 ステーション

1. **切る**
   - まな板、包丁、ネギ、納豆を表示する。
   - ネギと納豆は必要な分だけまな板へ置ける。
   - 刻んだ食材は鉢へ移せる。
2. **混ぜる**
   - 鉢、箸、卵、醤油、からしを表示する。
   - 卵は鉢の縁をタップしてひびを入れ、再度タップして開く。
   - 醤油とからしは押している時間に応じて投入する。
   - 箸を鉢内で円形に動かして混ぜる。
3. **盛る**
   - 盛り付け済みのご飯と納豆の鉢を表示する。
   - 鉢をドラッグで傾け、方向・距離・保持時間で盛り付け位置と量を決める。

カメラは各ステーションで固定し、自由視点操作は設けない。

## 6. 状態遷移と不可逆操作

ゲームの大状態は次のとおりとする。

```text
LOADING → INTRO → COOKING ⇄ COLLECTION
                      ↓
                 FINISH_CONFIRM → RESULT
                                      ↓
                                   COOKING（新規プレイ）
```

`COOKING` 内では `CUT / MIX / SERVE` を自由に往復できる。

- 食材をまな板から鉢へ移すと、その食材はまな板へ戻せない。
- 鉢の内容をご飯へ移すと、鉢へ戻せない。
- 不可逆操作の直前には、初回だけ短い確認を表示する。確認には「次回から表示しない」を設ける。
- 鉢へ移していない食材は、別ステーションへ移動した後でも再び切れる。
- 完成確定後は調理へ戻れない。結果画面から新しいプレイを開始する。
- 「最初からやり直す」は確認後に現在の `GameState` を破棄する。称号コレクションは消さない。

## 7. 入力設計

- Pointer Eventsを使い、対象を掴んだ時点で `setPointerCapture()` する。
- 操作中はステーション移動を無効にする。
- ステーションスワイプは、操作対象ではない背景から始まり、横移動が縦移動の1.4倍以上かつ48 CSS px以上の場合だけ成立する。
- 下部タブを常に確実な移動手段として残す。
- Canvas内だけ `touch-action: none` を指定し、Canvas外の通常スクロールを妨げない。
- 切断位置と混ぜ軌跡は画面pxではなく、まな板または鉢のローカル座標へ正規化する。
- 醤油とからしの投入量はフレーム数ではなく、経過時間と固定流量から計算する。
- 鉢の傾きはジャイロを使わず、ドラッグ方向・距離・保持時間で計算する。

## 8. 疑似3D表現

操作位置は内部状態と採点に使うが、形状変化は事前定義した状態を補間して表現する。

- **ネギ**: あらかじめ分割可能な円柱パーツまたは `InstancedMesh` を使い、切断位置に近いパーツを短く分割する。
- **納豆**: `whole / coarse / hikiwari / paste` の段階モデルまたは粒子配置を切り替える。
- **混ぜ**: 箸の軌跡に応じて、糸の本数・長さ、泡、色、表面の揺れを補間する。
- **卵**: `mixing.progress <= 0.20` では黄身の形を残し、それを超えると段階的に納豆へなじませる。「卵かけご飯」の判定と見た目を一致させる。
- **盛り付け**: 実流体は使わず、傾け量と着地点に応じて、ご飯上の納豆メッシュとテクスチャを変形・増加させる。
- **包丁**: 刃と食材の交差をローカル座標で判定する。任意のメッシュ切断は行わない。

## 9. GameState

状態はJSON化可能な値だけで保持する。Three.jsオブジェクトを含めない。

```js
{
  version: 1,
  phase: "cooking",
  station: "cut",
  elapsedMs: 0,
  ingredients: {
    natto: {
      amount: 1,
      cutStage: "whole", // whole | coarse | hikiwari | paste
      cutProgress: 0,
      inBowl: false
    },
    greenOnion: {
      usedAmount: 0,
      fineness: 0,
      uniformity: 0,
      inBowl: false
    },
    egg: { added: false },
    soySauceMl: 0,
    mustardG: 0
  },
  mixing: {
    progress: 0,
    circularity: 0,
    speedStability: 0,
    clockwiseRatio: 0,
    aeration: 0
  },
  serving: {
    transferredRatio: 0,
    coverage: 0,
    centerOffset: 1,
    spillRatio: 0
  }
}
```

実装時にフィールドを追加する場合も、採点または表示に使う値に限定する。

## 10. 採点

各項目を0〜100点で計算し、総合点は4項目の単純平均を整数へ丸める。

### 10.1 刻み方

- 納豆の基準点: `whole=95 / coarse=88 / hikiwari=95 / paste=30`
- ネギ未使用: 85点を中立値とする。
- ネギ使用時: 細かさの理想範囲を `0.55〜0.80` とし、範囲からの距離と均一さで0〜100点を算出する。
- 最終点は納豆70%、ネギ30%。ネギ未使用でも高評価を可能にする。

### 10.2 混ぜ具合

- 卵なしの理想 `progress` は `0.55〜0.72`。
- 卵ありの理想 `progress` は `0.68〜0.84`。
- 理想範囲からの距離60%、`circularity` 25%、`speedStability` 15%で算出する。
- `progress >= 0.96` は混ぜすぎとして減点するが、特殊称号の条件になり得る。

### 10.3 味のバランス

- 醤油の理想範囲: 卵なし `2.5〜4.8ml`、卵あり `3.5〜5.8ml`
- からしの高評価範囲: `0〜1.2g`。未使用も有効な正解とする。
- ネギの高評価範囲: `0〜0.40`。未使用も有効な正解とする。
- 各範囲内を満点候補とし、範囲外では連続的に減点する。
- 醤油60%、からし20%、ネギ20%で算出する。

### 10.4 盛り付け

- `transferredRatio` が `0.88〜1.0`
- `coverage` が `0.40〜0.78`
- `centerOffset <= 0.18`
- `spillRatio <= 0.05`

上記を満たすほど高得点とし、移し残し、偏り、こぼれを連続的に減点する。

## 11. 称号

### 11.1 判定原則

- 通常称号は、条件に合うものから優先順位が最も高い1つを主称号として表示・解除する。
- 特殊称号は通常称号と別枠で判定し、同一プレイで複数解除できる。
- 通常称号と特殊称号の解除状態は言語非依存の内部IDで保存する。
- 各称号の代表状態を自動テストに使い、全称号が到達可能であることを保証する。

### 11.2 通常称号14種

| 優先 | ID | 日本語 / English | 正確な条件 | 未獲得ヒント | 代表状態 |
|---:|---|---|---|---|---|
| 120 | `fermentation_master` | 発酵の匠 / Fermentation Master | 4項目すべて90点以上 | すべての工程を極めよう / Master every step | 粒、卵なし、各軸92点 |
| 110 | `balanced_bowl` | 黄金バランス / Golden Balance | 4項目すべて80点以上、総合85点以上 | 弱点のない一膳を / Make every part shine | ひき割り、卵あり、各軸85点 |
| 105 | `tamago_kake_gohan` | 卵かけご飯 / Tamago Kake Gohan | `ingredients.egg.added === true`、`mixing.progress <= 0.20`、`serving.transferredRatio >= 0.88`、`serving.spillRatio <= 0.10` | 黄身を残してご飯へ / Let the yolk shine over rice | 卵あり、混ぜ進捗0.12、移し量0.94、こぼれ0.02 |
| 100 | `whole_bean_artisan` | 粒立ち名人 / Whole-Bean Artisan | `whole`、刻み90点以上、混ぜ80点以上 | 豆の形を生かそう / Let the beans stay whole | 粒、刻み95、混ぜ84 |
| 99 | `coarse_cut_devotee` | 粗びき派 / Coarse-Cut Devotee | `coarse`、刻み85点以上、混ぜ75点以上 | 粒とひき割りの間を探そう / Find the space between whole and split | 粗びき、刻み88、混ぜ80 |
| 95 | `hikiwari_master` | ひき割りの達人 / Hikiwari Master | `hikiwari`、刻み90点以上、盛り付け80点以上 | 細かく、でも潰さず / Fine, but never mushy | ひき割り、刻み94、盛付86 |
| 90 | `fluffy_egg_crafter` | ふわとろ職人 / Fluffy Egg Crafter | 卵あり、混ぜ88点以上、味80点以上 | 卵と空気を味方に / Bring egg and air together | 卵あり、混ぜ92、味84 |
| 80 | `green_onion_perfumer` | ねぎ香る一膳 / Scallion Fragrance | ネギ量`0.15〜0.35`、細かさと均一さが各0.80以上、味75点以上 | 香りと切り方を整えよう / Balance aroma and cut | ネギ0.25、細かさ0.7、均一0.9 |
| 70 | `mixing_seeker` | 混ぜの求道者 / Mixing Seeker | 混ぜ90点以上、`circularity >= 0.90` | 美しい円を描こう / Draw a perfect circle | 混ぜ93、円運動0.94 |
| 60 | `rice_bowl_thief` | 白米泥棒 / Rice Bowl Thief | 味92点以上、盛り付け85点以上 | 味とご飯の一体感 / Make rice ask for more | 味94、盛付90 |
| 50 | `presentation_artist` | 一膳の芸術家 / Bowl Presentation Artist | 盛り付け95点以上 | 真ん中へ美しく / Aim beautifully for the center | 盛付97 |
| 40 | `minimalist_breakfast` | 引き算の朝食 / Minimalist Breakfast | 卵なし、ネギなし、からし0g、味80点以上 | 足さない勇気も味になる / Sometimes less is more | 醤油3.5ml、他の具なし |
| 30 | `classic_breakfast` | 朝の王道 / Breakfast Classic | `whole`、卵なし、総合75点以上 | 王道は丁寧さから / Treat the classic with care | 粒、卵なし、総合82 |
| 10 | `homestyle_bowl` | まごころ納豆ご飯 / Homestyle Natto Rice | 完成し、他の通常称号条件を満たさない | まずは一膳を完成させよう / Finish your first bowl | 完成済み、総合任意 |

### 11.3 特殊称号6種

| ID | 日本語 / English | 正確な条件 | 未獲得ヒント | 代表状態 |
|---|---|---|---|---|
| `paste_researcher` | 納豆ペースト研究員 / Natto Paste Researcher | `cutStage === "paste"` | 刻むことにも限界がある / Even chopping has a limit | `cutProgress >= 0.96` |
| `mustard_volcano` | からし火山 / Mustard Volcano | `mustardG >= 2.2` | 黄色い刺激を恐れずに / Embrace the yellow heat | からし2.3g |
| `soy_sauce_sea` | 醤油の海 / Sea of Soy Sauce | `soySauceMl >= 8.0` | 入れ物にも限界がある / Every bowl has its limit | 醤油8.2ml |
| `scallion_mountain` | ねぎだく山 / Scallion Mountain | `ingredients.greenOnion.usedAmount >= 0.65` | 緑の山を築いてみよう / Build a mountain of green | ネギ量0.70 |
| `chaos_threads` | 混沌の糸使い / Weaver of Chaos | `mixing.progress >= 0.96` かつ `aeration >= 0.90` | 混ぜ続けた先を見よう / See what lies beyond mixing | 進捗0.98、泡立ち0.94 |
| `serving_disaster` | 盛り付け大事故 / Serving Disaster | `serving.spillRatio >= 0.35` | ご飯の外にも世界は広い / Not everything lands on the rice | こぼれ0.40 |

称号名と英訳は実装時のコピー編集で自然さを調整できるが、内部IDと獲得条件は仕様変更として扱う。

## 12. コレクションと保存

- 保存キー: `wataryuu.natto.save.v1`
- 言語キー: `wataryuu.natto.locale.v1`
- 保存形式:

```js
{
  version: 1,
  achievements: {
    [achievementId]: {
      unlockedAt: "ISO-8601",
      bestOverall: 0,
      bestScores: {
        cutting: 0,
        mixing: 0,
        taste: 0,
        serving: 0
      }
    }
  },
  settings: {
    muted: false,
    skipIrreversibleConfirmations: false,
    tutorialSeen: false
  }
}
```

- 日付表示には `Intl.DateTimeFormat` を使う。
- JSON破損、未知version、容量超過では保存だけを無効化し、プレイを継続する。
- 破損データは上書きせず、そのセッションでは空の状態として扱う。設定画面から全消去できる。
- 全消去前には確認を表示する。
- 「このブラウザ内に保存され、ブラウザデータの削除や別端末では引き継がれない」と日英で明記する。

## 13. 日本語・英語対応

- 言語の優先順位は、有効な `?lang=ja|en`、保存済み設定、ブラウザ言語の順。
- 不正な `?lang` は無視し、次の優先順位へ進む。
- プレイ途中の切り替えでも `GameState` を保持し、全UIを即時更新する。
- `<html lang>`、title、description、ARIAラベル、確認文、エラー、共有文、称号名、ヒントを切り替える。
- URLパラメータは表示設定として扱い、canonicalは `https://wataryuu.com/natto/` に統一する。
- すべての翻訳キーについて日英の一致を自動テストする。
- 未翻訳キーは本番でキー文字列を表示せず、英語へフォールバックしてコンソールへ警告する。

## 14. 音声

- 包丁、混ぜ、調味料、卵、盛り付け、結果演出の短い効果音を用意する。
- ブラウザの自動再生制限に従い、最初のユーザー操作後にAudioContextを開始する。
- ミュートボタンを常設し、設定を保存する。
- BGMは初版では使用しない。

## 15. エラー処理

- WebGL非対応: 日英の説明と対応ブラウザ案内を表示する。
- アセット読み込み失敗: 失敗した素材名を内部ログへ残し、再読み込みボタンを表示する。
- WebGL context lost: 操作を停止して復旧表示を出し、context restored後に現在の `GameState` からシーンを再構築する。
- localStorage失敗: セッション内メモリへ切り替え、プレイは継続する。
- 音声失敗: 無音で続行する。
- 予期しない状態遷移: 操作を無視してエラーを握りつぶさず、開発時は例外、本番は安全なガイド表示にする。

## 16. 性能と対応環境

- 初回ロードの圧縮転送量を8MB以内とする。
- テクスチャは原則2048px以下。小物は1024px以下を優先する。
- 同種の豆、ネギ片、泡は `InstancedMesh` を優先する。
- 中級スマートフォン相当で30fps以上、PCで60fpsを目標とする。
- 長時間フレームが続く場合は、糸、泡、影、解像度の順に品質を落とす。
- 正式対応は実装時点の最新2メジャー相当のiOS Safari、Android Chrome、デスクトップ版Chrome、Safari、Edgeとする。
- 横画面でも操作不能にはしないが、初版のレイアウト最適化と受け入れ確認は縦画面を優先する。

## 17. アクセシビリティ

- DOM操作はキーボードで到達でき、フォーカス表示を消さない。
- 色だけで状態を伝えず、ラベル、形、数値を併用する。
- 結果の4項目はグラフだけでなくテキストと数値でも表示する。
- `prefers-reduced-motion` では結果演出とカメラ遷移を短縮する。
- `prefers-reduced-transparency` が利用可能な環境では半透明UIを不透明寄りにする。
- 3Dの直接操作をキーボードだけで完全再現することは初版の必須要件にしないが、ステーション移動、完成、設定、コレクション閲覧はキーボード対応する。

## 18. ファイル構成

```text
natto/
├── index.html
├── licenses.html
├── AGENTS.md
├── README.md
├── package.json
├── assets/
│   ├── audio/
│   ├── models/
│   ├── textures/
│   └── images/
├── src/
│   ├── main.js
│   ├── game-state.js
│   ├── scene/
│   ├── stations/
│   ├── systems/
│   │   ├── achievements.js
│   │   ├── i18n.js
│   │   ├── input.js
│   │   ├── persistence.js
│   │   ├── scoring.js
│   │   └── state-machine.js
│   └── i18n/
│       ├── ja.js
│       └── en.js
├── tests/
└── vendor/
    └── three/
```

`docs/`、`tests/`、開発用設定は公開対象へコピーしない。

## 19. 検証

### 自動テスト

- 4採点式の境界値と単調性
- 通常称号の優先順位
- 特殊称号の複数同時解除
- 全20称号の代表 `GameState` による到達性
- `CUT / MIX / SERVE / RESULT` の状態遷移と不可逆操作
- 保存、破損保存、schema version、全消去
- 日英翻訳キーの一致とフォールバック
- 相対アセットパス

### ブラウザ検証

- 375×812を基準とするスマホ縦画面
- 1280×800のデスクトップ
- タップ、ドラッグ、長押し、背景スワイプ、下部タブ
- 全工程と再プレイ
- プレイ途中の言語切り替え
- ミュートと音声解放
- 保存あり、保存不可、破損保存
- WebGL context lostからの復旧
- コンソールエラーとネットワーク404がないこと
- 初回転送量と実測fps

## 20. 公開フロー

ゲーム本体を `git@github.com:wryuchan/natto.git` の `main` で管理し、wataryuu.com親リポジトリへ `natto` の名前でsubmodule登録する。

親リポジトリでは以下を行う。

1. `.gitmodules` に `branch = main` と `ignore = all` を設定する。
2. `scripts/prepare-firebase.mjs` に `copyNatto()` を追加し、実行時ファイルだけを `hosting/natto/` へコピーする。
3. トップページへカードと実画面プレビュー画像を追加する。
4. `sitemap.xml` へ `https://wataryuu.com/natto/` を追加する。
5. `npm run hosting:prepare` を実行する。
6. `/natto/` とトップページカードをmobile/desktopでレビューする。
7. natto側をcommit・pushしてから親側のsubmodule pointerを更新する。
8. デプロイ前に、親の公開処理が意図したnatto commitを参照していることを確認する。

SSH URLを使うため、公開作業環境でGitHub SSH鍵が利用できることを前提とする。

## 21. 受け入れ条件

- 日本語または英語で、ガイドから完成結果まで中断なくプレイできる。
- 粒納豆、ひき割り、卵あり、卵なしの4系統すべてで総合85点以上を獲得できる。
- ペーストだけが納豆の刻みすぎとして明確に減点される。
- 4項目の点数と操作結果に説明可能な対応関係がある。
- 通常14種と特殊6種がすべてテストで到達可能である。
- 未獲得称号は名前を伏せて日英ヒントだけを表示する。
- ブラウザ再読み込み後も獲得称号が維持される。
- 375×812で主要操作が44px以上となり、safe-areaと英語文言で崩れない。
- 初期転送量8MB以内、中級スマートフォン相当で30fps以上を満たす。
- 外部CDNなしで `/natto/` 配下から全素材を読み込める。
- `npm run hosting:prepare` が成功し、公開不要なファイルが `hosting/natto/` に含まれない。
