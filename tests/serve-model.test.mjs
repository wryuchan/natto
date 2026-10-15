import assert from 'node:assert/strict';
import test from 'node:test';

import {
  Box3,
  Matrix4,
  PerspectiveCamera,
  Quaternion,
  Vector3,
} from 'three';

import { createAppController } from '../src/app-controller.js';
import { createInitialGameState } from '../src/core/game-state.js';
import { reduceGameState } from '../src/core/state-machine.js';
import { createKitchenScene } from '../src/scene/kitchen.js';
import {
  applyPourSample,
  deriveServingVisual,
} from '../src/stations/serve-model.js';
import { createServeStation } from '../src/stations/serve-station.js';

const initialServing = () => ({
  transferredRatio: 0,
  coverage: 0,
  centerOffset: 1,
  spillRatio: 0,
});

const centeredPour = (samples = 2, elapsedMs = 1_800) => ({
  path: Array.from({ length: samples }, (_, index) => ({
    x: 0,
    y: -(index / (samples - 1)) * 0.68,
  })),
  elapsedMs,
});

test('pour direction, drag distance, and held milliseconds control distinct serving outcomes', () => {
  const centered = applyPourSample(initialServing(), centeredPour());
  const lateral = applyPourSample(initialServing(), {
    path: [{ x: 0, y: 0 }, { x: 0.5, y: -0.46 }],
    elapsedMs: 1_800,
  });
  const short = applyPourSample(initialServing(), {
    path: [{ x: 0, y: 0 }, { x: 0, y: -0.25 }],
    elapsedMs: 1_800,
  });
  const brief = applyPourSample(initialServing(), centeredPour(2, 500));

  assert.ok(lateral.centerOffset > centered.centerOffset);
  assert.ok(short.coverage < centered.coverage);
  assert.ok(short.transferredRatio < centered.transferredRatio);
  assert.ok(brief.transferredRatio < centered.transferredRatio);
});

test('equal pour endpoints and elapsed time are independent of sample rate', () => {
  const sparse = applyPourSample(initialServing(), centeredPour(31));
  const dense = applyPourSample(initialServing(), centeredPour(61));
  assert.deepEqual(dense, sparse);
});

test('serving accumulation clamps transfer and spill to normalized bounds', () => {
  let serving = initialServing();
  const excessive = {
    path: [{ x: 0, y: 0 }, { x: 1.3, y: 0.8 }],
    elapsedMs: 5_000,
  };
  for (let index = 0; index < 5; index += 1) {
    serving = applyPourSample(serving, excessive);
  }

  assert.equal(serving.transferredRatio, 1);
  assert.ok(serving.spillRatio >= 0 && serving.spillRatio <= 1);
  for (const value of Object.values(serving)) assert.ok(value >= 0 && value <= 1);
});

test('a centered moderate pour satisfies all four exact perfect serving ranges', () => {
  const serving = applyPourSample(initialServing(), centeredPour());

  assert.ok(serving.transferredRatio >= 0.88 && serving.transferredRatio <= 1);
  assert.ok(serving.coverage >= 0.4 && serving.coverage <= 0.78);
  assert.ok(serving.centerOffset <= 0.18);
  assert.ok(serving.spillRatio <= 0.05);

  const visual = deriveServingVisual(serving);
  assert.ok(visual.patchCount > 0 && visual.patchCount <= 64);
  assert.equal(visual.spillVisible, false);
});

test('rice transfer permits station navigation but locks every bowl mutation', () => {
  let state = createInitialGameState();
  state = reduceGameState(state, { type: 'TRANSFER_TO_BOWL', ingredient: 'natto', amount: 1 });
  state = reduceGameState(state, {
    type: 'TRANSFER_TO_RICE', confirmed: true, transferredRatio: 0.9,
  });

  const cut = reduceGameState(state, { type: 'SWITCH_STATION', station: 'cut' });
  const mix = reduceGameState(cut, { type: 'SWITCH_STATION', station: 'mix' });
  assert.equal(mix.station, 'mix');
  assert.equal(reduceGameState(mix, {
    type: 'UPDATE_CUT', ingredient: 'natto', cutProgress: 0.8,
  }), mix);
  assert.equal(reduceGameState(mix, { type: 'ADD_EGG' }), mix);
  assert.equal(reduceGameState(mix, {
    type: 'ADD_CONDIMENT', condiment: 'mustard', amount: 0.5,
  }), mix);
  assert.equal(reduceGameState(mix, { type: 'UPDATE_MIX', progress: 0.7 }), mix);
});

test('finish and the first rice transfer stay unavailable until explicitly confirmed', () => {
  const confirmations = [];
  const state = reduceGameState(createInitialGameState(), {
    type: 'TRANSFER_TO_BOWL', ingredient: 'natto', amount: 1,
  });
  const controller = createAppController({
    initialState: state,
    settings: { tutorialSeen: true, skipIrreversibleConfirmations: false },
    shell: {
      render() {},
      showTutorial() {},
      announce() {},
      showConfirmation: (_copy, accept) => confirmations.push(accept),
    },
  });

  assert.equal(controller.getModel().controls.finishDisabled, true);
  controller.requestIrreversible('transferToRice', {
    type: 'TRANSFER_TO_RICE', confirmed: true, transferredRatio: 0.94,
  }, null, {
    type: 'UPDATE_SERVE', coverage: 0.68, centerOffset: 0.04, spillRatio: 0.01,
  });
  assert.equal(controller.getState().serving.transferredRatio, 0);
  confirmations.shift()();
  assert.deepEqual(controller.getState().serving, {
    transferredRatio: 0.94,
    coverage: 0.68,
    centerOffset: 0.04,
    spillRatio: 0.01,
  });
  assert.equal(controller.getModel().controls.finishDisabled, false);

  controller.requestIrreversible('finish', { type: 'FINISH' });
  assert.equal(controller.getState().phase, 'cooking');
  confirmations.shift()();
  assert.equal(controller.getState().phase, 'result');
});

test('green onion alone cannot count as natto reaching the rice', () => {
  let state = createInitialGameState();
  state = reduceGameState(state, {
    type: 'TRANSFER_TO_BOWL', ingredient: 'greenOnion', amount: 0.25,
  });
  const transferred = reduceGameState(state, {
    type: 'TRANSFER_TO_RICE', confirmed: true, transferredRatio: 0.9,
  });

  assert.equal(transferred, state);
  assert.equal(reduceGameState(state, { type: 'FINISH' }), state);
});

test('serving vessels meet the counter and rice stays inside while cresting the rim', () => {
  const station = createServeStation({
    camera: new PerspectiveCamera(45, 1, 0.1, 100),
    dispatch() {},
  });
  station.group.updateWorldMatrix(true, true);
  const riceBowlBox = new Box3().setFromObject(station.group.getObjectByName('rice-bowl'));
  const pouringBowlBox = new Box3().setFromObject(station.group.getObjectByName('pouring-bowl'));
  const riceBox = new Box3().setFromObject(station.group.getObjectByName('rice'));

  assert.ok(Math.abs(riceBowlBox.min.y - 0.04) < 1e-6);
  assert.ok(Math.abs(pouringBowlBox.min.y - 0.04) < 1e-6);
  assert.ok(riceBox.min.x > riceBowlBox.min.x);
  assert.ok(riceBox.max.x < riceBowlBox.max.x);
  assert.ok(riceBox.min.z > riceBowlBox.min.z);
  assert.ok(riceBox.max.z < riceBowlBox.max.z);
  assert.ok(riceBox.max.y > riceBowlBox.max.y);

  const tiltedState = createInitialGameState();
  tiltedState.serving = {
    transferredRatio: 1,
    coverage: 0.9,
    centerOffset: 0.7,
    spillRatio: 0.4,
  };
  station.renderState(tiltedState);
  station.group.updateWorldMatrix(true, true);
  const tiltedPouringBowlBox = new Box3().setFromObject(
    station.group.getObjectByName('pouring-bowl'),
  );
  assert.ok(Math.abs(tiltedPouringBowlBox.min.y - 0.04) < 1e-6);
  station.dispose();
});

test('served natto follows the flattened rice surface even at maximum lateral offset', () => {
  const station = createServeStation({
    camera: new PerspectiveCamera(45, 1, 0.1, 100),
    dispatch() {},
  });
  const state = createInitialGameState();
  state.serving = {
    transferredRatio: 1,
    coverage: 1,
    centerOffset: 1,
    spillRatio: 0,
  };
  station.renderState(state);

  const rice = station.group.getObjectByName('rice');
  const patches = station.group.getObjectByName('serving-patches');
  const riceRadius = rice.geometry.parameters.radius;
  const moundHeight = riceRadius * rice.scale.y;
  const matrix = new Matrix4();
  const position = new Vector3();
  const rotation = new Quaternion();
  const scale = new Vector3();
  const expectedNormal = new Vector3();
  const patchUp = new Vector3();

  assert.ok(rice.scale.y >= 0.5 && rice.scale.y <= 0.6);
  assert.ok(patches.count > 0);
  for (let index = 0; index < patches.count; index += 1) {
    patches.getMatrixAt(index, matrix);
    matrix.decompose(position, rotation, scale);
    const dx = position.x - rice.position.x;
    const dz = position.z - rice.position.z;
    const radialRatio = Math.hypot(dx, dz) / riceRadius;
    const surfaceY = rice.position.y + moundHeight * Math.sqrt(1 - (radialRatio ** 2));
    expectedNormal.set(
      dx / (riceRadius ** 2),
      (surfaceY - rice.position.y) / (moundHeight ** 2),
      dz / (riceRadius ** 2),
    ).normalize();
    patchUp.set(0, 1, 0).applyQuaternion(rotation);

    assert.ok(radialRatio <= 0.94, `patch ${index} escaped the rice footprint`);
    assert.ok(position.y > surfaceY, `patch ${index} is buried in the rice`);
    assert.ok(position.y - surfaceY < 0.16, `patch ${index} floats above the rice`);
    assert.ok(patchUp.dot(expectedNormal) > 0.995, `patch ${index} does not follow the mound normal`);
  }
  station.dispose();
});

test('default kitchen installs the bounded serving adapter and visible spill projection', () => {
  const canvas = {
    clientWidth: 375,
    clientHeight: 500,
    addEventListener() {},
    removeEventListener() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 375, height: 500 }),
  };
  const renderer = {
    shadowMap: {}, setPixelRatio() {}, setSize() {}, render() {}, dispose() {},
  };
  const kitchen = createKitchenScene(canvas, {
    autoStart: false,
    enableInput: false,
    rendererFactory: () => renderer,
  });
  const station = kitchen.getStation('serve');
  const patches = station.group.getObjectByName('serving-patches');
  const spill = station.group.getObjectByName('serving-spill');
  const state = createInitialGameState();
  state.serving = {
    transferredRatio: 1,
    coverage: 0.9,
    centerOffset: 0.7,
    spillRatio: 0.4,
  };
  station.renderState(state);

  assert.equal(patches.instanceMatrix.count, 64);
  assert.ok(patches.count <= 64);
  assert.equal(spill.visible, true);
  kitchen.dispose();
});
