import { fetchLanguageIndex } from './aso-dashboard/js/lib/translate-paths.js';

export async function authFetch(url, token, errorContext, mimeType = 'json', cacheBust = false) {
  try {
    const fetchUrl = cacheBust ? `${url}${url.includes('?') ? '&' : '?'}cb=${Date.now()}` : url;
    const resp = await fetch(fetchUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (!resp.ok) {
      console.error(`Failed to fetch ${errorContext}:`, resp.status);
      return null;
    }
    return mimeType === 'json' ? await resp.json() : await resp.text();
  } catch (error) {
    console.error(`Error fetching ${errorContext}:`, error);
    return null;
  }
}

export async function fetchLanguages({ context, token, configFile } = {}) {
  const index = await fetchLanguageIndex({ context, token, configFile });
  return index.map((language) => ({
    code: language.localizedCode,
    translateCode: language.code,
    label: language.name,
    name: language.name,
    sourcePath: language.sourcePath,
    localizedPath: language.localizedPath,
    isManagedLocale: language.isManagedLocale,
  }));
}

const STORE_PUBLISH_CONFIG_FILE = 'store-publish.json';
const STORE_PUBLISH_API_KEY = 'store-publish.api';
const storePublishConfigCache = new Map();

// "Stage", " DEV " -> "stage", "dev"
export function normalizeEnv(env) {
  return String(env ?? '').toLowerCase().replace(/\s+/g, '');
}

export function getEnvOverride() {
  return normalizeEnv(new URLSearchParams(window.location.search).get('env')) || undefined;
}

export async function fetchStorePublishConfig({ context, token } = {}) {
  const { org, repo } = context;
  const cacheKey = `${org}/${repo}`;
  if (storePublishConfigCache.has(cacheKey)) return storePublishConfigCache.get(cacheKey);
  const data = await authFetch(
    `https://admin.da.live/source/${org}/${repo}/.da/${STORE_PUBLISH_CONFIG_FILE}`,
    token,
    STORE_PUBLISH_CONFIG_FILE,
  );
  if (data) storePublishConfigCache.set(cacheKey, data);
  return data;
}

export function resolveStorePublishApi(config, env) {
  const suffix = normalizeEnv(env);
  const key = suffix ? `${STORE_PUBLISH_API_KEY}.${suffix}` : STORE_PUBLISH_API_KEY;
  const entry = (config?.config?.data || []).find((row) => String(row.key ?? '').trim() === key);
  const value = String(entry?.value ?? '').trim().replace(/\/+$/, '');
  if (!value) throw new Error(`Publish API is not configured: missing "${key}" in .da/${STORE_PUBLISH_CONFIG_FILE}.`);
  return value;
}

export async function getStorePublishApi({ context, token, env = getEnvOverride() } = {}) {
  const config = await fetchStorePublishConfig({ context, token });
  if (!config) throw new Error(`Could not load .da/${STORE_PUBLISH_CONFIG_FILE}.`);
  return resolveStorePublishApi(config, env);
}

export async function fetchAppLanguages({ context, token } = {}) {
  const config = await fetchStorePublishConfig({ context, token });
  return config?.['app-languages']?.data || [];
}

// Keeps only languages (by translate.json code) listed for the app + platform;
// apps absent from the sheet are unfiltered.
export function filterLanguagesForApp(languages, appLanguages, app, platform) {
  const norm = (value) => String(value ?? '').trim().toLowerCase();
  const row = appLanguages.find(
    (r) => norm(r.app) === norm(app) && norm(r.platform) === norm(platform),
  );
  if (!row) return languages;
  const allowed = new Set(String(row.languages ?? '').split(',').map(norm).filter(Boolean));
  return languages.filter((language) => allowed.has(norm(language.translateCode)));
}
