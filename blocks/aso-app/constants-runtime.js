import {
  DEFAULT_SOURCE_LANGUAGE_LABEL,
  constantsPathFromPagePath,
  hasConstantTokens,
  parseAllConstantsForLanguage,
  substituteConstantTokensInDom,
} from '../../utils/aso-constants.js';

const TRANSLATE_PATH = '/.da/translate.json';

let translateLanguagesPromise;
const constantsValuesByPath = new Map();

function pathSegments(pagePath) {
  return pagePath.replace(/\.html$/i, '').replace(/\/$/, '').split('/').filter(Boolean);
}

function cleanPagePath(pagePath) {
  if (!pagePath || typeof pagePath !== 'string') return '/';
  return pagePath.replace(/\.html$/i, '').replace(/\/$/, '') || '/';
}

function normalizePathPrefix(prefix) {
  if (!prefix || typeof prefix !== 'string') return '';
  const trimmed = prefix.trim().replace(/\/$/, '');
  if (!trimmed || trimmed === '/') return '';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function normalizeLocPathForTranslateMatch(pathname) {
  const path = cleanPagePath(pathname);
  if (!path.startsWith('/target-preview/')) return path;
  return path.replace(/^\/target-preview\//, '/langstore/');
}

export function isDaEditMode() {
  return window.location.href.includes('da.live/edit');
}

export function shouldResolveConstantsForDisplay() {
  return !isDaEditMode();
}

export function getLocaleCodeFromPath(pathname) {
  if (!pathname || typeof pathname !== 'string') return undefined;
  return pathSegments(pathname)[0]?.toLowerCase();
}

export function localeCodesFromTranslateEntry(locales) {
  if (!locales || typeof locales !== 'string') return [];
  return locales.split(',').map((loc) => {
    const trimmed = loc.trim();
    const segment = trimmed.startsWith('/')
      ? trimmed.split('/').find((part) => part?.trim() !== '')
      : trimmed;
    return segment?.toLowerCase();
  }).filter(Boolean);
}

function prefixesForLanguage(lang) {
  const prefixes = [];
  const locationPrefix = normalizePathPrefix(lang?.location);
  if (locationPrefix) prefixes.push(locationPrefix);
  localeCodesFromTranslateEntry(lang?.locales).forEach((code) => {
    prefixes.push(normalizePathPrefix(code));
  });
  return prefixes;
}

export function matchTranslateLanguage(pathname, languagesData) {
  if (!pathname || !languagesData?.length) return null;
  const path = normalizeLocPathForTranslateMatch(pathname);
  let match = null;
  languagesData.forEach((lang) => {
    prefixesForLanguage(lang).forEach((prefix) => {
      if (path === prefix || path.startsWith(`${prefix}/`)) {
        if (!match || prefix.length > match.prefix.length) {
          match = { lang, prefix };
        }
      }
    });
  });
  return match;
}

export function stripLocaleFromPagePath(pagePath) {
  const segments = pathSegments(pagePath);
  if (segments.length <= 1) return '/';
  return `/${segments.slice(1).join('/')}`;
}

export function stripLanguagePrefixFromPagePath(pagePath, prefix) {
  const path = cleanPagePath(pagePath);
  const normalizedPrefix = normalizePathPrefix(prefix);
  if (!normalizedPrefix) return path;
  if (path === normalizedPrefix) return '/';
  if (path.startsWith(`${normalizedPrefix}/`)) {
    return path.slice(normalizedPrefix.length) || '/';
  }
  return stripLocaleFromPagePath(pagePath);
}

export function languageNameForPath(pathname, languagesData) {
  return matchTranslateLanguage(pathname, languagesData)?.lang?.name
    ?? DEFAULT_SOURCE_LANGUAGE_LABEL;
}

export function constantsPathFromListingPath(pagePath, languagesData) {
  const normalizedPath = normalizeLocPathForTranslateMatch(pagePath);
  const match = matchTranslateLanguage(normalizedPath, languagesData);
  const contentPath = match
    ? stripLanguagePrefixFromPagePath(normalizedPath, match.prefix)
    : normalizedPath;
  return constantsPathFromPagePath(contentPath);
}

export function resetConstantsRuntimeCache() {
  translateLanguagesPromise = undefined;
  constantsValuesByPath.clear();
}

function loadTranslateLanguages(fetchImpl = fetch) {
  if (translateLanguagesPromise) return translateLanguagesPromise;
  translateLanguagesPromise = (async () => {
    try {
      const resp = await fetchImpl(TRANSLATE_PATH);
      if (!resp.ok) return null;
      const data = await resp.json();
      return data.languages?.data || null;
    } catch (error) {
      console.error('Error fetching translate.json:', error);
      return null;
    }
  })();
  return translateLanguagesPromise;
}

async function fetchConstantsValues({ pathname, fetchImpl = fetch }) {
  try {
    const languagesData = await loadTranslateLanguages(fetchImpl);
    const constantsPath = constantsPathFromListingPath(pathname, languagesData);
    const constantsResp = await fetchImpl(constantsPath);
    if (!constantsResp?.ok) return {};
    const html = await constantsResp.text();
    const languageName = languageNameForPath(pathname, languagesData);
    return parseAllConstantsForLanguage(html, languageName);
  } catch (error) {
    console.error('Error fetching constants file:', error);
    return {};
  }
}

export async function loadConstantsValuesForPage({
  pathname = window.location.pathname,
  fetch: fetchImpl = fetch,
} = {}) {
  if (constantsValuesByPath.has(pathname)) {
    return constantsValuesByPath.get(pathname);
  }
  const valuesPromise = fetchConstantsValues({ pathname, fetchImpl });
  constantsValuesByPath.set(pathname, valuesPromise);
  return valuesPromise;
}

export function applyConstantsToDisplay(dataEl, constantsValues = {}, { resolveForDisplay } = {}) {
  const shouldResolve = resolveForDisplay ?? shouldResolveConstantsForDisplay();
  if (!shouldResolve || !dataEl || !hasConstantTokens(dataEl.innerHTML)) return;
  substituteConstantTokensInDom(dataEl, constantsValues);
}
