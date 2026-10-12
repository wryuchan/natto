import { amountFromHold } from '../systems/input.js';

const TWO_PI = Math.PI * 2;
const MOVE_EPSILON = 1e-4;
const CONDIMENTS = Object.freeze({
  soySauce: Object.freeze({ ratePerSecond: 2, max: 12 }),
  mustard: Object.freeze({ ratePerSecond: 0.6, max: 3 }),
});

const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const clamp01 = (value) => Math.min(1, Math.max(0, value));

function cleanPoints(points) {
  if (!Array.isArray(points) || points.length < 2) return null;
  const normalized = points.map((point) => ({ x: point?.x, y: point?.y }));
  return normalized.every((point) => finite(point.x) && finite(point.y)) ? normalized : null;
}

function angleDelta(from, to) {
  let delta = to - from;
  while (delta > Math.PI) delta -= TWO_PI;
  while (delta < -Math.PI) delta += TWO_PI;
  return delta;
}

function weighted(previous, next, previousWeight, nextWeight) {
  const total = previousWeight + nextWeight;
  return total > 0 ? ((previous * previousWeight) + (next * nextWeight)) / total : next;
}

export function applyEggTap(eggState, target) {
  if (!eggState || target !== 'bowl-rim') return eggState;
  if (eggState.stage === 'whole' && eggState.added !== true) {
    return { ...eggState, stage: 'cracked', added: false };
  }
  if (eggState.stage === 'cracked' && eggState.added !== true) {
    return { ...eggState, stage: 'opened', added: true };
  }
  return eggState;
}

export function amountFromCondimentHold(kind, elapsedMs) {
  const condiment = CONDIMENTS[kind];
  return condiment
    ? amountFromHold(elapsedMs, condiment.ratePerSecond, condiment.max)
    : 0;
}

export function applyMixPath(mixing, points, elapsedMs) {
  const path = cleanPoints(points);
  if (!mixing || !path || !finite(elapsedMs) || elapsedMs <= 0) return mixing;

  const distances = [];
  const angularDeltas = [];
  const radii = path.map(({ x, y }) => Math.hypot(x, y));
  for (let index = 1; index < path.length; index += 1) {
    distances.push(Math.hypot(
      path[index].x - path[index - 1].x,
      path[index].y - path[index - 1].y,
    ));
    angularDeltas.push(angleDelta(
      Math.atan2(path[index - 1].y, path[index - 1].x),
      Math.atan2(path[index].y, path[index].x),
    ));
  }

  const distance = distances.reduce((sum, value) => sum + value, 0);
  if (distance <= MOVE_EPSILON) return mixing;

  const angularTravel = angularDeltas.reduce((sum, value) => sum + Math.abs(value), 0);
  const signedTravel = angularDeltas.reduce((sum, value) => sum + value, 0);
  const radiusMean = radii.reduce((sum, value) => sum + value, 0) / radii.length;
  const radiusVariance = radii.reduce(
    (sum, value) => sum + ((value - radiusMean) ** 2),
    0,
  ) / radii.length;
  const radiusStability = radiusMean <= MOVE_EPSILON
    ? 0
    : clamp01(1 - (Math.sqrt(radiusVariance) / radiusMean));
  const directionConsistency = angularTravel <= MOVE_EPSILON
    ? 0
    : clamp01(Math.abs(signedTravel) / angularTravel);
  const closureDistance = Math.hypot(
    path.at(-1).x - path[0].x,
    path.at(-1).y - path[0].y,
  );
  const closure = radiusMean <= MOVE_EPSILON
    ? 0
    : clamp01(1 - (closureDistance / (radiusMean * 2)));
  const coverage = clamp01(angularTravel / TWO_PI);
  const circularity = clamp01(coverage * (
    (radiusStability * 0.4) + (directionConsistency * 0.4) + (closure * 0.2)
  ));

  const meanSpeed = distance / elapsedMs;
  const sampleSpeeds = distances.map((segment) => segment / (elapsedMs / distances.length));
  const speedVariance = sampleSpeeds.reduce(
    (sum, speed) => sum + ((speed - meanSpeed) ** 2),
    0,
  ) / sampleSpeeds.length;
  const speedStability = meanSpeed <= MOVE_EPSILON
    ? 0
    : clamp01(1 - (Math.sqrt(speedVariance) / meanSpeed));
  const clockwiseRatio = angularTravel <= MOVE_EPSILON
    ? mixing.clockwiseRatio
    : clamp01(angularDeltas.reduce(
      (sum, value) => sum + (value > 0 ? Math.abs(value) : 0),
      0,
    ) / angularTravel);

  const progressDelta = clamp01(distance * 0.045);
  const previousProgress = clamp01(finite(mixing.progress) ? mixing.progress : 0);
  const progress = clamp01(previousProgress + progressDelta);
  const aerationGain = progressDelta * (0.35 + (circularity * 0.75));

  return {
    progress,
    circularity: clamp01(weighted(
      clamp01(mixing.circularity ?? 0),
      circularity,
      previousProgress,
      progressDelta,
    )),
    speedStability: clamp01(weighted(
      clamp01(mixing.speedStability ?? 0),
      speedStability,
      previousProgress,
      progressDelta,
    )),
    clockwiseRatio: clamp01(weighted(
      clamp01(mixing.clockwiseRatio ?? 0),
      clockwiseRatio,
      previousProgress,
      progressDelta,
    )),
    aeration: clamp01((finite(mixing.aeration) ? mixing.aeration : 0) + aerationGain),
  };
}
