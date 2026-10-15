import { NATTO_STAGES } from '../core/game-state.js';

export const CUT_BOARD_BOUNDS = Object.freeze({
  minX: -2.2,
  maxX: 2.2,
  minY: -1.65,
  maxY: 1.65,
});

export const GREEN_ONION_LAYOUT = Object.freeze({
  minX: 0.28,
  maxX: 1.53,
  minY: -0.07,
  maxY: 0.07,
});

const GREEN_ONION_INTERACTION_MARGIN = 0.12;

export const CUT_INGREDIENT_BOUNDS = Object.freeze({
  natto: Object.freeze({ minX: -1.6, maxX: -0.2, minY: -0.68, maxY: 0.68 }),
  greenOnion: Object.freeze({
    minX: GREEN_ONION_LAYOUT.minX - GREEN_ONION_INTERACTION_MARGIN,
    maxX: GREEN_ONION_LAYOUT.maxX + GREEN_ONION_INTERACTION_MARGIN,
    minY: GREEN_ONION_LAYOUT.minY - GREEN_ONION_INTERACTION_MARGIN,
    maxY: GREEN_ONION_LAYOUT.maxY + GREEN_ONION_INTERACTION_MARGIN,
  }),
});

const NATTO_PROGRESS_PER_STROKE = 0.1;
const ONION_CUTS_FOR_MAX_FINENESS = 10;
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const clamp01 = (value) => Math.min(1, Math.max(0, value));

function normalizedPoints(points) {
  if (!Array.isArray(points) || points.length < 2) return null;
  const clean = points.map((point) => ({ x: point?.x, y: point?.y }));
  return clean.every((point) => finite(point.x) && finite(point.y)) ? clean : null;
}

function clipSegment(start, end, bounds) {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const p = [-deltaX, deltaX, -deltaY, deltaY];
  const q = [
    start.x - bounds.minX,
    bounds.maxX - start.x,
    start.y - bounds.minY,
    bounds.maxY - start.y,
  ];
  let enter = 0;
  let exit = 1;

  for (let index = 0; index < p.length; index += 1) {
    if (p[index] === 0) {
      if (q[index] < 0) return null;
      continue;
    }
    const ratio = q[index] / p[index];
    if (p[index] < 0) enter = Math.max(enter, ratio);
    else exit = Math.min(exit, ratio);
    if (enter > exit) return null;
  }

  return {
    start: { x: start.x + deltaX * enter, y: start.y + deltaY * enter },
    end: { x: start.x + deltaX * exit, y: start.y + deltaY * exit },
  };
}

export function deriveNattoStage(progress) {
  const normalized = finite(progress) ? clamp01(progress) : 0;
  if (normalized >= 0.96) return NATTO_STAGES.PASTE;
  if (normalized >= 0.52) return NATTO_STAGES.HIKIWARI;
  if (normalized >= 0.18) return NATTO_STAGES.COARSE;
  return NATTO_STAGES.WHOLE;
}

export function scoreOnionCuts(cuts) {
  const positions = Array.isArray(cuts)
    ? cuts
      .map((cut) => typeof cut === 'number' ? cut : cut?.x)
      .filter(finite)
      .sort((left, right) => left - right)
    : [];
  const fineness = clamp01(positions.length / ONION_CUTS_FOR_MAX_FINENESS);
  if (positions.length < 2) return { fineness, uniformity: 0 };

  const spacings = positions.slice(1).map((position, index) => position - positions[index]);
  const mean = spacings.reduce((sum, spacing) => sum + spacing, 0) / spacings.length;
  if (mean <= 0) return { fineness, uniformity: 0 };
  const variance = spacings.reduce((sum, spacing) => sum + ((spacing - mean) ** 2), 0)
    / spacings.length;
  const coefficientOfVariation = Math.sqrt(variance) / mean;
  return {
    fineness,
    uniformity: clamp01(1 - coefficientOfVariation),
  };
}

export function applyKnifeStroke(cutState, stroke) {
  const ingredient = stroke?.ingredient;
  const ingredientState = cutState?.[ingredient];
  const bounds = CUT_INGREDIENT_BOUNDS[ingredient];
  const points = normalizedPoints(stroke?.points);
  if (!ingredientState || !bounds || !points || ingredientState.inBowl === true) return cutState;

  // A gesture is one geometric stroke regardless of how many pointer samples describe it.
  const start = points[0];
  const end = points.at(-1);
  if (!clipSegment(start, end, CUT_BOARD_BOUNDS)) return cutState;
  const ingredientIntersection = clipSegment(start, end, bounds);
  if (!ingredientIntersection) return cutState;

  if (ingredient === 'natto') {
    const previousProgress = finite(ingredientState.cutProgress)
      ? clamp01(ingredientState.cutProgress)
      : 0;
    const cutProgress = clamp01(previousProgress + NATTO_PROGRESS_PER_STROKE);
    return {
      ...cutState,
      natto: {
        ...ingredientState,
        cutProgress,
        cutStage: deriveNattoStage(cutProgress),
      },
    };
  }

  const cutPosition = (ingredientIntersection.start.x + ingredientIntersection.end.x) / 2;
  const cuts = [...(Array.isArray(ingredientState.cuts) ? ingredientState.cuts : []), cutPosition];
  return {
    ...cutState,
    greenOnion: {
      ...ingredientState,
      cuts,
      ...scoreOnionCuts(cuts),
    },
  };
}
