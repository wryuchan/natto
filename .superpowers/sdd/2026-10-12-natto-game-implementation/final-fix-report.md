# Final fix report — Natto Cooking Game

## Scope completed

This fix wave addressed the confirmed correctness, interaction, persistence, responsive-control, localization, and disclosure findings in the final review brief.  It preserves the existing 20-title / six-special registry and keeps all persisted game state JSON-serializable.

## Fixes

- **Scallion amount and cut recovery:** the cooking shell now exposes a labeled 0.05–1.00 scallion amount control.  The selected value drives the cut station and bowl transfer.  `greenOnion.cutPositions` is persisted, validated, and replayed when a cut station is rebuilt after recovery.
- **Pointer ownership:** kitchen station changes are rejected while a station owns an active pointer.  Switching becomes available immediately after that pointer ends.
- **Event effects:** confirmed transfers now select the appropriate animation effect: bowl transfer uses `pour`, and rice transfer uses `serve`.
- **Confirmation opt-out:** irreversible-dialog acceptance forwards the checkbox choice, persists the setting, and hides future confirmation copy/controls when opted out.
- **Collection disclosure:** the collection explains whether its records are stored locally or only for the current session.
- **Cooking controls:** a visible reset control uses the existing irreversible reset flow.  Range, reset, and opt-out controls meet the existing 44px interactive-target styling.
- **Localization:** the new scallion label is translated in Japanese and English and is updated when the active locale changes.

## Test-driven evidence

Focused tests were added before the corresponding implementation.  The initial focused run produced ten expected failures for the missing amount propagation, saved cut positions, pointer guard, persistence disclosure, confirmation forwarding/persistence, and visible cooking controls.  After implementation the focused suite passed **47/47**.

The pointer regression was additionally mutation-checked: removing the kitchen active-pointer guard made the real-controller regression fail (`true !== false`), and restoring the guard returned the test to green.

The live browser walk uncovered two integration gaps after the first green run:

1. The visible scallion control label was not re-localized after switching to English.
2. Controller-derived confirmation models did not include the skip-confirmation label, so the checkbox was hidden.

Each was covered by a new/strengthened shell test that failed first, then passed after the minimal implementation update.

## Browser evidence

Using a fresh local server on port 4180, the browser flow completed: tutorial next/start, language switch to English, and Start over confirmation.  The final live DOM result was:

```text
dialogOpen: true
onionLabel: Scallion amount
restart: Start over
skipLabel: Do not show this again
skipVisible: true
```

The browser-control surface available in this environment did not expose viewport resizing, so an actual browser resize to exactly 375×812 and 1280×800 could not be performed.  The existing renderer regression suite did verify the exact portrait and desktop camera descriptors at those two dimensions, and the live browser flow verified the responsive controls and dialog behavior.

## Final verification

Executed after the final fixes:

```text
npm test                                      # 121 passed, 0 failed
node --check <all changed JavaScript files>   # passed
git diff --check d578f3d..HEAD                # no output
git diff --check                              # no output
```

The requested base-to-HEAD whitespace check contained no confirmed defect.  No unrelated EOF whitespace in `AGENTS.md`, `package.json`, or the static-server script was changed.

## Files changed

Production changes are limited to the application shell, styles, controller/state/cut/kitchen/collection modules, startup wiring, and the two locale dictionaries.  Tests were added only to the relevant state-machine, cut-model, renderer-config, results, and shell suites.

## Self-review

- All added state fields are plain arrays/numbers and survive JSON serialization.
- State-machine validation rejects malformed cut positions and preserves identity for invalid updates.
- Existing title IDs, names, and unlock rules were not edited.
- The reset path resets only the current run while preserving saved achievements and the accepted confirmation preference.
- No deployment, remote push, vendored-library change, or unrelated cleanup was performed.
