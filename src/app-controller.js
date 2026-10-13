import { PHASES, createInitialGameState } from './core/game-state.js';
import { reduceGameState } from './core/state-machine.js';
import { buildCollectionModel, renderCollection } from './ui/collection.js';
import { buildResultModel, buildShareText, renderResults } from './ui/results.js';
import { deriveShellModel } from './ui/shell.js';

const CANONICAL_URL = 'https://wataryuu.com/natto/';

const DEFAULT_SETTINGS = Object.freeze({
  muted: false,
  skipIrreversibleConfirmations: false,
  tutorialSeen: false,
});

const NULL_SCENE = Object.freeze({
  setStation() {},
  renderState() {},
  pause() {},
  resume() {},
  dispose() {},
});

const NULL_AUDIO = Object.freeze({
  unlock: async () => false,
  play: () => false,
  setMuted: () => false,
  dispose: async () => {},
});

const EVENT_EFFECTS = Object.freeze({
  UPDATE_CUT: 'chop',
  ADD_EGG: 'crack',
  ADD_CONDIMENT: 'pour',
  TRANSFER_TO_BOWL: 'pour',
  TRANSFER_TO_RICE: 'serve',
  UPDATE_MIX: 'stir',
  FINISH: 'result',
});

export function createAppController({
  initialState = createInitialGameState(),
  settings = DEFAULT_SETTINGS,
  locale = 'en',
  shell,
  scene = NULL_SCENE,
  persistence = null,
  saveLocale = null,
  pointerRouter = null,
  audio = NULL_AUDIO,
  resultRoot = null,
  collectionRoot = null,
  shareTarget = globalThis.navigator,
  openWindow = globalThis.open,
} = {}) {
  if (!shell || typeof shell.render !== 'function') {
    throw new TypeError('createAppController requires a shell view');
  }

  let state = initialState;
  let activeLocale = locale === 'ja' ? 'ja' : 'en';
  let activeSettings = { ...DEFAULT_SETTINGS, ...settings };
  let activeScene = scene;
  let activeAudio = audio ?? NULL_AUDIO;
  let activeView = state.phase === PHASES.RESULT ? 'result' : 'cooking';
  let collectionReturnView = activeView;
  let resultPreviousSave = null;
  let currentResultModel = null;
  let recoveryPaused = false;
  let greenOnionAmount = 0.25;
  activeAudio.setMuted?.(activeSettings.muted);

  const playEffect = (effect) => {
    void Promise.resolve(activeAudio.unlock?.()).then((ready) => {
      if (ready) activeAudio.play?.(effect);
    });
  };

  const model = () => deriveShellModel(state, activeSettings, activeLocale, { greenOnionAmount });
  const loadSave = () => persistence?.load?.() ?? {
    version: 1,
    achievements: {},
    settings: { ...activeSettings },
  };
  const showView = (view) => {
    activeView = view;
    shell.showView?.(view);
  };
  const renderCollectionView = () => {
    const collectionModel = buildCollectionModel(loadSave(), activeLocale, persistence?.mode);
    if (collectionRoot) {
      renderCollection(collectionRoot, collectionModel, {
        close: () => controller.closeCollection(),
        reset: () => controller.resetCollection(),
      });
    }
    return collectionModel;
  };
  const renderResultView = () => {
    resultPreviousSave ??= loadSave();
    currentResultModel = buildResultModel(state, resultPreviousSave, activeLocale);
    if (resultRoot) {
      renderResults(resultRoot, currentResultModel, {
        replay: () => controller.replay(),
        collection: () => controller.openCollection(),
        share: () => controller.shareResult(),
      });
    }
    return currentResultModel;
  };
  const render = ({ projectScene = true } = {}) => {
    const nextModel = model();
    shell.render(nextModel);
    if (projectScene) activeScene.renderState?.(state);
    return nextModel;
  };

  const dispatch = (event) => {
    if (recoveryPaused) return false;
    const previous = state;
    const previousSave = event?.type === 'FINISH' ? loadSave() : null;
    const next = reduceGameState(state, event);
    if (next === state) return false;
    state = next;
    if (previous.station !== next.station) activeScene.setStation?.(next.station);
    render();
    const effect = EVENT_EFFECTS[event.type];
    if (effect) playEffect(effect);
    if (previous.phase !== PHASES.RESULT && next.phase === PHASES.RESULT) {
      resultPreviousSave = previousSave;
      const result = renderResultView();
      persistence?.recordResult?.({
        primaryId: result.primaryId,
        specialIds: result.specialIds,
        scores: result.scores,
      });
      showView('result');
    }
    return true;
  };

  const controller = {
    getState: () => state,
    getLocale: () => activeLocale,
    getModel: model,
    dispatch,
    switchStation(station) {
      if (activeScene.isPointerActive?.()) return false;
      return dispatch({ type: 'SWITCH_STATION', station });
    },
    setLocale(nextLocale) {
      if (nextLocale !== 'ja' && nextLocale !== 'en') return false;
      activeLocale = nextLocale;
      saveLocale?.(nextLocale);
      render({ projectScene: false });
      if (activeView === 'result') renderResultView();
      if (activeView === 'collection') renderCollectionView();
      return true;
    },
    toggleMute() {
      activeSettings = { ...activeSettings, muted: !activeSettings.muted };
      activeAudio.setMuted?.(activeSettings.muted);
      persistence?.updateSettings?.({ muted: activeSettings.muted });
      render({ projectScene: false });
      return activeSettings.muted;
    },
    completeTutorial() {
      activeSettings = { ...activeSettings, tutorialSeen: true };
      persistence?.updateSettings?.({ tutorialSeen: true });
      render({ projectScene: false });
    },
    getGreenOnionAmount: () => greenOnionAmount,
    setGreenOnionAmount(amount) {
      if (!Number.isFinite(amount)) return false;
      greenOnionAmount = Math.min(1, Math.max(0.05, amount));
      render({ projectScene: false });
      return true;
    },
    showTutorial(opener = null) {
      shell.showTutorial?.(model().tutorial, controller.completeTutorial, opener);
    },
    requestIrreversible(kind, event, opener = null, followUpEvent = null) {
      const copy = model().confirmations[kind];
      const accept = ({ skip = false } = {}) => {
        if (skip) {
          activeSettings = { ...activeSettings, skipIrreversibleConfirmations: true };
          persistence?.updateSettings?.({ skipIrreversibleConfirmations: true });
        }
        const applied = dispatch(event);
        if (applied && followUpEvent) dispatch(followUpEvent);
        return applied;
      };
      if (!copy) return accept();
      shell.showConfirmation?.(copy, accept, opener);
      return false;
    },
    setScene(nextScene) {
      if (activeScene !== NULL_SCENE && activeScene !== nextScene) activeScene.dispose?.();
      activeScene = nextScene ?? NULL_SCENE;
      activeScene.setStation?.(state.station);
      activeScene.renderState?.(state);
    },
    renderSceneFrame() {
      return activeScene.renderFrame?.();
    },
    pause() {
      recoveryPaused = true;
      pointerRouter?.setRecoveryMode?.(true);
      activeScene.pause?.();
    },
    resume() {
      activeScene.resume?.();
      pointerRouter?.setRecoveryMode?.(false);
      recoveryPaused = false;
    },
    isPaused: () => recoveryPaused,
    activateAudio() {
      return activeAudio.unlock?.() ?? false;
    },
    playEffect,
    getResultModel: () => currentResultModel,
    replay() {
      state = reduceGameState(state, { type: 'RESET_RUN' });
      resultPreviousSave = null;
      currentResultModel = null;
      showView('cooking');
      activeScene.setStation?.(state.station);
      render();
      return state;
    },
    openCollection() {
      if (activeView !== 'collection') collectionReturnView = activeView;
      const collectionModel = renderCollectionView();
      showView('collection');
      return collectionModel;
    },
    closeCollection() {
      const target = collectionReturnView === 'result' && state.phase === PHASES.RESULT
        ? 'result'
        : 'cooking';
      showView(target);
      if (target === 'result') renderResultView();
      return target;
    },
    resetCollection(opener = null) {
      const collectionModel = buildCollectionModel(loadSave(), activeLocale);
      const copy = {
        title: collectionModel.copy.reset,
        body: collectionModel.copy.resetConfirm,
        accept: collectionModel.copy.confirm,
        cancel: collectionModel.copy.cancel,
      };
      shell.showConfirmation?.(copy, () => {
        persistence?.reset?.();
        activeSettings = { ...DEFAULT_SETTINGS };
        activeAudio.setMuted?.(false);
        render({ projectScene: false });
        if (activeView === 'collection') renderCollectionView();
        shell.announce?.(collectionModel.copy.resetDone);
      }, opener);
      return false;
    },
    async shareResult() {
      const result = currentResultModel ?? renderResultView();
      const text = buildShareText(result, activeLocale, CANONICAL_URL);
      if (typeof shareTarget?.share === 'function') {
        try {
          await shareTarget.share({ text, url: CANONICAL_URL, title: result.primary?.name ?? '' });
          return 'share';
        } catch {
          return false;
        }
      }
      const intent = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
      openWindow?.(intent, '_blank', 'noopener,noreferrer');
      return 'x';
    },
    dispose() {
      pointerRouter?.dispose?.();
      activeScene.dispose?.();
      shell.dispose?.();
      void activeAudio.dispose?.();
      activeScene = NULL_SCENE;
      activeAudio = NULL_AUDIO;
    },
  };

  activeScene.setStation?.(state.station);
  const firstModel = render();
  showView(activeView);
  if (state.phase === PHASES.RESULT) renderResultView();
  shell.announce?.(firstModel.readyMessage);
  if (firstModel.tutorial.visible) controller.showTutorial();
  return controller;
}
