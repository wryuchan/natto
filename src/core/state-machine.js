import {
  NATTO_STAGES,
  PHASES,
  STATIONS,
  createInitialGameState,
} from './game-state.js';

const NORMALIZED_MIX_FIELDS = Object.freeze([
  'progress',
  'circularity',
  'speedStability',
  'clockwiseRatio',
  'aeration',
]);
const NORMALIZED_SERVE_FIELDS = Object.freeze([
  'transferredRatio',
  'coverage',
  'centerOffset',
  'spillRatio',
]);

const clamp01 = (value) => Math.min(1, Math.max(0, value));
const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const isCooking = (state) => state?.phase === PHASES.COOKING;
const hasRiceTransfer = (state) => state.serving.transferredRatio > 0;

function updateNormalized(source, event, fields) {
  const supplied = fields.filter((field) => Object.hasOwn(event, field));
  if (supplied.length === 0 || supplied.some((field) => !isFiniteNumber(event[field]))) {
    return null;
  }

  return Object.fromEntries(supplied.map((field) => [field, clamp01(event[field])]));
}

/**
 * @typedef {
 *   | {type: 'SWITCH_STATION', station: 'cut'|'mix'|'serve'}
 *   | {type: 'UPDATE_CUT', ingredient: 'natto'|'greenOnion', cutProgress?: number, cutStage?: 'whole'|'coarse'|'hikiwari'|'paste', fineness?: number, uniformity?: number}
 *   | {type: 'TRANSFER_TO_BOWL', ingredient: 'natto'|'greenOnion', amount: number}
 *   | {type: 'ADD_EGG'}
 *   | {type: 'ADD_CONDIMENT', condiment: 'soySauce'|'mustard', amount: number}
 *   | {type: 'UPDATE_MIX', progress?: number, circularity?: number, speedStability?: number, clockwiseRatio?: number, aeration?: number}
 *   | {type: 'TRANSFER_TO_RICE', confirmed: boolean, transferredRatio: number}
 *   | {type: 'UPDATE_SERVE', transferredRatio?: number, coverage?: number, centerOffset?: number, spillRatio?: number}
 *   | {type: 'FINISH'}
 *   | {type: 'RESET_RUN'}
 * } GameEvent
 */

/**
 * Apply a validated cooking event without mutating the current state.
 * Invalid and out-of-order events return the exact original object.
 *
 * @param {ReturnType<createInitialGameState>} state
 * @param {GameEvent} event
 */
export function reduceGameState(state, event) {
  if (!state || !event || typeof event !== 'object' || typeof event.type !== 'string') {
    return state;
  }

  if (event.type === 'RESET_RUN') {
    return createInitialGameState();
  }

  if (!isCooking(state)) {
    return state;
  }

  switch (event.type) {
    case 'SWITCH_STATION': {
      if (!Object.values(STATIONS).includes(event.station)) return state;
      return { ...state, station: event.station };
    }

    case 'UPDATE_CUT': {
      if (hasRiceTransfer(state)) return state;
      if (event.ingredient === 'natto') {
        const natto = state.ingredients.natto;
        if (natto.inBowl) return state;
        const hasProgress = Object.hasOwn(event, 'cutProgress');
        const hasStage = Object.hasOwn(event, 'cutStage');
        if (!hasProgress && !hasStage) return state;
        if (hasProgress && !isFiniteNumber(event.cutProgress)) return state;
        if (hasStage && !Object.values(NATTO_STAGES).includes(event.cutStage)) return state;
        return {
          ...state,
          ingredients: {
            ...state.ingredients,
            natto: {
              ...natto,
              ...(hasProgress ? { cutProgress: clamp01(event.cutProgress) } : {}),
              ...(hasStage ? { cutStage: event.cutStage } : {}),
            },
          },
        };
      }

      if (event.ingredient === 'greenOnion') {
        const onion = state.ingredients.greenOnion;
        if (onion.inBowl) return state;
        const updates = updateNormalized(onion, event, ['fineness', 'uniformity']);
        if (!updates) return state;
        if (
          Object.hasOwn(event, 'cutPositions')
          && (!Array.isArray(event.cutPositions) || event.cutPositions.some((position) => !isFiniteNumber(position)))
        ) return state;
        return {
          ...state,
          ingredients: {
            ...state.ingredients,
            greenOnion: {
              ...onion,
              ...updates,
              ...(Object.hasOwn(event, 'cutPositions') ? { cutPositions: [...event.cutPositions] } : {}),
            },
          },
        };
      }
      return state;
    }

    case 'TRANSFER_TO_BOWL': {
      if (hasRiceTransfer(state) || !isFiniteNumber(event.amount) || event.amount <= 0) return state;
      const amount = clamp01(event.amount);
      if (event.ingredient === 'natto' && !state.ingredients.natto.inBowl) {
        return {
          ...state,
          ingredients: {
            ...state.ingredients,
            natto: { ...state.ingredients.natto, amount, inBowl: true },
          },
        };
      }
      if (event.ingredient === 'greenOnion' && !state.ingredients.greenOnion.inBowl) {
        return {
          ...state,
          ingredients: {
            ...state.ingredients,
            greenOnion: {
              ...state.ingredients.greenOnion,
              usedAmount: amount,
              inBowl: true,
            },
          },
        };
      }
      return state;
    }

    case 'ADD_EGG': {
      if (hasRiceTransfer(state) || state.ingredients.egg.added) return state;
      return {
        ...state,
        ingredients: {
          ...state.ingredients,
          egg: { added: true },
        },
      };
    }

    case 'ADD_CONDIMENT': {
      if (hasRiceTransfer(state) || !isFiniteNumber(event.amount) || event.amount <= 0) return state;
      const field = event.condiment === 'soySauce'
        ? 'soySauceMl'
        : event.condiment === 'mustard'
          ? 'mustardG'
          : null;
      if (!field) return state;
      return {
        ...state,
        ingredients: {
          ...state.ingredients,
          [field]: state.ingredients[field] + event.amount,
        },
      };
    }

    case 'UPDATE_MIX': {
      if (hasRiceTransfer(state)) return state;
      const updates = updateNormalized(state.mixing, event, NORMALIZED_MIX_FIELDS);
      if (!updates) return state;
      return { ...state, mixing: { ...state.mixing, ...updates } };
    }

    case 'TRANSFER_TO_RICE': {
      const hasBowlContents = state.ingredients.natto.inBowl;
      if (
        hasRiceTransfer(state)
        || !hasBowlContents
        || event.confirmed !== true
        || !isFiniteNumber(event.transferredRatio)
        || event.transferredRatio <= 0
      ) return state;
      return {
        ...state,
        serving: {
          ...state.serving,
          transferredRatio: clamp01(event.transferredRatio),
        },
      };
    }

    case 'UPDATE_SERVE': {
      if (!hasRiceTransfer(state)) return state;
      const updates = updateNormalized(state.serving, event, NORMALIZED_SERVE_FIELDS);
      if (!updates) return state;
      if (
        Object.hasOwn(updates, 'transferredRatio')
        && updates.transferredRatio < state.serving.transferredRatio
      ) return state;
      return { ...state, serving: { ...state.serving, ...updates } };
    }

    case 'FINISH':
      return hasRiceTransfer(state) ? { ...state, phase: PHASES.RESULT } : state;

    default:
      return state;
  }
}

export function canApplyEvent(state, event) {
  return reduceGameState(state, event) !== state;
}
