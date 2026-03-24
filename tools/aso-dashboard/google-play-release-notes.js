export const LOCALE_TAG_OVERRIDES = { 'es-mx': 'es-419' };

/** @param {string} fieldName - First-column label (`textContent` from the label cell) */
export function isReleaseNotesField(fieldName) {
  return fieldName.trim().replace(/\s+/g, ' ').toLowerCase() === 'release notes';
}

export function formatPlayLocaleTag(rawCode) {
  if (rawCode == null) return '';
  const key = String(rawCode).trim().replace(/^\//, '').toLowerCase();
  if (!key) return '';
  return LOCALE_TAG_OVERRIDES[key]
    ?? key.replace(/-([a-z0-9]+)/gi, (_, tail) => `-${tail.toUpperCase()}`);
}

function appendLocaleBlock(parts, tag, body) {
  parts.push(`<${tag}>\n\n${body}\n\n</${tag}>\n\n`);
}

/**
 * Concatenate per-locale release note strings into one paste blob.
 * Locales with empty or whitespace-only text are skipped.
 *
 * @param {string[]} languages - Column order (same keys as langData)
 * @param {Record<string, Record<string, string>>} langData - language -> field name -> value
 * @param {string} fieldName - Exact field key (e.g. "Release Notes")
 * @returns {string}
 */
export function buildGooglePlayReleaseNotesBlob(languages, langData, fieldName) {
  if (!languages?.length || !fieldName) return '';

  const chunks = [];
  languages.forEach((langKey) => {
    const raw = langData[langKey]?.[fieldName];
    const body = typeof raw === 'string' ? raw.trim() : '';
    if (!body) return;

    const tag = formatPlayLocaleTag(langKey);
    if (!tag) return;

    appendLocaleBlock(chunks, tag, body);
  });

  return chunks.join('').replace(/\n+$/, '');
}
