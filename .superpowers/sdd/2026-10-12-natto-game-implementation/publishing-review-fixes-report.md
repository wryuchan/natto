# Publishing review fixes

## Outcome

All five independently reproduced publishing-review findings were fixed on
`codex/publishing-review-fixes` without changing dependencies, vendored files,
title rules, or persisted state shape.

## Root causes and fixes

1. **Hidden confirmation opt-out was exposed.** The author rule
   `.dialog-skip { display: flex }` overrode the browser's `[hidden]` rule.
   A global `[hidden] { display: none !important; }` contract now preserves
   hidden semantics. When the option is shown, the checkbox also receives the
   localized accessible name.
2. **Canvas grew after portrait-to-desktop resizing.** The shell had only a
   minimum height, so its `1fr` track was indefinite. The canvas drawing-buffer
   aspect ratio then participated in intrinsic grid sizing and fed the previous
   portrait ratio back into the desktop height. The shell now has a definite
   `100svh` block size with a two-row explicit grid, and the canvas uses size
   containment so drawing-buffer dimensions do not become layout input.
3. **Invalid Serve confirmation loop.** `requestIrreversible` opened a modal
   before checking whether the reducer could apply the event. It now calls the
   existing pure `canApplyEvent` guard first. Missing natto announces localized
   guidance and never opens a confirmation.
4. **Gesture guide and keyboard access were incomplete.** Both tutorial pages
   now describe the actual knife drag, two egg taps, seasoning hold, circular
   chopstick drag, and serving-bowl drag in Japanese and English. Two localized,
   station-aware buttons provide a keyboard-accessible required path: chop and
   transfer natto, mix/add egg, and serve over rice. The buttons use the same
   reducer and confirmation paths as pointer input.
5. **Locale switching left live/ARIA copy stale.** The shell now localizes the
   settings group, cooking region, alternative controls, and action buttons.
   The controller tracks the current live-status message by locale-independent
   ID and re-announces it immediately after either locale switch.

## RED / GREEN evidence

Before production changes:

```text
node --test tests/shell.test.mjs
17 tests: 9 passed, 8 failed
```

The eight expected failures covered gesture copy, hidden checkbox naming,
alternative controls, pre-confirmation Serve guard, keyboard-only cooking,
settings/cooking ARIA, live-status locale refresh, and layout/hidden CSS
contracts. A test-fixture-only `prepend()` shim was added after the first run so
the remaining RED failures represented production behavior rather than an
incomplete fake DOM.

After the minimal implementation:

```text
node --test tests/shell.test.mjs
17 passed, 0 failed

npm test
128 passed, 0 failed
```

## Browser verification

Served the source locally at `http://127.0.0.1:4181/?lang=en` and used the same
tab for the complete resize round trip:

| Step | Viewport | Stage / canvas CSS size | Canvas buffer | Body / shell scroll height |
| --- | --- | --- | --- | --- |
| Initial | 375×812 | 351×307 | 351×307 | 812 / 812 |
| Resize | 1280×800 | 1000×399 | 1000×399 | 800 / 800 |
| Round trip | 375×812 | 351×307 | 351×307 | 812 / 812 |

The previous reproduction was 1000×1034 with a 1379px body after the first
resize. The fixed sizes return exactly to their starting values.

Additional live checks:

- The hidden opt-out had `hidden=true`, computed `display:none`, and did not
  appear in the accessibility tree. In a real irreversible confirmation it was
  exposed as checkbox `Do not show this again`.
- Trying `Serve over rice` before transferring natto left `dialogOpen=false`
  and announced `Move the natto to the mixing bowl before serving.`
- Switching to Japanese immediately changed that live message to
  `盛り付ける前に、納豆を混ぜ鉢へ移してください。` and changed settings,
  cooking, and alternative-control ARIA labels. Switching back restored all
  four English values.
- The visible button-only flow completed chop → confirmed bowl transfer → mix
  → add egg → confirmed rice transfer. The Finish button became enabled.
- Mobile screenshot inspection showed the complete 375×812 cooking layout
  without clipping. Browser console warnings/errors: 0.

## Changed files

- `index.html`
- `styles/app.css`
- `src/app-controller.js`
- `src/main.js`
- `src/ui/shell.js`
- `src/i18n/ja.js`
- `src/i18n/en.js`
- `tests/shell.test.mjs`
- this report

## Remaining concerns

The alternative buttons intentionally cover the required completion path and
egg addition; optional scallion and condiment variants remain pointer-driven.
They are not required to finish a bowl, while all required canvas-only actions
now have visible, focusable button equivalents.

## Independent review fix round 1

The follow-up review found that `.app-tools` had a localized `aria-label` but
remained a plain generic `div`, so the label was not reliably exposed as a
named settings group. A focused semantic-contract test failed against that
markup, then passed after adding `role="group"`; the existing shell render path
continues to update the group's accessible name in both directions.

The keyboard-only regression now creates the real shell/controller pair,
asserts that each station's rendered buttons are visible with the expected
localized labels, and activates every action through the buttons' actual click
listeners across Cut → Mix → Serve. It verifies both confirmation dialogs via
their rendered accept button rather than calling controller actions directly.

The responsive style checks were split into an explicit layout-contract test:
removing the definite `height: 100svh`, restoring a viewport `min-height`, or
removing canvas `contain: size` now fail independent assertions. The exact
375×812 → 1280×800 → 375×812 behavior remains covered by the live browser
round trip rather than adding a heavyweight browser dependency to `npm test`.

Fix-round RED/GREEN and browser evidence:

```text
node --test tests/shell.test.mjs  # RED: 17 passed, 1 failed (missing settings group role)
node --test tests/shell.test.mjs  # GREEN: 18 passed, 0 failed
npm test                          # 129 passed, 0 failed
```

The accessibility snapshot exposed `group "Settings"`; after switching
locale it exposed `group "設定"`, confirming that the semantic group and its
localized name both reach the accessibility tree. The repeated viewport run
measured 351×307 at 375×812, 1000×399 at 1280×800, and 351×307 after returning
to 375×812. Body and shell scroll heights stayed equal to the corresponding
812/800/812 viewport heights, and browser warnings/errors remained at zero.
