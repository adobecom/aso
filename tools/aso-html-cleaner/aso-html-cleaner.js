/**
 * HTML Cleaner: Clean up document — fix literal tags (e.g. &lt;h1&gt;) in ASO data cells
 * and save via DA Source API.
 * DA Source API: https://docs.da.live/developers/api/source
 * Plugin guide: https://docs.da.live/developers/guides/developing-apps-and-plugins#plugin-example
 */
import DA_SDK from 'https://da.live/nx/utils/sdk.js';
import { authFetch } from '../utils.js';
import {
  buildSourceUrl,
  cleanCellContentForDocument,
} from './aso-html-cleaner-core.js';

async function putPageContent(org, repo, path, html, token) {
  const url = buildSourceUrl(org, repo, path);
  const formData = new FormData();
  formData.append('data', new Blob([html], { type: 'text/html' }));
  const resp = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  return {
    ok: resp.ok,
    status: resp.status,
    statusText: resp.statusText,
    method: 'POST',
  };
}

async function handleCleanupDocument(elements) {
  const { button, errorSection, errorMessage, statusSection, statusMessage } = elements;
  errorSection.classList.add('hidden');
  button.disabled = true;
  try {
    const { context, token } = await DA_SDK;
    const { org, repo, path } = context;
    if (!path) {
      errorMessage.textContent = 'Open this tool from a document to clean the current page.';
      errorSection.classList.remove('hidden');
      button.disabled = false;
      return;
    }
    const fetchUrl = buildSourceUrl(org, repo, path);
    const html = await authFetch(fetchUrl, token, 'page', 'html');
    if (!html) {
      errorMessage.textContent = 'Could not load the current page.';
      errorSection.classList.remove('hidden');
      button.disabled = false;
      return;
    }
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const rows = doc.querySelectorAll('.aso-app > div');
    let changed = 0;
    let scanned = 0;
    rows.forEach((row) => {
      const cols = row.children;
      if (cols.length < 2) return;
      scanned += 1;
      const dataEl = cols[1];
      const raw = dataEl.innerHTML;
      const cleaned = cleanCellContentForDocument(raw);
      if (cleaned !== raw) {
        dataEl.innerHTML = cleaned;
        changed += 1;
      }
    });
    if (scanned === 0) {
      errorMessage.textContent = 'No ASO blocks found on this page. Add .aso-app blocks or check the page path.';
      errorSection.classList.remove('hidden');
      button.disabled = false;
      return;
    }
    if (changed === 0) {
      statusMessage.textContent = `Scanned ${scanned} cell(s). No changes needed.`;
      statusSection.classList.remove('hidden');
      setTimeout(() => statusSection.classList.add('hidden'), 2000);
      button.disabled = false;
      return;
    }
    const fullHtml = `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`;
    const saveResult = await putPageContent(org, repo, path, fullHtml, token);
    if (!saveResult.ok) {
      errorMessage.textContent = `Save failed: ${saveResult.status} ${saveResult.statusText}. Check permissions.`;
      errorSection.classList.remove('hidden');
      button.disabled = false;
      return;
    }
    statusMessage.textContent = `Cleaned ${changed} cell(s) and saved. Reload the document in the editor to see changes.`;
    statusSection.classList.remove('hidden');
    setTimeout(() => statusSection.classList.add('hidden'), 3000);
  } catch (e) {
    errorMessage.textContent = `Clean up failed: ${e.message}`;
    errorSection.classList.remove('hidden');
  }
  button.disabled = false;
}

(async function init() {
  await DA_SDK;
  const heading = document.createElement('h2');
  heading.textContent = 'HTML Cleaner';
  heading.className = 'heading';

  const hint = document.createElement('p');
  hint.textContent = 'Fix content where HTML tags appear as text (e.g. <h1>). Cleans ASO data cells on the current page and saves. Reload the document in the editor after cleaning.';
  hint.className = 'hint';

  const button = document.createElement('button');
  button.textContent = 'Clean up';
  button.className = 'button button-primary';
  button.id = 'cleanup-doc-button';

  const errorSection = document.createElement('div');
  errorSection.id = 'error-section';
  errorSection.className = 'error-section hidden';
  const errorMessage = document.createElement('p');
  errorMessage.id = 'error-message';
  errorSection.appendChild(errorMessage);

  const statusSection = document.createElement('div');
  statusSection.id = 'status-section';
  statusSection.className = 'status-section hidden';
  const statusMessage = document.createElement('p');
  statusMessage.id = 'status-message';
  statusSection.appendChild(statusMessage);

  button.addEventListener('click', () => handleCleanupDocument({
    button,
    errorSection,
    errorMessage,
    statusSection,
    statusMessage,
  }));

  const container = document.createElement('div');
  container.className = 'container';
  container.append(heading, hint, button, errorSection, statusSection);
  document.body.append(container);
}());
