import { buildContentPath } from './lib/content-taxonomy.js';
import {
  getSelectedTestNames,
  isStoreTestsScope,
  readStoreType,
  STORE_TYPE_TESTS,
} from './store-scope-settings.js';
import {
  isReleasePeriodComplete,
  readReleasePeriod,
} from './release-period-settings.js';
import { listMediaAssetFields, listSchemaFields } from './import-export/page-map.js';
import { buildHtmlSourcePath } from './import-export/paths.js';
import { getSourceText } from './lib/da-source-client.js';
import {
  fetchBlockSchema,
  fetchProducts,
  fetchLanguages,
  fetchSheetBlockMap,
  getConfigFileOverride,
  getRelativeProductsPath,
} from './lib/utils.js';

const PREVIEW_HOST = 'https://main--aso--adobecom.aem.page';

const BLOCK_TYPE_LABELS = {
  listing: 'Metadata',
  'images-videos': 'Images & Videos',
  'media-assets': 'Media Assets',
};

let languageIndexByName = new Map();
let schemaCache = null;
let sheetMapCache = null;
let previewContext = null;

function getDropdownValues() {
  return {
    product: document.getElementById('product')?.value,
    languageName: document.getElementById('language')?.value,
    device: document.getElementById('device')?.value,
  };
}

// One section per distinct page leaf, not per field — many fields (every screenshot copy,
// every media-assets slot) share a single page, so deduping by pageLeaf avoids showing the
// same page over and over. Pure/exported for testability, matching this project's
// convention for network-adjacent logic (see buildProductExportArtifacts, collectExportData).
function buildPreviewSections(schema, sheetMap, {
  product,
  language,
  device,
  releasePeriod,
  storeType,
  testName,
}) {
  if (!schema || !product || !language || !device || !isReleasePeriodComplete(releasePeriod)) {
    return [];
  }
  if (storeType === STORE_TYPE_TESTS && !testName) return [];

  const productsPath = getRelativeProductsPath();
  const seenLeaves = new Set();
  const sections = [];

  Object.entries(BLOCK_TYPE_LABELS).forEach(([blockType, label]) => {
    const fields = blockType === 'media-assets'
      ? listMediaAssetFields(schema, device)
      : listSchemaFields(schema, sheetMap, device, blockType);

    fields.forEach((field) => {
      if (!field.pageLeaf || seenLeaves.has(field.pageLeaf)) return;
      seenLeaves.add(field.pageLeaf);

      const contentPath = buildContentPath({
        language: language.localizedPath,
        productsPath,
        product,
        device,
        year: releasePeriod.year,
        quarter: releasePeriod.quarter,
        month: releasePeriod.month,
        storeType,
        testName,
        pageLeaf: field.pageLeaf,
      });
      if (contentPath) {
        sections.push({ label: `${label}: ${field.pageLeaf}`, pageLeaf: field.pageLeaf, contentPath });
      }
    });
  });

  return sections;
}

// Filters down to only the pages that actually exist in DA — showing a stack of empty/404
// iframes for fields nobody has authored yet would be exactly the kind of confusing noise
// the field-scope checkboxes were pruned to avoid.
async function probeSectionsExistence(org, repo, token, sections) {
  const withExistence = await Promise.all(sections.map(async (section) => {
    const htmlPath = buildHtmlSourcePath(section.contentPath);
    const html = await getSourceText(org, repo, htmlPath, token);
    return { ...section, exists: html !== null };
  }));
  return withExistence.filter((section) => section.exists);
}

function renderPreviewSections(container, sections) {
  if (!sections.length) {
    container.innerHTML = '<p class="preview-placeholder">No content found yet for this product, device, and release period.</p>';
    return;
  }

  // Collapsed by default and styled like the Export accordions — a tall stack of always-open
  // iframes (each carrying its own page chrome) is mostly scrolling past blank space, so a
  // collapsed list scans in one glance; opening one loads just that iframe.
  container.innerHTML = sections.map((section) => {
    const url = `${PREVIEW_HOST}${section.contentPath}`;
    return `
      <details class="preview-block">
        <summary>
          <span class="preview-url">${section.label}</span>
          <button type="button" class="open-new-tab" onclick="event.preventDefault(); window.open('${url}', '_blank');">Open in New Tab</button>
        </summary>
        <iframe src="${url}" class="preview-iframe" title="ASO Preview — ${section.label}" loading="lazy"></iframe>
      </details>
    `;
  }).join('');
}

async function updatePreview() {
  const container = document.getElementById('preview-frame-container');
  if (!container) return;

  const { product, languageName, device } = getDropdownValues();
  const language = languageIndexByName.get(languageName);
  const releasePeriod = readReleasePeriod();
  const storeType = readStoreType();
  const testName = isStoreTestsScope() ? getSelectedTestNames()[0] : undefined;

  const scopeReady = product && language && device && isReleasePeriodComplete(releasePeriod)
    && (!isStoreTestsScope() || testName);
  if (!scopeReady) {
    const missingReleasePeriod = !isReleasePeriodComplete(releasePeriod);
    container.innerHTML = `<p class="preview-placeholder">Select product, language, device${missingReleasePeriod ? ', release period (year, quarter, month)' : ''}${isStoreTestsScope() ? ', and at least one experiment' : ''} to preview staged content.</p>`;
    return;
  }
  if (!schemaCache || !previewContext) return;

  const sections = buildPreviewSections(schemaCache, sheetMapCache, {
    product, language, device, releasePeriod, storeType, testName,
  });
  if (!sections.length) {
    container.innerHTML = '<p class="preview-placeholder">No preview pages found for this scope.</p>';
    return;
  }

  container.innerHTML = '<p class="preview-placeholder">Loading preview…</p>';
  const { org, repo, token } = previewContext;
  const existingSections = await probeSectionsExistence(org, repo, token, sections);
  renderPreviewSections(container, existingSections);
}

// Copying several fields' text otherwise means expand → find Copy in the iframe → collapse
// → expand the next one, repeated per field. One click loads every iframe at once so authors
// can scan/copy across all of them without re-opening each row individually.
function toggleExpandAllSections() {
  const blocks = [...document.querySelectorAll('#preview-frame-container .preview-block')];
  if (!blocks.length) return;
  const allOpen = blocks.every((block) => block.open);
  blocks.forEach((block) => { block.open = !allOpen; });
}

function populateDropdown(type, items, { emptyMessage } = {}) {
  const select = document.getElementById(type);
  if (!select?.options[0]) return;
  select.options[0].textContent = items.length === 0
    ? (emptyMessage || `No ${type} found`)
    : `Select a ${type}...`;
  if (items.length === 0) return;
  items.forEach((item) => {
    const option = document.createElement('option');
    option.value = item.name || item.value || item.code;
    option.textContent = item.label || item.name;
    select.appendChild(option);
  });
}

function setupListeners() {
  ['product', 'language', 'device', '#release-period-year', '#release-period-quarter', '#release-period-month', 'input[name="store-type"]'].forEach((id) => {
    const selector = id.startsWith('#') ? id : `#${id}`;
    const element = document.querySelector(selector);
    if (element) element.addEventListener('change', updatePreview);
  });
  document.addEventListener('change', (event) => {
    if (event.target?.classList?.contains('store-test-checkbox')) {
      updatePreview();
    }
  });
  document.getElementById('preview-expand-all')?.addEventListener('click', toggleExpandAllSections);
}

// eslint-disable-next-line import/prefer-default-export
export async function init({ context, token }) {
  const { org, repo } = context;
  previewContext = { org, repo, token };

  const products = await fetchProducts({ context, token });
  populateDropdown('product', products);
  const languages = await fetchLanguages({ context, token, configFile: getConfigFileOverride() });
  languageIndexByName = new Map(languages.map((language) => [language.name, language]));
  populateDropdown('language', languages, { emptyMessage: `No languages found in ${getConfigFileOverride() || 'translate.json'} — add ?configFile=translate-redesign.json to the URL.` });

  [schemaCache, sheetMapCache] = await Promise.all([
    fetchBlockSchema({ context: { org, repo }, token }),
    fetchSheetBlockMap({ context: { org, repo }, token }),
  ]);

  setupListeners();
  await updatePreview();
}

export {
  buildPreviewSections,
  probeSectionsExistence,
  toggleExpandAllSections,
};
