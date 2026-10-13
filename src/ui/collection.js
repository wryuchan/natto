import { ACHIEVEMENTS } from '../core/achievements.js';
import { createTranslator, formatUnlockedDate } from '../systems/i18n.js';

const SCORE_IDS = Object.freeze(['cutting', 'mixing', 'taste', 'serving']);

function actionButton(document, label, action, callback) {
  const element = document.createElement('button');
  element.type = 'button';
  element.textContent = label;
  element.dataset.action = action;
  element.addEventListener('click', () => callback?.());
  return element;
}

export function buildCollectionModel(save = {}, locale = 'en', persistenceMode = 'local') {
  const t = createTranslator(locale);
  const saved = save?.achievements ?? {};
  const entries = ACHIEVEMENTS.map(({ id, kind }) => {
    const record = saved[id];
    if (!record) {
      return {
        id,
        kind,
        unlocked: false,
        silhouette: true,
        hint: t(`achievements.${id}.hint`),
      };
    }
    return {
      id,
      kind,
      unlocked: true,
      silhouette: false,
      name: t(`achievements.${id}.name`),
      hint: t(`achievements.${id}.hint`),
      unlockedAt: record.unlockedAt,
      unlockedDate: formatUnlockedDate(locale, record.unlockedAt),
      bestOverall: record.bestOverall,
      bestScores: { ...record.bestScores },
    };
  });

  return {
    locale,
    entries,
    copy: {
      heading: t('results.collection'),
      locked: t('results.locked'),
      unlockedOn: (date) => t('results.unlockedOn', { date }),
      overall: t('scores.overall'),
      scoreLabels: Object.fromEntries(SCORE_IDS.map((id) => [id, t(`scores.${id}`)])),
      close: t('confirm.cancel'),
      reset: t('save.reset'),
      resetConfirm: t('save.resetConfirm'),
      resetDone: t('save.resetDone'),
      confirm: t('confirm.accept'),
      cancel: t('confirm.cancel'),
      disclosure: t(persistenceMode === 'memory' ? 'save.disclosure.memory' : 'save.disclosure.local'),
    },
  };
}

export function renderCollection(root, model, callbacks = {}) {
  if (!root?.ownerDocument || typeof root.replaceChildren !== 'function') {
    throw new TypeError('renderCollection requires a DOM root');
  }
  const document = root.ownerDocument;
  const panel = document.createElement('section');
  panel.className = 'collection-panel';
  const heading = document.createElement('h2');
  heading.textContent = model.copy.heading;
  panel.append(heading);
  const disclosure = document.createElement('p');
  disclosure.className = 'save-disclosure';
  disclosure.textContent = model.copy.disclosure;
  panel.append(disclosure);

  const grid = document.createElement('ul');
  grid.className = 'collection-grid';
  for (const entry of model.entries) {
    const item = document.createElement('li');
    item.className = `collection-card ${entry.unlocked ? 'is-unlocked' : 'is-locked'}`;
    const name = document.createElement('h3');
    name.textContent = entry.unlocked ? entry.name : '●●●';
    item.append(name);

    if (entry.unlocked) {
      const date = document.createElement('p');
      date.textContent = model.copy.unlockedOn(entry.unlockedDate);
      const overall = document.createElement('p');
      overall.textContent = `${model.copy.overall}: ${entry.bestOverall}`;
      const scores = document.createElement('dl');
      for (const id of SCORE_IDS) {
        const term = document.createElement('dt');
        term.textContent = model.copy.scoreLabels[id];
        const value = document.createElement('dd');
        value.textContent = String(entry.bestScores[id]);
        scores.append(term, value);
      }
      item.append(date, overall, scores);
    } else {
      const locked = document.createElement('p');
      locked.textContent = model.copy.locked;
      const hint = document.createElement('p');
      hint.textContent = entry.hint;
      item.append(locked, hint);
    }
    grid.append(item);
  }
  panel.append(grid);

  const actions = document.createElement('div');
  actions.className = 'collection-actions';
  actions.append(
    actionButton(document, model.copy.close, 'close', callbacks.close),
    actionButton(document, model.copy.reset, 'reset', callbacks.reset),
  );
  panel.append(actions);
  root.replaceChildren(panel);
  return panel;
}
