import { createTranslator } from './i18n.js';

const READY_STATUS = Object.freeze({
  kind: 'ready',
  actionable: false,
  assetId: null,
  message: '',
  retryLabel: '',
  serializedState: null,
});

function requireMethod(value, name, owner) {
  if (typeof value?.[name] !== 'function') {
    throw new TypeError(`${owner} requires ${name}()`);
  }
}

export function createRecoveryController({ scene, shell, rebuild } = {}) {
  requireMethod(scene, 'getState', 'createRecoveryController scene');
  requireMethod(scene, 'pause', 'createRecoveryController scene');
  if (!shell || typeof shell !== 'object') {
    throw new TypeError('createRecoveryController requires a shell view');
  }
  if (typeof rebuild !== 'function') {
    throw new TypeError('createRecoveryController requires rebuild()');
  }

  let status = READY_STATUS;
  let serializedState = null;
  let attachedTarget = null;
  let inFlight = null;
  let disposed = false;

  const translator = () => createTranslator(scene.getLocale?.() === 'ja' ? 'ja' : 'en');
  const snapshot = () => {
    serializedState = JSON.stringify(scene.getState());
    return serializedState;
  };
  const recoveryModel = (kind, { assetId = null, actionable = false } = {}) => {
    const t = translator();
    const message = kind === 'asset'
      ? t('errors.asset', { asset: assetId })
      : kind === 'webgl'
        ? t('errors.webgl')
        : kind === 'restoreFailed'
          ? t('errors.restoreFailed')
          : t('errors.contextLost');
    return Object.freeze({
      kind,
      actionable,
      assetId,
      message,
      retryLabel: t('errors.retry'),
      serializedState,
    });
  };
  const show = (kind, options) => {
    status = recoveryModel(kind, options);
    shell.showRecovery?.(status, status.actionable ? () => controller.retry() : null);
    shell.announce?.(status.message);
    return status;
  };
  const enterFailure = (kind, options) => {
    if (serializedState == null) snapshot();
    scene.pause();
    return show(kind, options);
  };

  const attemptRecovery = () => {
    if (disposed || inFlight) return inFlight ?? Promise.resolve(false);
    if (serializedState == null) snapshot();
    show('contextLost', { actionable: false });
    const exactSnapshot = serializedState;

    inFlight = (async () => {
      try {
        const state = JSON.parse(exactSnapshot);
        scene.setScene?.(null);
        const rebuiltScene = await rebuild(state);
        if (!rebuiltScene || typeof rebuiltScene !== 'object') {
          throw new Error('Scene rebuild did not return a scene');
        }
        scene.setScene?.(rebuiltScene);
        const renderResult = typeof scene.renderSceneFrame === 'function'
          ? scene.renderSceneFrame()
          : rebuiltScene.renderFrame?.();
        if (renderResult === false) throw new Error('Restored scene did not render');
        scene.resume?.();
        serializedState = null;
        status = READY_STATUS;
        shell.hideRecovery?.();
        return true;
      } catch (error) {
        if (typeof error?.assetId === 'string' && error.assetId.length > 0) {
          show('asset', { assetId: error.assetId, actionable: true });
        } else {
          show('restoreFailed', { actionable: true });
        }
        return false;
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  };

  const onContextLost = (event) => {
    event?.preventDefault?.();
    if (disposed || status.kind !== 'ready') return;
    enterFailure('contextLost', { actionable: false });
  };
  const onContextRestored = () => {
    if (disposed || status.kind !== 'contextLost') return;
    void attemptRecovery();
  };

  const controller = {
    getStatus: () => status,
    reportAssetFailure(assetId) {
      const safeId = String(assetId ?? 'unknown');
      serializedState = null;
      return enterFailure('asset', { assetId: safeId, actionable: true });
    },
    reportWebGLFailure() {
      serializedState = null;
      return enterFailure('webgl', { actionable: true });
    },
    retry() {
      if (!status.actionable) return Promise.resolve(false);
      return attemptRecovery();
    },
    attach(target) {
      if (!target || typeof target.addEventListener !== 'function') {
        throw new TypeError('RecoveryController.attach requires an event target');
      }
      if (attachedTarget === target) return;
      if (attachedTarget) controller.detach();
      attachedTarget = target;
      target.addEventListener('webglcontextlost', onContextLost);
      target.addEventListener('webglcontextrestored', onContextRestored);
    },
    detach() {
      attachedTarget?.removeEventListener?.('webglcontextlost', onContextLost);
      attachedTarget?.removeEventListener?.('webglcontextrestored', onContextRestored);
      attachedTarget = null;
    },
    whenSettled() {
      return inFlight ?? Promise.resolve(status.kind === 'ready');
    },
    dispose() {
      disposed = true;
      controller.detach();
    },
  };

  return controller;
}
