import assert from 'node:assert/strict';
import test from 'node:test';

import { Group } from 'three';

import { createAppController } from '../src/app-controller.js';
import { createInitialGameState } from '../src/core/game-state.js';
import { createKitchenScene } from '../src/scene/kitchen.js';
import { selectQualityProfile } from '../src/scene/renderer.js';
import { createRecoveryController } from '../src/systems/recovery.js';

function makeStation(id, profileChanges = []) {
  return {
    id,
    group: new Group(),
    hitTest() { return null; },
    applyPointerSample() {},
    renderState() {},
    setQualityProfile(profile) { profileChanges.push([id, profile]); },
    dispose() {},
  };
}

function makeCanvas() {
  const target = new EventTarget();
  return Object.assign(target, {
    clientWidth: 375,
    clientHeight: 500,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 375, height: 500 }),
  });
}

function makeRenderer() {
  return {
    shadowMap: {},
    setPixelRatio() {},
    setSize() {},
    render() {},
    dispose() {},
  };
}

test('asset failure pauses input and exposes a translated retry state with the failed asset ID', () => {
  const state = createInitialGameState();
  const shown = [];
  let pauses = 0;
  const recovery = createRecoveryController({
    scene: {
      getState: () => state,
      getLocale: () => 'ja',
      pause: () => { pauses += 1; },
    },
    shell: { showRecovery: (model) => shown.push(model) },
    rebuild: async () => ({}),
  });

  const model = recovery.reportAssetFailure('rice-bowl');

  assert.equal(pauses, 1);
  assert.equal(model.kind, 'asset');
  assert.equal(model.assetId, 'rice-bowl');
  assert.match(model.message, /rice-bowl/);
  assert.equal(model.retryLabel, '再読み込み');
  assert.equal(model.actionable, true);
  assert.equal(shown.at(-1), model);
});

test('context loss prevents default handling, pauses, and preserves the exact serialized GameState', () => {
  const state = createInitialGameState();
  state.ingredients.soySauceMl = 3.75;
  const canvas = makeCanvas();
  let pauses = 0;
  const recovery = createRecoveryController({
    scene: {
      getState: () => state,
      getLocale: () => 'en',
      pause: () => { pauses += 1; },
    },
    shell: { showRecovery() {} },
    rebuild: async () => ({}),
  });
  recovery.attach(canvas);
  const lost = new Event('webglcontextlost', { cancelable: true });

  canvas.dispatchEvent(lost);

  assert.equal(lost.defaultPrevented, true);
  assert.equal(pauses, 1);
  assert.equal(recovery.getStatus().serializedState, JSON.stringify(state));
  assert.equal(recovery.getStatus().kind, 'contextLost');
  recovery.dispose();
});

test('context restoration rebuilds from the snapshot and resumes only after a successful render', async () => {
  const state = createInitialGameState();
  state.mixing.progress = 0.64;
  const serialized = JSON.stringify(state);
  const canvas = makeCanvas();
  const calls = [];
  const rebuiltScene = { id: 'rebuilt' };
  const recovery = createRecoveryController({
    scene: {
      getState: () => state,
      getLocale: () => 'en',
      pause: () => calls.push('pause'),
      setScene: (next) => calls.push(['setScene', next]),
      renderSceneFrame: () => calls.push('render'),
      resume: () => calls.push('resume'),
    },
    shell: {
      showRecovery: (model) => calls.push(['show', model.kind]),
      hideRecovery: () => calls.push('hide'),
    },
    rebuild: async (snapshot) => {
      calls.push(['rebuild', snapshot]);
      return rebuiltScene;
    },
  });
  recovery.attach(canvas);

  canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
  canvas.dispatchEvent(new Event('webglcontextrestored'));
  const restored = await recovery.whenSettled();

  assert.equal(restored, true);
  const rebuildCall = calls.find((call) => Array.isArray(call) && call[0] === 'rebuild');
  assert.equal(JSON.stringify(rebuildCall[1]), serialized);
  const detachIndex = calls.findIndex((call) => Array.isArray(call)
    && call[0] === 'setScene'
    && call[1] == null);
  assert.ok(detachIndex >= 0);
  assert.ok(detachIndex < calls.indexOf(rebuildCall));
  assert.ok(calls.indexOf('render') < calls.indexOf('resume'));
  assert.equal(recovery.getStatus().kind, 'ready');
  assert.equal(recovery.getStatus().serializedState, null);
  recovery.dispose();
});

test('a failed rebuild remains actionable and never enters an automatic retry loop', async () => {
  const canvas = makeCanvas();
  let rebuilds = 0;
  const shown = [];
  const recovery = createRecoveryController({
    scene: {
      getState: createInitialGameState,
      getLocale: () => 'en',
      pause() {},
      resume() { assert.fail('resume must not run after a failed render'); },
    },
    shell: { showRecovery: (model) => shown.push(model) },
    rebuild: async () => {
      rebuilds += 1;
      throw new Error('still unavailable');
    },
  });
  recovery.attach(canvas);

  canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
  canvas.dispatchEvent(new Event('webglcontextrestored'));
  assert.equal(await recovery.whenSettled(), false);
  canvas.dispatchEvent(new Event('webglcontextrestored'));
  await Promise.resolve();

  assert.equal(rebuilds, 1);
  assert.equal(recovery.getStatus().kind, 'restoreFailed');
  assert.equal(recovery.getStatus().actionable, true);
  assert.equal(shown.at(-1).retryLabel, 'Reload');

  assert.equal(await recovery.retry(), false);
  assert.equal(rebuilds, 2);
  assert.equal(recovery.getStatus().actionable, true);
  recovery.dispose();
});

test('performance degradation reduces threads, foam, shadows, then resolution without mutating state', () => {
  const profiles = [0, 1, 2, 3, 4].map((degradationLevel) => selectQualityProfile({
    devicePixelRatio: 3,
    degradationLevel,
  }));
  assert.deepEqual(profiles.map(({ threadCount, foamCount, shadows, pixelRatio }) => ({
    threadCount,
    foamCount,
    shadows,
    pixelRatio,
  })), [
    { threadCount: 72, foamCount: 48, shadows: true, pixelRatio: 2 },
    { threadCount: 36, foamCount: 48, shadows: true, pixelRatio: 2 },
    { threadCount: 36, foamCount: 24, shadows: true, pixelRatio: 2 },
    { threadCount: 36, foamCount: 24, shadows: false, pixelRatio: 2 },
    { threadCount: 36, foamCount: 24, shadows: false, pixelRatio: 1.5 },
  ]);

  const canvas = makeCanvas();
  const profileChanges = [];
  const kitchen = createKitchenScene(canvas, {
    stations: ['cut', 'mix', 'serve'].map((id) => makeStation(id, profileChanges)),
    rendererFactory: makeRenderer,
    autoStart: false,
    enableInput: false,
    capabilities: { devicePixelRatio: 3 },
    performanceOptions: { slowFrameMs: 30, sustainedFrameCount: 1 },
  });
  const state = createInitialGameState();
  state.mixing.progress = 0.7;
  const serialized = JSON.stringify(state);
  kitchen.renderState(state);

  const changedProfiles = Array.from({ length: 4 }, () => kitchen.samplePerformanceFrame(40));

  assert.deepEqual(changedProfiles.map((profile) => profile.degradationLevel), [1, 2, 3, 4]);
  assert.equal(JSON.stringify(state), serialized);
  assert.deepEqual(
    profileChanges.filter(([id]) => id === 'mix').map(([, profile]) => profile.degradationLevel),
    [1, 2, 3, 4],
  );
  kitchen.dispose();
});

test('controller pause blocks DOM-driven cooking events until recovery resumes', () => {
  const controller = createAppController({
    settings: { tutorialSeen: true },
    shell: { render() {}, announce() {}, showView() {}, dispose() {} },
    scene: { setStation() {}, renderState() {}, pause() {}, resume() {}, dispose() {} },
  });

  controller.pause();
  assert.equal(controller.switchStation('mix'), false);
  assert.equal(controller.getState().station, 'cut');

  controller.resume();
  assert.equal(controller.switchStation('mix'), true);
  assert.equal(controller.getState().station, 'mix');
  controller.dispose();
});
