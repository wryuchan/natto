import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import { createAppController } from '../src/app-controller.js';
import { createInitialGameState } from '../src/core/game-state.js';
import {
  buildCollectionModel,
  renderCollection,
} from '../src/ui/collection.js';
import {
  buildResultModel,
  buildShareText,
  renderResults,
} from '../src/ui/results.js';
import { createShell } from '../src/ui/shell.js';

const DEFAULT_SETTINGS = {
  muted: false,
  skipIrreversibleConfirmations: false,
  tutorialSeen: true,
};

function finishedState() {
  const state = createInitialGameState();
  state.phase = 'result';
  state.ingredients.natto.inBowl = true;
  state.ingredients.soySauceMl = 3.5;
  state.mixing = {
    progress: 0.62,
    circularity: 1,
    speedStability: 1,
    clockwiseRatio: 0.5,
    aeration: 0.5,
  };
  state.serving = {
    transferredRatio: 0.94,
    coverage: 0.62,
    centerOffset: 0.04,
    spillRatio: 0.01,
  };
  return state;
}

function emptySave() {
  return { version: 1, achievements: {}, settings: { ...DEFAULT_SETTINGS } };
}

class FakeNode {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.attributes = new Map();
    this.dataset = {};
    this.className = '';
    this.textContent = '';
    this.listeners = new Map();
  }

  append(...children) {
    this.children.push(...children);
  }

  replaceChildren(...children) {
    this.children = [...children];
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  click() {
    this.listeners.get('click')?.({ currentTarget: this });
  }
}

function fakeRoot() {
  const document = { createElement: (tag) => new FakeNode(tag, document) };
  return new FakeNode('div', document);
}

function descendants(node) {
  return [node, ...node.children.flatMap(descendants)];
}

function textTree(node) {
  return descendants(node).map((child) => child.textContent).join(' ');
}

test('result model exposes numeric scores, one primary title, and only newly unlocked specials', () => {
  const state = finishedState();
  state.ingredients.mustardG = 2.3;
  const previousSave = emptySave();
  previousSave.achievements.whole_bean_artisan = {
    unlockedAt: '2026-10-12T00:00:00.000Z',
    bestOverall: 70,
    bestScores: { cutting: 90, mixing: 80, taste: 60, serving: 50 },
  };
  const model = buildResultModel(state, previousSave, 'en');

  for (const key of ['cutting', 'mixing', 'taste', 'serving', 'overall']) {
    assert.equal(typeof model.scores[key], 'number');
  }
  assert.ok(model.primary?.id);
  assert.equal(typeof model.primary.name, 'string');
  assert.deepEqual(model.specialIds, ['mustard_volcano']);
  assert.deepEqual(model.newlyUnlockedSpecials.map(({ id }) => id), ['mustard_volcano']);
});

test('locked collection records expose silhouettes and translated hints but never title names', () => {
  const collection = buildCollectionModel(emptySave(), 'en');
  const locked = collection.entries.find(({ id }) => id === 'fermentation_master');

  assert.deepEqual(locked, {
    id: 'fermentation_master',
    kind: 'primary',
    unlocked: false,
    silhouette: true,
    hint: 'Master every step',
  });
  assert.doesNotMatch(JSON.stringify(collection), /Fermentation Master|発酵の匠/);
});

test('collection discloses whether titles persist locally or only for this session', () => {
  assert.match(buildCollectionModel(emptySave(), 'en', 'local').copy.disclosure, /saved in this browser/);
  assert.match(buildCollectionModel(emptySave(), 'en', 'memory').copy.disclosure, /only for this session/);
});

test('unlocked collection records expose localized names and locale-independent best data', () => {
  const save = emptySave();
  save.achievements.fermentation_master = {
    unlockedAt: '2026-10-12T01:00:00.000Z',
    bestOverall: 94,
    bestScores: { cutting: 92, mixing: 96, taste: 93, serving: 95 },
  };
  const ja = buildCollectionModel(save, 'ja');
  const en = buildCollectionModel(save, 'en');
  const jaEntry = ja.entries.find(({ id }) => id === 'fermentation_master');
  const enEntry = en.entries.find(({ id }) => id === 'fermentation_master');

  assert.equal(jaEntry.name, '発酵の匠');
  assert.equal(enEntry.name, 'Fermentation Master');
  assert.deepEqual(jaEntry.bestScores, enEntry.bestScores);
  assert.equal(jaEntry.bestOverall, enEntry.bestOverall);
  assert.equal(jaEntry.unlockedAt, enEntry.unlockedAt);
  assert.notEqual(jaEntry.unlockedDate, '');
  assert.notEqual(enEntry.unlockedDate, '');
});

test('locale switching changes display copy but preserves achievement IDs, scores, and dates', () => {
  const state = finishedState();
  const ja = buildResultModel(state, emptySave(), 'ja');
  const en = buildResultModel(state, emptySave(), 'en');

  assert.notEqual(ja.primary.name, en.primary.name);
  assert.notEqual(ja.copy.heading, en.copy.heading);
  assert.equal(ja.primary.id, en.primary.id);
  assert.deepEqual(ja.scores, en.scores);

  const save = emptySave();
  save.achievements.homestyle_bowl = {
    unlockedAt: '2026-10-12T01:00:00.000Z',
    bestOverall: 50,
    bestScores: { cutting: 50, mixing: 50, taste: 50, serving: 50 },
  };
  const collectionJa = buildCollectionModel(save, 'ja').entries;
  const collectionEn = buildCollectionModel(save, 'en').entries;
  assert.deepEqual(collectionJa.map(({ id }) => id), collectionEn.map(({ id }) => id));
  assert.deepEqual(
    collectionJa.find(({ id }) => id === 'homestyle_bowl').bestScores,
    collectionEn.find(({ id }) => id === 'homestyle_bowl').bestScores,
  );
  assert.equal(
    collectionJa.find(({ id }) => id === 'homestyle_bowl').unlockedAt,
    collectionEn.find(({ id }) => id === 'homestyle_bowl').unlockedAt,
  );
});

test('Japanese and English share text include title, overall, canonical URL, and no placeholders', () => {
  const canonical = 'https://wataryuu.com/natto/';
  for (const locale of ['ja', 'en']) {
    const result = buildResultModel(finishedState(), emptySave(), locale);
    const text = buildShareText(result, locale, canonical);
    assert.match(text, new RegExp(result.primary.name));
    assert.match(text, new RegExp(String(result.scores.overall)));
    assert.ok(text.includes(canonical));
    assert.doesNotMatch(text, /undefined|\{(?:title|overall|url)\}/);
  }
});

test('result and collection renderers create accessible output and route user actions', () => {
  const actions = [];
  const resultRoot = fakeRoot();
  const result = buildResultModel(finishedState(), emptySave(), 'en');
  renderResults(resultRoot, result, {
    replay: () => actions.push('replay'),
    collection: () => actions.push('collection'),
    share: () => actions.push('share'),
  });

  const bars = descendants(resultRoot)
    .filter((node) => node.getAttribute('role') === 'progressbar');
  assert.equal(bars.length, 4);
  assert.deepEqual(bars.map((bar) => bar.getAttribute('aria-valuenow')),
    result.scoreRows.map(({ value }) => String(value)));
  for (const node of descendants(resultRoot).filter(({ dataset }) => dataset.action)) node.click();
  assert.deepEqual(actions, ['replay', 'collection', 'share']);

  const collectionRoot = fakeRoot();
  const collection = buildCollectionModel(emptySave(), 'en');
  renderCollection(collectionRoot, collection, {
    close: () => actions.push('close'),
    reset: () => actions.push('reset'),
  });
  assert.doesNotMatch(textTree(collectionRoot), /Fermentation Master/);
  for (const node of descendants(collectionRoot).filter(({ dataset }) => dataset.action)) node.click();
  assert.deepEqual(actions.slice(-2), ['close', 'reset']);
});

test('result model localizes a keyboard-focusable local license link', () => {
  const root = fakeRoot();
  const result = buildResultModel(finishedState(), emptySave(), 'en');

  renderResults(root, result);

  assert.equal(result.copy.licenses, 'Licenses');
  const licenseLinks = descendants(root).filter((node) =>
    node.tagName === 'A' && node.href === './licenses.html'
  );
  assert.equal(licenseLinks.length, 1);
  assert.equal(licenseLinks[0].textContent, result.copy.licenses);
  assert.notEqual(licenseLinks[0].getAttribute('tabindex'), '-1');
});

test('replay creates a fresh GameState while saved collection data remains untouched', () => {
  const save = emptySave();
  save.achievements.homestyle_bowl = {
    unlockedAt: '2026-10-12T01:00:00.000Z',
    bestOverall: 50,
    bestScores: { cutting: 50, mixing: 50, taste: 50, serving: 50 },
  };
  const snapshot = structuredClone(save);
  const initialState = finishedState();
  const controller = createAppController({
    initialState,
    settings: DEFAULT_SETTINGS,
    persistence: { load: () => structuredClone(save), updateSettings() {} },
    shell: { render() {}, showTutorial() {}, announce() {}, showView() {} },
  });

  const replayed = controller.replay();
  assert.notEqual(replayed, initialState);
  assert.deepEqual(replayed, createInitialGameState());
  assert.deepEqual(save, snapshot);
});

test('collection reset waits for confirmation and announces completion', () => {
  const confirmations = [];
  const announcements = [];
  let resets = 0;
  const controller = createAppController({
    settings: DEFAULT_SETTINGS,
    persistence: {
      load: emptySave,
      updateSettings() {},
      reset: () => {
        resets += 1;
        return emptySave();
      },
    },
    shell: {
      render() {},
      showTutorial() {},
      announce: (message) => announcements.push(message),
      showView() {},
      showConfirmation: (_copy, accept) => confirmations.push(accept),
    },
  });

  controller.resetCollection();
  assert.equal(resets, 0);
  confirmations[0]();
  assert.equal(resets, 1);
  assert.equal(announcements.at(-1), 'Saved data erased.');
});

test('finishing records locale-independent result data and reveals the result view', () => {
  const records = [];
  const views = [];
  const state = finishedState();
  state.phase = 'cooking';
  const controller = createAppController({
    initialState: state,
    settings: DEFAULT_SETTINGS,
    persistence: {
      load: emptySave,
      updateSettings() {},
      recordResult: (result) => records.push(result),
    },
    shell: {
      render() {},
      showTutorial() {},
      announce() {},
      showView: (view) => views.push(view),
    },
  });

  assert.equal(controller.dispatch({ type: 'FINISH' }), true);
  assert.equal(controller.getState().phase, 'result');
  assert.equal(records.length, 1);
  assert.ok(records[0].primaryId);
  assert.equal(typeof records[0].scores.overall, 'number');
  assert.doesNotMatch(JSON.stringify(records[0]), /Fermentation Master|発酵の匠/);
  assert.equal(views.at(-1), 'result');
});

test('share uses native Web Share when available and encoded X intent otherwise', async () => {
  const nativePayloads = [];
  const nativeController = createAppController({
    initialState: finishedState(),
    settings: DEFAULT_SETTINGS,
    shareTarget: { share: async (payload) => nativePayloads.push(payload) },
    openWindow: () => assert.fail('X fallback must not open when Web Share is available'),
    shell: { render() {}, showTutorial() {}, announce() {}, showView() {} },
  });
  assert.equal(await nativeController.shareResult(), 'share');
  assert.equal(nativePayloads.length, 1);
  assert.ok(nativePayloads[0].text.includes('https://wataryuu.com/natto/'));
  assert.equal(nativePayloads[0].url, 'https://wataryuu.com/natto/');

  const opened = [];
  const fallbackController = createAppController({
    initialState: finishedState(),
    settings: DEFAULT_SETTINGS,
    shareTarget: {},
    openWindow: (...args) => opened.push(args),
    shell: { render() {}, showTutorial() {}, announce() {}, showView() {} },
  });
  assert.equal(await fallbackController.shareResult(), 'x');
  assert.equal(opened.length, 1);
  assert.match(opened[0][0], /^https:\/\/twitter\.com\/intent\/tweet\?text=/);
  assert.equal(opened[0][1], '_blank');
  assert.equal(opened[0][2], 'noopener,noreferrer');
  const sharedText = decodeURIComponent(new URL(opened[0][0]).searchParams.get('text'));
  assert.ok(sharedText.includes('https://wataryuu.com/natto/'));
});

test('shell view switching and static result regions keep cooking, result, and collection distinct', async () => {
  const views = ['cooking', 'result', 'collection'].map((view) => ({
    dataset: { view },
    hidden: false,
  }));
  const shell = createShell({
    querySelector: () => null,
    querySelectorAll: (selector) => selector === '[data-view]' ? views : [],
  });
  shell.showView('result');
  assert.deepEqual(views.map(({ hidden }) => hidden), [true, false, true]);

  const [html, css] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../styles/app.css', import.meta.url), 'utf8'),
  ]);
  assert.match(html, /data-action="collection"/);
  assert.match(html, /id="result-view"[^>]*data-view="result"[^>]*hidden/);
  assert.match(html, /id="collection-view"[^>]*data-view="collection"[^>]*hidden/);
  assert.match(css, /\.score-bar/);
  assert.match(css, /\.collection-grid/);
});
