export const STATIONS = Object.freeze({
  CUT: 'cut',
  MIX: 'mix',
  SERVE: 'serve',
});

export const PHASES = Object.freeze({
  COOKING: 'cooking',
  RESULT: 'result',
});

export const NATTO_STAGES = Object.freeze({
  WHOLE: 'whole',
  COARSE: 'coarse',
  HIKIWARI: 'hikiwari',
  PASTE: 'paste',
});

export function createInitialGameState() {
  return {
    version: 1,
    phase: PHASES.COOKING,
    station: STATIONS.CUT,
    elapsedMs: 0,
    ingredients: {
      natto: {
        amount: 1,
        cutStage: NATTO_STAGES.WHOLE,
        cutProgress: 0,
        inBowl: false,
      },
      greenOnion: {
        usedAmount: 0,
        fineness: 0,
        uniformity: 0,
        cutPositions: [],
        inBowl: false,
      },
      egg: { added: false },
      soySauceMl: 0,
      mustardG: 0,
    },
    mixing: {
      progress: 0,
      circularity: 0,
      speedStability: 0,
      clockwiseRatio: 0,
      aeration: 0,
    },
    serving: {
      transferredRatio: 0,
      coverage: 0,
      centerOffset: 1,
      spillRatio: 0,
    },
  };
}
