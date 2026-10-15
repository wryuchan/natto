import assert from 'node:assert/strict';
import test from 'node:test';

import {
  Box3,
  Group,
  Plane,
  PCFShadowMap,
  PerspectiveCamera,
  Raycaster,
  Vector3,
} from 'three';

import { createAppController } from '../src/app-controller.js';
import { createInitialGameState } from '../src/core/game-state.js';
import {
  createRenderer,
  getCameraDescriptor,
  resizeRendererToCanvas,
  selectQualityProfile,
} from '../src/scene/renderer.js';
import { createKitchenScene } from '../src/scene/kitchen.js';
import { createCutStation } from '../src/stations/cut-station.js';
import { createMixStation } from '../src/stations/mix-station.js';
import { createServeStation } from '../src/stations/serve-station.js';

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

function boxCorners(box) {
  return [box.min.x, box.max.x].flatMap((x) => (
    [box.min.y, box.max.y].flatMap((y) => (
      [box.min.z, box.max.z].map((z) => new Vector3(x, y, z))
    ))
  ));
}

// Full viewports plus the canvas boxes the shell actually lays out at 375x812 and 1280x800.
const CANVAS_SIZES = [[375, 812], [1280, 800], [351, 365], [1000, 394]];

function cameraFor(station, width, height) {
  const descriptor = getCameraDescriptor({ station, width, height });
  const camera = new PerspectiveCamera(
    descriptor.fov,
    width / height,
    descriptor.near,
    descriptor.far,
  );
  camera.position.fromArray(descriptor.position);
  camera.lookAt(...descriptor.target);
  camera.updateMatrixWorld();
  return camera;
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

test('portrait and desktop serve cameras target the midpoint between both vessels', () => {
  const expectedCenterX = (-2 + 0.45) / 2;
  const station = createServeStation({
    camera: new PerspectiveCamera(45, 1, 0.1, 100),
    dispatch() {},
  });
  const state = createInitialGameState();
  state.serving = {
    transferredRatio: 1,
    coverage: 0.9,
    centerOffset: 0.7,
    spillRatio: 0.4,
  };
  station.renderState(state);
  station.group.updateWorldMatrix(true, true);
  const framedCorners = ['rice-bowl', 'rice', 'pouring-bowl'].flatMap((name) => (
    boxCorners(new Box3().setFromObject(station.group.getObjectByName(name)))
  ));
  const views = [[375, 812], [1280, 800]].map(([width, height]) => {
    const descriptor = getCameraDescriptor({ station: 'serve', width, height });
    const camera = new PerspectiveCamera(
      descriptor.fov,
      width / height,
      descriptor.near,
      descriptor.far,
    );
    camera.position.fromArray(descriptor.position);
    camera.lookAt(...descriptor.target);
    camera.updateMatrixWorld();
    return { descriptor, camera };
  });
  const [portrait, desktop] = views.map(({ descriptor }) => descriptor);

  assert.equal(portrait.target[0], expectedCenterX);
  assert.equal(desktop.target[0], expectedCenterX);
  assert.ok(portrait.target[1] >= 0.04 && portrait.target[1] <= 0.86);
  assert.ok(desktop.target[1] >= 0.04 && desktop.target[1] <= 0.86);
  for (const { camera } of views) {
    for (const corner of framedCorners) {
      const projected = corner.clone().project(camera);
      assert.ok(projected.x >= -1 && projected.x <= 1);
      assert.ok(projected.y >= -1 && projected.y <= 1);
    }
  }
  station.dispose();
});

test('station cameras fill the canvas while keeping every interaction target visible', () => {
  const makers = {
    cut: createCutStation,
    mix: createMixStation,
    serve: createServeStation,
  };
  const objectNames = {
    cut: ['knife-blade', 'knife-handle', 'transfer-bowl', 'transfer-natto', 'transfer-onion'],
    mix: ['mix-bowl', 'bowl-rim', 'mix-egg', 'soy-sauce', 'mustard', 'chopstick-1', 'chopstick-2'],
    serve: ['rice-bowl', 'rice', 'pouring-bowl'],
  };

  for (const [stationId, makeStationAdapter] of Object.entries(makers)) {
    const station = makeStationAdapter({
      camera: new PerspectiveCamera(45, 1, 0.1, 100),
      dispatch() {},
    });
    station.group.updateWorldMatrix(true, true);
    const objects = objectNames[stationId].map((name) => station.group.getObjectByName(name));
    const mainBounds = stationId === 'cut'
      ? new Box3().setFromObject(station.group.children[0])
      : objects.reduce((bounds, object) => bounds.union(new Box3().setFromObject(object)), new Box3());

    for (const [width, height] of CANVAS_SIZES) {
      const camera = cameraFor(stationId, width, height);
      const projectedMain = boxCorners(mainBounds).map((corner) => corner.project(camera));
      const widthFraction = (
        Math.max(...projectedMain.map((point) => point.x))
        - Math.min(...projectedMain.map((point) => point.x))
      ) / 2;
      const heightFraction = (
        Math.max(...projectedMain.map((point) => point.y))
        - Math.min(...projectedMain.map((point) => point.y))
      ) / 2;
      // On very wide canvases the height binds first; filling it counts as filling the frame.
      assert.ok(
        widthFraction >= 0.5 || heightFraction >= 0.75,
        `${stationId} is too small at ${width}x${height}`,
      );
      assert.ok(widthFraction <= 0.68, `${stationId} is too large at ${width}x${height}`);

      for (const object of objects) {
        for (const corner of boxCorners(new Box3().setFromObject(object))) {
          const projected = corner.project(camera);
          assert.ok(projected.x >= -1 && projected.x <= 1, `${object.name} is cropped horizontally`);
          assert.ok(projected.y >= -1 && projected.y <= 1, `${object.name} is cropped vertically`);
        }
      }
    }
    station.dispose();
  }
});

test('counter covers every camera ray and the gradient backdrop texture is disposed', () => {
  const canvas = makeCanvas(1280, 800);
  const kitchen = createKitchenScene(canvas, {
    rendererFactory: () => makeRenderer(canvas),
    autoStart: false,
    enableInput: false,
  });
  const counter = kitchen.scene.getObjectByName('counter');
  const backdrop = kitchen.scene.getObjectByName('backdrop');

  assert.ok(counter);
  assert.ok(backdrop?.material?.map);
  assert.equal(kitchen.scene.background.getHex(), kitchen.scene.fog.color.getHex());

  const counterBounds = new Box3().setFromObject(counter);
  const backdropBounds = new Box3().setFromObject(backdrop);
  const counterPlane = new Plane(new Vector3(0, 1, 0), 0);
  const backdropPlane = new Plane(new Vector3(0, 0, 1), 24);
  const raycaster = new Raycaster();
  const intersection = new Vector3();
  for (const stationId of ['cut', 'mix', 'serve']) {
    for (const [width, height] of CANVAS_SIZES) {
      const camera = cameraFor(stationId, width, height);
      for (const x of [-1, 1]) {
        raycaster.setFromCamera({ x, y: -1 }, camera);
        assert.ok(raycaster.ray.intersectPlane(counterPlane, intersection));
        assert.ok(intersection.x >= counterBounds.min.x && intersection.x <= counterBounds.max.x);
        assert.ok(intersection.z >= counterBounds.min.z && intersection.z <= counterBounds.max.z);

        // A steep portrait camera sees only counter at the top edge; either surface means no void.
        raycaster.setFromCamera({ x, y: 1 }, camera);
        const hitsCounter = raycaster.ray.intersectPlane(counterPlane, intersection)
          && intersection.x >= counterBounds.min.x && intersection.x <= counterBounds.max.x
          && intersection.z >= counterBounds.min.z && intersection.z <= counterBounds.max.z;
        const hitsBackdrop = raycaster.ray.intersectPlane(backdropPlane, intersection)
          && intersection.x >= backdropBounds.min.x && intersection.x <= backdropBounds.max.x
          && intersection.y >= backdropBounds.min.y && intersection.y <= backdropBounds.max.y;
        assert.ok(hitsCounter || hitsBackdrop, `${stationId} shows a void at ${width}x${height}`);
      }
    }
  }

  let backdropTextureDisposed = false;
  backdrop.material.map.addEventListener('dispose', () => {
    backdropTextureDisposed = true;
  });
  kitchen.dispose();
  assert.equal(backdropTextureDisposed, true);
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
