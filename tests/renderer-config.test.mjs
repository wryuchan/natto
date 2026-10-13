import assert from 'node:assert/strict';
import test from 'node:test';

import { Group, PCFShadowMap } from 'three';

import { createAppController } from '../src/app-controller.js';
import { createInitialGameState } from '../src/core/game-state.js';
import {
  createRenderer,
  getCameraDescriptor,
  resizeRendererToCanvas,
  selectQualityProfile,
} from '../src/scene/renderer.js';
import { createKitchenScene } from '../src/scene/kitchen.js';

function makeCanvas(width = 375, height = 500) {
  const listeners = new Map();
  return {
    clientWidth: width,
    clientHeight: height,
    width,
    height,
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
    dispatchPointer(type, event) {
      listeners.get(type)?.(event);
    },
    getBoundingClientRect() {
      return { left: 0, top: 0, width, height };
    },
  };
}

function makeRenderer(canvas) {
  const calls = [];
  return {
    domElement: canvas,
    shadowMap: {},
    calls,
    setPixelRatio(value) {
      calls.push(['pixelRatio', value]);
    },
    setSize(width, height, updateStyle) {
      calls.push(['size', width, height, updateStyle]);
      canvas.width = width;
      canvas.height = height;
    },
    render(scene, camera) {
      calls.push(['render', scene, camera]);
    },
    dispose() {
      calls.push(['dispose']);
    },
  };
}

function makeStation(id, projections) {
  return {
    id,
    group: new Group(),
    hitTest() {
      return null;
    },
    applyPointerSample() {},
    renderState(state) {
      projections.push([id, state.station, state.ingredients.natto.cutProgress]);
    },
    dispose() {},
  };
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value)) deepFreeze(nested);
  return value;
}

test('quality profiles cap DPR and degrade threads, foam, shadows, then resolution', () => {
  const profiles = [0, 1, 2, 3, 4].map((degradationLevel) => selectQualityProfile({
    devicePixelRatio: 3,
    degradationLevel,
  }));

  assert.deepEqual(profiles.map((profile) => ({
    pixelRatio: profile.pixelRatio,
    shadows: profile.shadows,
    threadCount: profile.threadCount,
    foamCount: profile.foamCount,
    antialias: profile.antialias,
  })), [
    { pixelRatio: 2, shadows: true, threadCount: 72, foamCount: 48, antialias: true },
    { pixelRatio: 2, shadows: true, threadCount: 36, foamCount: 48, antialias: true },
    { pixelRatio: 2, shadows: true, threadCount: 36, foamCount: 24, antialias: true },
    { pixelRatio: 2, shadows: false, threadCount: 36, foamCount: 24, antialias: true },
    { pixelRatio: 1.5, shadows: false, threadCount: 36, foamCount: 24, antialias: true },
  ]);
});

test('shadow-enabled renderers use the supported PCF shadow map type', () => {
  const renderer = createRenderer(makeCanvas(), { shadows: true }, () => makeRenderer(makeCanvas()));

  assert.equal(renderer.shadowMap.type, PCFShadowMap);
});

test('portrait and desktop cameras frame the same station coordinate system', () => {
  const portrait = getCameraDescriptor({ station: 'cut', width: 375, height: 812 });
  const desktop = getCameraDescriptor({ station: 'cut', width: 1280, height: 800 });

  assert.equal(portrait.orientation, 'portrait');
  assert.equal(desktop.orientation, 'landscape');
  assert.deepEqual(portrait.target, desktop.target);
  assert.deepEqual(portrait.workSurface, desktop.workSurface);
  assert.equal(portrait.worldScale, 1);
  assert.equal(desktop.worldScale, 1);
  assert.notDeepEqual(portrait.position, desktop.position);
});

test('renderer resize reads the canvas client box and not window dimensions', () => {
  const canvas = makeCanvas(643, 377);
  const renderer = makeRenderer(canvas);
  const camera = {
    aspect: 1,
    updates: 0,
    updateProjectionMatrix() {
      this.updates += 1;
    },
  };

  const resized = resizeRendererToCanvas(renderer, camera, canvas, { pixelRatio: 1.5 });

  assert.equal(resized, true);
  assert.deepEqual(renderer.calls.slice(0, 2), [
    ['pixelRatio', 1.5],
    ['size', 643, 377, false],
  ]);
  assert.equal(camera.aspect, 643 / 377);
  assert.equal(camera.updates, 1);
});

test('kitchen projects frozen GameState without mutation or switch-time object growth', () => {
  const canvas = makeCanvas();
  const renderer = makeRenderer(canvas);
  const projections = [];
  const stations = ['cut', 'mix', 'serve'].map((id) => makeStation(id, projections));
  const kitchen = createKitchenScene(canvas, {
    stations,
    rendererFactory: () => renderer,
    autoStart: false,
    enableInput: false,
    capabilities: { devicePixelRatio: 1, degradationLevel: 0 },
  });
  const state = deepFreeze(createInitialGameState());
  const serialized = JSON.stringify(state);
  const objectCount = kitchen.scene.children.length;

  kitchen.renderState(state);
  for (let index = 0; index < 20; index += 1) {
    kitchen.setStation(['cut', 'mix', 'serve'][index % 3]);
  }

  assert.equal(JSON.stringify(state), serialized);
  assert.deepEqual(projections, [['cut', 'cut', 0]]);
  assert.equal(kitchen.scene.children.length, objectCount);
  kitchen.dispose();
  assert.ok(renderer.calls.some(([name]) => name === 'dispose'));
});

test('station changes tween between fixed camera descriptors instead of snapping', () => {
  const canvas = makeCanvas(1280, 800);
  const renderer = makeRenderer(canvas);
  const projections = [];
  const stations = ['cut', 'mix', 'serve'].map((id) => makeStation(id, projections));
  let now = 0;
  const kitchen = createKitchenScene(canvas, {
    stations,
    rendererFactory: () => renderer,
    autoStart: false,
    enableInput: false,
    now: () => now,
    cameraTransitionMs: 400,
  });
  const start = kitchen.camera.position.toArray();
  const target = getCameraDescriptor({ station: 'mix', width: 1280, height: 800 }).position;

  kitchen.setStation('mix');
  now = 200;
  kitchen.renderFrame();

  assert.notDeepEqual(kitchen.camera.position.toArray(), start);
  assert.notDeepEqual(kitchen.camera.position.toArray(), [...target]);

  now = 400;
  kitchen.renderFrame();
  assert.deepEqual(kitchen.camera.position.toArray(), [...target]);
  kitchen.dispose();
});

test('reduced motion makes the fixed-camera station transition immediate', () => {
  const canvas = makeCanvas(1280, 800);
  const renderer = makeRenderer(canvas);
  const projections = [];
  const stations = ['cut', 'mix', 'serve'].map((id) => makeStation(id, projections));
  const kitchen = createKitchenScene(canvas, {
    stations,
    rendererFactory: () => renderer,
    autoStart: false,
    enableInput: false,
    reducedMotion: true,
  });
  const target = getCameraDescriptor({ station: 'mix', width: 1280, height: 800 }).position;

  kitchen.setStation('mix');
  kitchen.renderFrame();

  assert.deepEqual(kitchen.camera.position.toArray(), [...target]);
  kitchen.dispose();
});

test('controller blocks station switching until an active pointer ends at its owning station', () => {
  const canvas = makeCanvas(375, 812);
  const renderer = makeRenderer(canvas);
  const calls = [];
  const stations = ['cut', 'mix', 'serve'].map((id) => ({
    ...makeStation(id, []),
    hitTest: () => ({ type: 'drag' }),
    applyPointerSample: (phase) => calls.push([id, phase]),
  }));
  const kitchen = createKitchenScene(canvas, {
    stations,
    rendererFactory: () => renderer,
    autoStart: false,
  });
  const controller = createAppController({
    scene: kitchen,
    settings: { muted: false, skipIrreversibleConfirmations: true, tutorialSeen: true },
    shell: { render() {}, showView() {}, showTutorial() {}, announce() {} },
  });
  const pointer = { pointerId: 1, clientX: 120, clientY: 120 };

  canvas.dispatchPointer('pointerdown', pointer);
  assert.equal(controller.switchStation('mix'), false);
  assert.equal(controller.getState().station, 'cut');
  canvas.dispatchPointer('pointerup', pointer);
  assert.equal(controller.switchStation('mix'), true);
  assert.equal(controller.getState().station, 'mix');

  assert.deepEqual(calls, [['cut', 'start'], ['cut', 'end']]);
  controller.dispose();
});
