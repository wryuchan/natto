import * as THREE from 'three';

const MAX_DEGRADATION_LEVEL = 4;
const STATION_TARGETS = Object.freeze({
  cut: Object.freeze([0, 0.15, 0]),
  mix: Object.freeze([0, 0.3, 0]),
  serve: Object.freeze([-0.775, 0.43, 0]),
});
const STATION_CAMERA_OFFSETS = Object.freeze({
  cut: Object.freeze([0, 0, 0]),
  mix: Object.freeze([0.35, -0.55, 0.15]),
  serve: Object.freeze([-0.775, -0.4, 3.5]),
});
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

export function getCameraDescriptor({ station = 'cut', width = 1, height = 1 } = {}) {
  const orientation = height > width ? 'portrait' : 'landscape';
  const target = STATION_TARGETS[station] ?? STATION_TARGETS.cut;
  const offset = STATION_CAMERA_OFFSETS[station] ?? STATION_CAMERA_OFFSETS.cut;
  const portrait = orientation === 'portrait';
  const basePosition = portrait ? [0, 8.4, 8.8] : [0, 6.8, 9.6];

  return Object.freeze({
    station: Object.hasOwn(STATION_TARGETS, station) ? station : 'cut',
    orientation,
    position: Object.freeze(basePosition.map((value, index) => value + offset[index])),
    target: Object.freeze([...target]),
    fov: portrait ? (station === 'serve' ? 54 : 48) : 38,
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
