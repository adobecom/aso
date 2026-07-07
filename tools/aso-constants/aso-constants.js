// eslint-disable-next-line import/no-unresolved -- DA SDK is loaded from CDN at runtime
import DA_SDK from 'https://da.live/nx/utils/sdk.js';
import { collectConstantSlugsFromBlocks } from '../../utils/aso-constants.js';
import { constantsPathFromListingPath } from '../../blocks/aso-app/constants-runtime.js';
import { authFetch, fetchLanguages } from '../utils.js';
import { fetchHTML, mergeConstantsHtml, parseHtml } from './utils.js';

const displayMessage = (type, message) => {
  document.getElementById(`${type}-message`).innerHTML = message;
  document.getElementById(`${type}-section`).classList.remove('hidden');
};
const hideMessages = () => {
  document.getElementById('status-section').classList.add('hidden');
  document.getElementById('error-section').classList.add('hidden');
};

async function fetchPageHTML(org, repo, path, token) {
  const htmlPath = path.endsWith('.html') ? path : `${path}.html`;
  const url = `https://admin.da.live/source/${org}/${repo}${htmlPath}`;
  return fetchHTML(url, token, 'page HTML', true);
}

async function fetchTranslateLanguages(org, repo, token) {
  const data = await authFetch(
    `https://admin.da.live/source/${org}/${repo}/.da/translate.json`,
    token,
    'languages',
  );
  return data?.languages?.data || [];
}

async function fetchExistingConstants(org, repo, constantsPath, token) {
  return authFetch(
    `https://admin.da.live/source/${org}/${repo}${constantsPath}.html`,
    token,
    'existing constants',
    'html',
    true,
  );
}

async function saveHtmlFile(org, repo, filePath, html, token, errorContext) {
  try {
    const formData = new FormData();
    const blob = new Blob([html], { type: 'text/html' });
    formData.append('data', blob);
    const resp = await fetch(`https://admin.da.live/source/${org}/${repo}${filePath}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    if (!resp.ok) {
      const errorText = await resp.text();
      // eslint-disable-next-line no-console -- surfaced to plugin UI; log aids admin diagnosis
      console.error(`Failed to save ${errorContext}:`, resp.status, errorText);
      return false;
    }
    return true;
  } catch (error) {
    // eslint-disable-next-line no-console -- surfaced to plugin UI; log aids admin diagnosis
    console.error(`Error saving ${errorContext}:`, error);
    return false;
  }
}

async function handleGenerate() {
  const button = document.getElementById('generate-button');
  button.disabled = true;
  hideMessages();
  displayMessage('status', 'Fetching constants...');
  try {
    const { context, token } = await DA_SDK;
    const { org, repo, path } = context;
    const html = await fetchPageHTML(org, repo, path, token);
    if (!html) {
      displayMessage('error', 'Failed to load page content.');
      button.disabled = false;
      return;
    }
    const doc = parseHtml(html);
    const slugs = collectConstantSlugsFromBlocks(doc);
    if (slugs.length === 0) {
      displayMessage('error', 'No {{slug}} tokens found in ASO blocks on this page.');
      button.disabled = false;
      return;
    }
    const languages = await fetchLanguages({ context, token });
    if (languages.length === 0) {
      displayMessage('error', 'Failed to load languages.');
      button.disabled = false;
      return;
    }
    const translateLanguages = await fetchTranslateLanguages(org, repo, token);
    const constantsPath = constantsPathFromListingPath(path, translateLanguages);
    const existingHtml = await fetchExistingConstants(org, repo, constantsPath, token);
    const { html: finalHtml, orphanedSlugs } = mergeConstantsHtml({
      slugs,
      languages,
      existingHtml,
    });
    const saved = await saveHtmlFile(org, repo, `${constantsPath}.html`, finalHtml, token, 'constants');
    if (!saved) {
      displayMessage('error', 'Failed to save constants file.');
      button.disabled = false;
      return;
    }

    window.open(`https://da.live/edit#/${org}/${repo}${constantsPath}`, '_blank');
    hideMessages();
    const action = existingHtml ? 'Updated' : 'Created';
    const slugList = slugs.join(', ');
    let statusMsg = `${action} constants file and opened it in a new tab.<br/>Slugs: ${slugList}`;
    if (orphanedSlugs.length > 0) {
      statusMsg = `${statusMsg}<br/>Slugs in constants file but not on page:<br/>${orphanedSlugs.join('<br/>')}`;
    }
    displayMessage('status', statusMsg);
    button.disabled = false;
  } catch (error) {
    // eslint-disable-next-line no-console -- surfaced to plugin UI; log aids admin diagnosis
    console.error('Error generating constants:', error);
    displayMessage('error', 'Unexpected error. Contact admin.');
    button.disabled = false;
  }
}

(function init() {
  document.getElementById('generate-button').addEventListener('click', handleGenerate);
}());
