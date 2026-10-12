import assert from 'node:assert/strict';
import test from 'node:test';

import { ACHIEVEMENTS, evaluateAchievements } from '../src/core/achievements.js';
import {
  PRIMARY_FIXTURES,
  SPECIAL_FIXTURES,
  coarseCutDevoteeFixture,
  fermentationMasterFixture,
  homestyleBowlFixture,
  tamagoKakeGohanFixture,
} from './fixtures/achievement-states.mjs';

function evaluate(fixture) {
  return evaluateAchievements(fixture.state, fixture.scores);
}

test('all 14 primary representative states select their intended title', () => {
  assert.equal(Object.keys(PRIMARY_FIXTURES).length, 14);
  for (const [expectedId, fixture] of Object.entries(PRIMARY_FIXTURES)) {
    assert.equal(evaluate(fixture).primaryId, expectedId, expectedId);
  }
});

test('fermentation master outranks every other matching primary title', () => {
  assert.equal(evaluate(fermentationMasterFixture).primaryId, 'fermentation_master');
});

test('tamago kake gohan requires every exact state boundary', () => {
  assert.equal(evaluate(tamagoKakeGohanFixture).primaryId, 'tamago_kake_gohan');

  const mutations = [
    { ingredients: { egg: { added: false } } },
    { mixing: { progress: 0.200001 } },
    { serving: { transferredRatio: 0.879999 } },
    { serving: { spillRatio: 0.100001 } },
  ];
  for (const mutation of mutations) {
    const fixture = {
      ...tamagoKakeGohanFixture,
      state: {
        ...tamagoKakeGohanFixture.state,
        ...mutation,
        ingredients: {
          ...tamagoKakeGohanFixture.state.ingredients,
          ...(mutation.ingredients ?? {}),
        },
        mixing: { ...tamagoKakeGohanFixture.state.mixing, ...(mutation.mixing ?? {}) },
        serving: { ...tamagoKakeGohanFixture.state.serving, ...(mutation.serving ?? {}) },
      },
    };
    assert.notEqual(evaluate(fixture).primaryId, 'tamago_kake_gohan');
  }
});

test('coarse cut devotee rejects every other natto stage', () => {
  assert.equal(evaluate(coarseCutDevoteeFixture).primaryId, 'coarse_cut_devotee');
  for (const cutStage of ['whole', 'hikiwari', 'paste']) {
    const fixture = {
      ...coarseCutDevoteeFixture,
      state: {
        ...coarseCutDevoteeFixture.state,
        ingredients: {
          ...coarseCutDevoteeFixture.state.ingredients,
          natto: { ...coarseCutDevoteeFixture.state.ingredients.natto, cutStage },
        },
      },
    };
    assert.notEqual(evaluate(fixture).primaryId, 'coarse_cut_devotee');
  }
});

test('homestyle bowl is fallback only for a valid finish', () => {
  assert.equal(evaluate(homestyleBowlFixture).primaryId, 'homestyle_bowl');
  const cooking = {
    ...homestyleBowlFixture,
    state: { ...homestyleBowlFixture.state, phase: 'cooking' },
  };
  assert.equal(evaluate(cooking).primaryId, null);
});

test('all six specials unlock independently in stable declaration order', () => {
  const expectedOrder = Object.keys(SPECIAL_FIXTURES);
  assert.equal(expectedOrder.length, 6);

  for (const [expectedId, fixture] of Object.entries(SPECIAL_FIXTURES)) {
    assert.deepEqual(evaluate(fixture).specialIds, [expectedId], expectedId);
  }

  const allFixture = {
    state: {
      ...homestyleBowlFixture.state,
      ingredients: {
        ...homestyleBowlFixture.state.ingredients,
        natto: { ...homestyleBowlFixture.state.ingredients.natto, cutStage: 'paste' },
        greenOnion: { ...homestyleBowlFixture.state.ingredients.greenOnion, usedAmount: 0.65 },
        mustardG: 2.2,
        soySauceMl: 8,
      },
      mixing: { ...homestyleBowlFixture.state.mixing, progress: 0.96, aeration: 0.9 },
      serving: { ...homestyleBowlFixture.state.serving, spillRatio: 0.35 },
    },
    scores: homestyleBowlFixture.scores,
  };
  assert.deepEqual(evaluate(allFixture).specialIds, expectedOrder);
});

test('registry contains 20 pure, locale-independent rule entries', () => {
  assert.equal(ACHIEVEMENTS.length, 20);
  assert.equal(new Set(ACHIEVEMENTS.map(({ id }) => id)).size, 20);
  for (const achievement of ACHIEVEMENTS) {
    assert.deepEqual(Object.keys(achievement).sort(), ['id', 'kind', 'matches', 'priority']);
    assert.equal(typeof achievement.matches, 'function');
    assert.equal(typeof achievement.priority, 'number');
    assert.equal('name' in achievement, false);
    assert.equal('hint' in achievement, false);
    assert.doesNotMatch(achievement.matches.toString(), /[\u3040-\u30ff\u3400-\u9fff]/u);
  }
});
