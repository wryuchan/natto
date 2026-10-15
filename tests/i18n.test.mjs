import assert from 'node:assert/strict';
import test from 'node:test';

import { ACHIEVEMENTS } from '../src/core/achievements.js';
import en from '../src/i18n/en.js';
import ja from '../src/i18n/ja.js';
import {
  createTranslator,
  formatUnlockedDate,
  resolveLocale,
} from '../src/systems/i18n.js';

function flattenKeys(value, prefix = '') {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return child && typeof child === 'object' && !Array.isArray(child)
      ? flattenKeys(child, path)
      : [path];
  });
}

test('valid query locale wins over saved and browser locale', () => {
  assert.equal(resolveLocale({
    query: '?lang=ja',
    saved: 'en',
    navigatorLanguage: 'en-US',
  }), 'ja');
  assert.equal(resolveLocale({
    query: '?lang=en',
    saved: 'ja',
    navigatorLanguage: 'ja-JP',
  }), 'en');
});

test('invalid query falls through to saved, navigator, then English', () => {
  assert.equal(resolveLocale({
    query: '?lang=de',
    saved: 'ja',
    navigatorLanguage: 'en-US',
  }), 'ja');
  assert.equal(resolveLocale({
    query: '?lang=de',
    saved: 'invalid',
    navigatorLanguage: 'ja-JP',
  }), 'ja');
  assert.equal(resolveLocale({
    query: '?lang=de',
    saved: null,
    navigatorLanguage: 'fr-FR',
  }), 'en');
});

test('Japanese and English contain identical flattened copy keys', () => {
  assert.deepEqual(flattenKeys(ja).sort(), flattenKeys(en).sort());
});

test('both locales contain every approved copy category and title name and hint', () => {
  const requiredKeys = [
    'shell.station.cut',
    'shell.station.mix',
    'shell.station.serve',
    'tutorial.page1.title',
    'tutorial.page2.body',
    'confirm.transferToBowl.body',
    'confirm.transferToRice.body',
    'confirm.finish.body',
    'results.heading',
    'results.licenses',
    'scores.cutting',
    'scores.mixing',
    'scores.taste',
    'scores.serving',
    'errors.webgl',
    'errors.asset',
    'save.disclosure.local',
    'save.disclosure.memory',
    'save.resetConfirm',
    'aria.canvas',
    'aria.language',
    'seo.title',
    'seo.description',
    'share.text',
  ];

  for (const locale of [ja, en]) {
    const keys = new Set(flattenKeys(locale));
    for (const key of requiredKeys) assert.ok(keys.has(key), key);
    for (const { id } of ACHIEVEMENTS) {
      assert.ok(keys.has(`achievements.${id}.name`), `${id} name`);
      assert.ok(keys.has(`achievements.${id}.hint`), `${id} hint`);
    }
  }
});

test('missing Japanese copy falls back to English and warns once per key', () => {
  const warnings = [];
  const translator = createTranslator('ja', {
    catalogs: {
      ja: { present: 'あります' },
      en: { present: 'Present', fallback: 'Hello {name} {unknown}' },
    },
    warn: (message) => warnings.push(message),
  });

  assert.equal(translator('fallback', { name: '<Natto>' }), 'Hello &lt;Natto&gt; {unknown}');
  assert.equal(translator('fallback', { name: '<Natto>' }), 'Hello &lt;Natto&gt; {unknown}');
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /fallback/);
});

test('interpolation preserves unknown placeholders and never returns undefined', () => {
  const warnings = [];
  const translator = createTranslator('en', {
    catalogs: { ja: {}, en: { greeting: 'Hi {name}; {missing}' } },
    warn: (message) => warnings.push(message),
  });

  assert.equal(translator('greeting', { name: 'A&B' }), 'Hi A&amp;B; {missing}');
  assert.equal(translator('absent'), '');
  assert.equal(warnings.length, 1);
});

test('unlocked dates use Intl.DateTimeFormat for the active locale', () => {
  const date = new Date('2026-10-12T00:00:00.000Z');
  assert.equal(
    formatUnlockedDate('ja', date),
    new Intl.DateTimeFormat('ja').format(date),
  );
  assert.equal(
    formatUnlockedDate('en', date),
    new Intl.DateTimeFormat('en').format(date),
  );
});
