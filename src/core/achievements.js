import { NATTO_STAGES, PHASES } from './game-state.js';

const primary = (id, priority, matches) => Object.freeze({
  id,
  kind: 'primary',
  priority,
  matches,
});

const special = (id, matches) => Object.freeze({
  id,
  kind: 'special',
  priority: 0,
  matches,
});

const primaryAchievements = [
  primary('fermentation_master', 120, (_state, scores) =>
    scores.cutting >= 90
    && scores.mixing >= 90
    && scores.taste >= 90
    && scores.serving >= 90),
  primary('balanced_bowl', 110, (_state, scores) =>
    scores.cutting >= 80
    && scores.mixing >= 80
    && scores.taste >= 80
    && scores.serving >= 80
    && scores.overall >= 85),
  primary('tamago_kake_gohan', 105, (state) =>
    state.ingredients.egg.added === true
    && state.mixing.progress <= 0.2
    && state.serving.transferredRatio >= 0.88
    && state.serving.spillRatio <= 0.1),
  primary('whole_bean_artisan', 100, (state, scores) =>
    state.ingredients.natto.cutStage === NATTO_STAGES.WHOLE
    && scores.cutting >= 90
    && scores.mixing >= 80),
  primary('coarse_cut_devotee', 99, (state, scores) =>
    state.ingredients.natto.cutStage === NATTO_STAGES.COARSE
    && scores.cutting >= 85
    && scores.mixing >= 75),
  primary('hikiwari_master', 95, (state, scores) =>
    state.ingredients.natto.cutStage === NATTO_STAGES.HIKIWARI
    && scores.cutting >= 90
    && scores.serving >= 80),
  primary('fluffy_egg_crafter', 90, (state, scores) =>
    state.ingredients.egg.added === true
    && scores.mixing >= 88
    && scores.taste >= 80),
  primary('green_onion_perfumer', 80, (state, scores) => {
    const onion = state.ingredients.greenOnion;
    return onion.usedAmount >= 0.15
      && onion.usedAmount <= 0.35
      && onion.fineness >= 0.8
      && onion.uniformity >= 0.8
      && scores.taste >= 75;
  }),
  primary('mixing_seeker', 70, (state, scores) =>
    scores.mixing >= 90 && state.mixing.circularity >= 0.9),
  primary('rice_bowl_thief', 60, (_state, scores) =>
    scores.taste >= 92 && scores.serving >= 85),
  primary('presentation_artist', 50, (_state, scores) => scores.serving >= 95),
  primary('minimalist_breakfast', 40, (state, scores) =>
    state.ingredients.egg.added === false
    && state.ingredients.greenOnion.usedAmount === 0
    && state.ingredients.mustardG === 0
    && scores.taste >= 80),
  primary('classic_breakfast', 30, (state, scores) =>
    state.ingredients.natto.cutStage === NATTO_STAGES.WHOLE
    && state.ingredients.egg.added === false
    && scores.overall >= 75),
  primary('homestyle_bowl', 10, (state) => state.phase === PHASES.RESULT),
];

const specialAchievements = [
  special('paste_researcher', (state) =>
    state.ingredients.natto.cutStage === NATTO_STAGES.PASTE),
  special('mustard_volcano', (state) => state.ingredients.mustardG >= 2.2),
  special('soy_sauce_sea', (state) => state.ingredients.soySauceMl >= 8),
  special('scallion_mountain', (state) =>
    state.ingredients.greenOnion.usedAmount >= 0.65),
  special('chaos_threads', (state) =>
    state.mixing.progress >= 0.96 && state.mixing.aeration >= 0.9),
  special('serving_disaster', (state) => state.serving.spillRatio >= 0.35),
];

export const ACHIEVEMENTS = Object.freeze([
  ...primaryAchievements,
  ...specialAchievements,
]);

export function evaluateAchievements(state, scores) {
  if (state?.phase !== PHASES.RESULT) {
    return { primaryId: null, specialIds: [] };
  }

  const primaryMatch = primaryAchievements
    .toSorted((left, right) => right.priority - left.priority)
    .find((achievement) => achievement.matches(state, scores));
  const specialIds = specialAchievements
    .filter((achievement) => achievement.matches(state, scores))
    .map((achievement) => achievement.id);

  return {
    primaryId: primaryMatch?.id ?? null,
    specialIds,
  };
}
