import assert from 'node:assert/strict';
import test from 'node:test';

import {
  NATTO_STAGES,
  PHASES,
  STATIONS,
  createInitialGameState,
} from '../src/core/game-state.js';
import { canApplyEvent, reduceGameState } from '../src/core/state-machine.js';

const INITIAL_STATE = {
  version: 1,
  phase: 'cooking',
  station: 'cut',
  elapsedMs: 0,
  ingredients: {
    natto: {
      amount: 1,
      cutStage: 'whole',
      cutProgress: 0,
      inBowl: false,
    },
    greenOnion: {
      usedAmount: 0,
      fineness: 0,
      uniformity: 0,
      cutPositions: [],
      inBowl: false,
    },
    egg: { added: false },
    soySauceMl: 0,
    mustardG: 0,
  },
  mixing: {
    progress: 0,
    circularity: 0,
    speedStability: 0,
    clockwiseRatio: 0,
    aeration: 0,
  },
  serving: {
    transferredRatio: 0,
    coverage: 0,
    centerOffset: 1,
    spillRatio: 0,
  },
};

function bowlState() {
  return reduceGameState(createInitialGameState(), {
    type: 'TRANSFER_TO_BOWL',
    ingredient: 'natto',
    amount: 1,
  });
}

function riceState() {
  return reduceGameState(bowlState(), {
    type: 'TRANSFER_TO_RICE',
    confirmed: true,
    transferredRatio: 0.25,
  });
}

test('initial state is the serializable version-1 specification shape', () => {
  const state = createInitialGameState();

  assert.deepEqual(state, INITIAL_STATE);
  assert.deepEqual(JSON.parse(JSON.stringify(state)), INITIAL_STATE);
  assert.ok(Object.isFrozen(STATIONS));
  assert.ok(Object.isFrozen(PHASES));
  assert.ok(Object.isFrozen(NATTO_STAGES));
});

test('station switches are allowed during cooking and rejected in result', () => {
  for (const station of ['cut', 'mix', 'serve']) {
    const state = createInitialGameState();
    const next = reduceGameState(state, { type: 'SWITCH_STATION', station });

    assert.equal(next.station, station);
    assert.equal(canApplyEvent(state, { type: 'SWITCH_STATION', station }), true);
  }

  const result = reduceGameState(riceState(), { type: 'FINISH' });
  const unchanged = reduceGameState(result, { type: 'SWITCH_STATION', station: 'cut' });
  assert.strictEqual(unchanged, result);
  assert.equal(canApplyEvent(result, { type: 'SWITCH_STATION', station: 'cut' }), false);
});

test('bowl transfer moves only the named available ingredient and is idempotent', () => {
  const initial = createInitialGameState();
  const natto = reduceGameState(initial, {
    type: 'TRANSFER_TO_BOWL',
    ingredient: 'natto',
    amount: 0.75,
  });

  assert.equal(natto.ingredients.natto.inBowl, true);
  assert.equal(natto.ingredients.natto.amount, 0.75);
  assert.deepEqual(natto.ingredients.greenOnion, initial.ingredients.greenOnion);
  assert.equal(initial.ingredients.natto.inBowl, false);
  assert.strictEqual(reduceGameState(natto, {
    type: 'TRANSFER_TO_BOWL',
    ingredient: 'natto',
    amount: 0.5,
  }), natto);

  const onion = reduceGameState(initial, {
    type: 'TRANSFER_TO_BOWL',
    ingredient: 'greenOnion',
    amount: 0.3,
  });
  assert.equal(onion.ingredients.greenOnion.inBowl, true);
  assert.equal(onion.ingredients.greenOnion.usedAmount, 0.3);
  assert.deepEqual(onion.ingredients.natto, initial.ingredients.natto);
});

test('rice transfer requires bowl contents and confirmation and locks ingredient mutation', () => {
  const initial = createInitialGameState();
  assert.strictEqual(reduceGameState(initial, {
    type: 'TRANSFER_TO_RICE',
    confirmed: true,
    transferredRatio: 0.2,
  }), initial);

  const bowl = bowlState();
  assert.strictEqual(reduceGameState(bowl, {
    type: 'TRANSFER_TO_RICE',
    confirmed: false,
    transferredRatio: 0.2,
  }), bowl);

  const served = reduceGameState(bowl, {
    type: 'TRANSFER_TO_RICE',
    confirmed: true,
    transferredRatio: 0.2,
  });
  assert.equal(served.serving.transferredRatio, 0.2);

  for (const event of [
    { type: 'UPDATE_CUT', ingredient: 'natto', cutProgress: 0.8, cutStage: 'hikiwari' },
    { type: 'TRANSFER_TO_BOWL', ingredient: 'greenOnion', amount: 0.2 },
    { type: 'ADD_EGG' },
    { type: 'ADD_CONDIMENT', condiment: 'soySauce', amount: 1 },
    { type: 'UPDATE_MIX', progress: 0.5 },
  ]) {
    assert.strictEqual(reduceGameState(served, event), served);
  }
});

test('finish requires a rice transfer and is accepted afterward', () => {
  const initial = createInitialGameState();
  assert.strictEqual(reduceGameState(initial, { type: 'FINISH' }), initial);

  const served = riceState();
  const result = reduceGameState(served, { type: 'FINISH' });
  assert.equal(result.phase, 'result');
  assert.notStrictEqual(result, served);
});

test('invalid, malformed, and out-of-order events preserve object identity', () => {
  const initial = createInitialGameState();
  const invalidEvents = [
    null,
    {},
    { type: 'UNKNOWN' },
    { type: 'SWITCH_STATION', station: 'oven' },
    { type: 'UPDATE_CUT', ingredient: 'natto', cutProgress: Number.NaN, cutStage: 'coarse' },
    { type: 'UPDATE_CUT', ingredient: 'natto', cutProgress: Infinity, cutStage: 'coarse' },
    { type: 'TRANSFER_TO_BOWL', ingredient: 'natto', amount: -1 },
    { type: 'ADD_CONDIMENT', condiment: 'soySauce', amount: '3' },
    { type: 'UPDATE_MIX', progress: Number.NaN },
    { type: 'UPDATE_SERVE', coverage: 0.5 },
  ];

  for (const event of invalidEvents) {
    assert.strictEqual(reduceGameState(initial, event), initial);
    assert.equal(canApplyEvent(initial, event), false);
  }
});

test('normalized updates clamp finite fields to zero through one', () => {
  const cut = reduceGameState(createInitialGameState(), {
    type: 'UPDATE_CUT',
    ingredient: 'greenOnion',
    fineness: 1.4,
    uniformity: -0.2,
  });
  assert.equal(cut.ingredients.greenOnion.fineness, 1);
  assert.equal(cut.ingredients.greenOnion.uniformity, 0);

  const mixed = reduceGameState(cut, {
    type: 'UPDATE_MIX',
    progress: 1.2,
    aeration: -1,
  });
  assert.equal(mixed.mixing.progress, 1);
  assert.equal(mixed.mixing.aeration, 0);
});

test('onion cut positions survive serializing state and later updates', () => {
  const cut = reduceGameState(createInitialGameState(), {
    type: 'UPDATE_CUT',
    ingredient: 'greenOnion',
    fineness: 0.3,
    uniformity: 0.8,
    cutPositions: [0.35, 0.7, 1.05],
  });
  const recovered = JSON.parse(JSON.stringify(cut));
  const continued = reduceGameState(recovered, {
    type: 'UPDATE_CUT',
    ingredient: 'greenOnion',
    fineness: 0.4,
    uniformity: 0.85,
    cutPositions: [0.35, 0.7, 1.05, 1.4],
  });

  assert.deepEqual(continued.ingredients.greenOnion.cutPositions, [0.35, 0.7, 1.05, 1.4]);
  assert.deepEqual(JSON.parse(JSON.stringify(continued)), continued);
});

test('reset creates a fresh run without touching external achievement data', () => {
  const achievements = { fermentation_master: { unlockedAt: '2026-10-12T00:00:00.000Z' } };
  const served = riceState();
  const reset = reduceGameState(served, { type: 'RESET_RUN' });

  assert.deepEqual(reset, INITIAL_STATE);
  assert.notStrictEqual(reset, served);
  assert.deepEqual(achievements, {
    fermentation_master: { unlockedAt: '2026-10-12T00:00:00.000Z' },
  });
});
