import { loadConstantsValuesForPage } from '../../../../blocks/aso-app/constants-runtime.js';
import { buildHtmlSourcePath } from '../import-export/paths.js';
import {
  getKeywordsSidecar,
  getSourceText,
  getSpacingSidecar,
} from './da-source-client.js';

// Shared by Export and Publish so both resolve page content (text, spacing, keywords,
// constants) through exactly the same DA fetch path before handing it to collectExportData.
function createAdminFetch(org, repo, token) {
  const adminOrigin = `https://admin.da.live/source/${org}/${repo}`;
  return async (input) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url.startsWith('/')) {
      // .json/.html fetched verbatim; extensionless source paths get .html appended.
      const sourcePath = url.endsWith('.html') || url.endsWith('.json') ? url : `${url}.html`;
      return fetch(`${adminOrigin}${sourcePath}`, { headers: { Authorization: `Bearer ${token}` } });
    }
    return fetch(input);
  };
}

function createFetchPage(org, repo, token, adminFetch) {
  return async (_org, _repo, pagePath) => {
    const htmlPath = buildHtmlSourcePath(pagePath);
    const [html, spacingSidecar, keywordsSidecar] = await Promise.all([
      getSourceText(org, repo, htmlPath, token),
      getSpacingSidecar(org, repo, pagePath, token),
      getKeywordsSidecar(org, repo, pagePath, token),
    ]);
    const constantsValues = html !== null
      ? await loadConstantsValuesForPage({ pathname: pagePath, fetch: adminFetch })
      : {};
    return {
      html: html ?? '',
      htmlFound: html !== null,
      spacingSidecar,
      keywordsSidecar,
      constantsValues,
    };
  };
}

export { createAdminFetch, createFetchPage };
