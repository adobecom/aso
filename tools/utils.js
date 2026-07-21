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
    label: language.name,
    name: language.name,
    sourcePath: language.sourcePath,
    localizedPath: language.localizedPath,
    isManagedLocale: language.isManagedLocale,
  }));
}
