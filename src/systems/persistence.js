import { ACHIEVEMENTS } from '../core/achievements.js';

export const SAVE_KEY = 'wataryuu.natto.save.v1';
export const LOCALE_KEY = 'wataryuu.natto.locale.v1';

const ACHIEVEMENT_IDS = new Set(ACHIEVEMENTS.map(({ id }) => id));
const SCORE_KEYS = Object.freeze(['cutting', 'mixing', 'taste', 'serving']);
const SETTING_KEYS = Object.freeze([
  'muted',
  'skipIrreversibleConfirmations',
  'tutorialSeen',
]);

function emptySave() {
  return {
    version: 1,
    achievements: {},
    settings: {
      muted: false,
      skipIrreversibleConfirmations: false,
      tutorialSeen: false,
    },
  };
}

const clone = (value) => JSON.parse(JSON.stringify(value));
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isScore = (value) => Number.isFinite(value) && value >= 0 && value <= 100;

function isAchievementRecord(value) {
  return isObject(value)
    && typeof value.unlockedAt === 'string'
    && !Number.isNaN(Date.parse(value.unlockedAt))
    && isScore(value.bestOverall)
    && isObject(value.bestScores)
    && SCORE_KEYS.every((key) => isScore(value.bestScores[key]));
}

function isValidSave(value) {
  return isObject(value)
    && value.version === 1
    && isObject(value.achievements)
    && Object.entries(value.achievements).every(([id, record]) =>
      ACHIEVEMENT_IDS.has(id) && isAchievementRecord(record)
    )
    && isObject(value.settings)
    && SETTING_KEYS.every((key) => typeof value.settings[key] === 'boolean');
}

function normalizedScores(scores) {
  if (!isObject(scores) || !SCORE_KEYS.every((key) => Number.isFinite(scores[key]))) {
    return null;
  }
  if (!Number.isFinite(scores.overall)) return null;
  const clamp = (value) => Math.round(Math.min(100, Math.max(0, value)));
  return {
    cutting: clamp(scores.cutting),
    mixing: clamp(scores.mixing),
    taste: clamp(scores.taste),
    serving: clamp(scores.serving),
    overall: clamp(scores.overall),
  };
}

export function createPersistence(storage) {
  let mode = storage
    && typeof storage.getItem === 'function'
    && typeof storage.setItem === 'function'
    && typeof storage.removeItem === 'function'
    ? 'local'
    : 'memory';
  let memoryState = emptySave();

  function fallBackToMemory() {
    mode = 'memory';
    memoryState = emptySave();
    return clone(memoryState);
  }

  function load() {
    if (mode === 'memory') return clone(memoryState);
    try {
      const raw = storage.getItem(SAVE_KEY);
      if (raw === null) {
        memoryState = emptySave();
        return clone(memoryState);
      }
      const parsed = JSON.parse(raw);
      if (!isValidSave(parsed)) return fallBackToMemory();
      memoryState = clone(parsed);
      return clone(memoryState);
    } catch {
      return fallBackToMemory();
    }
  }

  function write(next) {
    memoryState = clone(next);
    if (mode === 'local') {
      try {
        storage.setItem(SAVE_KEY, JSON.stringify(next));
      } catch {
        mode = 'memory';
      }
    }
    return clone(memoryState);
  }

  function recordResult(result) {
    const current = load();
    const scores = normalizedScores(result?.scores);
    if (!scores) return current;

    const ids = [result?.primaryId, ...(Array.isArray(result?.specialIds) ? result.specialIds : [])]
      .filter((id, index, all) => ACHIEVEMENT_IDS.has(id) && all.indexOf(id) === index);
    if (ids.length === 0) return current;

    const requestedDate = typeof result.unlockedAt === 'string' && !Number.isNaN(Date.parse(result.unlockedAt))
      ? result.unlockedAt
      : new Date().toISOString();
    const achievements = { ...current.achievements };

    for (const id of ids) {
      const existing = achievements[id];
      achievements[id] = {
        unlockedAt: existing?.unlockedAt ?? requestedDate,
        bestOverall: Math.max(existing?.bestOverall ?? 0, scores.overall),
        bestScores: Object.fromEntries(SCORE_KEYS.map((key) => [
          key,
          Math.max(existing?.bestScores?.[key] ?? 0, scores[key]),
        ])),
      };
    }

    return write({ ...current, achievements });
  }

  function updateSettings(partial) {
    const current = load();
    const updates = Object.fromEntries(SETTING_KEYS
      .filter((key) => typeof partial?.[key] === 'boolean')
      .map((key) => [key, partial[key]]));
    return write({
      ...current,
      settings: { ...current.settings, ...updates },
    });
  }

  function reset() {
    memoryState = emptySave();
    if (mode === 'local') {
      try {
        storage.removeItem(SAVE_KEY);
      } catch {
        mode = 'memory';
      }
    }
    return clone(memoryState);
  }

  return {
    get mode() {
      return mode;
    },
    load,
    recordResult,
    updateSettings,
    reset,
  };
}

export function createMemoryPersistence() {
  return createPersistence(null);
}
