/** Map translate `location` path segments to Google Play Console release-notes locale tags. */
export const LOCALE_TAG_OVERRIDES = {
  'es-mx': 'es-419',
  'fil-ph': 'fil',
  'id-id': 'id',
  'th-th': 'th',
  'uk-ua': 'uk',
  'vi-vn': 'vi',
  uk: 'en-GB',
};

/** @param {string} fieldName - First-column label (`textContent` from the label cell) */
export function isReleaseNotesField(fieldName) {
  return fieldName.trim().replace(/\s+/g, ' ').toLowerCase() === 'release notes';
}

function pathToPlayLocaleKey(localizedPath) {
  const path = String(localizedPath ?? '').trim();
  if (!path || path === '/') return 'en-us';
  return path.replace(/^\/+/, '').replace(/\/+$/, '').toLowerCase();
}

function resolvePlayLocaleKey(input) {
  if (input == null) return '';
  if (typeof input === 'object') {
    if (input.localizedPath) return pathToPlayLocaleKey(input.localizedPath);
    if (input.localizedCode) {
      return String(input.localizedCode).trim().replace(/^\//, '').toLowerCase();
    }
    return '';
  }
  const raw = String(input).trim();
  if (!raw) return '';
  if (raw.startsWith('/')) return pathToPlayLocaleKey(raw);
  return raw.toLowerCase();
}

/**
 * Map a translate.json `location` path (or language object) to a Play locale tag.
 * Prefer `language.localizedPath`; legacy locale-code strings still work.
 */
export function formatPlayLocaleTag(localizedPathOrLanguage) {
  const key = resolvePlayLocaleKey(localizedPathOrLanguage);
  if (!key) return '';
  return LOCALE_TAG_OVERRIDES[key]
    ?? key.replace(/-([a-z0-9]+)/gi, (_, tail) => `-${tail.toUpperCase()}`);
}

function languageDataKey(languageEntry) {
  if (typeof languageEntry === 'object' && languageEntry !== null) {
    return languageEntry.name
      || languageEntry.localizedCode
      || pathToPlayLocaleKey(languageEntry.localizedPath);
  }
  return languageEntry;
}

function appendLocaleBlock(parts, tag, body) {
  parts.push(`<${tag}>\n\n${body}\n\n</${tag}>\n\n`);
}

/**
 * Concatenate per-locale release note strings into one paste blob.
 * Locales with empty or whitespace-only text are skipped.
 *
 * @param {Array<string|object>} languages - language name objects or legacy locale keys
 * @param {Record<string, Record<string, string>>} langData - lookup key -> field name -> value
 * @param {string} fieldName - Exact field key (e.g. "Release Notes")
 * @returns {string}
 */
export function buildGooglePlayReleaseNotesBlob(languages, langData, fieldName) {
  if (!languages?.length || !fieldName) return '';

  const chunks = [];
  languages.forEach((languageEntry) => {
    const lookupKey = languageDataKey(languageEntry);
    const raw = langData[lookupKey]?.[fieldName];
    const body = typeof raw === 'string' ? raw.trim() : '';
    if (!body) return;

    const tag = formatPlayLocaleTag(languageEntry);
    if (!tag) return;

    appendLocaleBlock(chunks, tag, body);
  });

  return chunks.join('').replace(/\n+$/, '');
}
