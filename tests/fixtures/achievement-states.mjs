import { createInitialGameState } from '../../src/core/game-state.js';

const lowScores = Object.freeze({
  cutting: 50,
  mixing: 50,
  taste: 50,
  serving: 50,
  overall: 50,
});

function finishedState(overrides = {}) {
  const state = createInitialGameState();
  return {
    ...state,
    ...overrides,
    phase: 'result',
    ingredients: {
      ...state.ingredients,
      ...(overrides.ingredients ?? {}),
      natto: { ...state.ingredients.natto, ...(overrides.ingredients?.natto ?? {}) },
      greenOnion: {
        ...state.ingredients.greenOnion,
        ...(overrides.ingredients?.greenOnion ?? {}),
      },
      egg: { ...state.ingredients.egg, ...(overrides.ingredients?.egg ?? {}) },
    },
    mixing: { ...state.mixing, ...(overrides.mixing ?? {}) },
    serving: {
      ...state.serving,
      transferredRatio: 0.9,
      ...(overrides.serving ?? {}),
    },
  };
}

function fixture(stateOverrides, scoreOverrides) {
  return {
    state: finishedState(stateOverrides),
    scores: { ...lowScores, ...scoreOverrides },
  };
}

export const fermentationMasterFixture = fixture({}, {
  cutting: 92, mixing: 92, taste: 92, serving: 92, overall: 92,
});
export const balancedBowlFixture = fixture({
  ingredients: { natto: { cutStage: 'hikiwari' }, egg: { added: true } },
}, { cutting: 85, mixing: 85, taste: 85, serving: 85, overall: 85 });
export const tamagoKakeGohanFixture = fixture({
  ingredients: { egg: { added: true } },
  mixing: { progress: 0.12 },
  serving: { transferredRatio: 0.94, spillRatio: 0.02 },
}, {});
export const wholeBeanArtisanFixture = fixture({
  ingredients: { natto: { cutStage: 'whole' } },
}, { cutting: 95, mixing: 84, overall: 70 });
export const coarseCutDevoteeFixture = fixture({
  ingredients: { natto: { cutStage: 'coarse' } },
}, { cutting: 88, mixing: 80, overall: 67 });
export const hikiwariMasterFixture = fixture({
  ingredients: { natto: { cutStage: 'hikiwari' } },
}, { cutting: 94, serving: 86, overall: 70 });
export const fluffyEggCrafterFixture = fixture({
  ingredients: { egg: { added: true } },
  mixing: { progress: 0.7 },
}, { mixing: 92, taste: 84, overall: 69 });
export const greenOnionPerfumerFixture = fixture({
  ingredients: { greenOnion: { usedAmount: 0.25, fineness: 0.8, uniformity: 0.9 } },
}, { taste: 75, overall: 56 });
export const mixingSeekerFixture = fixture({
  mixing: { progress: 0.65, circularity: 0.94 },
}, { mixing: 93, overall: 61 });
export const riceBowlThiefFixture = fixture({}, {
  taste: 94, serving: 90, overall: 71,
});
export const presentationArtistFixture = fixture({}, {
  serving: 97, overall: 62,
});
export const minimalistBreakfastFixture = fixture({}, {
  taste: 80, overall: 58,
});
export const classicBreakfastFixture = fixture({
  ingredients: { mustardG: 0.5 },
}, { cutting: 80, mixing: 80, taste: 84, serving: 84, overall: 82 });
export const homestyleBowlFixture = fixture({
  ingredients: { natto: { cutStage: 'paste' }, mustardG: 0.5 },
}, { overall: 50 });

export const pasteResearcherFixture = fixture({
  ingredients: { natto: { cutStage: 'paste', cutProgress: 0.96 } },
}, {});
export const mustardVolcanoFixture = fixture({ ingredients: { mustardG: 2.2 } }, {});
export const soySauceSeaFixture = fixture({ ingredients: { soySauceMl: 8 } }, {});
export const scallionMountainFixture = fixture({
  ingredients: { greenOnion: { usedAmount: 0.65 } },
}, {});
export const chaosThreadsFixture = fixture({
  mixing: { progress: 0.96, aeration: 0.9 },
}, {});
export const servingDisasterFixture = fixture({ serving: { spillRatio: 0.35 } }, {});

export const PRIMARY_FIXTURES = Object.freeze({
  fermentation_master: fermentationMasterFixture,
  balanced_bowl: balancedBowlFixture,
  tamago_kake_gohan: tamagoKakeGohanFixture,
  whole_bean_artisan: wholeBeanArtisanFixture,
  coarse_cut_devotee: coarseCutDevoteeFixture,
  hikiwari_master: hikiwariMasterFixture,
  fluffy_egg_crafter: fluffyEggCrafterFixture,
  green_onion_perfumer: greenOnionPerfumerFixture,
  mixing_seeker: mixingSeekerFixture,
  rice_bowl_thief: riceBowlThiefFixture,
  presentation_artist: presentationArtistFixture,
  minimalist_breakfast: minimalistBreakfastFixture,
  classic_breakfast: classicBreakfastFixture,
  homestyle_bowl: homestyleBowlFixture,
});

export const SPECIAL_FIXTURES = Object.freeze({
  paste_researcher: pasteResearcherFixture,
  mustard_volcano: mustardVolcanoFixture,
  soy_sauce_sea: soySauceSeaFixture,
  scallion_mountain: scallionMountainFixture,
  chaos_threads: chaosThreadsFixture,
  serving_disaster: servingDisasterFixture,
});

