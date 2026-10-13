import assert from 'node:assert/strict';
import test from 'node:test';

import { PerspectiveCamera, Vector3 } from 'three';

import { NATTO_STAGES, createInitialGameState } from '../src/core/game-state.js';
import { reduceGameState } from '../src/core/state-machine.js';
import {
  applyKnifeStroke,
  deriveNattoStage,
  scoreOnionCuts,
} from '../src/stations/cut-model.js';
import { createCutStation } from '../src/stations/cut-station.js';

function initialCutState() {
  return {
    natto: {
      cutProgress: 0,
      cutStage: NATTO_STAGES.WHOLE,
      inBowl: false,
    },
    greenOnion: {
      cuts: [],
      fineness: 0,
      uniformity: 0,
      inBowl: false,
    },
  };
}

const nattoStroke = (points = [
  { x: -0.9, y: -0.75 },
  { x: -0.9, y: 0.75 },
]) => ({ ingredient: 'natto', points });

test('strokes outside the board or named ingredient preserve cut state identity', () => {
  const state = initialCutState();
  const outsideBoard = nattoStroke([
    { x: 3, y: 3 },
    { x: 3.5, y: 3.5 },
  ]);
  const missesNatto = nattoStroke([
    { x: 0, y: -0.8 },
    { x: 0, y: 0.8 },
  ]);

  assert.equal(applyKnifeStroke(state, outsideBoard), state);
  assert.equal(applyKnifeStroke(state, missesNatto), state);
});

test('natto stages use exact 0.18, 0.52, and 0.96 thresholds', () => {
  assert.equal(deriveNattoStage(0.179999), NATTO_STAGES.WHOLE);
  assert.equal(deriveNattoStage(0.18), NATTO_STAGES.COARSE);
  assert.equal(deriveNattoStage(0.519999), NATTO_STAGES.COARSE);
  assert.equal(deriveNattoStage(0.52), NATTO_STAGES.HIKIWARI);
  assert.equal(deriveNattoStage(0.959999), NATTO_STAGES.HIKIWARI);
  assert.equal(deriveNattoStage(0.96), NATTO_STAGES.PASTE);

  let state = initialCutState();
  const stages = [];
  for (let index = 0; index < 10; index += 1) {
    const previousProgress = state.natto.cutProgress;
    state = applyKnifeStroke(state, nattoStroke());
    assert.ok(state.natto.cutProgress >= previousProgress);
    stages.push(state.natto.cutStage);
  }
  assert.deepEqual([...new Set(stages)], [
    NATTO_STAGES.WHOLE,
    NATTO_STAGES.COARSE,
    NATTO_STAGES.HIKIWARI,
    NATTO_STAGES.PASTE,
  ]);
});

test('onion spacing changes uniformity independently of cut count', () => {
  const even = scoreOnionCuts([0.3, 0.6, 0.9, 1.2, 1.5]);
  const uneven = scoreOnionCuts([0.3, 0.31, 0.32, 1.35, 1.5]);

  assert.equal(even.fineness, uneven.fineness);
  assert.ok(even.uniformity > uneven.uniformity);
  assert.ok(even.uniformity >= 0.95);
});

test('sample frequency does not change one geometric knife stroke', () => {
  const state = initialCutState();
  const sparse = nattoStroke([
    { x: -0.9, y: -0.75 },
    { x: -0.9, y: 0.75 },
  ]);
  const dense = nattoStroke(Array.from({ length: 31 }, (_, index) => ({
    x: -0.9,
    y: -0.75 + (index / 30) * 1.5,
  })));

  assert.deepEqual(applyKnifeStroke(state, sparse), applyKnifeStroke(state, dense));
});

test('an ingredient already transferred to the bowl rejects further cuts', () => {
  const nattoTransferred = initialCutState();
  nattoTransferred.natto.inBowl = true;
  const onionTransferred = initialCutState();
  onionTransferred.greenOnion.inBowl = true;
  const onionStroke = {
    ingredient: 'greenOnion',
    points: [{ x: 0.9, y: -0.6 }, { x: 0.9, y: 0.6 }],
  };

  assert.equal(applyKnifeStroke(nattoTransferred, nattoStroke()), nattoTransferred);
  assert.equal(applyKnifeStroke(onionTransferred, onionStroke), onionTransferred);
});

test('cut station implements the adapter contract with instanced ingredients', () => {
  const station = createCutStation({
    camera: new PerspectiveCamera(45, 1, 0.1, 100),
    dispatch() {},
  });
  const instances = station.group.children.filter((child) => child.isInstancedMesh);

  assert.equal(station.id, 'cut');
  assert.ok(instances.length >= 2);
  assert.equal(typeof station.hitTest, 'function');
  assert.equal(typeof station.applyPointerSample, 'function');
  assert.equal(typeof station.renderState, 'function');
  assert.equal(typeof station.dispose, 'function');
  station.dispose();
});

test('station transfer uses the player selected scallion amount through the reducer', () => {
  const dispatched = [];
  const station = createCutStation({
    camera: new PerspectiveCamera(45, 1, 0.1, 100),
    getGreenOnionAmount: () => 0.65,
    dispatch: (event) => dispatched.push(event),
  });

  station.applyPointerSample('end', {}, { type: 'transfer', ingredient: 'greenOnion' });
  const next = reduceGameState(createInitialGameState(), dispatched[0]);

  assert.equal(dispatched[0].amount, 0.65);
  assert.equal(next.ingredients.greenOnion.usedAmount, 0.65);
  station.dispose();
});

test('station resumes onion scoring from serialized cut positions after recovery', () => {
  const events = [];
  const camera = new PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 5, 5);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const station = createCutStation({ camera, dispatch: (event) => events.push(event) });
  let state = createInitialGameState();
  state = reduceGameState(state, {
    type: 'UPDATE_CUT',
    ingredient: 'greenOnion',
    fineness: 0.3,
    uniformity: 0.8,
    cutPositions: [0.35, 0.7, 1.05],
  });
  state = JSON.parse(JSON.stringify(state));
  station.renderState(state);
  const sampleAt = (x, z) => {
    const projected = new Vector3(x, 0.15, z).project(camera);
    return { local: { x: (projected.x + 1) / 2, y: (1 - projected.y) / 2 } };
  };
  station.applyPointerSample('start', sampleAt(0.9, -0.6), { type: 'knife' });
  station.applyPointerSample('end', sampleAt(0.9, 0.6), { type: 'knife' });
  for (const event of events) state = reduceGameState(state, event);

  assert.equal(state.ingredients.greenOnion.cutPositions.length, 4);
  assert.deepEqual(state.ingredients.greenOnion.cutPositions.slice(0, 3), [0.35, 0.7, 1.05]);
  station.dispose();
});
