import { NATTO_STAGES } from './game-state.js';

const clampScore = (value) => Math.min(100, Math.max(0, value));
const normalizedScore = (value) => clampScore(value * 100);

export function scoreRange(value, idealMin, idealMax, hardMin, hardMax) {
  if (
    ![value, idealMin, idealMax, hardMin, hardMax].every(Number.isFinite)
    || hardMin > idealMin
    || idealMin > idealMax
    || idealMax > hardMax
  ) return 0;

  if (value >= idealMin && value <= idealMax) return 100;
  if (value <= hardMin || value >= hardMax) return 0;
  if (value < idealMin) {
    return clampScore(((value - hardMin) / (idealMin - hardMin)) * 100);
  }
  return clampScore(((hardMax - value) / (hardMax - idealMax)) * 100);
}

export function scoreCutting(state) {
  const nattoBases = {
    [NATTO_STAGES.WHOLE]: 95,
    [NATTO_STAGES.COARSE]: 88,
    [NATTO_STAGES.HIKIWARI]: 95,
    [NATTO_STAGES.PASTE]: 30,
  };
  const nattoScore = nattoBases[state.ingredients.natto.cutStage] ?? 0;
  const onion = state.ingredients.greenOnion;
  const onionScore = onion.usedAmount <= 0
    ? 85
    : (scoreRange(onion.fineness, 0.55, 0.8, 0, 1) + normalizedScore(onion.uniformity)) / 2;

  return Math.round(clampScore((nattoScore * 0.7) + (onionScore * 0.3)));
}

export function scoreMixing(state) {
  const progressRange = state.ingredients.egg.added
    ? [0.68, 0.84]
    : [0.55, 0.72];
  const progressScore = scoreRange(state.mixing.progress, ...progressRange, 0, 1);
  const score = (progressScore * 0.6)
    + (normalizedScore(state.mixing.circularity) * 0.25)
    + (normalizedScore(state.mixing.speedStability) * 0.15);

  return Math.round(clampScore(score));
}

export function scoreTaste(state) {
  const soyRange = state.ingredients.egg.added
    ? [3.5, 5.8, 0, 11]
    : [2.5, 4.8, 0, 10];
  const soyScore = scoreRange(state.ingredients.soySauceMl, ...soyRange);
  const mustardScore = scoreRange(state.ingredients.mustardG, 0, 1.2, 0, 3);
  const onionScore = scoreRange(state.ingredients.greenOnion.usedAmount, 0, 0.4, 0, 1);

  return Math.round(clampScore(
    (soyScore * 0.6) + (mustardScore * 0.2) + (onionScore * 0.2),
  ));
}

export function scoreServing(state) {
  const serving = state.serving;
  const score = (
    scoreRange(serving.transferredRatio, 0.88, 1, 0, 1)
    + scoreRange(serving.coverage, 0.4, 0.78, 0, 1)
    + scoreRange(serving.centerOffset, 0, 0.18, 0, 1)
    + scoreRange(serving.spillRatio, 0, 0.05, 0, 1)
  ) / 4;

  return Math.round(clampScore(score));
}

export function scoreGame(state) {
  const scores = {
    cutting: scoreCutting(state),
    mixing: scoreMixing(state),
    taste: scoreTaste(state),
    serving: scoreServing(state),
  };

  return {
    ...scores,
    overall: Math.round(
      (scores.cutting + scores.mixing + scores.taste + scores.serving) / 4,
    ),
  };
}
