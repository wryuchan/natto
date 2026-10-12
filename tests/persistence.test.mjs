import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LOCALE_KEY,
  SAVE_KEY,
  createMemoryPersistence,
  createPersistence,
} from '../src/systems/persistence.js';

const DEFAULT_SETTINGS = {
  muted: false,
  skipIrreversibleConfirmations: false,
  tutorialSeen: false,
};

class FakeStorage {
  constructor(entries = {}) {
    this.values = new Map(Object.entries(entries));
    this.getCalls = 0;
    this.setCalls = 0;
    this.removeCalls = 0;
    this.throwOnGet = null;
    this.throwOnSet = null;
    this.throwOnRemove = null;
  }

  getItem(key) {
    this.getCalls += 1;
    if (this.throwOnGet) throw this.throwOnGet;
    return this.values.get(key) ?? null;
  }

  setItem(key, value) {
    this.setCalls += 1;
    if (this.throwOnSet) throw this.throwOnSet;
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.removeCalls += 1;
    if (this.throwOnRemove) throw this.throwOnRemove;
    this.values.delete(key);
  }
}

function result(overrides = {}) {
  return {
    primaryId: 'whole_bean_artisan',
    specialIds: [],
    unlockedAt: '2026-10-12T01:00:00.000Z',
    scores: {
      cutting: 90,
      mixing: 80,
      taste: 70,
      serving: 60,
      overall: 75,
    },
    ...overrides,
  };
}

test('storage constants use the approved versioned keys', () => {
  assert.equal(SAVE_KEY, 'wataryuu.natto.save.v1');
  assert.equal(LOCALE_KEY, 'wataryuu.natto.locale.v1');
});

test('valid version-1 data round-trips under the save key', () => {
  const existing = {
    version: 1,
    achievements: {
      homestyle_bowl: {
        unlockedAt: '2026-10-12T00:00:00.000Z',
        bestOverall: 50,
        bestScores: { cutting: 50, mixing: 50, taste: 50, serving: 50 },
      },
    },
    settings: { ...DEFAULT_SETTINGS, tutorialSeen: true },
  };
  const storage = new FakeStorage({ [SAVE_KEY]: JSON.stringify(existing) });
  const adapter = createPersistence(storage);

  assert.equal(adapter.mode, 'local');
  assert.deepEqual(adapter.load(), existing);
  adapter.updateSettings({ muted: true });
  assert.equal(adapter.mode, 'local');
  assert.equal(JSON.parse(storage.values.get(SAVE_KEY)).settings.muted, true);
});

test('unlock timestamp is set once while each best score only increases', () => {
  const storage = new FakeStorage();
  const adapter = createPersistence(storage);
  adapter.recordResult(result({ specialIds: ['paste_researcher'] }));
  adapter.recordResult(result({
    unlockedAt: '2026-10-13T01:00:00.000Z',
    scores: {
      cutting: 85,
      mixing: 95,
      taste: 65,
      serving: 90,
      overall: 84,
    },
  }));

  const save = adapter.load();
  assert.deepEqual(save.achievements.whole_bean_artisan, {
    unlockedAt: '2026-10-12T01:00:00.000Z',
    bestOverall: 84,
    bestScores: { cutting: 90, mixing: 95, taste: 70, serving: 90 },
  });
  assert.deepEqual(save.achievements.paste_researcher, {
    unlockedAt: '2026-10-12T01:00:00.000Z',
    bestOverall: 75,
    bestScores: { cutting: 90, mixing: 80, taste: 70, serving: 60 },
  });
});

test('malformed JSON and unknown versions use memory without overwriting source data', () => {
  for (const raw of ['{broken', JSON.stringify({ version: 2 })]) {
    const storage = new FakeStorage({ [SAVE_KEY]: raw });
    const adapter = createPersistence(storage);

    assert.doesNotThrow(() => adapter.load());
    assert.equal(adapter.mode, 'memory');
    assert.deepEqual(adapter.load(), {
      version: 1,
      achievements: {},
      settings: DEFAULT_SETTINGS,
    });
    assert.equal(storage.values.get(SAVE_KEY), raw);
    assert.equal(storage.setCalls, 0);
  }
});

test('thrown reads switch to memory without blocking play', () => {
  const storage = new FakeStorage();
  storage.throwOnGet = new Error('SecurityError');
  const adapter = createPersistence(storage);

  assert.doesNotThrow(() => adapter.load());
  assert.equal(adapter.mode, 'memory');
  assert.doesNotThrow(() => adapter.recordResult(result()));
  assert.equal(adapter.load().achievements.whole_bean_artisan.bestOverall, 75);
});

test('thrown writes and quota errors retain the update in memory', () => {
  for (const error of [new Error('write denied'), Object.assign(new Error('quota'), { name: 'QuotaExceededError' })]) {
    const storage = new FakeStorage();
    storage.throwOnSet = error;
    const adapter = createPersistence(storage);

    assert.doesNotThrow(() => adapter.recordResult(result()));
    assert.equal(adapter.mode, 'memory');
    assert.equal(adapter.load().achievements.whole_bean_artisan.bestOverall, 75);
  }
});

test('memory adapter works when browser storage is missing', () => {
  const adapter = createPersistence(null);
  assert.equal(adapter.mode, 'memory');
  adapter.updateSettings({ muted: true });
  assert.equal(adapter.load().settings.muted, true);

  const explicitMemory = createMemoryPersistence();
  assert.equal(explicitMemory.mode, 'memory');
});

test('reset clears achievements and settings after the caller confirms', () => {
  const storage = new FakeStorage();
  const adapter = createPersistence(storage);
  adapter.recordResult(result());
  adapter.updateSettings({ muted: true, tutorialSeen: true });

  const callerConfirmed = true;
  if (callerConfirmed) adapter.reset();

  assert.deepEqual(adapter.load(), {
    version: 1,
    achievements: {},
    settings: DEFAULT_SETTINGS,
  });
  assert.equal(storage.removeCalls, 1);
});

test('persisted achievement IDs and scores contain no locale-dependent copy', () => {
  const storage = new FakeStorage();
  const adapter = createPersistence(storage);
  adapter.recordResult(result({ specialIds: ['soy_sauce_sea'] }));

  const raw = storage.values.get(SAVE_KEY);
  assert.match(raw, /whole_bean_artisan/);
  assert.match(raw, /soy_sauce_sea/);
  assert.doesNotMatch(raw, /Whole-Bean Artisan|粒立ち名人|Sea of Soy Sauce|醤油の海/);
  assert.equal(JSON.parse(raw).achievements.whole_bean_artisan.bestScores.cutting, 90);
});
