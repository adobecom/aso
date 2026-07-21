import { authFetch } from '../../../utils.js';

const languageIndexCache = new Map();

function parseSourceLanguageName(translateData) {
  const rows = translateData?.config?.data;
  if (!Array.isArray(rows)) return null;
  const row = rows.find((entry) => entry?.key === 'source.language');
  return row?.value?.trim() || null;
}

function getEnglishLanguage(languages, sourceLanguageName) {
  const key = (sourceLanguageName || '').trim();
  if (!languages?.length || !key) return null;
  return languages.find((entry) => (entry?.name || '').trim() === key) || null;
}

function normalizePathPrefix(value) {
  if (value == null || !String(value).trim()) return null;
  let path = String(value).trim();
  if (!path.startsWith('/')) path = `/${path}`;
  path = path.replace(/\/+$/, '');
  return path || '/';
}

function normalizeLocaleSegment(value, rootLocaleCode) {
  const prefix = normalizePathPrefix(value);
  if (!prefix) return null;
  if (prefix === '/') {
    return rootLocaleCode ? String(rootLocaleCode).toLowerCase() : null;
  }
  return prefix.replace(/^\/+/, '').toLowerCase();
}

function getSourcePath(entry) {
  return normalizePathPrefix(entry?.source);
}

function getLocalizedPath(entry) {
  return normalizePathPrefix(entry?.location);
}

function buildLanguageContext(languages, translateData) {
  const sourceLanguageName = parseSourceLanguageName(translateData);
  const english = getEnglishLanguage(languages, sourceLanguageName);
  return {
    sourceLanguageName,
    englishSourcePath: getSourcePath(english),
    englishLocaleCode: english?.code ? String(english.code).toLowerCase() : null,
  };
}

function isManagedLocale(entry, context) {
  const name = (entry?.name || '').trim();
  if (context?.sourceLanguageName && name === context.sourceLanguageName) return true;

  const source = getSourcePath(entry);
  if (!source || !context?.englishSourcePath) return false;

  return source.toLowerCase() !== context.englishSourcePath.toLowerCase();
}

function buildLanguageFromEntry(entry, context) {
  const name = (entry?.name || '').trim();
  if (!name) return null;

  const localizedPath = getLocalizedPath(entry);
  if (!localizedPath) return null;

  const { englishSourcePath } = context;
  const sourcePath = getSourcePath(entry) || englishSourcePath;
  if (!sourcePath) return null;

  return {
    name,
    code: entry?.code,
    sourcePath,
    localizedPath,
    localizedCode: normalizeLocaleSegment(localizedPath, context.englishLocaleCode),
    isManagedLocale: isManagedLocale(entry, context),
  };
}

function parseTranslateLanguages(data) {
  return data?.languages?.data || [];
}

function translateConfigUrl(org, repo, configFile) {
  return `https://admin.da.live/source/${org}/${repo}/.da/${configFile}`;
}

export function buildLanguageIndex(languages, translateData) {
  if (!languages?.length) return [];
  const context = buildLanguageContext(languages, translateData);
  return languages
    .map((entry) => buildLanguageFromEntry(entry, context))
    .filter(Boolean);
}

export function getLanguageByName(name, languages, translateData) {
  const key = (name || '').trim();
  if (!key) return null;
  return buildLanguageIndex(languages, translateData).find((language) => language.name === key) || null;
}

export async function fetchLanguageIndex({
  context,
  token,
  configFile = 'translate.json',
  fetchImpl = authFetch,
}) {
  if (languageIndexCache.has(configFile)) return languageIndexCache.get(configFile);

  const { org, repo } = context;
  const data = await fetchImpl(
    translateConfigUrl(org, repo, configFile),
    token,
    configFile,
  );

  if (!data) return [];

  const index = buildLanguageIndex(parseTranslateLanguages(data), data);
  languageIndexCache.set(configFile, index);
  return index;
}
