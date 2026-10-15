import * as THREE from 'three';

const MAX_DEGRADATION_LEVEL = 4;
const STATION_TARGETS = Object.freeze({
  cut: Object.freeze([0, 0.15, 0]),
  mix: Object.freeze([0, 0.95, 0]),
  serve: Object.freeze([-0.775, 0.43, 0]),
});
// World-space bounds of each station's visible content. The camera distance is
// solved per canvas aspect so these bounds fill a fixed share of the canvas.
const STATION_FRAMES = Object.freeze({
  cut: Object.freeze({ min: [-2.2, 0, -1.6], max: [2.2, 0.6, 1.6] }),
  mix: Object.freeze({ min: [-2.25, 0, -1.5], max: [2.15, 2.8, 1.5] }),
  serve: Object.freeze({ min: [-3.05, 0, -1.75], max: [2.2, 1.45, 1.75] }),
});
const CAMERA_VIEWS = Object.freeze({
  portrait: Object.freeze({ fov: 40, elevation: THREE.MathUtils.degToRad(52) }),
  landscape: Object.freeze({ fov: 35, elevation: THREE.MathUtils.degToRad(36) }),
});
// Largest NDC extent the station bounds may reach horizontally and vertically.
const FRAME_FILL = Object.freeze({ x: 0.66, y: 0.82 });
const WORK_SURFACE = Object.freeze({
  minX: -2.2,
  maxX: 2.2,
  minZ: -1.65,
  maxZ: 1.65,
});

const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function selectQualityProfile(capabilities = {}) {
  const requestedLevel = finite(capabilities.degradationLevel)
    ? Math.round(capabilities.degradationLevel)
    : capabilities.lowPower === true
      ? MAX_DEGRADATION_LEVEL
      : 0;
  const degradationLevel = clamp(requestedLevel, 0, MAX_DEGRADATION_LEVEL);
  const rawPixelRatio = finite(capabilities.devicePixelRatio) && capabilities.devicePixelRatio > 0
    ? capabilities.devicePixelRatio
    : 1;
  const lowProfile = degradationLevel === MAX_DEGRADATION_LEVEL;

  return Object.freeze({
    id: lowProfile ? 'low' : degradationLevel === 0 ? 'high' : `reduced-${degradationLevel}`,
    degradationLevel,
    pixelRatio: Math.min(rawPixelRatio, lowProfile ? 1.5 : 2),
    shadows: degradationLevel < 3,
    threadCount: degradationLevel < 1 ? 72 : 36,
    foamCount: degradationLevel < 2 ? 48 : 24,
    antialias: true,
  });
}

export function createPerformanceMonitor({
  capabilities = {},
  slowFrameMs = 1000 / 28,
  sustainedFrameCount = 45,
  onChange = null,
} = {}) {
  const requiredSlowFrames = finite(sustainedFrameCount)
    ? Math.max(1, Math.round(sustainedFrameCount))
    : 45;
  const threshold = finite(slowFrameMs) && slowFrameMs > 0 ? slowFrameMs : 1000 / 28;
  let profile = selectQualityProfile(capabilities);
  let consecutiveSlowFrames = 0;

  return {
    getProfile: () => profile,
    sample(frameDurationMs) {
      if (!finite(frameDurationMs) || frameDurationMs <= 0) return profile;
      if (frameDurationMs <= threshold) {
        consecutiveSlowFrames = 0;
        return profile;
      }
      consecutiveSlowFrames += 1;
      if (
        consecutiveSlowFrames < requiredSlowFrames
        || profile.degradationLevel >= MAX_DEGRADATION_LEVEL
      ) return profile;

      consecutiveSlowFrames = 0;
      profile = selectQualityProfile({
        ...capabilities,
        lowPower: false,
        degradationLevel: profile.degradationLevel + 1,
      });
      onChange?.(profile);
      return profile;
    },
    reset() {
      consecutiveSlowFrames = 0;
    },
  };
}

const fittedPositions = new Map();
const fitCamera = new THREE.PerspectiveCamera();
const fitCorner = new THREE.Vector3();

function fitCameraPosition(station, orientation, aspect) {
  const key = `${station}:${orientation}:${aspect.toFixed(4)}`;
  const cached = fittedPositions.get(key);
  if (cached) return cached;

  const frame = STATION_FRAMES[station];
  const target = STATION_TARGETS[station];
  const { fov, elevation } = CAMERA_VIEWS[orientation];
  const direction = [0, Math.sin(elevation), Math.cos(elevation)];
  const positionAt = (distance) => target.map((value, index) => value + direction[index] * distance);
  const overflow = (distance) => {
    fitCamera.fov = fov;
    fitCamera.aspect = aspect;
    fitCamera.near = 0.1;
    fitCamera.far = 100;
    fitCamera.position.fromArray(positionAt(distance));
    fitCamera.lookAt(...target);
    fitCamera.updateMatrixWorld();
    fitCamera.updateProjectionMatrix();
    let worst = 0;
    for (const x of [frame.min[0], frame.max[0]]) {
      for (const y of [frame.min[1], frame.max[1]]) {
        for (const z of [frame.min[2], frame.max[2]]) {
          fitCorner.set(x, y, z).project(fitCamera);
          worst = Math.max(worst, Math.abs(fitCorner.x) / FRAME_FILL.x, Math.abs(fitCorner.y) / FRAME_FILL.y);
        }
      }
    }
    return worst;
  };

  let near = 2;
  let far = 60;
  for (let step = 0; step < 32; step += 1) {
    const middle = (near + far) / 2;
    if (overflow(middle) > 1) near = middle;
    else far = middle;
  }
  const position = Object.freeze(positionAt(far));
  if (fittedPositions.size > 64) fittedPositions.clear();
  fittedPositions.set(key, position);
  return position;
}

export function getCameraDescriptor({ station = 'cut', width = 1, height = 1 } = {}) {
  const orientation = height > width ? 'portrait' : 'landscape';
  const stationId = Object.hasOwn(STATION_TARGETS, station) ? station : 'cut';
  const aspect = finite(width) && finite(height) && width > 0 && height > 0 ? width / height : 1;

  return Object.freeze({
    station: stationId,
    orientation,
    position: fitCameraPosition(stationId, orientation, aspect),
    target: Object.freeze([...STATION_TARGETS[stationId]]),
    fov: CAMERA_VIEWS[orientation].fov,
    near: 0.1,
    far: 100,
    worldScale: 1,
    workSurface: WORK_SURFACE,
  });
}

export function resizeRendererToCanvas(renderer, camera, canvas, profile) {
  const width = Math.max(1, Math.round(canvas?.clientWidth ?? 0));
  const height = Math.max(1, Math.round(canvas?.clientHeight ?? 0));
  const pixelRatio = finite(profile?.pixelRatio) && profile.pixelRatio > 0
    ? profile.pixelRatio
    : 1;
  if (!renderer || !camera || !canvas) return false;

  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  return true;
}

export function createRenderer(canvas, profile, rendererFactory = null) {
  const renderer = rendererFactory
    ? rendererFactory({ canvas, profile, THREE })
    : new THREE.WebGLRenderer({ canvas, antialias: profile.antialias, alpha: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = profile.shadows;
  if (profile.shadows) renderer.shadowMap.type = THREE.PCFShadowMap;
  return renderer;
}
