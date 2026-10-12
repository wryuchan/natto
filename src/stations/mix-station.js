import * as THREE from 'three';

import { STATIONS } from '../core/game-state.js';
import { createKitchenMaterials, disposeKitchenMaterials } from '../scene/materials.js';
import {
  applyEggTap,
  amountFromCondimentHold,
  applyMixPath,
} from './mix-model.js';

const SURFACE_Y = 0.78;
const DEFAULT_THREAD_COUNT = 72;
const DEFAULT_FOAM_COUNT = 48;

const clamp01 = (value) => Math.min(1, Math.max(0, value));

function addMesh(group, geometry, material, position, rotation = null) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  if (rotation) mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function sampleTime(sample, fallback) {
  const timestamp = sample?.originalEvent?.timeStamp;
  return typeof timestamp === 'number' && Number.isFinite(timestamp) ? timestamp : fallback();
}

export function createMixStation(context = {}) {
  const camera = context.camera;
  if (!camera?.isCamera) throw new TypeError('createMixStation requires a camera');
  const dispatch = typeof context.dispatch === 'function' ? context.dispatch : () => {};
  const playEffect = typeof context.playEffect === 'function' ? context.playEffect : () => {};
  const now = typeof context.now === 'function'
    ? context.now
    : () => globalThis.performance?.now?.() ?? Date.now();
  const ownsMaterials = !context.materials;
  const materials = context.materials ?? createKitchenMaterials();
  const threadCount = Math.max(1, Math.round(
    context.qualityProfile?.threadCount ?? DEFAULT_THREAD_COUNT,
  ));
  const foamCount = Math.max(1, Math.round(
    context.qualityProfile?.foamCount ?? DEFAULT_FOAM_COUNT,
  ));
  const group = new THREE.Group();
  group.name = 'mix-station';

  const bowl = addMesh(
    group,
    new THREE.CylinderGeometry(1.48, 1.08, 0.88, 40, 1, true),
    materials.ceramic,
    [0, 0.44, 0],
  );
  bowl.name = 'mix-bowl';
  const rim = addMesh(
    group,
    new THREE.TorusGeometry(1.45, 0.08, 10, 48),
    materials.ceramicAccent,
    [0, 0.88, 0],
    [Math.PI / 2, 0, 0],
  );
  rim.name = 'bowl-rim';

  const surfaceMaterial = materials.natto.clone();
  const surface = addMesh(
    group,
    new THREE.CircleGeometry(1.28, 48),
    surfaceMaterial,
    [0, SURFACE_Y, 0],
    [-Math.PI / 2, 0, 0],
  );
  surface.name = 'natto-surface';

  const yolkMaterial = new THREE.MeshStandardMaterial({
    color: 0xf5a623,
    roughness: 0.48,
    transparent: true,
    opacity: 1,
  });
  const yolk = addMesh(
    group,
    new THREE.SphereGeometry(0.42, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2),
    yolkMaterial,
    [0, 0.82, 0],
  );
  yolk.name = 'egg-yolk';
  yolk.visible = false;

  const eggShellMaterial = new THREE.MeshStandardMaterial({ color: 0xfff4d8, roughness: 0.72 });
  const egg = addMesh(
    group,
    new THREE.SphereGeometry(0.37, 22, 14),
    eggShellMaterial,
    [-1.92, 0.42, 0.52],
    [0, 0, -0.18],
  );
  egg.scale.set(1, 1.24, 1);
  egg.name = 'mix-egg';

  const soyBottle = addMesh(
    group,
    new THREE.CylinderGeometry(0.34, 0.42, 1.12, 24),
    materials.soy,
    [-1.9, 0.56, -0.55],
  );
  soyBottle.name = 'soy-sauce';
  const mustardTube = addMesh(
    group,
    new THREE.CylinderGeometry(0.25, 0.31, 0.78, 20),
    materials.mustard,
    [1.9, 0.39, -0.5],
  );
  mustardTube.name = 'mustard';

  const chopsticks = [-0.17, 0.17].map((x, index) => {
    const stick = addMesh(
      group,
      new THREE.CylinderGeometry(0.05, 0.05, 3.15, 10),
      materials.darkWood,
      [x, 1.28, 0.2],
      [0.18, 0, index === 0 ? -0.24 : -0.14],
    );
    stick.name = `chopstick-${index + 1}`;
    return stick;
  });

  const foamGeometry = new THREE.SphereGeometry(1, 8, 6);
  const foamMaterial = new THREE.MeshStandardMaterial({ color: 0xf2ddbd, roughness: 0.8 });
  const foam = new THREE.InstancedMesh(foamGeometry, foamMaterial, foamCount);
  foam.name = 'mix-foam';
  foam.castShadow = false;
  group.add(foam);
  const foamMatrix = new THREE.Matrix4();
  const foamPosition = new THREE.Vector3();
  const foamScale = new THREE.Vector3();
  const foamRotation = new THREE.Quaternion();
  for (let index = 0; index < foamCount; index += 1) {
    const angle = index * 2.399963;
    const radius = 1.12 * Math.sqrt((index + 0.5) / foamCount);
    foamPosition.set(Math.cos(angle) * radius, SURFACE_Y + 0.055, Math.sin(angle) * radius);
    const scale = 0.035 + ((index % 5) * 0.006);
    foamScale.set(scale, scale * 0.55, scale);
    foamMatrix.compose(foamPosition, foamRotation, foamScale);
    foam.setMatrixAt(index, foamMatrix);
  }
  foam.instanceMatrix.needsUpdate = true;
  foam.count = 0;

  const threadMaterial = new THREE.LineBasicMaterial({ color: 0xead1a6, transparent: true, opacity: 0.72 });
  const threads = new THREE.Group();
  threads.name = 'mix-threads';
  for (let index = 0; index < threadCount; index += 1) {
    const angle = (index / threadCount) * Math.PI * 2;
    const innerRadius = 0.18 + ((index % 7) * 0.055);
    const outerRadius = Math.min(1.2, innerRadius + 0.3 + ((index % 5) * 0.08));
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(Math.cos(angle) * innerRadius, SURFACE_Y + 0.08, Math.sin(angle) * innerRadius),
      new THREE.Vector3(Math.cos(angle + 0.3) * outerRadius, SURFACE_Y + 0.14, Math.sin(angle + 0.3) * outerRadius),
    ]);
    const thread = new THREE.Line(geometry, threadMaterial);
    thread.visible = false;
    threads.add(thread);
  }
  group.add(threads);

  const raycaster = new THREE.Raycaster();
  const surfacePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -SURFACE_Y);
  const surfacePoint = new THREE.Vector3();
  const owners = new Map([
    [egg, { type: 'egg' }],
    [rim, { type: 'egg' }],
    [soyBottle, { type: 'condiment', kind: 'soySauce' }],
    [mustardTube, { type: 'condiment', kind: 'mustard' }],
    [surface, { type: 'mix' }],
    ...chopsticks.map((stick) => [stick, { type: 'mix' }]),
  ]);
  const targets = [...owners.keys()];
  let eggState = { stage: 'whole', added: false };
  let mixing = {
    progress: 0,
    circularity: 0,
    speedStability: 0,
    clockwiseRatio: 0,
    aeration: 0,
  };
  let activePath = [];
  let gestureStartedAt = 0;

  const setRay = (sample) => {
    if (!sample?.local) return false;
    group.updateWorldMatrix(true, true);
    camera.updateMatrixWorld();
    raycaster.setFromCamera({
      x: sample.local.x * 2 - 1,
      y: 1 - sample.local.y * 2,
    }, camera);
    return true;
  };

  const bowlLocalPoint = (sample) => {
    if (!setRay(sample) || !raycaster.ray.intersectPlane(surfacePlane, surfacePoint)) return null;
    const point = group.worldToLocal(surfacePoint.clone());
    return Math.hypot(point.x, point.z) <= 1.35 ? { x: point.x, y: point.z } : null;
  };

  const renderEgg = () => {
    egg.visible = eggState.stage !== 'opened';
    egg.scale.set(
      eggState.stage === 'cracked' ? 1.08 : 1,
      eggState.stage === 'cracked' ? 1.12 : 1.24,
      1,
    );
  };

  const renderMixing = () => {
    const progress = clamp01(mixing.progress);
    const aeration = clamp01(mixing.aeration);
    const eggBlend = eggState.added ? clamp01((progress - 0.2) / 0.64) : 0;
    surfaceMaterial.color.copy(materials.natto.color).lerp(new THREE.Color(0xc68b48), eggBlend * 0.72);
    yolk.visible = eggState.added && eggBlend < 0.98;
    yolkMaterial.opacity = eggState.added ? 1 - eggBlend : 0;
    const visibleFoam = Math.min(foamCount, Math.round(foamCount * aeration));
    foam.count = visibleFoam;
    const visibleThreads = Math.min(threadCount, Math.round(threadCount * progress));
    threads.children.forEach((thread, index) => {
      thread.visible = index < visibleThreads;
    });
  };

  renderEgg();
  renderMixing();

  return {
    id: STATIONS.MIX,
    group,
    hitTest(sample) {
      if (!setRay(sample)) return null;
      const hit = raycaster.intersectObjects(targets, false)[0];
      return hit ? owners.get(hit.object) ?? null : null;
    },
    applyPointerSample(phase, sample, owner) {
      if (phase === 'start') gestureStartedAt = sampleTime(sample, now);

      if (owner?.type === 'egg') {
        if (phase !== 'end') return;
        const next = applyEggTap(eggState, 'bowl-rim');
        if (next === eggState) return;
        eggState = next;
        renderEgg();
        if (eggState.added) dispatch({ type: 'ADD_EGG' });
        else playEffect('crack');
        return;
      }

      if (owner?.type === 'condiment') {
        if (phase !== 'end') return;
        const elapsedMs = Math.max(0, sampleTime(sample, now) - gestureStartedAt);
        const amount = amountFromCondimentHold(owner.kind, elapsedMs);
        if (amount <= 0) return;
        dispatch({ type: 'ADD_CONDIMENT', condiment: owner.kind, amount });
        return;
      }

      if (owner?.type !== 'mix') return;
      if (phase === 'cancel') {
        activePath = [];
        return;
      }
      const point = bowlLocalPoint(sample);
      if (point) activePath.push(point);
      if (phase !== 'end') return;
      const elapsedMs = Math.max(1, sampleTime(sample, now) - gestureStartedAt);
      const next = applyMixPath(mixing, activePath, elapsedMs);
      activePath = [];
      if (next === mixing) return;
      mixing = next;
      dispatch({ type: 'UPDATE_MIX', ...mixing });
      renderMixing();
    },
    renderState(state) {
      if (!state?.mixing || !state?.ingredients?.egg) return;
      mixing = { ...state.mixing };
      if (state.ingredients.egg.added) eggState = { stage: 'opened', added: true };
      renderEgg();
      renderMixing();
    },
    dispose() {
      activePath = [];
      surfaceMaterial.dispose();
      yolkMaterial.dispose();
      eggShellMaterial.dispose();
      foamMaterial.dispose();
      threadMaterial.dispose();
      if (ownsMaterials) disposeKitchenMaterials(materials);
    },
  };
}
