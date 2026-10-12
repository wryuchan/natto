import * as THREE from 'three';

import { NATTO_STAGES, STATIONS } from '../core/game-state.js';
import { createKitchenMaterials, disposeKitchenMaterials } from '../scene/materials.js';
import { applyKnifeStroke } from './cut-model.js';

const BOARD_Y = 0.15;
const NATTO_MAX_INSTANCES = 72;
const ONION_MAX_INSTANCES = 32;

function addMesh(group, geometry, material, position, rotation = null) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  if (rotation) mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function makeInitialCutState() {
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

function setNattoInstances(mesh, stage) {
  const configuration = {
    [NATTO_STAGES.WHOLE]: { count: 24, scale: [0.24, 0.14, 0.17], spread: 0.62 },
    [NATTO_STAGES.COARSE]: { count: 36, scale: [0.18, 0.11, 0.13], spread: 0.66 },
    [NATTO_STAGES.HIKIWARI]: { count: 52, scale: [0.12, 0.085, 0.1], spread: 0.7 },
    [NATTO_STAGES.PASTE]: { count: 72, scale: [0.11, 0.035, 0.1], spread: 0.74 },
  }[stage] ?? { count: 24, scale: [0.24, 0.14, 0.17], spread: 0.62 };
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3(...configuration.scale);
  mesh.count = configuration.count;

  for (let index = 0; index < configuration.count; index += 1) {
    const angle = index * 2.399963;
    const radius = configuration.spread * Math.sqrt((index + 0.5) / configuration.count);
    position.set(-0.9 + Math.cos(angle) * radius, 0.27 + (index % 3) * 0.025, Math.sin(angle) * radius);
    rotation.setFromEuler(new THREE.Euler(0, angle, (index % 5) * 0.12));
    matrix.compose(position, rotation, scale);
    mesh.setMatrixAt(index, matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
}

function setOnionInstances(mesh, fineness) {
  const visibleCount = Math.max(6, Math.min(ONION_MAX_INSTANCES, 6 + Math.round(fineness * 26)));
  const segmentWidth = 1.25 / visibleCount;
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3(segmentWidth * 0.82, 0.1, 0.14);
  mesh.count = visibleCount;
  for (let index = 0; index < visibleCount; index += 1) {
    position.set(0.28 + segmentWidth * (index + 0.5), 0.27, 0);
    rotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (index % 3 - 1) * 0.04);
    matrix.compose(position, rotation, scale);
    mesh.setMatrixAt(index, matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
}

export function createCutStation(context = {}) {
  const camera = context.camera;
  if (!camera?.isCamera) throw new TypeError('createCutStation requires a camera');
  const dispatch = typeof context.dispatch === 'function' ? context.dispatch : () => {};
  const ownsMaterials = !context.materials;
  const materials = context.materials ?? createKitchenMaterials();
  const group = new THREE.Group();
  group.name = 'cut-station';

  addMesh(group, new THREE.BoxGeometry(4.4, 0.18, 3.2), materials.board, [0, 0.05, 0]);

  const nattoGeometry = new THREE.SphereGeometry(1, 14, 8);
  const nattoInstances = new THREE.InstancedMesh(nattoGeometry, materials.natto, NATTO_MAX_INSTANCES);
  nattoInstances.name = 'natto-instances';
  nattoInstances.castShadow = true;
  nattoInstances.receiveShadow = true;
  group.add(nattoInstances);

  const onionGeometry = new THREE.BoxGeometry(1, 1, 1);
  const onionInstances = new THREE.InstancedMesh(onionGeometry, materials.onion, ONION_MAX_INSTANCES);
  onionInstances.name = 'onion-instances';
  onionInstances.castShadow = true;
  onionInstances.receiveShadow = true;
  group.add(onionInstances);

  const knifeBlade = addMesh(
    group,
    new THREE.BoxGeometry(1.8, 0.08, 0.42),
    materials.metal,
    [-0.2, 0.55, 1.12],
    [0, 0.05, 0],
  );
  knifeBlade.name = 'knife-blade';
  const knifeHandle = addMesh(
    group,
    new THREE.CapsuleGeometry(0.12, 0.72, 5, 10),
    materials.darkWood,
    [1.0, 0.55, 1.12],
    [0, 0, Math.PI / 2],
  );
  knifeHandle.name = 'knife-handle';

  const bowl = addMesh(
    group,
    new THREE.CylinderGeometry(0.62, 0.48, 0.34, 28, 1, true),
    materials.ceramicAccent,
    [0, 0.25, -1.18],
  );
  bowl.name = 'transfer-bowl';
  const nattoTransfer = addMesh(
    group,
    new THREE.CylinderGeometry(0.31, 0.31, 0.08, 24),
    materials.natto,
    [-0.62, 0.23, -1.18],
  );
  nattoTransfer.name = 'transfer-natto';
  const onionTransfer = addMesh(
    group,
    new THREE.CylinderGeometry(0.31, 0.31, 0.08, 24),
    materials.onion,
    [0.62, 0.23, -1.18],
  );
  onionTransfer.name = 'transfer-onion';

  const raycaster = new THREE.Raycaster();
  const boardPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -BOARD_Y);
  const boardPoint = new THREE.Vector3();
  const knifeTargets = [knifeBlade, knifeHandle];
  const transferTargets = [nattoTransfer, onionTransfer];
  const transferOwners = new Map([
    [nattoTransfer, { type: 'transfer', ingredient: 'natto' }],
    [onionTransfer, { type: 'transfer', ingredient: 'greenOnion' }],
  ]);
  let cutState = makeInitialCutState();
  let strokePoints = [];

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

  const boardLocalPoint = (sample) => {
    if (!setRay(sample) || !raycaster.ray.intersectPlane(boardPlane, boardPoint)) return null;
    const local = group.worldToLocal(boardPoint.clone());
    return { x: local.x, y: local.z };
  };

  const renderIngredients = () => {
    nattoInstances.visible = !cutState.natto.inBowl;
    onionInstances.visible = !cutState.greenOnion.inBowl;
    nattoTransfer.visible = !cutState.natto.inBowl;
    onionTransfer.visible = !cutState.greenOnion.inBowl;
    setNattoInstances(nattoInstances, cutState.natto.cutStage);
    setOnionInstances(onionInstances, cutState.greenOnion.fineness);
  };

  const finishStroke = () => {
    if (strokePoints.length < 2) {
      strokePoints = [];
      return;
    }
    for (const ingredient of ['natto', 'greenOnion']) {
      const next = applyKnifeStroke(cutState, { ingredient, points: strokePoints });
      if (next === cutState) continue;
      cutState = next;
      if (ingredient === 'natto') {
        dispatch({
          type: 'UPDATE_CUT',
          ingredient,
          cutProgress: cutState.natto.cutProgress,
          cutStage: cutState.natto.cutStage,
        });
      } else {
        dispatch({
          type: 'UPDATE_CUT',
          ingredient,
          fineness: cutState.greenOnion.fineness,
          uniformity: cutState.greenOnion.uniformity,
        });
      }
    }
    strokePoints = [];
    renderIngredients();
  };

  renderIngredients();

  return {
    id: STATIONS.CUT,
    group,
    hitTest(sample) {
      if (!setRay(sample)) return null;
      const transferHit = raycaster.intersectObjects(transferTargets, false)[0];
      if (transferHit) return transferOwners.get(transferHit.object);
      return raycaster.intersectObjects(knifeTargets, false).length > 0 ? { type: 'knife' } : null;
    },
    applyPointerSample(phase, sample, owner) {
      if (owner?.type === 'transfer') {
        if (phase !== 'end' || cutState[owner.ingredient]?.inBowl) return;
        dispatch({
          type: 'TRANSFER_TO_BOWL',
          ingredient: owner.ingredient,
          amount: owner.ingredient === 'natto' ? 1 : 0.25,
        }, { confirmation: 'transferToBowl' });
        return;
      }
      if (owner?.type !== 'knife') return;
      if (phase === 'cancel') {
        strokePoints = [];
        return;
      }
      const point = boardLocalPoint(sample);
      if (point) strokePoints.push(point);
      if (phase === 'end') finishStroke();
    },
    renderState(state) {
      const natto = state?.ingredients?.natto;
      const greenOnion = state?.ingredients?.greenOnion;
      if (!natto || !greenOnion) return;
      cutState = {
        natto: {
          cutProgress: natto.cutProgress,
          cutStage: natto.cutStage,
          inBowl: natto.inBowl,
        },
        greenOnion: {
          ...cutState.greenOnion,
          fineness: greenOnion.fineness,
          uniformity: greenOnion.uniformity,
          inBowl: greenOnion.inBowl,
        },
      };
      renderIngredients();
    },
    dispose() {
      strokePoints = [];
      if (ownsMaterials) disposeKitchenMaterials(materials);
    },
  };
}

