import { evaluateAchievements } from '../core/achievements.js';
import { scoreGame } from '../core/scoring.js';
import { createTranslator } from '../systems/i18n.js';

const SCORE_IDS = Object.freeze(['cutting', 'mixing', 'taste', 'serving']);

function button(document, label, action, callback) {
  const element = document.createElement('button');
  element.type = 'button';
  element.textContent = label;
  element.dataset.action = action;
  element.addEventListener('click', () => callback?.());
  return element;
}

export function buildResultModel(state, previousSave = {}, locale = 'en') {
  const t = createTranslator(locale);
  const scores = scoreGame(state);
  const evaluated = evaluateAchievements(state, scores);
  const achievements = previousSave?.achievements ?? {};
  const primary = evaluated.primaryId ? {
    id: evaluated.primaryId,
    name: t(`achievements.${evaluated.primaryId}.name`),
    newlyUnlocked: !Object.hasOwn(achievements, evaluated.primaryId),
  } : null;
  const newlyUnlockedSpecials = evaluated.specialIds
    .filter((id) => !Object.hasOwn(achievements, id))
    .map((id) => ({ id, name: t(`achievements.${id}.name`) }));

  return {
    locale,
    scores,
    scoreRows: SCORE_IDS.map((id) => ({ id, label: t(`scores.${id}`), value: scores[id] })),
    primary,
    primaryId: evaluated.primaryId,
    specialIds: [...evaluated.specialIds],
    newlyUnlockedSpecials,
    copy: {
      heading: t('results.heading'),
      primaryTitle: t('results.primaryTitle'),
      newlyUnlocked: t('results.newlyUnlocked'),
      overall: t('scores.overall'),
      playAgain: t('results.playAgain'),
      collection: t('results.collection'),
      share: t('results.share'),
      returnHome: t('results.returnHome'),
    },
  };
}

export function buildShareText(result, locale = 'en', url = 'https://wataryuu.com/natto/') {
  const t = createTranslator(locale);
  return t('share.text', {
    title: result?.primary?.name ?? '',
    overall: result?.scores?.overall ?? 0,
    url,
  });
}

export function renderResults(root, model, callbacks = {}) {
  if (!root?.ownerDocument || typeof root.replaceChildren !== 'function') {
    throw new TypeError('renderResults requires a DOM root');
  }
  const document = root.ownerDocument;
  const panel = document.createElement('section');
  panel.className = 'result-panel';

  const heading = document.createElement('h2');
  heading.textContent = model.copy.heading;
  panel.append(heading);

  const titleLabel = document.createElement('p');
  titleLabel.className = 'eyebrow';
  titleLabel.textContent = model.copy.primaryTitle;
  const title = document.createElement('h3');
  title.className = 'result-title';
  title.textContent = model.primary?.name ?? '';
  panel.append(titleLabel, title);

  const overall = document.createElement('p');
  overall.className = 'overall-score';
  overall.textContent = `${model.copy.overall}: ${model.scores.overall}`;
  panel.append(overall);

  const scores = document.createElement('div');
  scores.className = 'score-list';
  for (const row of model.scoreRows) {
    const score = document.createElement('div');
    score.className = 'score-row';
    const label = document.createElement('span');
    label.textContent = row.label;
    const value = document.createElement('strong');
    value.textContent = String(row.value);
    const bar = document.createElement('div');
    bar.className = 'score-bar';
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-label', row.label);
    bar.setAttribute('aria-valuemin', '0');
    bar.setAttribute('aria-valuemax', '100');
    bar.setAttribute('aria-valuenow', String(row.value));
    const fill = document.createElement('span');
    fill.className = 'score-bar-fill';
    fill.style?.setProperty?.('--score', `${row.value}%`);
    bar.append(fill);
    score.append(label, value, bar);
    scores.append(score);
  }
  panel.append(scores);

  if (model.newlyUnlockedSpecials.length > 0) {
    const unlocked = document.createElement('section');
    unlocked.className = 'new-unlocks';
    const unlockedHeading = document.createElement('h3');
    unlockedHeading.textContent = model.copy.newlyUnlocked;
    unlocked.append(unlockedHeading);
    for (const achievement of model.newlyUnlockedSpecials) {
      const name = document.createElement('p');
      name.textContent = achievement.name;
      unlocked.append(name);
    }
    panel.append(unlocked);
  }

  const actions = document.createElement('div');
  actions.className = 'result-actions';
  actions.append(
    button(document, model.copy.playAgain, 'replay', callbacks.replay),
    button(document, model.copy.collection, 'collection', callbacks.collection),
    button(document, model.copy.share, 'share', callbacks.share),
  );
  const home = document.createElement('a');
  home.href = '../';
  home.textContent = model.copy.returnHome;
  actions.append(home);
  panel.append(actions);
  root.replaceChildren(panel);
  return panel;
}
