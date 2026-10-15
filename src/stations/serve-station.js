import * as THREE from 'three';

import { STATIONS } from '../core/game-state.js';
import { createKitchenMaterials, disposeKitchenMaterials } from '../scene/materials.js';
import { createVesselGeometry } from '../scene/vessels.js';
import { applyPourSample, deriveServingVisual } from './serve-model.js';

const COUNTER_Y = 0.04;
const PATCH_COUNT = 64;

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

export function createServeStation(context = {}) {
  const camera = context.camera;
  if (!camera?.isCamera) throw new TypeError('createServeStation requires a camera');
  const dispatch = typeof context.dispatch === 'function' ? context.dispatch : () => {};
  const now = typeof context.now === 'function'
    ? context.now
    : () => globalThis.performance?.now?.() ?? Date.now();
  const ownsMaterials = !context.materials;
  const materials = context.materials ?? createKitchenMaterials();
  const group = new THREE.Group();
  group.name = 'serve-station';

  addMesh(
    group,
    createVesselGeometry({
      innerRadius: 1.52,
      outerRadius: 1.72,
      height: 0.82,
      footRadius: 1.16,
      segments: 40,
    }),
    materials.ceramicAccent,
    [0.45, COUNTER_Y, 0],
  ).name = 'rice-bowl';
  addMesh(
    group,
    new THREE.SphereGeometry(1.23, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2),
    materials.rice,
    [0.45, 0.72, 0],
  ).name = 'rice';

  const pouringBowl = addMesh(
    group,
    createVesselGeometry({
      innerRadius: 0.83,
      outerRadius: 1.03,
      height: 0.66,
      footRadius: 0.8,
      segments: 36,
    }),
    materials.ceramic,
    [-2, COUNTER_Y, 0.36],
    [0, 0, -0.2],
  );
  pouringBowl.name = 'pouring-bowl';

  const patches = new THREE.InstancedMesh(
    new THREE.SphereGeometry(1, 12, 7),
    materials.natto,
    PATCH_COUNT,
  );
  patches.name = 'serving-patches';
  patches.castShadow = true;
  group.add(patches);

  const spillMaterial = materials.natto.clone();
  spillMaterial.transparent = true;
  spillMaterial.opacity = 0.72;
  const spill = addMesh(
    group,
    new THREE.CircleGeometry(0.75, 32),
    spillMaterial,
    [2.05, 0.02, 0.82],
    [-Math.PI / 2, 0, 0],
  );
  spill.name = 'serving-spill';
  spill.visible = false;

  const raycaster = new THREE.Raycaster();
  const counterPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -COUNTER_Y);
  const counterPoint = new THREE.Vector3();
  let serving = {
    transferredRatio: 0,
    coverage: 0,
    centerOffset: 1,
    spillRatio: 0,
  };
  let path = [];
  let startedAt = 0;

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

  const localPoint = (sample) => {
    if (!setRay(sample) || !raycaster.ray.intersectPlane(counterPlane, counterPoint)) return null;
    const point = group.worldToLocal(counterPoint.clone());
    return { x: point.x, y: point.z };
  };

  const renderServing = () => {
    const visual = deriveServingVisual(serving);
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    patches.count = visual.patchCount;
    for (let index = 0; index < visual.patchCount; index += 1) {
      const angle = index * 2.399963;
      const radius = visual.patchRadius * Math.sqrt((index + 0.5) / Math.max(1, visual.patchCount));
      position.set(
        0.45 + visual.patchOffsetX + Math.cos(angle) * radius,
        0.72 + visual.patchHeight + ((index % 3) * 0.018),
        Math.sin(angle) * radius,
      );
      rotation.setFromEuler(new THREE.Euler(0, angle, (index % 5) * 0.08));
      scale.set(0.13, 0.055, 0.1);
      matrix.compose(position, rotation, scale);
      patches.setMatrixAt(index, matrix);
    }
    patches.instanceMatrix.needsUpdate = true;
    spill.visible = visual.spillVisible;
    spill.scale.set(visual.spillScale, visual.spillScale, visual.spillScale);
    pouringBowl.rotation.z = -0.2 - visual.bowlTilt;
  };

  renderServing();

  return {
    id: STATIONS.SERVE,
    group,
    hitTest(sample) {
      if (!setRay(sample)) return null;
      return raycaster.intersectObject(pouringBowl, false).length > 0
        ? { type: 'pouring-bowl' }
        : null;
    },
    applyPointerSample(phase, sample, owner) {
      if (owner?.type !== 'pouring-bowl') return;
      if (phase === 'start') {
        startedAt = sampleTime(sample, now);
        path = [];
      }
      if (phase === 'cancel') {
        path = [];
        return;
      }
      const point = localPoint(sample);
      if (point) path.push(point);
      if (phase !== 'end') return;

      const next = applyPourSample(serving, {
        path,
        elapsedMs: Math.max(1, sampleTime(sample, now) - startedAt),
      });
      path = [];
      if (next === serving) return;
      if (serving.transferredRatio <= 0) {
        dispatch({
          type: 'TRANSFER_TO_RICE',
          confirmed: true,
          transferredRatio: next.transferredRatio,
        }, {
          confirmation: 'transferToRice',
          followUp: {
            type: 'UPDATE_SERVE',
            coverage: next.coverage,
            centerOffset: next.centerOffset,
            spillRatio: next.spillRatio,
          },
        });
      } else {
        dispatch({ type: 'UPDATE_SERVE', ...next });
      }
    },
    renderState(state) {
      if (!state?.serving) return;
      serving = { ...state.serving };
      renderServing();
    },
    dispose() {
      path = [];
      spillMaterial.dispose();
      if (ownsMaterials) disposeKitchenMaterials(materials);
    },
  };
}
