export async function authFetch(url, token, errorContext, mimeType = 'json') {
  try {
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
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

let languagesCache = null;

export async function fetchLanguages({ context, token }) {
  if (languagesCache) return languagesCache;
  const { org, repo } = context;
  const data = await authFetch(
    `https://admin.da.live/source/${org}/${repo}/.da/translate.json`,
    token,
    'languages',
  );
  if (!data?.languages?.data) return [];
  languagesCache = data.languages.data.map((lang) => ({
    code: lang.locales.toLowerCase(),
    label: lang.name,
  }));
  return languagesCache;
}
