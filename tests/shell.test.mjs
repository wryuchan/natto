import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { createInitialGameState } from '../src/core/game-state.js';
import { createAppController } from '../src/app-controller.js';
import { createShell, deriveShellModel } from '../src/ui/shell.js';

const defaultSettings = {
  muted: false,
  skipIrreversibleConfirmations: false,
  tutorialSeen: false,
};

class FakeElement extends EventTarget {
  constructor(dataset = {}) {
    super();
    this.dataset = dataset;
    this.attributes = new Map();
    this.textContent = '';
    this.disabled = false;
    this.open = false;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  focus() {
    FakeElement.activeElement = this;
  }

  showModal() {
    this.open = true;
  }

  close() {
    this.open = false;
    this.dispatchEvent(new Event('close'));
  }

  click() {
    this.dispatchEvent(new Event('click'));
  }

  prepend() {}
}

function shellFixture() {
  const stations = ['cut', 'mix', 'serve'].map((id) => new FakeElement({ station: id }));
  const elements = {
    language: new FakeElement({ action: 'language' }),
    mute: new FakeElement({ action: 'mute' }),
    help: new FakeElement({ action: 'help' }),
    finish: new FakeElement({ action: 'finish' }),
    restart: new FakeElement({ action: 'restart' }),
    onionAmount: new FakeElement({ action: 'onion-amount' }),
    onionAmountLabel: new FakeElement(),
    status: new FakeElement(),
    dialog: new FakeElement(),
    title: new FakeElement(),
    body: new FakeElement(),
    accept: new FakeElement({ dialog: 'accept' }),
    cancel: new FakeElement({ dialog: 'cancel' }),
    skip: new FakeElement({ dialog: 'skip-confirmations' }),
    skipLabel: new FakeElement({ dialogLabel: 'skip-confirmations' }),
    canvas: new FakeElement(),
    appTools: new FakeElement(),
    gameStage: new FakeElement(),
    alternativeControls: new FakeElement(),
    alternativePrimary: new FakeElement({ alternativeAction: 'primary' }),
    alternativeSecondary: new FakeElement({ alternativeAction: 'secondary' }),
    recovery: new FakeElement(),
    recoveryMessage: new FakeElement(),
    recoveryRetry: new FakeElement({ recovery: 'retry' }),
    description: new FakeElement(),
  };
  elements.recovery.hidden = true;
  const selectors = new Map([
    ['[data-action="language"]', elements.language],
    ['[data-action="mute"]', elements.mute],
    ['[data-action="help"]', elements.help],
    ['[data-action="finish"]', elements.finish],
    ['[data-action="restart"]', elements.restart],
    ['[data-action="onion-amount"]', elements.onionAmount],
    ['[data-onion-amount-label]', elements.onionAmountLabel],
    ['#app-status', elements.status],
    ['#app-dialog', elements.dialog],
    ['#dialog-title', elements.title],
    ['#dialog-body', elements.body],
    ['[data-dialog="accept"]', elements.accept],
    ['[data-dialog="cancel"]', elements.cancel],
    ['[data-dialog="skip-confirmations"]', elements.skip],
    ['[data-dialog-label="skip-confirmations"]', elements.skipLabel],
    ['#game-canvas', elements.canvas],
    ['.app-tools', elements.appTools],
    ['.game-stage', elements.gameStage],
    ['[data-alternative-controls]', elements.alternativeControls],
    ['#recovery-overlay', elements.recovery],
    ['[data-recovery-message]', elements.recoveryMessage],
    ['[data-recovery="retry"]', elements.recoveryRetry],
  ]);
  const ownerDocument = {
    activeElement: null,
    documentElement: { lang: '' },
    title: '',
    querySelector: (selector) => selector === 'meta[name="description"]'
      ? elements.description
      : null,
  };

  return {
    stations,
    elements,
    root: {
      querySelector: (selector) => selectors.get(selector) ?? null,
      querySelectorAll: (selector) => {
        if (selector === '[data-station]') return stations;
        if (selector === '[data-alternative-action]') {
          return [elements.alternativePrimary, elements.alternativeSecondary];
        }
        return [];
      },
      ownerDocument,
    },
  };
}

test('shell model exposes translated station state and keeps the source state reference', () => {
  const state = createInitialGameState();
  const ja = deriveShellModel(state, defaultSettings, 'ja');
  const en = deriveShellModel(state, defaultSettings, 'en');

  assert.deepEqual(ja.tabs, [
    { id: 'cut', label: '切る', active: true, disabled: false },
    { id: 'mix', label: '混ぜる', active: false, disabled: false },
    { id: 'serve', label: '盛る', active: false, disabled: false },
  ]);
  assert.deepEqual(en.tabs.map(({ label }) => label), ['Cut', 'Mix', 'Serve']);
  assert.equal(ja.state, state);
  assert.equal(en.state, state);
  assert.equal(ja.metadata.title, '納豆調理ゲーム');
  assert.equal(en.metadata.title, 'Natto Cooking Game');
  assert.match(en.metadata.description, /20 titles/);

  const resultState = { ...state, phase: 'result' };
  assert.ok(deriveShellModel(resultState, defaultSettings, 'en').tabs.every((tab) => tab.disabled));
});

test('first run has exactly two tutorial pages and saved completion suppresses it', () => {
  const state = createInitialGameState();
  const firstRun = deriveShellModel(state, defaultSettings, 'en');
  assert.equal(firstRun.tutorial.visible, true);
  assert.equal(firstRun.tutorial.pages.length, 2);

  const returning = deriveShellModel(state, { ...defaultSettings, tutorialSeen: true }, 'en');
  assert.equal(returning.tutorial.visible, false);
});

test('tutorial names the real drag and circular gestures and offers button alternatives in both locales', () => {
  const state = createInitialGameState();
  const ja = deriveShellModel(state, defaultSettings, 'ja');
  const en = deriveShellModel(state, defaultSettings, 'en');

  assert.match(ja.tutorial.pages[0].body, /ドラッグ/);
  assert.match(ja.tutorial.pages[0].body, /円/);
  assert.match(ja.tutorial.pages[0].body, /ボタン/);
  assert.match(ja.tutorial.pages[1].body, /ドラッグ/);
  assert.match(en.tutorial.pages[0].body, /drag/i);
  assert.match(en.tutorial.pages[0].body, /circle/i);
  assert.match(en.tutorial.pages[0].body, /button/i);
  assert.match(en.tutorial.pages[1].body, /drag/i);
});

test('irreversible copy is present unless confirmations are skipped', () => {
  const state = createInitialGameState();
  const guarded = deriveShellModel(state, defaultSettings, 'en');
  assert.deepEqual(Object.keys(guarded.confirmations), [
    'transferToBowl',
    'transferToRice',
    'finish',
    'restart',
  ]);
  assert.equal(guarded.confirmations.transferToRice.title, 'Serve this over rice?');
  assert.equal(guarded.confirmations.transferToRice.skipNext, 'Do not show this again');

  const skipped = deriveShellModel(
    state,
    { ...defaultSettings, skipIrreversibleConfirmations: true },
    'en',
  );
  assert.equal(skipped.confirmations.transferToBowl, null);
  assert.equal(skipped.confirmations.transferToRice, null);
  assert.equal(skipped.confirmations.finish, null);
});

test('controller changes locale without replacing state and gates irreversible events', () => {
  const rendered = [];
  const confirmations = [];
  const sceneCalls = [];
  const shell = {
    render: (model) => rendered.push(model),
    showConfirmation: (copy, action) => confirmations.push({ copy, action }),
    showTutorial() {},
    announce() {},
  };
  const scene = {
    setStation: (station) => sceneCalls.push(['station', station]),
    renderState: (state) => sceneCalls.push(['state', state]),
    pause() {},
    resume() {},
  };
  const controller = createAppController({
    shell,
    scene,
    locale: 'ja',
    settings: defaultSettings,
  });
  const originalState = controller.getState();

  controller.setLocale('en');
  assert.equal(controller.getState(), originalState);
  assert.equal(rendered.at(-1).tabs[0].label, 'Cut');

  controller.requestIrreversible('transferToBowl', {
    type: 'TRANSFER_TO_BOWL',
    ingredient: 'natto',
    amount: 1,
  });
  assert.equal(controller.getState(), originalState);
  assert.equal(confirmations.length, 1);
  confirmations[0].action();
  assert.equal(controller.getState().ingredients.natto.inBowl, true);
  assert.ok(sceneCalls.some(([kind]) => kind === 'state'));
});

test('controller bypasses irreversible dialog when the saved setting requests it', () => {
  const state = createInitialGameState();
  let confirmationCount = 0;
  const controller = createAppController({
    initialState: state,
    locale: 'en',
    settings: { ...defaultSettings, skipIrreversibleConfirmations: true },
    shell: {
      render() {},
      showConfirmation: () => { confirmationCount += 1; },
      showTutorial() {},
      announce() {},
    },
    scene: { setStation() {}, renderState() {}, pause() {}, resume() {} },
  });

  controller.requestIrreversible('transferToBowl', {
    type: 'TRANSFER_TO_BOWL',
    ingredient: 'natto',
    amount: 1,
  });
  assert.equal(confirmationCount, 0);
  assert.equal(controller.getState().ingredients.natto.inBowl, true);
});

test('shell view routes tab clicks and restores focus when a dialog closes', () => {
  const fixture = shellFixture();
  const switched = [];
  const view = createShell(fixture.root, {
    switchStation: (station) => switched.push(station),
  });
  const model = deriveShellModel(createInitialGameState(), defaultSettings, 'en');
  view.render(model);
  fixture.stations[1].click();
  assert.deepEqual(switched, ['mix']);

  fixture.elements.help.focus();
  view.showConfirmation(
    { title: 'Continue?', body: 'This cannot be undone.', accept: 'Continue', cancel: 'Back' },
    () => {},
    fixture.elements.help,
  );
  assert.equal(FakeElement.activeElement, fixture.elements.accept);
  fixture.elements.cancel.click();
  assert.equal(FakeElement.activeElement, fixture.elements.help);
  view.dispose();
});

test('shell confirmation forwards the accepted opt-out choice', () => {
  const fixture = shellFixture();
  const accepted = [];
  const view = createShell(fixture.root);

  view.showConfirmation({
    title: 'Continue?', body: 'This cannot be undone.', accept: 'Continue', cancel: 'Back',
    skipNext: 'Do not show this again',
  }, (options) => accepted.push(options));
  fixture.elements.skip.checked = true;
  fixture.elements.accept.click();

  assert.deepEqual(accepted, [{ skip: true }]);
  view.dispose();
});

test('confirmation opt-out stays hidden without copy and has an accessible name when shown', () => {
  const fixture = shellFixture();
  const view = createShell(fixture.root);

  view.showConfirmation({
    title: 'Notice', body: 'Body', accept: 'Continue', cancel: 'Back',
  }, () => {});
  assert.equal(fixture.elements.skipLabel.hidden, true);
  assert.equal(fixture.elements.skip.getAttribute('aria-label'), null);

  view.showConfirmation({
    title: 'Notice', body: 'Body', accept: 'Continue', cancel: 'Back',
    skipNext: 'Do not show this again',
  }, () => {});
  assert.equal(fixture.elements.skipLabel.hidden, false);
  assert.equal(fixture.elements.skip.getAttribute('aria-label'), 'Do not show this again');
  view.dispose();
});

test('shell renders and routes keyboard-accessible alternatives for the active station', () => {
  const fixture = shellFixture();
  const actions = [];
  const view = createShell(fixture.root, {
    alternativeAction: (slot, opener) => actions.push([slot, opener]),
  });

  view.render(deriveShellModel(createInitialGameState(), defaultSettings, 'en'));
  assert.equal(fixture.elements.alternativeControls.getAttribute('aria-label'), 'Keyboard cooking controls');
  assert.equal(fixture.elements.alternativePrimary.textContent, 'Chop natto');
  assert.equal(fixture.elements.alternativeSecondary.textContent, 'Move natto to bowl');
  assert.equal(fixture.elements.alternativePrimary.hidden, false);
  fixture.elements.alternativePrimary.click();
  assert.deepEqual(actions, [['primary', fixture.elements.alternativePrimary]]);
  view.dispose();
});

test('shell localizes the visible scallion amount control', () => {
  const fixture = shellFixture();
  const view = createShell(fixture.root);

  view.render(deriveShellModel(createInitialGameState(), defaultSettings, 'en', { greenOnionAmount: 0.65 }));

  assert.equal(fixture.elements.onionAmountLabel.textContent, 'Scallion amount');
  assert.equal(fixture.elements.onionAmount.value, '0.65');
  view.dispose();
});

test('controller persists accepted confirmation opt-out and resets only the current run', () => {
  const confirmations = [];
  const savedSettings = [];
  const collection = { homestyle_bowl: { unlockedAt: '2026-10-12T00:00:00.000Z' } };
  const controller = createAppController({
    settings: defaultSettings,
    persistence: {
      load: () => ({ version: 1, achievements: collection, settings: defaultSettings }),
      updateSettings: (settings) => savedSettings.push(settings),
    },
    shell: {
      render() {}, showTutorial() {}, announce() {}, showView() {},
      showConfirmation: (_copy, accept) => confirmations.push(accept),
    },
  });

  controller.requestIrreversible('transferToBowl', {
    type: 'TRANSFER_TO_BOWL', ingredient: 'natto', amount: 1,
  });
  confirmations.pop()({ skip: true });
  controller.requestIrreversible('restart', { type: 'RESET_RUN' });

  assert.equal(savedSettings.at(-1).skipIrreversibleConfirmations, true);
  assert.deepEqual(controller.getState(), createInitialGameState());
  assert.deepEqual(collection, { homestyle_bowl: { unlockedAt: '2026-10-12T00:00:00.000Z' } });
});

test('serve is guarded before confirmation until natto is in the bowl and guidance follows locale', () => {
  const confirmations = [];
  const announcements = [];
  const controller = createAppController({
    locale: 'en',
    settings: { ...defaultSettings, tutorialSeen: true },
    shell: {
      render() {}, showTutorial() {}, showView() {},
      showConfirmation: (copy) => confirmations.push(copy),
      announce: (message) => announcements.push(message),
    },
  });

  const requested = controller.requestIrreversible('transferToRice', {
    type: 'TRANSFER_TO_RICE', confirmed: true, transferredRatio: 0.5,
  });
  assert.equal(requested, false);
  assert.equal(confirmations.length, 0);
  assert.equal(announcements.at(-1), 'Move the natto to the mixing bowl before serving.');

  controller.setLocale('ja');
  assert.equal(announcements.at(-1), '盛り付ける前に、納豆を混ぜ鉢へ移してください。');
});

test('alternative buttons complete the required keyboard-only cooking path', () => {
  const confirmations = [];
  const controller = createAppController({
    locale: 'en',
    settings: { ...defaultSettings, tutorialSeen: true },
    shell: {
      render() {}, showTutorial() {}, showView() {}, announce() {},
      showConfirmation: (_copy, accept) => confirmations.push(accept),
    },
  });

  assert.equal(controller.performAlternativeAction('primary'), true);
  assert.equal(controller.getState().ingredients.natto.cutProgress, 0.1);
  controller.performAlternativeAction('secondary');
  confirmations.pop()();
  assert.equal(controller.getState().ingredients.natto.inBowl, true);

  controller.switchStation('mix');
  assert.equal(controller.performAlternativeAction('primary'), true);
  assert.equal(controller.getState().mixing.progress > 0, true);
  assert.equal(controller.performAlternativeAction('secondary'), true);
  assert.equal(controller.getState().ingredients.egg.added, true);

  controller.switchStation('serve');
  controller.performAlternativeAction('primary');
  confirmations.pop()();
  assert.equal(controller.getState().serving.transferredRatio > 0, true);
});

test('shell renders localized document metadata and an actionable recovery overlay', () => {
  const fixture = shellFixture();
  let retries = 0;
  const view = createShell(fixture.root);
  view.render(deriveShellModel(createInitialGameState(), defaultSettings, 'en'));

  assert.equal(fixture.root.ownerDocument.title, 'Natto Cooking Game');
  assert.match(fixture.elements.description.getAttribute('content'), /20 titles/);
  assert.equal(fixture.elements.canvas.getAttribute('aria-label'), 'Interactive 3D natto cooking area');
  assert.equal(fixture.elements.appTools.getAttribute('aria-label'), 'Settings');
  assert.equal(fixture.elements.gameStage.getAttribute('aria-label'), 'Cooking area');

  view.showRecovery({
    message: 'Could not load “rice-bowl”.',
    retryLabel: 'Reload',
    actionable: true,
  }, () => { retries += 1; });
  assert.equal(fixture.elements.recovery.hidden, false);
  assert.equal(fixture.elements.recoveryMessage.textContent, 'Could not load “rice-bowl”.');
  assert.equal(fixture.elements.recoveryRetry.textContent, 'Reload');
  fixture.elements.recoveryRetry.click();
  assert.equal(retries, 1);

  view.hideRecovery();
  assert.equal(fixture.elements.recovery.hidden, true);
  view.dispose();
});

test('locale switching immediately refreshes live status and settings/cooking ARIA in both directions', () => {
  const fixture = shellFixture();
  const shell = createShell(fixture.root);
  const controller = createAppController({
    shell,
    locale: 'ja',
    settings: { ...defaultSettings, tutorialSeen: true },
  });

  controller.setLocale('en');
  assert.equal(fixture.elements.status.textContent, 'Ready to cook');
  assert.equal(fixture.elements.appTools.getAttribute('aria-label'), 'Settings');
  assert.equal(fixture.elements.gameStage.getAttribute('aria-label'), 'Cooking area');
  assert.equal(fixture.elements.alternativeControls.getAttribute('aria-label'), 'Keyboard cooking controls');

  controller.setLocale('ja');
  assert.equal(fixture.elements.status.textContent, '調理の準備ができました');
  assert.equal(fixture.elements.appTools.getAttribute('aria-label'), '設定');
  assert.equal(fixture.elements.gameStage.getAttribute('aria-label'), '調理画面');
  assert.equal(fixture.elements.alternativeControls.getAttribute('aria-label'), 'キーボード調理操作');
  controller.dispose();
});

test('static shell has labeled live regions, dialogs, safe areas, and wrapping 44px controls', async () => {
  const [html, css] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../styles/app.css', import.meta.url), 'utf8'),
  ]);

  assert.match(html, /<html lang="ja">/);
  assert.match(html, /id="app-status"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(html, /role="alert"[^>]*aria-live="assertive"/);
  assert.match(html, /<dialog[^>]*aria-labelledby="dialog-title"[^>]*aria-describedby="dialog-body"/);
  assert.equal((html.match(/data-station=/g) ?? []).length, 3);
  assert.match(html, /data-action="restart"/);
  assert.match(html, /data-action="onion-amount"/);
  assert.match(html, /data-dialog="skip-confirmations"/);
  assert.match(css, /--safe-top:\s*env\(safe-area-inset-top/);
  assert.match(css, /--safe-bottom:\s*env\(safe-area-inset-bottom/);
  assert.match(css, /min-(?:block-size|height):\s*44px/);
  assert.doesNotMatch(css, /white-space:\s*nowrap/);
  assert.match(css, /\[hidden\]\s*\{[^}]*display:\s*none\s*!important/s);
  assert.match(css, /\.app-shell\s*\{[^}]*height:\s*100svh/s);
  assert.match(css, /#game-canvas\s*\{[^}]*contain:\s*size/s);

  const fixedPixelWidths = [...css.matchAll(/(?:^|[;{])\s*(?:width|max-width):\s*(\d+)px/gm)]
    .map((match) => Number(match[1]));
  assert.ok(fixedPixelWidths.every((width) => width <= 375));
});
