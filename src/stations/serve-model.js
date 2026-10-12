const MAX_PATCHES = 64;
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const clamp01 = (value) => Math.min(1, Math.max(0, value));

function endpointPath(path) {
  if (!Array.isArray(path) || path.length < 2) return null;
  const first = path[0];
  const last = path.at(-1);
  if (![first?.x, first?.y, last?.x, last?.y].every(finite)) return null;
  return { first, last };
}

export function applyPourSample(serving, sample) {
  const path = endpointPath(sample?.path);
  if (!serving || !path || !finite(sample?.elapsedMs) || sample.elapsedMs <= 0) return serving;

  const deltaX = path.last.x - path.first.x;
  const deltaY = path.last.y - path.first.y;
  const distance = Math.hypot(deltaX, deltaY);
  if (distance <= 1e-4) return serving;

  const tilt = clamp01(distance / 0.7);
  const directionX = deltaX / distance;
  const directionY = deltaY / distance;
  const landingOffset = clamp01(
    (Math.abs(directionX) * 0.5) + (Math.max(0, directionY) * 0.6),
  );
  const transferGain = (sample.elapsedMs / 1_000) * 0.55 * tilt;
  const previousTransfer = clamp01(serving.transferredRatio ?? 0);
  const transferredRatio = clamp01(previousTransfer + transferGain);
  const coverageTarget = clamp01(0.28 + (transferredRatio * 0.42) + (tilt * 0.08));
  const centerOffset = previousTransfer <= 0
    ? landingOffset
    : clamp01((
      (clamp01(serving.centerOffset ?? 1) * previousTransfer)
      + (landingOffset * Math.min(transferGain, 1 - previousTransfer))
    ) / Math.max(transferredRatio, 1e-6));
  const spillGain = Math.max(0, transferGain - (1 - previousTransfer)) * 0.7
    + Math.max(0, landingOffset - 0.18) * 0.8
    + Math.max(0, tilt - 0.98) * 0.1;

  return {
    transferredRatio,
    coverage: Math.max(clamp01(serving.coverage ?? 0), coverageTarget),
    centerOffset,
    spillRatio: clamp01(clamp01(serving.spillRatio ?? 0) + spillGain),
  };
}

export function deriveServingVisual(serving) {
  const transferredRatio = clamp01(serving?.transferredRatio ?? 0);
  const coverage = clamp01(serving?.coverage ?? 0);
  const centerOffset = clamp01(serving?.centerOffset ?? 1);
  const spillRatio = clamp01(serving?.spillRatio ?? 0);
  return Object.freeze({
    patchCount: Math.min(MAX_PATCHES, Math.round(MAX_PATCHES * transferredRatio)),
    patchRadius: 0.35 + (coverage * 0.95),
    patchOffsetX: centerOffset * 0.72,
    patchHeight: 0.05 + (transferredRatio * 0.08),
    spillVisible: spillRatio > 0.001,
    spillScale: 0.2 + (spillRatio * 1.5),
    bowlTilt: Math.min(1.05, transferredRatio * 1.1),
  });
}
