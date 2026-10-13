import * as THREE from 'three';

import { STATIONS } from '../core/game-state.js';
import { createCutStation } from '../stations/cut-station.js';
import { createMixStation } from '../stations/mix-station.js';
import { createServeStation } from '../stations/serve-station.js';
import { createPointerRouter } from '../systems/input.js';
import {
  createPerformanceMonitor,
  createRenderer,
  getCameraDescriptor,
  resizeRendererToCanvas,
  selectQualityProfile,
} from './renderer.js';
import { createKitchenMaterials, disposeKitchenMaterials } from './materials.js';

const STATION_IDS = Object.freeze([STATIONS.CUT, STATIONS.MIX, STATIONS.SERVE]);

function addMesh(group, geometry, material, position, rotation = null) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  if (rotation) mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function createPlaceholderStation(id, materials) {
  const group = new THREE.Group();
  group.name = `${id}-station`;

  if (id === STATIONS.CUT) {
    addMesh(group, new THREE.BoxGeometry(4.4, 0.18, 3.2), materials.board, [0, 0.05, 0]);
    addMesh(group, new THREE.BoxGeometry(2.3, 0.08, 0.12), materials.metal, [-0.4, 0.35, 0.9], [0, 0.12, 0]);
    addMesh(group, new THREE.CapsuleGeometry(0.13, 0.75, 5, 10), materials.darkWood, [1.05, 0.34, 0.9], [0, 0, Math.PI / 2]);
  } else if (id === STATIONS.MIX) {
    addMesh(group, new THREE.CylinderGeometry(1.45, 1.05, 0.85, 40, 1, true), materials.ceramic, [0, 0.45, 0]);
    addMesh(group, new THREE.CylinderGeometry(0.055, 0.055, 3.2, 12), materials.darkWood, [-0.2, 1.15, 0], [0.2, 0, -0.28]);
    addMesh(group, new THREE.CylinderGeometry(0.055, 0.055, 3.2, 12), materials.darkWood, [0.2, 1.15, 0], [0.2, 0, -0.18]);
    addMesh(group, new THREE.CylinderGeometry(0.35, 0.42, 1.1, 24), materials.soy, [-1.8, 0.55, 0.2]);
    addMesh(group, new THREE.CylinderGeometry(0.35, 0.42, 0.7, 24), materials.mustard, [1.8, 0.35, 0.2]);
  } else {
    addMesh(group, new THREE.CylinderGeometry(1.7, 1.15, 0.8, 40, 1, true), materials.ceramicAccent, [0, 0.4, 0]);
    addMesh(group, new THREE.SphereGeometry(1.22, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), materials.rice, [0, 0.72, 0]);
    addMesh(group, new THREE.CylinderGeometry(1.05, 0.82, 0.66, 36, 1, true), materials.ceramic, [-2, 0.65, 0.35], [0, 0, -0.2]);
  }

  return {
    id,
    group,
    hitTest() {
      return null;
    },
    applyPointerSample() {},
    renderState() {},
    dispose() {},
  };
}

function validateStation(station) {
  return station
    && STATION_IDS.includes(station.id)
    && station.group?.isObject3D
    && typeof station.hitTest === 'function'
    && typeof station.applyPointerSample === 'function'
    && typeof station.renderState === 'function'
    && typeof station.dispose === 'function';
}

function applyCameraDescriptor(camera, target, descriptor) {
  camera.fov = descriptor.fov;
  camera.near = descriptor.near;
  camera.far = descriptor.far;
  camera.position.set(...descriptor.position);
  target.set(...descriptor.target);
  camera.lookAt(target);
  camera.updateProjectionMatrix();
}

function applyCameraTween(camera, target, transition, progress) {
  const eased = progress * progress * (3 - 2 * progress);
  camera.position.lerpVectors(transition.fromPosition, transition.toPosition, eased);
  target.lerpVectors(transition.fromTarget, transition.toTarget, eased);
  camera.fov = THREE.MathUtils.lerp(transition.fromFov, transition.toFov, eased);
  camera.near = transition.near;
  camera.far = transition.far;
  camera.lookAt(target);
  camera.updateProjectionMatrix();
}

export function createKitchenScene(canvas, options = {}) {
  if (!canvas) throw new TypeError('createKitchenScene requires a canvas');

  const defaultCapabilities = {
    devicePixelRatio: typeof globalThis.devicePixelRatio === 'number'
      ? globalThis.devicePixelRatio
      : 1,
  };
  const capabilities = { ...defaultCapabilities, ...options.capabilities };
  let profile = selectQualityProfile(capabilities);
  const renderer = createRenderer(canvas, profile, options.rendererFactory);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf3dfc2);
  scene.fog = new THREE.Fog(0xf3dfc2, 12, 28);

  const materials = createKitchenMaterials();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  const cameraTarget = new THREE.Vector3();
  const counter = addMesh(
    scene,
    new THREE.BoxGeometry(9, 0.5, 6.4),
    materials.counter,
    [0, -0.35, 0],
  );
  counter.receiveShadow = true;

  const hemisphere = new THREE.HemisphereLight(0xfff8df, 0x77543f, 2.1);
  scene.add(hemisphere);
  const keyLight = new THREE.DirectionalLight(0xffecd0, 3.4);
  keyLight.position.set(-4, 8, 5);
  keyLight.castShadow = profile.shadows;
  keyLight.shadow.mapSize.set(1024, 1024);
  scene.add(keyLight);
  const fillLight = new THREE.DirectionalLight(0xcfe4ff, 1.2);
  fillLight.position.set(5, 4, -3);
  scene.add(fillLight);

  const providedStations = Array.isArray(options.stations) ? options.stations : null;
  const stationList = providedStations ?? STATION_IDS.map((id) => {
    const stationContext = {
      camera,
      materials,
      dispatch: options.dispatch,
      playEffect: options.playEffect,
      qualityProfile: profile,
      now: options.now,
    };
    if (id === STATIONS.CUT) return createCutStation(stationContext);
    if (id === STATIONS.MIX) return createMixStation(stationContext);
    return createServeStation(stationContext);
  });
  if (stationList.length !== STATION_IDS.length || stationList.some((station) => !validateStation(station))) {
    throw new TypeError('Kitchen stations must implement the station adapter contract');
  }
  const stations = new Map(stationList.map((station) => [station.id, station]));
  if (STATION_IDS.some((id) => !stations.has(id))) {
    throw new TypeError('Kitchen requires cut, mix, and serve station adapters');
  }
  for (const station of stationList) scene.add(station.group);

  let activeId = STATIONS.CUT;
  let paused = true;
  let disposed = false;
  let animationFrame = null;
  let lastState = null;
  let cameraTransition = null;
  let lastFrameTime = null;
  const now = typeof options.now === 'function'
    ? options.now
    : () => globalThis.performance?.now?.() ?? Date.now();
  const reducedMotion = options.reducedMotion === true
    || (options.reducedMotion !== false
      && globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true);
  const cameraTransitionMs = typeof options.cameraTransitionMs === 'number'
    && Number.isFinite(options.cameraTransitionMs)
    ? Math.max(0, options.cameraTransitionMs)
    : reducedMotion ? 0 : 360;

  const currentStation = () => stations.get(activeId);
  const currentDescriptor = () => getCameraDescriptor({
    station: activeId,
    width: canvas.clientWidth,
    height: canvas.clientHeight,
  });

  const setStationVisibility = () => {
    for (const [id, station] of stations) station.group.visible = id === activeId;
  };
  setStationVisibility();
  applyCameraDescriptor(camera, cameraTarget, currentDescriptor());

  const applyQualityProfile = (nextProfile) => {
    profile = nextProfile;
    renderer.shadowMap.enabled = profile.shadows;
    keyLight.castShadow = profile.shadows;
    for (const station of stations.values()) station.setQualityProfile?.(profile);
    options.performanceOptions?.onChange?.(profile);
  };
  const performanceMonitor = createPerformanceMonitor({
    ...options.performanceOptions,
    capabilities,
    onChange: applyQualityProfile,
  });

  const renderFrame = () => {
    if (disposed) return;
    resizeRendererToCanvas(renderer, camera, canvas, profile);
    if (cameraTransition) {
      const progress = cameraTransitionMs === 0
        ? 1
        : Math.min(1, Math.max(0, (now() - cameraTransition.startedAt) / cameraTransitionMs));
      applyCameraTween(camera, cameraTarget, cameraTransition, progress);
      if (progress === 1) cameraTransition = null;
    } else {
      applyCameraDescriptor(camera, cameraTarget, currentDescriptor());
    }
    renderer.render(scene, camera);
  };

  const tick = (timestamp) => {
    if (paused || disposed) return;
    const frameTime = typeof timestamp === 'number' && Number.isFinite(timestamp) ? timestamp : now();
    if (lastFrameTime != null) performanceMonitor.sample(frameTime - lastFrameTime);
    lastFrameTime = frameTime;
    renderFrame();
    if (typeof globalThis.requestAnimationFrame === 'function') {
      animationFrame = globalThis.requestAnimationFrame(tick);
    }
  };

  const pointerRouter = options.enableInput === false ? null : createPointerRouter({
    canvas,
    hitTest: (sample) => currentStation().hitTest(sample),
    handlers: {
      pointerStart: (owner, sample) => currentStation().applyPointerSample('start', sample, owner),
      pointerMove: (owner, sample) => currentStation().applyPointerSample('move', sample, owner),
      pointerEnd: (owner, sample) => currentStation().applyPointerSample('end', sample, owner),
      pointerCancel: (owner, sample) => currentStation().applyPointerSample('cancel', sample, owner),
      backgroundSwipe: (direction, sample) => options.onBackgroundSwipe?.(direction, sample),
    },
  });

  const kitchen = {
    renderer,
    scene,
    camera,
    getQualityProfile: () => profile,
    samplePerformanceFrame: (frameDurationMs) => performanceMonitor.sample(frameDurationMs),
    getCameraDescriptor: currentDescriptor,
    getStation: (id = activeId) => stations.get(id) ?? null,
    setStation(id) {
      if (!stations.has(id) || id === activeId) return false;
      const fromPosition = camera.position.clone();
      const fromTarget = cameraTarget.clone();
      const fromFov = camera.fov;
      activeId = id;
      setStationVisibility();
      const descriptor = currentDescriptor();
      cameraTransition = {
        startedAt: now(),
        fromPosition,
        fromTarget,
        fromFov,
        toPosition: new THREE.Vector3(...descriptor.position),
        toTarget: new THREE.Vector3(...descriptor.target),
        toFov: descriptor.fov,
        near: descriptor.near,
        far: descriptor.far,
      };
      return true;
    },
    renderState(state) {
      if (!state || typeof state !== 'object') return false;
      lastState = state;
      currentStation().renderState(state);
      return true;
    },
    renderFrame,
    pause() {
      paused = true;
      pointerRouter?.setRecoveryMode(true);
      if (animationFrame != null && typeof globalThis.cancelAnimationFrame === 'function') {
        globalThis.cancelAnimationFrame(animationFrame);
      }
      animationFrame = null;
      lastFrameTime = null;
      performanceMonitor.reset();
    },
    resume() {
      if (disposed || !paused) return;
      paused = false;
      pointerRouter?.setRecoveryMode(false);
      if (lastState) currentStation().renderState(lastState);
      tick();
    },
    dispose() {
      if (disposed) return;
      kitchen.pause();
      disposed = true;
      pointerRouter?.dispose();
      for (const station of stations.values()) station.dispose();
      const geometries = new Set();
      scene.traverse((object) => {
        if (object.geometry) geometries.add(object.geometry);
      });
      for (const geometry of geometries) geometry.dispose();
      disposeKitchenMaterials(materials);
      renderer.dispose();
    },
  };

  if (options.autoStart !== false) kitchen.resume();
  return kitchen;
}
