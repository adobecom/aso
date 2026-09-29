import { loadConstantsValuesForPage } from '../../../blocks/aso-app/constants-runtime.js';
import {
  isReleasePeriodComplete,
  readReleasePeriod,
} from './release-period-settings.js';
import {
  readStoreType,
  STORE_TYPE_UPDATES,
} from './store-scope-settings.js';
import { collectExportData } from './import-export/collect.js';
import { buildHtmlSourcePath } from './import-export/paths.js';
import { buildPromosListPath } from './lib/content-taxonomy.js';
import {
  getKeywordsSidecar,
  getSourceText,
  getSpacingSidecar,
  listDirectory,
  putJsonSource,
} from './lib/da-source-client.js';
import {
  fetchBlockSchema,
  fetchLanguages,
  fetchProducts,
  fetchSheetBlockMap,
  getConfigFileOverride,
  getRelativeProductsPath,
} from './lib/utils.js';

const PUBLISH_REQUEST_PATH = '/.da/storepublish/request';

let languageIndexByName = new Map();
let schemaCache = null;
let sheetMapCache = null;

function getPublishProduct() {
  return document.getElementById('publish-product')?.value || '';
}

function getPublishPlatform() {
  return document.querySelector('input[name="publish-platform"]:checked')?.value || 'apple';
}

function getPublishLanguages() {
  return Array.from(document.querySelectorAll('.publish-language-checkbox:checked'))
    .map((cb) => languageIndexByName.get(cb.value))
    .filter(Boolean);
}

function updatePublishButtonState() {
  const btn = document.getElementById('publish-button');
  if (!btn) return;
  btn.disabled = !(getPublishProduct() && getPublishLanguages().length > 0 && isReleasePeriodComplete());
}

function showPublishStatus(message, duration = 3000) {
  const btn = document.getElementById('publish-button');
  if (!btn) return;
  btn.textContent = message;
  btn.classList.remove('loading');
  window.setTimeout(() => {
    btn.textContent = 'Publish to Store';
    updatePublishButtonState();
  }, duration);
}

function populatePublishProductDropdown(products) {
  const select = document.getElementById('publish-product');
  if (!select) return;
  select.innerHTML = products.length
    ? ['<option value="">Select a product…</option>', ...products.map((p) => `<option value="${p.value}">${p.label}</option>`)].join('')
    : '<option value="">No products found</option>';
}

function populatePublishLanguageCheckboxes(languages) {
  const container = document.getElementById('publish-languages-checkboxes');
  if (!container) return;
  if (!languages.length) {
    container.innerHTML = '<p>No languages found</p>';
    return;
  }
  container.innerHTML = languages.map((lang) => {
    const id = `publish-lang-${lang.name.replace(/[^a-zA-Z0-9]/g, '_')}`;
    return `<div class="checkbox-item">
      <input type="checkbox" id="${id}" value="${lang.name}" class="publish-language-checkbox">
      <label for="${id}">${lang.label}</label>
    </div>`;
  }).join('');
}

function createAdminFetch(org, repo, token) {
  const adminOrigin = `https://admin.da.live/source/${org}/${repo}`;
  return async (input) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url.startsWith('/')) {
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
      html: html ?? '', htmlFound: html !== null, spacingSidecar, keywordsSidecar, constantsValues,
    };
  };
}

async function listPromoNames(org, repo, token, { product, platform, year, quarter, month }) {
  const english = languageIndexByName.get('English') || [...languageIndexByName.values()][0];
  if (!english) return [];
  const promosPath = buildPromosListPath({
    language: english.localizedPath,
    productsPath: getRelativeProductsPath(),
    product,
    device: platform,
    year,
    quarter,
    month,
    storeType: STORE_TYPE_UPDATES,
  });
  if (!promosPath) return [];
  try {
    const items = await listDirectory(org, repo, promosPath, token);
    return (Array.isArray(items) ? items : [])
      .filter((item) => item?.name && !item.ext)
      .map((item) => item.name);
  } catch {
    return [];
  }
}

function fieldValue(cellIndex, langCode, device, blockType, fieldKey, promoName) {
  return cellIndex.get(`${langCode}|${device}|${blockType}|${fieldKey}|${promoName ?? ''}`) ?? '';
}

function buildLocalization(cellIndex, langCode, device, blockType, fieldKeys, promoName) {
  const loc = { locale: langCode };
  fieldKeys.forEach((key) => {
    const val = fieldValue(cellIndex, langCode, device, blockType, key, promoName);
    if (val) loc[key] = val;
  });
  return loc;
}

function buildPublishPayload(cells, { product, platform, languages, promoNames }) {
  const cellIndex = new Map();
  cells.forEach((cell) => {
    const key = `${cell.language.code}|${cell.device}|${cell.blockType}|${cell.fieldKey}|${cell.promoName ?? ''}`;
    if (!cellIndex.has(key) || cell.hasHtml) cellIndex.set(key, cell.text);
  });

  const langCodes = languages.map((l) => l.code);

  if (platform === 'apple') {
    const listingFields = ['name', 'subtitle', 'description', 'keywords', 'marketingUrl', 'promotionalText', 'supportUrl'];
    const payload = {
      app: product,
      metadata: {
        localizations: langCodes.map((code) => buildLocalization(cellIndex, code, 'apple', 'listing', listingFields)),
      },
    };

    if (promoNames.length) {
      const promoFields = ['eventName', 'shortDescription', 'longDescription'];
      payload.promos = promoNames.map((promoName) => ({
        referenceName: promoName,
        localizations: langCodes.map((code) => buildLocalization(cellIndex, code, 'apple', 'promo', promoFields, promoName)),
      }));
    }

    return payload;
  }

  // Google
  const googleFields = ['title', 'shortDescription', 'fullDescription', 'releaseNotes'];
  return {
    app: product,
    platform: 'google',
    track: readStoreType() === STORE_TYPE_UPDATES ? 'production' : readStoreType(),
    metadata: {
      localizations: langCodes.map((code) => buildLocalization(cellIndex, code, 'google', 'listing', googleFields)),
    },
  };
}

async function handlePublish(org, repo, token) {
  const btn = document.getElementById('publish-button');
  const summaryEl = document.getElementById('publish-summary');
  btn.classList.add('loading');
  btn.textContent = 'Publishing...';
  btn.disabled = true;
  if (summaryEl) summaryEl.textContent = '';

  try {
    const product = getPublishProduct();
    const platform = getPublishPlatform();
    const languages = getPublishLanguages();
    const releasePeriod = readReleasePeriod();

    if (!schemaCache || !sheetMapCache) {
      showPublishStatus('Config not loaded');
      return;
    }

    // ponytail: promos auto-listed from DA; CPP/store-tests support can be added when needed
    const promoNames = platform === 'apple'
      ? await listPromoNames(org, repo, token, { product, platform, ...releasePeriod })
      : [];

    const promoContexts = promoNames.map((promoName) => ({ promoName, promoVariant: 'default', device: platform }));
    const blockTypes = promoNames.length ? ['listing', 'promo'] : ['listing'];

    const adminFetch = createAdminFetch(org, repo, token);
    const fetchPage = createFetchPage(org, repo, token, adminFetch);

    const cells = await collectExportData({
      org,
      repo,
      token,
      schema: schemaCache,
      sheetMap: sheetMapCache,
      products: [product],
      languages,
      devices: [platform],
      year: releasePeriod.year,
      quarter: releasePeriod.quarter,
      month: releasePeriod.month,
      productsPath: getRelativeProductsPath(),
      storeType: STORE_TYPE_UPDATES,
      blockTypes,
      promoContexts,
      rowRoles: ['localized'],
      fetchPage,
    });

    const payload = buildPublishPayload(cells, {
      product, platform, languages, promoNames,
    });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filePath = `${PUBLISH_REQUEST_PATH}/${timestamp}.json`;
    const result = await putJsonSource(org, repo, filePath, payload, token);

    if (result.ok) {
      showPublishStatus('Published!');
      if (summaryEl) summaryEl.innerHTML = `Saved to <code>${filePath}</code>`;
    } else {
      showPublishStatus('Publish failed');
      if (summaryEl) summaryEl.textContent = `Error ${result.status}: ${result.statusText || 'write failed'}`;
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[aso publish]', error);
    showPublishStatus('Publish failed');
    if (summaryEl) summaryEl.textContent = error.message || 'Unknown error';
  }
}

function setupPublishListeners(org, repo, token) {
  document.getElementById('publish-product')?.addEventListener('change', updatePublishButtonState);
  document.querySelectorAll('#release-period-year, #release-period-quarter, #release-period-month').forEach((el) => {
    el.addEventListener('change', updatePublishButtonState);
  });
  document.getElementById('publish-select-all-languages')?.addEventListener('click', () => {
    const checkboxes = document.querySelectorAll('.publish-language-checkbox');
    const allChecked = [...checkboxes].every((cb) => cb.checked);
    checkboxes.forEach((cb) => { cb.checked = !allChecked; });
    updatePublishButtonState();
  });
  document.getElementById('publish-languages-checkboxes')?.addEventListener('change', updatePublishButtonState);
  document.getElementById('publish-button')?.addEventListener('click', () => handlePublish(org, repo, token));
}

// eslint-disable-next-line import/prefer-default-export
export async function init({ context, token }) {
  const { org, repo } = context;

  const [products, languages] = await Promise.all([
    fetchProducts({ context, token }),
    fetchLanguages({ context, token, configFile: getConfigFileOverride() }),
  ]);

  languageIndexByName = new Map(languages.map((l) => [l.name, l]));
  populatePublishProductDropdown(products);
  populatePublishLanguageCheckboxes(languages);

  [schemaCache, sheetMapCache] = await Promise.all([
    fetchBlockSchema({ context: { org, repo }, token }),
    fetchSheetBlockMap({ context: { org, repo }, token }),
  ]);

  setupPublishListeners(org, repo, token);
  updatePublishButtonState();
}
