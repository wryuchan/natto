import assert from 'node:assert/strict';
import test from 'node:test';

import { createInitialGameState } from '../src/core/game-state.js';
import {
  scoreCutting,
  scoreGame,
  scoreMixing,
  scoreRange,
  scoreServing,
  scoreTaste,
} from '../src/core/scoring.js';

function stateWith(overrides = {}) {
  const state = createInitialGameState();
  return {
    ...state,
    ...overrides,
    ingredients: {
      ...state.ingredients,
      ...(overrides.ingredients ?? {}),
      natto: { ...state.ingredients.natto, ...(overrides.ingredients?.natto ?? {}) },
      greenOnion: {
        ...state.ingredients.greenOnion,
        ...(overrides.ingredients?.greenOnion ?? {}),
      },
      egg: { ...state.ingredients.egg, ...(overrides.ingredients?.egg ?? {}) },
    },
    mixing: { ...state.mixing, ...(overrides.mixing ?? {}) },
    serving: { ...state.serving, ...(overrides.serving ?? {}) },
  };
}

test('scoreRange holds the ideal plateau and falls linearly to hard limits', () => {
  assert.equal(scoreRange(2, 2, 4, 0, 6), 100);
  assert.equal(scoreRange(3, 2, 4, 0, 6), 100);
  assert.equal(scoreRange(4, 2, 4, 0, 6), 100);
  assert.equal(scoreRange(1, 2, 4, 0, 6), 50);
  assert.equal(scoreRange(5, 2, 4, 0, 6), 50);
  assert.equal(scoreRange(-1, 2, 4, 0, 6), 0);
  assert.equal(scoreRange(7, 2, 4, 0, 6), 0);
});

test('whole natto with no green onion scores exactly 92 for cutting', () => {
  assert.equal(scoreCutting(stateWith()), 92);
});

test('natto stages use exact bases for whole, hikiwari, and paste', () => {
  const whole = stateWith({ ingredients: { natto: { cutStage: 'whole' } } });
  const hikiwari = stateWith({ ingredients: { natto: { cutStage: 'hikiwari' } } });
  const paste = stateWith({ ingredients: { natto: { cutStage: 'paste' } } });

  assert.equal(scoreCutting(whole), 92); // round(95 * 0.7 + 85 * 0.3)
  assert.equal(scoreCutting(hikiwari), 92);
  assert.equal(scoreCutting(paste), 47); // round(30 * 0.7 + 85 * 0.3)
});

test('egg-free mixing progress is ideal from 0.55 through 0.72', () => {
  for (const progress of [0.55, 0.63, 0.72]) {
    const state = stateWith({
      mixing: { progress, circularity: 1, speedStability: 1 },
    });
    assert.equal(scoreMixing(state), 100);
  }

  assert.ok(scoreMixing(stateWith({ mixing: {
    progress: 0.54,
    circularity: 1,
    speedStability: 1,
  } })) < 100);
  assert.ok(scoreMixing(stateWith({ mixing: {
    progress: 0.73,
    circularity: 1,
    speedStability: 1,
  } })) < 100);
});

test('egg mixing progress is ideal from 0.68 through 0.84', () => {
  for (const progress of [0.68, 0.76, 0.84]) {
    const state = stateWith({
      ingredients: { egg: { added: true } },
      mixing: { progress, circularity: 1, speedStability: 1 },
    });
    assert.equal(scoreMixing(state), 100);
  }

  assert.ok(scoreMixing(stateWith({
    ingredients: { egg: { added: true } },
    mixing: { progress: 0.67, circularity: 1, speedStability: 1 },
  })) < 100);
  assert.ok(scoreMixing(stateWith({
    ingredients: { egg: { added: true } },
    mixing: { progress: 0.85, circularity: 1, speedStability: 1 },
  })) < 100);
});

test('soy sauce ideal ranges use the exact egg-free and egg boundaries', () => {
  for (const soySauceMl of [2.5, 4.8]) {
    assert.equal(scoreTaste(stateWith({ ingredients: { soySauceMl } })), 100);
  }
  for (const soySauceMl of [3.5, 5.8]) {
    assert.equal(scoreTaste(stateWith({
      ingredients: { soySauceMl, egg: { added: true } },
    })), 100);
  }

  assert.ok(scoreTaste(stateWith({ ingredients: { soySauceMl: 2.4 } })) < 100);
  assert.ok(scoreTaste(stateWith({
    ingredients: { soySauceMl: 5.9, egg: { added: true } },
  })) < 100);
});

test('mustard 0..1.2g and green onion 0..0.40 remain high-score ranges', () => {
  for (const mustardG of [0, 1.2]) {
    for (const usedAmount of [0, 0.4]) {
      assert.equal(scoreTaste(stateWith({
        ingredients: {
          soySauceMl: 3.5,
          mustardG,
          greenOnion: { usedAmount },
        },
      })), 100);
    }
  }
});

test('serving is perfect only across all four exact ideal ranges', () => {
  for (const serving of [
    { transferredRatio: 0.88, coverage: 0.4, centerOffset: 0.18, spillRatio: 0.05 },
    { transferredRatio: 1, coverage: 0.78, centerOffset: 0, spillRatio: 0 },
  ]) {
    assert.equal(scoreServing(stateWith({ serving })), 100);
  }

  for (const serving of [
    { transferredRatio: 0.8, coverage: 0.4, centerOffset: 0.18, spillRatio: 0.05 },
    { transferredRatio: 0.88, coverage: 0.3, centerOffset: 0.18, spillRatio: 0.05 },
    { transferredRatio: 0.88, coverage: 0.4, centerOffset: 0.3, spillRatio: 0.05 },
    { transferredRatio: 0.88, coverage: 0.4, centerOffset: 0.18, spillRatio: 0.15 },
  ]) {
    assert.ok(scoreServing(stateWith({ serving })) < 100);
  }
});

test('all score outputs are bounded integers and worsening penalties is monotonic', () => {
  const states = [
    stateWith(),
    stateWith({
      ingredients: {
        natto: { cutStage: 'paste' },
        soySauceMl: 50,
        mustardG: 10,
        greenOnion: { usedAmount: 1, fineness: 0, uniformity: 0 },
      },
      mixing: { progress: 1, circularity: 0, speedStability: 0 },
      serving: { transferredRatio: 0, coverage: 1, centerOffset: 1, spillRatio: 1 },
    }),
  ];

  for (const state of states) {
    const scores = scoreGame(state);
    for (const value of Object.values(scores)) {
      assert.equal(Number.isInteger(value), true);
      assert.ok(value >= 0 && value <= 100);
    }
  }

  const soyPenalties = [6, 7, 8].map((soySauceMl) =>
    scoreTaste(stateWith({ ingredients: { soySauceMl } }))
  );
  assert.ok(soyPenalties[0] >= soyPenalties[1]);
  assert.ok(soyPenalties[1] >= soyPenalties[2]);

  const mixPenalties = [0.9, 0.96, 1].map((progress) =>
    scoreMixing(stateWith({ mixing: { progress, circularity: 1, speedStability: 1 } }))
  );
  assert.ok(mixPenalties[0] >= mixPenalties[1]);
  assert.ok(mixPenalties[1] >= mixPenalties[2]);
});
