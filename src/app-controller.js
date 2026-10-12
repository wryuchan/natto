import { createInitialGameState } from './core/game-state.js';
import { reduceGameState } from './core/state-machine.js';
import { deriveShellModel } from './ui/shell.js';

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

export function createAppController({
  initialState = createInitialGameState(),
  settings = DEFAULT_SETTINGS,
  locale = 'en',
  shell,
  scene = NULL_SCENE,
  persistence = null,
  saveLocale = null,
  pointerRouter = null,
} = {}) {
  if (!shell || typeof shell.render !== 'function') {
    throw new TypeError('createAppController requires a shell view');
  }

  let state = initialState;
  let activeLocale = locale === 'ja' ? 'ja' : 'en';
  let activeSettings = { ...DEFAULT_SETTINGS, ...settings };
  let activeScene = scene;

  const model = () => deriveShellModel(state, activeSettings, activeLocale);
  const render = ({ projectScene = true } = {}) => {
    const nextModel = model();
    shell.render(nextModel);
    if (projectScene) activeScene.renderState?.(state);
    return nextModel;
  };

  const dispatch = (event) => {
    const previous = state;
    const next = reduceGameState(state, event);
    if (next === state) return false;
    state = next;
    if (previous.station !== next.station) activeScene.setStation?.(next.station);
    render();
    return true;
  };

  const controller = {
    getState: () => state,
    getLocale: () => activeLocale,
    getModel: model,
    dispatch,
    switchStation(station) {
      return dispatch({ type: 'SWITCH_STATION', station });
    },
    setLocale(nextLocale) {
      if (nextLocale !== 'ja' && nextLocale !== 'en') return false;
      activeLocale = nextLocale;
      saveLocale?.(nextLocale);
      render({ projectScene: false });
      return true;
    },
    toggleMute() {
      activeSettings = { ...activeSettings, muted: !activeSettings.muted };
      persistence?.updateSettings?.({ muted: activeSettings.muted });
      render({ projectScene: false });
      return activeSettings.muted;
    },
    completeTutorial() {
      activeSettings = { ...activeSettings, tutorialSeen: true };
      persistence?.updateSettings?.({ tutorialSeen: true });
      render({ projectScene: false });
    },
    showTutorial(opener = null) {
      shell.showTutorial?.(model().tutorial, controller.completeTutorial, opener);
    },
    requestIrreversible(kind, event, opener = null) {
      const copy = model().confirmations[kind];
      if (!copy) return dispatch(event);
      shell.showConfirmation?.(copy, () => dispatch(event), opener);
      return false;
    },
    setScene(nextScene) {
      if (activeScene !== NULL_SCENE && activeScene !== nextScene) activeScene.dispose?.();
      activeScene = nextScene ?? NULL_SCENE;
      activeScene.setStation?.(state.station);
      activeScene.renderState?.(state);
    },
    pause() {
      pointerRouter?.setRecoveryMode?.(true);
      activeScene.pause?.();
    },
    resume() {
      activeScene.resume?.();
      pointerRouter?.setRecoveryMode?.(false);
    },
    dispose() {
      pointerRouter?.dispose?.();
      activeScene.dispose?.();
      shell.dispose?.();
      activeScene = NULL_SCENE;
    },
  };

  activeScene.setStation?.(state.station);
  const firstModel = render();
  shell.announce?.(firstModel.readyMessage);
  if (firstModel.tutorial.visible) controller.showTutorial();
  return controller;
}
