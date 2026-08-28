import { loadConstantsValuesForPage } from '../../../blocks/aso-app/constants-runtime.js';
import {
  isReleasePeriodComplete,
  readReleasePeriod,
} from './release-period-settings.js';
import {
  getSelectedPromoContexts,
  initPromoScope,
  isPromoScopeComplete,
  refreshPromoNames,
} from './promo-scope-settings.js';
import {
  getSelectedFieldsByDeviceBlock,
  initFieldScope,
  refreshFieldCheckboxes,
  refreshFieldCheckboxesForBlockType,
  restrictFieldCheckboxesToFile,
  setMediaAssetsAvailable,
  setMediaAssetsFieldAvailability,
} from './field-scope-settings.js';
import {
  getSelectedTestNames,
  initStoreScope,
  isStoreScopeComplete,
  isStoreTestsScope,
  normalizeStoreType,
  readStoreType,
  refreshStoreTests,
  STORE_TYPE_CPP,
  STORE_TYPE_TESTS,
  STORE_TYPE_UPDATES,
  storeTypeRequiresInstanceName,
  toggleStoreTestsFields,
  updateStoreTestsCount,
} from './store-scope-settings.js';
import { collectExportData } from './import-export/collect.js';
import { collectMediaExportData } from './import-export/media-collect.js';
import { listMediaAssetFields, listSchemaFields } from './import-export/page-map.js';
import {
  buildExportPayload,
  buildWorkbook,
  parseWorkbook,
} from './import-export/template.js';
import { buildHtmlSourcePath } from './import-export/paths.js';
import {
  getKeywordsSidecar,
  getSourceText,
  getSpacingSidecar,
} from './lib/da-source-client.js';
import { isFileTooLarge, loadExcelJS, MAX_WORKBOOK_FILE_BYTES } from './lib/excel-loader.js';
import { loadJSZip } from './lib/zip-loader.js';
import {
  buildImageZipPath,
  fetchImageBlob,
  getCurrentPreviewRef,
  getExtensionFromUrl,
  isAemPreviewUrl,
  slugifyLabel,
} from './lib/media-fetch.js';
import {
  fetchBlockSchema,
  fetchProducts,
  fetchLanguages,
  fetchSheetBlockMap,
  getConfigFileOverride,
  getRelativeProductsPath,
} from './lib/utils.js';

let languageIndexByName = new Map();
let schemaCache = null;
let sheetMapCache = null;

function getSelectedCheckboxes(selector) {
  return Array.from(document.querySelectorAll(`${selector}:checked`));
}

function getSelectedLanguages() {
  return getSelectedCheckboxes('.language-checkbox')
    .map((checkbox) => languageIndexByName.get(checkbox.value))
    .filter(Boolean);
}

function getSelectedItems() {
  const product = document.getElementById('export-product')?.value || '';
  const devices = [];
  if (document.getElementById('device-apple')?.checked) devices.push('apple');
  if (document.getElementById('device-google')?.checked) devices.push('google');
  return {
    product,
    languages: getSelectedLanguages(),
    devices,
  };
}

function refreshFieldScope() {
  if (!schemaCache || !sheetMapCache) return;
  const { devices } = getSelectedItems();
  refreshFieldCheckboxes(schemaCache, sheetMapCache, devices);
}

let mediaAssetsAvailable = false;

function updateImagesButtonVisibility() {
  const imagesButton = document.getElementById('export-images-button');
  if (imagesButton) imagesButton.classList.toggle('hidden', !mediaAssetsAvailable);
}

// Media Assets has no workbook representation (see media-collect.js) — it's raw image URLs,
// not text, so "does it exist" can't be read off the scope checkboxes. Reuses
// collectMediaExportData (the same pipeline the actual download goes through), across every
// selected language (images are localized — a screenshot present only on a non-English
// language's page must still show up as a selectable field, or handleImageExport's
// selection filter would silently exclude it from the zip even though it exists) — so the
// field list shown to authors matches what's really on the page. Schema defines every slot a
// block type supports (e.g. 10 screenshots), but showing all of them when a release only
// dropped in 2 would be confusing.
async function refreshMediaAssetsAvailability(org, repo, token, schema, {
  product,
  languages,
  devices,
}) {
  const releasePeriod = readReleasePeriod();
  const storeType = readStoreType();
  const testName = isStoreTestsScope() ? getSelectedTestNames()[0] : undefined;

  const scopeReady = schema && product && devices.length && languages.length
    && isReleasePeriodComplete(releasePeriod) && (!isStoreTestsScope() || testName);
  if (!scopeReady) {
    mediaAssetsAvailable = false;
    updateImagesButtonVisibility();
    setMediaAssetsAvailable(false);
    setMediaAssetsFieldAvailability({});
    refreshFieldCheckboxesForBlockType('media-assets', schema, sheetMapCache, devices);
    return;
  }

  const productsPath = getRelativeProductsPath();

  const entries = await collectMediaExportData({
    org,
    repo,
    token,
    schema,
    products: [product],
    languages,
    devices,
    year: releasePeriod.year,
    quarter: releasePeriod.quarter,
    month: releasePeriod.month,
    productsPath,
    storeType,
    testName,
  });

  const fieldsByDevice = new Map(
    devices.map((device) => [device, listMediaAssetFields(schema, device)]),
  );
  const fieldKeysByDevice = {};
  devices.forEach((device) => { fieldKeysByDevice[device] = new Set(); });
  entries.forEach((entry) => {
    const fields = fieldsByDevice.get(entry.device) || [];
    const match = fields.find((field) => field.fieldName === entry.fieldName);
    if (match) fieldKeysByDevice[entry.device].add(match.fieldKey);
  });
  const fieldKeysByDeviceArrays = Object.fromEntries(
    Object.entries(fieldKeysByDevice).map(([device, keys]) => [device, [...keys]]),
  );

  mediaAssetsAvailable = entries.length > 0;
  updateImagesButtonVisibility();
  setMediaAssetsAvailable(mediaAssetsAvailable);
  setMediaAssetsFieldAvailability(fieldKeysByDeviceArrays);
  refreshFieldCheckboxesForBlockType('media-assets', schema, sheetMapCache, devices);
}

function getExportBlockTypes() {
  const blockTypes = [];
  if (document.getElementById('export-scope-listing')?.checked) blockTypes.push('listing');
  if (document.getElementById('export-scope-promos')?.checked) blockTypes.push('promo');
  if (document.getElementById('export-scope-images-videos')?.checked) blockTypes.push('images-videos');
  return blockTypes;
}

function getPromoContexts() {
  if (!document.getElementById('export-scope-promos')?.checked) return [];
  return getSelectedPromoContexts();
}

function togglePromoFields() {
  const promosChecked = document.getElementById('export-scope-promos')?.checked;
  const promoFields = document.getElementById('export-promo-fields');
  if (promoFields) promoFields.open = promosChecked;
  const countEl = document.getElementById('export-promo-count');
  if (countEl) {
    countEl.textContent = promosChecked ? `(${getSelectedPromoContexts().length} selected)` : '(not included)';
  }
}

function createAdminFetch(org, repo, token) {
  const adminOrigin = `https://admin.da.live/source/${org}/${repo}`;
  return async (input) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url === '/.da/translate.json') {
      return fetch(`${adminOrigin}/.da/translate.json`, { headers: { Authorization: `Bearer ${token}` } });
    }
    if (url.startsWith('/')) {
      const sourcePath = url.endsWith('.html') ? url : `${url}.html`;
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

function downloadWorkbook(buffer, filename) {
  const blob = new Blob(
    [buffer],
    { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  );
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.URL.revokeObjectURL(url);
}

function renderExportSummary(container, {
  product,
  testName,
  stats,
  skipped,
}) {
  if (!container) return;
  const label = testName ? `${product} / ${testName}` : product;
  const lines = [
    `<strong>${label}</strong>: ${stats.cells} cell(s) exported`,
    `(${stats.uniquePaths} unique page path(s); ${stats.skipped} skipped)`,
  ];
  if (skipped.length) {
    lines.push('Fields not yet created in DA were skipped, not exported.');
  }

  container.innerHTML = `<p>${lines.join('<br>')}</p>`;
}

function downloadImagesZip(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.URL.revokeObjectURL(url);
}

function renderImageExportSummary(container, totalCount, fileCount, problems) {
  if (!container) return;
  container.textContent = '';
  if (!totalCount) return;

  const summary = document.createElement('p');
  summary.textContent = `${fileCount} of ${totalCount} image(s) downloaded.`;
  container.append(summary);

  if (problems.length) {
    const list = document.createElement('ul');
    list.className = 'image-export-summary-issues';
    problems.forEach((problem) => {
      const item = document.createElement('li');
      item.textContent = `${problem.label} — ${problem.reason}`;
      list.append(item);
    });
    container.append(list);
  }
}

function updateExportButtonState() {
  const hasProduct = Boolean(document.getElementById('export-product')?.value);
  const hasLanguages = getSelectedCheckboxes('.language-checkbox').length > 0;
  const hasDevices = document.getElementById('device-apple')?.checked
    || document.getElementById('device-google')?.checked;
  const hasScope = getExportBlockTypes().length > 0;
  const releasePeriodReady = isReleasePeriodComplete();
  const promosNeedName = !isPromoScopeComplete();
  const storeTestsNeedSelection = isStoreTestsScope() && !isStoreScopeComplete();
  const baseReady = hasProduct && hasLanguages && hasDevices && releasePeriodReady
    && !storeTestsNeedSelection;

  const exportButton = document.getElementById('export-button');
  if (exportButton) {
    exportButton.disabled = !(baseReady && hasScope && !promosNeedName);
  }

  const imagesButton = document.getElementById('export-images-button');
  if (imagesButton) {
    imagesButton.disabled = !baseReady || !mediaAssetsAvailable;
  }
}

function showExportStatus(message, duration = 2500) {
  const exportButton = document.getElementById('export-button');
  if (!exportButton) return;
  exportButton.textContent = message;
  exportButton.classList.remove('loading');
  window.setTimeout(() => {
    exportButton.textContent = 'Export from DA';
    updateExportButtonState();
  }, duration);
}

function showImageExportStatus(message, duration = 2500) {
  const imagesButton = document.getElementById('export-images-button');
  if (!imagesButton) return;
  imagesButton.textContent = message;
  imagesButton.classList.remove('loading');
  window.setTimeout(() => {
    imagesButton.textContent = 'Download Images';
    updateExportButtonState();
  }, duration);
}

async function buildProductExportArtifacts({
  org,
  repo,
  token,
  schema,
  sheetMap,
  product,
  languages,
  devices,
  releasePeriod,
  blockTypes,
  promoContexts,
  selection,
  fetchPage,
  ExcelJS,
  productsPath = getRelativeProductsPath(),
  storeType = readStoreType(),
  testName,
  collectExportDataFn = collectExportData,
}) {
  const collectResult = await collectExportDataFn({
    org,
    repo,
    token,
    schema,
    sheetMap,
    products: [product],
    languages,
    devices,
    year: releasePeriod.year,
    quarter: releasePeriod.quarter,
    month: releasePeriod.month,
    productsPath,
    storeType,
    testName,
    blockTypes,
    promoContexts,
    selection,
    fetchPage,
  });

  const languageNames = languages.map((language) => language.name);
  const payload = buildExportPayload({
    settings: {
      product,
      storeType,
      testName: testName || '',
      year: releasePeriod.year,
      quarter: releasePeriod.quarter,
      month: releasePeriod.month,
    },
    cells: collectResult.cells,
    languages,
    languageNames,
    schema,
    sheetMap,
    skipped: collectResult.skipped,
  });

  const workbook = buildWorkbook(ExcelJS, payload);
  const buffer = await workbook.xlsx.writeBuffer();
  const testSuffix = testName ? `-${testName}` : '';
  const filename = `ASO-Export-${product}-${releasePeriod.year}-${releasePeriod.quarter}-${releasePeriod.month}${testSuffix}.xlsx`;

  return {
    product,
    testName,
    payload,
    workbook,
    buffer,
    filename,
    stats: collectResult.stats,
    skipped: collectResult.skipped,
    overLimit: collectResult.overLimit,
  };
}

async function exportProductWorkbook(options) {
  const artifacts = await buildProductExportArtifacts(options);
  downloadWorkbook(artifacts.buffer, artifacts.filename);
  return {
    product: artifacts.product,
    stats: artifacts.stats,
    skipped: artifacts.skipped,
    overLimit: artifacts.overLimit,
  };
}

async function handleExport(org, repo, token) {
  const exportButton = document.getElementById('export-button');
  const summaryContainer = document.getElementById('export-summary');
  exportButton.classList.add('loading');
  exportButton.textContent = 'Exporting...';
  exportButton.disabled = true;
  if (summaryContainer) summaryContainer.innerHTML = '';

  try {
    const [schema, sheetMap] = await Promise.all([
      fetchBlockSchema({ context: { org, repo }, token }),
      fetchSheetBlockMap({ context: { org, repo }, token }),
    ]);
    if (!schema || !sheetMap) {
      showExportStatus('Config fetch failed');
      return;
    }

    const { product, languages, devices } = getSelectedItems();
    const releasePeriod = readReleasePeriod();
    const blockTypes = getExportBlockTypes();
    const promoContexts = getPromoContexts();
    const selection = { fieldsByDeviceBlock: getSelectedFieldsByDeviceBlock() };

    if (document.getElementById('export-scope-promos')?.checked && !promoContexts.length) {
      showExportStatus('Select promo');
      return;
    }

    const adminFetch = createAdminFetch(org, repo, token);
    const fetchPage = createFetchPage(org, repo, token, adminFetch);
    const ExcelJS = await loadExcelJS();

    const summaries = [];
    const storeType = readStoreType();
    const testNames = storeTypeRequiresInstanceName(storeType)
      ? getSelectedTestNames() : [undefined];

    // eslint-disable-next-line no-restricted-syntax
    for (const testName of testNames) {
      // eslint-disable-next-line no-await-in-loop
      const result = await exportProductWorkbook({
        org,
        repo,
        token,
        schema,
        sheetMap,
        product,
        languages,
        devices,
        releasePeriod,
        blockTypes,
        promoContexts,
        selection,
        fetchPage,
        ExcelJS,
        storeType,
        testName,
      });
      summaries.push(result);
      renderExportSummary(summaryContainer, result);
    }

    const totalSkipped = summaries.reduce((sum, entry) => sum + entry.skipped.length, 0);
    showExportStatus(
      totalSkipped
        ? `Exported with ${totalSkipped} skip(s)`
        : 'Export complete!',
      3000,
    );
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[aso export]', error);
    showExportStatus('Export failed');
  }
}

async function processMediaEntry(zip, entry, token, currentRef) {
  const slug = slugifyLabel(entry.fieldName);
  if (!slug) {
    return { label: entry.fieldName, status: 'skipped', reason: 'Empty or invalid field label' };
  }
  const ext = getExtensionFromUrl(entry.src);
  if (!ext) {
    return { label: entry.fieldName, status: 'skipped', reason: 'No file extension found in image URL' };
  }
  const blob = await fetchImageBlob(entry.src, token, currentRef);
  if (!blob) {
    const reason = isAemPreviewUrl(entry.src)
      ? 'Could not download — no authenticated preview session available for this image'
      : 'Could not download image (access denied or network error)';
    return { label: entry.fieldName, status: 'failed', reason };
  }
  const zipPath = buildImageZipPath({
    product: entry.product,
    device: entry.device,
    languageSegment: entry.language?.localizedCode || entry.language?.code || entry.language?.name,
  }, slug, ext);
  zip.file(zipPath, blob);
  return { label: entry.fieldName, status: 'ok' };
}

async function generateImagesZip(entries, token, currentRef) {
  const JSZip = await loadJSZip();
  const zip = new JSZip();
  let fileCount = 0;
  const problems = [];

  // eslint-disable-next-line no-restricted-syntax
  for (const entry of entries) {
    // eslint-disable-next-line no-await-in-loop
    const result = await processMediaEntry(zip, entry, token, currentRef);
    if (result.status === 'ok') {
      fileCount += 1;
    } else {
      problems.push(result);
    }
  }

  return { zip, fileCount, totalCount: entries.length, problems };
}

async function handleImageExport(org, repo, token) {
  const imagesButton = document.getElementById('export-images-button');
  const summaryContainer = document.getElementById('image-export-summary');
  if (!imagesButton) return;
  imagesButton.classList.add('loading');
  imagesButton.textContent = 'Downloading...';
  imagesButton.disabled = true;
  if (summaryContainer) summaryContainer.textContent = '';

  try {
    const schema = await fetchBlockSchema({ context: { org, repo }, token });
    if (!schema) {
      showImageExportStatus('Config fetch failed');
      return;
    }

    const { product, languages, devices } = getSelectedItems();
    const releasePeriod = readReleasePeriod();
    const storeType = readStoreType();
    const testNames = storeTypeRequiresInstanceName(storeType)
      ? getSelectedTestNames() : [undefined];
    const currentRef = getCurrentPreviewRef(repo, org);
    const productsPath = getRelativeProductsPath();
    const selection = { fieldsByDeviceBlock: getSelectedFieldsByDeviceBlock() };

    const allEntries = [];
    // eslint-disable-next-line no-restricted-syntax
    for (const testName of testNames) {
      // eslint-disable-next-line no-await-in-loop
      const entries = await collectMediaExportData({
        org,
        repo,
        token,
        schema,
        products: [product],
        languages,
        devices,
        year: releasePeriod.year,
        quarter: releasePeriod.quarter,
        month: releasePeriod.month,
        productsPath,
        storeType,
        testName,
        selection,
      });
      allEntries.push(...entries);
    }

    const { zip, fileCount, totalCount, problems } = await generateImagesZip(
      allEntries,
      token,
      currentRef,
    );
    renderImageExportSummary(summaryContainer, totalCount, fileCount, problems);
    if (fileCount === 0) {
      showImageExportStatus('No images found');
      return;
    }

    const buffer = await zip.generateAsync({ type: 'blob' });
    const filename = `ASO-Images-${new Date().toISOString().split('T')[0]}.zip`;
    downloadImagesZip(buffer, filename);
    showImageExportStatus('Download complete!');
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[aso export images]', error);
    showImageExportStatus('Download failed');
  }
}

function sanitizeIdPart(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '_');
}

// Only languages use this now (products became a single-select dropdown), but this stays
// generic over "type" since it's still shared with the count/select-all helpers below.
function createCheckboxHTML(item, type, { checked = false } = {}) {
  const value = item.name;
  const className = `${type.slice(0, -1)}-checkbox`;
  const checkedAttr = checked ? ' checked' : '';
  const id = `lang-${sanitizeIdPart(value)}`;
  return `
    <div class="checkbox-item">
      <input type="checkbox" id="${id}" value="${value}" class="${className}"${checkedAttr}>
      <label for="${id}">${item.label}</label>
    </div>
  `;
}

function updateSelectionCount(type) {
  const checkboxes = document.querySelectorAll(`.${type.slice(0, -1)}-checkbox`);
  const count = Array.from(checkboxes).filter((cb) => cb.checked).length;
  const countElement = document.getElementById(`${type}-count`);
  if (countElement) countElement.textContent = `(${count} selected)`;
}

function populateCheckboxes(containerId, items, type, {
  defaultChecked = false,
  emptyMessage,
} = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (items.length === 0) {
    container.innerHTML = `<p>${emptyMessage || `No ${type} found`}</p>`;
    return;
  }
  container.innerHTML = items.map(
    (item) => createCheckboxHTML(item, type, { checked: defaultChecked }),
  ).join('');
  updateSelectionCount(type);
}

function populateProductDropdown(products) {
  const select = document.getElementById('export-product');
  if (!select) return;
  if (!products.length) {
    select.innerHTML = '<option value="">No products found</option>';
    return;
  }
  select.innerHTML = [
    '<option value="">Select a product…</option>',
    ...products.map((product) => `<option value="${product.value}">${product.label}</option>`),
  ].join('');
}

function handleCheckboxChange() {
  updateSelectionCount('languages');
  updateExportButtonState();
}

function handleSelectAll(target) {
  const checkboxes = document.querySelectorAll(`.${target.slice(0, -1)}-checkbox`);
  const allChecked = Array.from(checkboxes).every((cb) => cb.checked);
  checkboxes.forEach((cb) => { cb.checked = !allChecked; });
  updateSelectionCount(target);
  updateExportButtonState();
}

function getCheckedDevices() {
  const devices = [];
  if (document.getElementById('device-apple')?.checked) devices.push('apple');
  if (document.getElementById('device-google')?.checked) devices.push('google');
  return devices;
}

function getBaseListProbeFields() {
  const product = document.getElementById('export-product')?.value;
  if (!product) return null;

  const releasePeriod = readReleasePeriod();
  if (!isReleasePeriodComplete(releasePeriod)) return null;

  const english = languageIndexByName.get('English') || getSelectedLanguages()[0];
  if (!english) return null;

  return {
    language: english.localizedPath || '/',
    productsPath: getRelativeProductsPath(),
    product,
    year: releasePeriod.year,
    quarter: releasePeriod.quarter,
    month: releasePeriod.month,
  };
}

function getStoreTestsListProbe() {
  const base = getBaseListProbeFields();
  if (!base) return null;
  const [device] = getCheckedDevices();
  if (!device) return null;
  return { ...base, device, storeType: readStoreType() };
}

// One probe per checked device — promos can differ (or only exist) per device.
function getPromoListProbes() {
  const base = getBaseListProbeFields();
  if (!base) return [];
  const devices = getCheckedDevices();
  if (!devices.length) return [];

  const storeType = readStoreType();
  const testName = isStoreTestsScope() ? getSelectedTestNames()[0] : undefined;
  if (isStoreTestsScope() && !testName) return [];

  return devices.map((device) => ({ ...base, device, storeType, testName }));
}

function applyProduct(product) {
  const select = document.getElementById('export-product');
  if (select) select.value = product;
}

// Returns language names from the file that don't match any currently known language.
function applyLanguages(languageNames) {
  const languageCheckboxes = [...document.querySelectorAll('.language-checkbox')];
  const known = new Set(languageCheckboxes.map((checkbox) => checkbox.value));
  languageCheckboxes.forEach((checkbox) => {
    checkbox.checked = languageNames.includes(checkbox.value);
  });
  return languageNames.filter((name) => !known.has(name));
}

function applyDevices(devices) {
  const appleCheckbox = document.getElementById('device-apple');
  const googleCheckbox = document.getElementById('device-google');
  if (appleCheckbox) appleCheckbox.checked = devices.has('apple');
  if (googleCheckbox) googleCheckbox.checked = devices.has('google');
}

function devicesFromParsed(parsed) {
  const devices = new Set();
  ['apple', 'google'].forEach((device) => {
    if (parsed.metadata?.[device]?.length) devices.add(device);
    if (parsed.imagesVideos?.[device]?.length) devices.add(device);
  });
  (parsed.promos || []).forEach((promo) => {
    Object.keys(promo.devices || {}).forEach((device) => devices.add(device));
  });
  return devices;
}

function applyReleasePeriod({ year, quarter, month } = {}) {
  const yearSelect = document.getElementById('release-period-year');
  const quarterSelect = document.getElementById('release-period-quarter');
  const monthSelect = document.getElementById('release-period-month');
  if (yearSelect && year) yearSelect.value = year;
  if (quarterSelect && quarter) quarterSelect.value = quarter;
  if (monthSelect && month) monthSelect.value = month;
}

function applyStoreType(storeType) {
  const normalized = normalizeStoreType(storeType);
  const updatesRadio = document.getElementById('store-type-updates');
  const testsRadio = document.getElementById('store-type-tests');
  const cppRadio = document.getElementById('store-type-cpp');
  if (updatesRadio) updatesRadio.checked = normalized === STORE_TYPE_UPDATES;
  if (testsRadio) testsRadio.checked = normalized === STORE_TYPE_TESTS;
  if (cppRadio) cppRadio.checked = normalized === STORE_TYPE_CPP;
  toggleStoreTestsFields();
}

function applyTestName(testName) {
  if (!testName) return;
  document.querySelectorAll('.store-test-checkbox').forEach((checkbox) => {
    checkbox.checked = checkbox.value === testName;
  });
  updateStoreTestsCount();
}

function applyScope(parsed) {
  const hasListing = (parsed.metadata?.apple?.length || 0)
    + (parsed.metadata?.google?.length || 0) > 0;
  const hasPromo = (parsed.promos?.length || 0) > 0;
  const hasImagesVideos = (parsed.imagesVideos?.apple?.length || 0)
    + (parsed.imagesVideos?.google?.length || 0) > 0;
  const listingCheckbox = document.getElementById('export-scope-listing');
  const promosCheckbox = document.getElementById('export-scope-promos');
  const imagesVideosCheckbox = document.getElementById('export-scope-images-videos');
  if (listingCheckbox) listingCheckbox.checked = hasListing;
  if (promosCheckbox) promosCheckbox.checked = hasPromo;
  if (imagesVideosCheckbox) imagesVideosCheckbox.checked = hasImagesVideos;
  togglePromoFields();
}

// Restricts the (already-discovered, all-checked-by-default) promo/variant checkboxes
// down to only the promo/device/variant combinations that were present in the file.
function restrictPromoCheckboxesToFile(promos) {
  const namedDevices = new Set();
  const variantCombos = new Set();
  (promos || []).forEach((promo) => {
    Object.entries(promo.devices || {}).forEach(([device, deviceData]) => {
      namedDevices.add(`${promo.promoName}|${device}`);
      Object.keys(deviceData.variants || {}).forEach((variant) => {
        variantCombos.add(`${promo.promoName}|${device}|${variant}`);
      });
    });
  });

  document.querySelectorAll('.promo-name-checkbox').forEach((checkbox) => {
    checkbox.checked = namedDevices.has(`${checkbox.value}|${checkbox.dataset.device}`);
  });
  document.querySelectorAll('.promo-variant-checkbox').forEach((checkbox) => {
    const key = `${checkbox.dataset.promo}|${checkbox.dataset.device}|${checkbox.value}`;
    checkbox.checked = variantCombos.has(key);
  });
}

// A field "had content in the file" if any language's englishSource column was filled in —
// matches schema fields by name (parsed fields only carry fieldName) to get back to fieldKey.
function fieldKeysWithContent(fields, schemaFields) {
  const keyByName = new Map(schemaFields.map((field) => [field.fieldName, field.fieldKey]));
  return (fields || [])
    .filter((field) => Object.values(field.englishSource || {}).some((text) => String(text ?? '').trim()))
    .map((field) => keyByName.get(field.fieldName))
    .filter(Boolean);
}

// Restricts the (already re-rendered, all-checked-by-default) field checkboxes down to only
// the fields that actually had content in the uploaded file, for Metadata and Images & Videos.
function restrictFieldScopeToFile(parsed, schema, sheetMap) {
  if (!schema || !sheetMap) return;
  ['apple', 'google'].forEach((device) => {
    const listingFields = listSchemaFields(schema, sheetMap, device, 'listing');
    restrictFieldCheckboxesToFile(
      'listing',
      device,
      fieldKeysWithContent(parsed.metadata?.[device], listingFields),
    );

    const imagesVideosFields = listSchemaFields(schema, sheetMap, device, 'images-videos');
    restrictFieldCheckboxesToFile(
      'images-videos',
      device,
      fieldKeysWithContent(parsed.imagesVideos?.[device], imagesVideosFields),
    );
  });
}

// Promo/device pairs from the file with no matching live checkbox (deleted or renamed since).
function findMissingPromos(promos) {
  const missing = [];
  (promos || []).forEach((promo) => {
    Object.keys(promo.devices || {}).forEach((device) => {
      const selector = `.promo-name-checkbox[value="${promo.promoName}"][data-device="${device}"]`;
      if (!document.querySelector(selector)) missing.push(`${promo.promoName} (${device})`);
    });
  });
  return missing;
}

function renderLoadScopeSummary(container, parsed, missingLanguages, missingPromos) {
  if (!container) return;
  const lines = [
    `Loaded from file: ${parsed.settings.product} — ${parsed.languageNames.length} language(s), `
      + `${parsed.promos.length} promo(s). Content below is pulled fresh from DA, not from this file.`,
  ];
  if (missingLanguages.length) {
    lines.push(`Not found in current languages: ${missingLanguages.join(', ')}`);
  }
  if (missingPromos.length) {
    lines.push(`Not found in DA anymore: ${missingPromos.join(', ')}`);
  }
  container.innerHTML = lines.map((line) => `<p>${line}</p>`).join('');
}

async function handleLoadScopeFile(org, repo, token, file) {
  const summaryContainer = document.getElementById('export-scope-file-summary');
  if (summaryContainer) summaryContainer.textContent = 'Reading file…';

  if (isFileTooLarge(file)) {
    const maxMb = Math.round(MAX_WORKBOOK_FILE_BYTES / (1024 * 1024));
    if (summaryContainer) summaryContainer.textContent = `File is too large to read (max ${maxMb}MB).`;
    return;
  }

  try {
    const ExcelJS = await loadExcelJS();
    const buffer = await file.arrayBuffer();
    const parsed = await parseWorkbook(buffer, ExcelJS);

    if (!parsed.settings?.product || !parsed.languageNames.length) {
      if (summaryContainer) summaryContainer.textContent = 'Could not read a product and languages from this file.';
      return;
    }

    applyProduct(parsed.settings.product);
    applyReleasePeriod(parsed.settings);
    applyStoreType(parsed.settings.storeType);
    applyScope(parsed);
    const missingLanguages = applyLanguages(parsed.languageNames);
    applyDevices(devicesFromParsed(parsed));
    refreshFieldScope();
    restrictFieldScopeToFile(parsed, schemaCache, sheetMapCache);
    refreshMediaAssetsAvailability(org, repo, token, schemaCache, getSelectedItems());
    handleCheckboxChange();

    if (isStoreTestsScope()) {
      await refreshStoreTests({ org, repo }, token, getStoreTestsListProbe);
      applyTestName(parsed.settings.testName);
    }

    if (document.getElementById('export-scope-promos')?.checked) {
      await refreshPromoNames({ org, repo }, token, getPromoListProbes);
      restrictPromoCheckboxesToFile(parsed.promos);
      togglePromoFields();
    }

    updateExportButtonState();
    renderLoadScopeSummary(
      summaryContainer,
      parsed,
      missingLanguages,
      findMissingPromos(parsed.promos),
    );
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[aso export] load scope from file failed', error);
    if (summaryContainer) summaryContainer.textContent = 'Could not read this file.';
  }
}

function setupListeners(org, repo, token) {
  const selectors = [
    '#export-product',
    '.language-checkbox',
    '#device-apple',
    '#device-google',
    '#export-scope-listing',
    '#export-scope-promos',
    '#export-scope-images-videos',
    '#release-period-year',
    '#release-period-quarter',
    '#release-period-month',
    'input[name="store-type"]',
  ].join(', ');

  const fieldScopeTriggers = new Set([
    'device-apple', 'device-google', 'export-scope-listing', 'export-scope-images-videos',
  ]);
  const mediaAssetsTriggerIds = new Set([
    'export-product', 'device-apple', 'device-google',
    'release-period-year', 'release-period-quarter', 'release-period-month',
  ]);
  document.querySelectorAll(selectors).forEach((element) => {
    element.addEventListener('change', () => {
      if (element.id === 'export-scope-promos') togglePromoFields();
      if (fieldScopeTriggers.has(element.id)) refreshFieldScope();
      if (mediaAssetsTriggerIds.has(element.id)
        || element.classList.contains('language-checkbox')
        || element.name === 'store-type') {
        refreshMediaAssetsAvailability(org, repo, token, schemaCache, getSelectedItems());
      }
      handleCheckboxChange();
    });
  });

  document.querySelectorAll('.select-all-link').forEach((button) => {
    button.addEventListener('click', () => handleSelectAll(button.dataset.target));
  });
  document.getElementById('export-button')?.addEventListener(
    'click',
    () => handleExport(org, repo, token),
  );
  document.getElementById('export-images-button')?.addEventListener(
    'click',
    () => handleImageExport(org, repo, token),
  );
  document.getElementById('export-scope-file-button')?.addEventListener('click', () => {
    document.getElementById('export-scope-file')?.click();
  });
  document.getElementById('export-scope-file')?.addEventListener('change', async (event) => {
    const [file] = event.target.files;
    event.target.value = '';
    if (!file) return;
    await handleLoadScopeFile(org, repo, token, file);
  });
}

// eslint-disable-next-line import/prefer-default-export
export async function init({ context, token }) {
  const { org, repo } = context;
  const languages = await fetchLanguages({ context, token, configFile: getConfigFileOverride() });
  languageIndexByName = new Map(languages.map((language) => [language.name, language]));

  const products = await fetchProducts({ context, token });
  populateProductDropdown(products);
  populateCheckboxes('languages-checkboxes', languages, 'languages', { emptyMessage: `No languages found in ${getConfigFileOverride() || 'translate.json'} — add ?configFile=translate-redesign.json to the URL.` });

  [schemaCache, sheetMapCache] = await Promise.all([
    fetchBlockSchema({ context: { org, repo }, token }),
    fetchSheetBlockMap({ context: { org, repo }, token }),
  ]);

  ['export-scope-listing', 'export-scope-promos', 'export-scope-images-videos'].forEach((id) => {
    const checkbox = document.getElementById(id);
    if (checkbox) checkbox.checked = true;
  });
  togglePromoFields();
  refreshFieldScope();
  initFieldScope();
  initPromoScope({
    context: { org, repo },
    token,
    getListProbes: getPromoListProbes,
    onScopeChange: () => {
      updateExportButtonState();
      togglePromoFields();
    },
  });
  initStoreScope({
    context: { org, repo },
    token,
    getListProbe: getStoreTestsListProbe,
    onScopeChange: () => {
      updateExportButtonState();
      if (document.getElementById('export-scope-promos')?.checked) {
        refreshPromoNames({ org, repo }, token, getPromoListProbes).then(togglePromoFields);
      }
    },
  });
  if (document.getElementById('export-scope-promos')?.checked) {
    await refreshPromoNames({ org, repo }, token, getPromoListProbes);
    togglePromoFields();
  }
  setupListeners(org, repo, token);
  updateExportButtonState();
}

export {
  applyDevices,
  applyLanguages,
  applyProduct,
  applyReleasePeriod,
  applyScope,
  applyStoreType,
  applyTestName,
  buildProductExportArtifacts,
  devicesFromParsed,
  fieldKeysWithContent,
  findMissingPromos,
  populateProductDropdown,
  refreshMediaAssetsAvailability,
  renderExportSummary,
  restrictFieldScopeToFile,
  restrictPromoCheckboxesToFile,
};
