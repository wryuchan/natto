import { createAppController } from './app-controller.js';
import { STATIONS } from './core/game-state.js';
import { createKitchenScene } from './scene/kitchen.js';
import { createAudioSystem } from './systems/audio.js';
import { LOCALE_KEY, createPersistence } from './systems/persistence.js';
import { resolveLocale } from './systems/i18n.js';
import { createShell } from './ui/shell.js';

const root = document.querySelector('#app');

if (root) {
  let storage = null;
  let savedLocale = null;
  try {
    storage = window.localStorage;
    savedLocale = storage.getItem(LOCALE_KEY);
  } catch {
    storage = null;
  }

  const persistence = createPersistence(storage);
  const save = persistence.load();
  const locale = resolveLocale({
    query: window.location.search,
    saved: savedLocale,
    navigatorLanguage: window.navigator.language,
  });
  const canvas = root.querySelector('#game-canvas');
  const audio = createAudioSystem({ muted: save.settings.muted });
  let controller = null;
  const shell = createShell(root, {
    switchStation: (station) => controller?.switchStation(station),
    toggleLocale: () => controller?.setLocale(controller.getLocale() === 'ja' ? 'en' : 'ja'),
    toggleMute: () => controller?.toggleMute(),
    help: (opener) => controller?.showTutorial(opener),
    collection: () => controller?.openCollection(),
    finish: (opener) => controller?.requestIrreversible('finish', { type: 'FINISH' }, opener),
  });
  const stations = [STATIONS.CUT, STATIONS.MIX, STATIONS.SERVE];
  const scene = createKitchenScene(canvas, {
    dispatch(event, metadata) {
      if (metadata?.confirmation) {
        controller?.requestIrreversible(metadata.confirmation, event, canvas, metadata.followUp);
      } else {
        controller?.dispatch(event);
      }
    },
    playEffect(effect) {
      controller?.playEffect(effect);
    },
    onBackgroundSwipe(direction) {
      if (!controller) return;
      const currentIndex = stations.indexOf(controller.getState().station);
      const delta = direction === 'next' ? 1 : -1;
      const nextIndex = Math.min(stations.length - 1, Math.max(0, currentIndex + delta));
      if (nextIndex !== currentIndex) controller.switchStation(stations[nextIndex]);
    },
  });

  controller = createAppController({
    shell,
    scene,
    settings: save.settings,
    locale,
    persistence,
    audio,
    resultRoot: root.querySelector('#result-view'),
    collectionRoot: root.querySelector('#collection-view'),
    saveLocale: (nextLocale) => {
      try {
        storage?.setItem(LOCALE_KEY, nextLocale);
      } catch {
        // Locale remains active for this session when storage is blocked.
      }
    },
  });

  root.dataset.ready = 'true';
  canvas?.focus({ preventScroll: true });
}
