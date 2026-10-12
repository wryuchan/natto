import en from '../i18n/en.js';
import ja from '../i18n/ja.js';

const VALID_LOCALES = new Set(['ja', 'en']);

function flatten(value, prefix = '', output = {}) {
  for (const [key, child] of Object.entries(value ?? {})) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === 'object' && !Array.isArray(child)) {
      flatten(child, path, output);
    } else {
      output[path] = child;
    }
  }
  return output;
}

function localeFromQuery(query) {
  if (query instanceof URLSearchParams) return query.get('lang');
  if (typeof query !== 'string') return null;
  return new URLSearchParams(query.startsWith('?') ? query.slice(1) : query).get('lang');
}

export function resolveLocale({ query = '', saved = null, navigatorLanguage = '' } = {}) {
  const queryLocale = localeFromQuery(query);
  if (VALID_LOCALES.has(queryLocale)) return queryLocale;
  if (VALID_LOCALES.has(saved)) return saved;
  if (typeof navigatorLanguage === 'string' && navigatorLanguage.toLowerCase().startsWith('ja')) {
    return 'ja';
  }
  return 'en';
}

function escapeValue(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function createTranslator(locale, options = {}) {
  const activeLocale = VALID_LOCALES.has(locale) ? locale : 'en';
  const catalogs = options.catalogs ?? { ja, en };
  const messages = {
    ja: flatten(catalogs.ja),
    en: flatten(catalogs.en),
  };
  const warn = options.warn ?? console.warn;
  const warnedKeys = new Set();

  return (key, params = {}) => {
    let template = messages[activeLocale][key];
    if (typeof template !== 'string') {
      template = messages.en[key];
      if (!warnedKeys.has(key)) {
        warnedKeys.add(key);
        warn(`Missing ${activeLocale} translation: ${key}`);
      }
    }
    if (typeof template !== 'string') return '';

    return template.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (placeholder, name) =>
      Object.hasOwn(params, name) && params[name] !== undefined
        ? escapeValue(params[name])
        : placeholder
    );
  };
}

export function formatUnlockedDate(locale, value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const activeLocale = VALID_LOCALES.has(locale) ? locale : 'en';
  return new Intl.DateTimeFormat(activeLocale).format(date);
}
