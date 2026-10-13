import { PHASES, STATIONS } from '../core/game-state.js';
import { createTranslator } from '../systems/i18n.js';

const STATION_IDS = Object.freeze([STATIONS.CUT, STATIONS.MIX, STATIONS.SERVE]);
const CONFIRMATION_IDS = Object.freeze([
  'transferToBowl',
  'transferToRice',
  'finish',
  'restart',
]);

export function deriveShellModel(state, settings = {}, locale = 'en') {
  const t = createTranslator(locale);
  const skipConfirmations = settings.skipIrreversibleConfirmations === true;
  const confirmation = (id) => skipConfirmations ? null : {
    title: t(`confirm.${id}.title`),
    body: t(`confirm.${id}.body`),
    accept: t('confirm.accept'),
    cancel: t('confirm.cancel'),
  };

  return {
    state,
    locale,
    metadata: {
      title: t('seo.title'),
      description: t('seo.description'),
      aria: {
        canvas: t('aria.canvas'),
        language: t('aria.language'),
        mute: t('aria.mute'),
        help: t('aria.help'),
        stationTabs: t('aria.stationTabs'),
        finish: t('aria.finish'),
      },
    },
    tabs: STATION_IDS.map((id) => ({
      id,
      label: t(`shell.station.${id}`),
      active: state.station === id,
      disabled: state.phase !== PHASES.COOKING,
    })),
    controls: {
      language: t('shell.language'),
      mute: t(settings.muted ? 'shell.unmute' : 'shell.mute'),
      help: t('shell.help'),
      collection: t('shell.collection'),
      finish: t('shell.finish'),
      finishDisabled: state.phase !== PHASES.COOKING || state.serving.transferredRatio <= 0,
    },
    tutorial: {
      visible: settings.tutorialSeen !== true,
      pages: [1, 2].map((page) => ({
        title: t(`tutorial.page${page}.title`),
        body: t(`tutorial.page${page}.body`),
      })),
      next: t('tutorial.next'),
      back: t('tutorial.back'),
      start: t('tutorial.start'),
    },
    confirmations: Object.fromEntries(CONFIRMATION_IDS.map((id) => [id, confirmation(id)])),
    readyMessage: t('shell.ready'),
  };
}

export function createShell(root, callbacks = {}) {
  if (!root || typeof root.querySelector !== 'function') {
    throw new TypeError('createShell requires a root element');
  }

  const stationButtons = [...root.querySelectorAll('[data-station]')];
  const languageButton = root.querySelector('[data-action="language"]');
  const muteButton = root.querySelector('[data-action="mute"]');
  const helpButton = root.querySelector('[data-action="help"]');
  const collectionButton = root.querySelector('[data-action="collection"]');
  const finishButton = root.querySelector('[data-action="finish"]');
  const canvas = root.querySelector('#game-canvas');
  const appTitle = root.querySelector('.app-title');
  const stationNav = root.querySelector('.station-nav');
  const status = root.querySelector('#app-status');
  const dialog = root.querySelector('#app-dialog');
  const dialogTitle = root.querySelector('#dialog-title');
  const dialogBody = root.querySelector('#dialog-body');
  const acceptButton = root.querySelector('[data-dialog="accept"]');
  const cancelButton = root.querySelector('[data-dialog="cancel"]');
  const recoveryOverlay = root.querySelector('#recovery-overlay');
  const recoveryMessage = root.querySelector('[data-recovery-message]');
  const recoveryRetry = root.querySelector('[data-recovery="retry"]');
  const removers = [];
  const views = [...root.querySelectorAll('[data-view]')];
  let pendingAction = null;
  let restoreTarget = null;
  let recoveryAction = null;

  const listen = (element, type, listener) => {
    if (!element) return;
    element.addEventListener(type, listener);
    removers.push(() => element.removeEventListener(type, listener));
  };

  for (const button of stationButtons) {
    listen(button, 'click', () => callbacks.switchStation?.(button.dataset.station));
  }
  listen(languageButton, 'click', (event) => callbacks.toggleLocale?.(event.currentTarget));
  listen(muteButton, 'click', (event) => callbacks.toggleMute?.(event.currentTarget));
  listen(helpButton, 'click', (event) => callbacks.help?.(event.currentTarget));
  listen(collectionButton, 'click', (event) => callbacks.collection?.(event.currentTarget));
  listen(finishButton, 'click', (event) => callbacks.finish?.(event.currentTarget));
  listen(recoveryRetry, 'click', () => recoveryAction?.());

  const closeDialog = () => {
    if (dialog?.open) dialog.close();
    else restoreTarget?.focus?.();
  };
  listen(acceptButton, 'click', () => {
    const action = pendingAction;
    pendingAction = null;
    closeDialog();
    action?.();
  });
  listen(cancelButton, 'click', () => {
    pendingAction = null;
    closeDialog();
  });
  listen(dialog, 'close', () => {
    restoreTarget?.focus?.();
    restoreTarget = null;
    pendingAction = null;
  });

  const showDialog = (copy, action, opener) => {
    if (!dialog) return;
    restoreTarget = opener ?? root.ownerDocument?.activeElement ?? null;
    pendingAction = action;
    dialogTitle.textContent = copy.title;
    dialogBody.textContent = copy.body;
    acceptButton.textContent = copy.accept;
    cancelButton.textContent = copy.cancel;
    if (!dialog.open) dialog.showModal();
    acceptButton.focus();
  };

  return {
    render(model) {
      for (const button of stationButtons) {
        const tab = model.tabs.find(({ id }) => id === button.dataset.station);
        if (!tab) continue;
        button.textContent = tab.label;
        button.disabled = tab.disabled;
        button.setAttribute('aria-selected', String(tab.active));
      }
      if (languageButton) languageButton.textContent = model.controls.language;
      if (languageButton) languageButton.setAttribute('aria-label', model.metadata.aria.language);
      if (muteButton) {
        muteButton.textContent = model.controls.mute;
        muteButton.setAttribute('aria-label', model.metadata.aria.mute);
      }
      if (helpButton) {
        helpButton.textContent = model.controls.help;
        helpButton.setAttribute('aria-label', model.metadata.aria.help);
      }
      if (collectionButton) collectionButton.textContent = model.controls.collection;
      if (finishButton) {
        finishButton.textContent = model.controls.finish;
        finishButton.disabled = model.controls.finishDisabled;
        finishButton.setAttribute('aria-label', model.metadata.aria.finish);
      }
      const documentElement = root.ownerDocument?.documentElement;
      if (documentElement) documentElement.lang = model.locale;
      if (root.ownerDocument) {
        root.ownerDocument.title = model.metadata.title;
        const description = root.ownerDocument.querySelector?.('meta[name="description"]');
        description?.setAttribute?.('content', model.metadata.description);
        for (const selector of ['meta[property="og:title"]', 'meta[name="twitter:title"]']) {
          root.ownerDocument.querySelector?.(selector)?.setAttribute?.('content', model.metadata.title);
        }
        for (const selector of ['meta[property="og:description"]', 'meta[name="twitter:description"]']) {
          root.ownerDocument.querySelector?.(selector)?.setAttribute?.('content', model.metadata.description);
        }
      }
      if (appTitle) appTitle.textContent = model.metadata.title;
      canvas?.setAttribute?.('aria-label', model.metadata.aria.canvas);
      stationNav?.setAttribute?.('aria-label', model.metadata.aria.stationTabs);
    },
    showConfirmation: showDialog,
    showView(view) {
      for (const element of views) element.hidden = element.dataset.view !== view;
    },
    showTutorial(tutorial, onComplete, opener) {
      let pageIndex = 0;
      const showPage = () => {
        const page = tutorial.pages[pageIndex];
        showDialog({
          ...page,
          accept: pageIndex === tutorial.pages.length - 1 ? tutorial.start : tutorial.next,
          cancel: tutorial.back,
        }, () => {
          if (pageIndex < tutorial.pages.length - 1) {
            pageIndex += 1;
            showPage();
          } else {
            onComplete?.();
          }
        }, opener);
        if (cancelButton) cancelButton.disabled = pageIndex === 0;
      };
      showPage();
    },
    announce(message) {
      if (status) status.textContent = message;
    },
    showRecovery(model, retry) {
      recoveryAction = typeof retry === 'function' ? retry : null;
      if (recoveryMessage) recoveryMessage.textContent = model.message;
      if (recoveryRetry) {
        recoveryRetry.textContent = model.retryLabel;
        recoveryRetry.hidden = !model.actionable;
      }
      if (recoveryOverlay) recoveryOverlay.hidden = false;
      if (model.actionable) recoveryRetry?.focus?.();
    },
    hideRecovery() {
      recoveryAction = null;
      if (recoveryOverlay) recoveryOverlay.hidden = true;
    },
    dispose() {
      for (const remove of removers.splice(0)) remove();
      pendingAction = null;
      restoreTarget = null;
      recoveryAction = null;
    },
  };
}
