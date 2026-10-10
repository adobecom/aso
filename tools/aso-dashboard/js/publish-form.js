import {
  isReleasePeriodComplete,
  readReleasePeriod,
} from './release-period-settings.js';
import {
  getSelectedTestNames,
  isStoreTestsScope,
  normalizeStoreType,
  readStoreType,
  refreshStoreTests,
  STORE_TYPE_TESTS,
  toggleStoreTestsFields,
  updateStoreTestsCount,
} from './store-scope-settings.js';
import { listSchemaFields } from './import-export/page-map.js';
import { parseWorkbook } from './import-export/template.js';
import { createAdminFetch, createFetchPage } from './lib/da-page-fetch.js';
import { runWithConcurrency } from './lib/concurrency.js';
import { isFileTooLarge, loadExcelJS, MAX_WORKBOOK_FILE_BYTES } from './lib/excel-loader.js';
import {
  fetchAppLanguages,
  fetchBlockSchema,
  fetchLanguages,
  fetchProducts,
  fetchPromoNames,
  fetchPromoVariants,
  fetchSheetBlockMap,
  filterLanguagesForApp,
  getConfigFileOverride,
  getRelativeProductsPath,
  getStorePublishApi,
} from './lib/utils.js';
import {
  applyReleasePeriod,
  devicesFromParsed,
  fieldKeysWithContent,
  languageNamesWithContent,
} from './export.js';
import { createPublishProgressModal, publishSelection, waitForPublishCompletion } from './publish.js';

const VARIANT_FETCH_CONCURRENCY = 5;
const PUBLISH_LABEL = 'Publish to Store';

let languageIndexByName = new Map();
let allLanguages = [];
let appLanguages = [];
let schemaCache = null;
let sheetMapCache = null;
let promoRefreshSeq = 0;

const byId = (id) => document.getElementById(id);

function getPlatform() {
  return document.querySelector('input[name="publish-platform"]:checked')?.value || '';
}

function getSelectedLanguages() {
  return [...document.querySelectorAll('.publish-language-checkbox:checked')]
    .map((checkbox) => languageIndexByName.get(checkbox.value))
    .filter(Boolean);
}

function isListingChecked() {
  return Boolean(byId('publish-scope-listing')?.checked);
}

function isPromosChecked() {
  return Boolean(byId('publish-scope-promos')?.checked);
}

function getPublishBlockTypes() {
  const blockTypes = [];
  if (isListingChecked()) blockTypes.push('listing');
  if (isPromosChecked()) blockTypes.push('promo');
  return blockTypes;
}

function getSelectedFieldKeys() {
  return [...document.querySelectorAll('.publish-field-checkbox:checked')]
    .map((checkbox) => checkbox.value);
}

// Publish covers Store updates and a single CPP campaign; the shared panel is hidden for
// Store tests, so an instance name is only ever required for CPP.
function getCppName() {
  return isStoreTestsScope() ? getSelectedTestNames()[0] : undefined;
}

function isStoreScopeReady() {
  return !isStoreTestsScope() || getSelectedTestNames().length === 1;
}

function getPromoContexts() {
  const device = getPlatform();
  if (!isPromosChecked() || !device) return [];
  const contexts = [];
  document.querySelectorAll('.publish-promo-checkbox:checked').forEach((promoCheckbox) => {
    const promoName = promoCheckbox.value;
    document.querySelectorAll('.publish-promo-variant-checkbox:checked').forEach((variant) => {
      if (variant.dataset.promo === promoName) {
        contexts.push({ promoName, promoVariant: variant.value, device });
      }
    });
  });
  return contexts;
}

function updateCount(id, text) {
  const element = byId(id);
  if (element) element.textContent = text;
}

function updateSummaries() {
  const listing = isListingChecked();
  const promos = isPromosChecked();
  const listingDetails = byId('publish-listing-fields');
  const promoDetails = byId('publish-promo-fields');
  if (listingDetails) listingDetails.open = listing;
  if (promoDetails) promoDetails.open = promos;
  updateCount('publish-listing-field-count', listing ? `(${getSelectedFieldKeys().length} selected)` : '(not included)');
  updateCount('publish-promo-count', promos ? `(${getPromoContexts().length} selected)` : '(not included)');
  updateCount('publish-languages-count', `(${getSelectedLanguages().length} selected)`);
}

function updateButtonState() {
  const button = byId('publish-button');
  if (!button) return;
  const ready = Boolean(byId('publish-product')?.value)
    && getSelectedLanguages().length > 0
    && Boolean(getPlatform())
    && isReleasePeriodComplete()
    && isStoreScopeReady()
    && getPublishBlockTypes().length > 0
    && (!isListingChecked() || getSelectedFieldKeys().length > 0)
    && (!isPromosChecked() || getPromoContexts().length > 0);
  button.disabled = button.classList.contains('loading') || !ready;
  updateSummaries();
}

function checkboxItem({
  id,
  className,
  value,
  label,
  dataset = {},
}) {
  const item = document.createElement('div');
  item.className = 'checkbox-item';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.id = id;
  input.className = className;
  input.value = value;
  input.checked = true;
  Object.entries(dataset).forEach(([key, val]) => { input.dataset[key] = val; });
  const labelEl = document.createElement('label');
  labelEl.htmlFor = id;
  labelEl.textContent = label;
  item.append(input, labelEl);
  return item;
}

function sanitizeIdPart(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '_');
}

function renderLanguages(languages) {
  const container = byId('publish-languages-checkboxes');
  if (!container) return;
  container.textContent = '';
  if (!languages.length) {
    const empty = document.createElement('p');
    empty.textContent = `No languages found in ${getConfigFileOverride() || 'translate.json'}.`;
    container.append(empty);
    return;
  }
  languages.forEach((language) => {
    const item = checkboxItem({
      id: `publish-lang-${sanitizeIdPart(language.name)}`,
      className: 'publish-language-checkbox',
      value: language.name,
      label: language.label,
    });
    item.querySelector('input').checked = false;
    container.append(item);
  });
}

// Only languages listed for the selected app and platform in store-publish.json are offered.
function refreshLanguages() {
  const previous = new Set(
    [...document.querySelectorAll('.publish-language-checkbox:checked')].map((box) => box.value),
  );
  renderLanguages(
    filterLanguagesForApp(allLanguages, appLanguages, byId('publish-product')?.value, getPlatform()),
  );
  document.querySelectorAll('.publish-language-checkbox').forEach((box) => {
    box.checked = previous.has(box.value);
  });
}

function renderProducts(products) {
  const select = byId('publish-product');
  if (!select) return;
  select.textContent = '';
  const placeholder = new Option(products.length ? 'Select a product…' : 'No products found', '');
  select.append(placeholder);
  products.forEach((product) => select.append(new Option(product.label, product.value)));
}

function renderMessage(container, text) {
  container.textContent = '';
  const message = document.createElement('p');
  message.textContent = text;
  container.append(message);
}

// Metadata fields come straight from the already-fetched schema, so this is synchronous.
function refreshFields() {
  const container = byId('publish-listing-field-groups');
  if (!container) return;
  const platform = getPlatform();
  if (!isListingChecked()) {
    renderMessage(container, 'Not included in this publish.');
    return;
  }
  if (!platform || !schemaCache || !sheetMapCache) {
    renderMessage(container, 'Select a platform…');
    return;
  }
  const fields = listSchemaFields(schemaCache, sheetMapCache, platform, 'listing');
  container.textContent = '';
  if (!fields.length) {
    renderMessage(container, 'No fields found');
    return;
  }
  const group = document.createElement('div');
  group.className = 'checkbox-group';
  fields.forEach((field) => group.append(checkboxItem({
    id: `publish-field-${sanitizeIdPart(field.fieldKey)}`,
    className: 'publish-field-checkbox',
    value: field.fieldKey,
    label: field.fieldName,
  })));
  container.append(group);
}

function getBaseProbe() {
  const product = byId('publish-product')?.value;
  const device = getPlatform();
  const releasePeriod = readReleasePeriod();
  if (!product || !device || !isReleasePeriodComplete(releasePeriod)) return null;
  const english = languageIndexByName.get('English') || getSelectedLanguages()[0];
  if (!english) return null;
  return {
    language: english.localizedPath || '/',
    productsPath: getRelativeProductsPath(),
    product,
    device,
    year: releasePeriod.year,
    quarter: releasePeriod.quarter,
    month: releasePeriod.month,
    storeType: readStoreType(),
  };
}

function getStoreProbe() {
  return getBaseProbe();
}

function getPromoProbe() {
  const probe = getBaseProbe();
  if (!probe) return null;
  if (isStoreTestsScope()) {
    const testName = getCppName();
    if (!testName) return null;
    return { ...probe, testName };
  }
  return probe;
}

function renderPromoGroups(container, promos) {
  container.textContent = '';
  if (!promos.length) {
    renderMessage(container, 'No promos found');
    return;
  }
  promos.forEach((promo) => {
    const group = document.createElement('div');
    group.className = 'promo-group';
    const header = checkboxItem({
      id: `publish-promo-${sanitizeIdPart(promo.value)}`,
      className: 'publish-promo-checkbox',
      value: promo.value,
      label: promo.label,
    });
    header.classList.add('promo-group-header');
    const variants = document.createElement('div');
    variants.className = 'promo-variant-list';
    variants.dataset.promo = promo.value;
    renderMessage(variants, 'Loading variants…');
    group.append(header, variants);
    container.append(group);
  });
}

function renderPromoVariants(container, promoName, variants) {
  const list = [...container.querySelectorAll('.promo-variant-list')]
    .find((element) => element.dataset.promo === promoName);
  if (!list) return;
  list.textContent = '';
  (variants.length ? variants : [{ value: 'default', label: 'Default' }]).forEach((variant) => {
    const item = checkboxItem({
      id: `publish-promo-variant-${sanitizeIdPart(promoName)}-${sanitizeIdPart(variant.value)}`,
      className: 'publish-promo-variant-checkbox',
      value: variant.value,
      label: variant.label,
      dataset: { promo: promoName },
    });
    item.classList.add('promo-variant-item');
    list.append(item);
  });
}

async function refreshStoreNames(context, token) {
  if (!isStoreTestsScope()) return;
  await refreshStoreTests(context, token, getStoreProbe);
}

async function refreshPromos(context, token) {
  const container = byId('publish-promo-groups');
  if (!container) return;
  promoRefreshSeq += 1;
  const seq = promoRefreshSeq;
  if (!isPromosChecked()) {
    renderMessage(container, 'Not included in this publish.');
    updateButtonState();
    return;
  }
  const probe = getPromoProbe();
  if (!probe) {
    renderMessage(container, 'Select product, language, platform, and release period…');
    updateButtonState();
    return;
  }
  renderMessage(container, 'Loading promos…');
  try {
    const promos = await fetchPromoNames({ context, token, selection: probe });
    if (seq !== promoRefreshSeq) return;
    renderPromoGroups(container, promos);
    await runWithConcurrency(promos, VARIANT_FETCH_CONCURRENCY, async (promo) => {
      const variants = await fetchPromoVariants({
        context,
        token,
        selection: probe,
        promoName: promo.value,
      });
      if (seq === promoRefreshSeq) renderPromoVariants(container, promo.value, variants);
    });
  } catch (error) {
    if (seq !== promoRefreshSeq) return;
    // eslint-disable-next-line no-console
    console.error('[aso publish] promo discovery failed', error);
    renderMessage(container, 'Could not load promos.');
  }
  if (seq === promoRefreshSeq) updateButtonState();
}

function setButtonLabel(text) {
  const button = byId('publish-button');
  if (button) button.textContent = text;
}

function showStatus(message, duration = 2500) {
  const button = byId('publish-button');
  if (!button) return;
  button.textContent = message;
  button.classList.remove('loading');
  window.setTimeout(() => {
    setButtonLabel(PUBLISH_LABEL);
    updateButtonState();
  }, duration);
}

// Same content resolution as Export: collectExportData (via publishSelection) with the
// shared createFetchPage, so text, spacing, keywords and constants resolve identically.
async function handlePublish(org, repo, token) {
  const button = byId('publish-button');
  if (button.classList.contains('loading')) return;
  const summary = byId('publish-summary');
  button.classList.add('loading');
  setButtonLabel('Publishing...');
  button.disabled = true;
  if (summary) summary.textContent = '';

  let progress;
  try {
    progress = createPublishProgressModal(button);
    if (!schemaCache || !sheetMapCache) throw new Error('Config fetch failed');

    const platform = getPlatform();
    if (!platform) throw new Error('Select a platform');
    if (!isStoreScopeReady()) throw new Error('Select one CPP campaign');
    const blockTypes = getPublishBlockTypes();
    if (!blockTypes.length) throw new Error('Select content');
    const promoContexts = getPromoContexts();
    if (blockTypes.includes('promo') && !promoContexts.length) throw new Error('Select promo');

    const selection = blockTypes.includes('listing')
      ? { fieldsByDeviceBlock: { [`${platform}:listing`]: getSelectedFieldKeys() } }
      : {};
    const adminFetch = createAdminFetch(org, repo, token);
    const apiBase = await getStorePublishApi({ context: { org, repo }, token });

    const result = await publishSelection({
      apiBase,
      org,
      repo,
      token,
      schema: schemaCache,
      sheetMap: sheetMapCache,
      product: byId('publish-product').value,
      platform,
      languages: getSelectedLanguages(),
      releasePeriod: readReleasePeriod(),
      storeType: readStoreType(),
      testName: getCppName(),
      fetchPage: createFetchPage(org, repo, token, adminFetch),
      blockTypes,
      promoContexts,
      selection,
      onRequestAccepted: progress.setRequestId,
    });

    if (!result.ok) {
      throw new Error(`Error ${result.status}: ${result.statusText || 'write failed'}`);
    }
    const completion = await waitForPublishCompletion({
      apiBase,
      requestId: result.requestId,
      token,
    });
    const title = completion.timedOut ? 'Publish not yet confirmed' : 'Published';
    const message = completion.timedOut
      ? 'Publish completion was not confirmed within one minute; it may still finish. Do not resubmit this request.'
      : 'Published';
    progress.finish(title, message, completion.timedOut);
    showStatus(title, 3000);
    if (summary) {
      summary.textContent = `${message} Request ID: ${result.requestId}. Status: ${completion.overallStatus}. Saved to ${result.filePath}`;
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[aso publish]', error);
    progress?.finish('Publish failed', error.message || 'Unknown error', true);
    showStatus('Publish failed');
    if (summary) summary.textContent = error.message || 'Unknown error';
  }
}

function restrictFieldsToFile(parsed) {
  const platform = getPlatform();
  if (!platform || !schemaCache || !sheetMapCache) return;
  const schemaFields = listSchemaFields(schemaCache, sheetMapCache, platform, 'listing');
  const keys = fieldKeysWithContent(parsed.metadata?.[platform], schemaFields);
  document.querySelectorAll('.publish-field-checkbox').forEach((checkbox) => {
    checkbox.checked = keys.includes(checkbox.value);
  });
}

function restrictPromosToFile(parsed) {
  const platform = getPlatform();
  const names = new Set();
  const variants = new Set();
  (parsed.promos || []).forEach((promo) => {
    const deviceData = promo.devices?.[platform];
    if (!deviceData) return;
    names.add(promo.promoName);
    Object.keys(deviceData.variants || {}).forEach((variant) => {
      variants.add(`${promo.promoName}|${variant}`);
    });
  });
  document.querySelectorAll('.publish-promo-checkbox').forEach((checkbox) => {
    checkbox.checked = names.has(checkbox.value);
  });
  document.querySelectorAll('.publish-promo-variant-checkbox').forEach((checkbox) => {
    checkbox.checked = variants.has(`${checkbox.dataset.promo}|${checkbox.value}`);
  });
}

async function handleLoadFile(context, token, file) {
  const summary = byId('publish-scope-file-summary');
  const say = (text) => { if (summary) summary.textContent = text; };
  say('Reading file…');
  if (isFileTooLarge(file)) {
    say(`File is too large to read (max ${Math.round(MAX_WORKBOOK_FILE_BYTES / (1024 * 1024))}MB).`);
    return;
  }
  try {
    const ExcelJS = await loadExcelJS();
    const parsed = await parseWorkbook(await file.arrayBuffer(), ExcelJS);
    const product = parsed.settings?.product;
    if (!product || !parsed.languageNames.length) {
      say('Could not read a product and languages from this file.');
      return;
    }

    const select = byId('publish-product');
    const hasProduct = [...select.options].some((option) => option.value === product);
    select.value = hasProduct ? product : '';
    applyReleasePeriod(parsed.settings);
    const fileStoreType = normalizeStoreType(parsed.settings.storeType);
    const notes = [];
    if (fileStoreType === STORE_TYPE_TESTS) {
      notes.push('Store tests cannot be published — keeping the current store content.');
    } else {
      const radio = document.querySelector(`input[name="store-type"][value="${fileStoreType}"]`);
      if (radio) radio.checked = true;
      toggleStoreTestsFields();
    }

    const devices = devicesFromParsed(parsed);
    if (devices.size === 1) {
      const [device] = devices;
      const radio = byId(`publish-platform-${device}`);
      if (radio) radio.checked = true;
    } else {
      document.querySelectorAll('input[name="publish-platform"]').forEach((radio) => { radio.checked = false; });
      notes.push('File has both platforms — choose one to publish.');
    }

    refreshLanguages();
    const names = languageNamesWithContent(parsed);
    const known = new Set();
    document.querySelectorAll('.publish-language-checkbox').forEach((checkbox) => {
      known.add(checkbox.value);
      checkbox.checked = names.includes(checkbox.value);
    });

    const hasListing = (parsed.metadata?.apple?.length || 0)
      + (parsed.metadata?.google?.length || 0) > 0;
    byId('publish-scope-listing').checked = hasListing;
    byId('publish-scope-promos').checked = (parsed.promos?.length || 0) > 0;

    refreshFields();
    if (hasListing) restrictFieldsToFile(parsed);
    await refreshStoreNames(context, token);
    if (isStoreTestsScope() && parsed.settings.testName) {
      document.querySelectorAll('.store-test-checkbox').forEach((checkbox) => {
        checkbox.checked = checkbox.value === parsed.settings.testName;
      });
      updateStoreTestsCount();
    }
    await refreshPromos(context, token);
    if (isPromosChecked()) restrictPromosToFile(parsed);
    updateButtonState();

    const missing = names.filter((name) => !known.has(name));
    if (!hasProduct) notes.push(`Product not found: ${product}`);
    if (missing.length) notes.push(`Not found in current languages: ${missing.join(', ')}`);
    say([`Loaded from file: ${product} — ${names.length} language(s).`, ...notes].join(' '));
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[aso publish] load from file failed', error);
    say('Could not read this file.');
  }
}

function toggleAll(selector, onChange) {
  const boxes = [...document.querySelectorAll(selector)];
  const allChecked = boxes.every((box) => box.checked);
  boxes.forEach((box) => { box.checked = !allChecked; });
  onChange();
}

function setupListeners({ org, repo, token }) {
  const context = { org, repo };
  const refreshAll = async () => {
    refreshLanguages();
    toggleStoreTestsFields();
    refreshFields();
    await refreshStoreNames(context, token);
    await refreshPromos(context, token);
    updateButtonState();
  };
  const promoTriggers = [
    '#publish-product', 'input[name="publish-platform"]',
    '#release-period-year', '#release-period-quarter', '#release-period-month',
  ].join(', ');

  document.querySelectorAll(`${promoTriggers}, input[name="store-type"]`).forEach((element) => {
    element.addEventListener('change', refreshAll);
  });
  // CPP campaigns are published one at a time; the checkboxes live in the shared store panel.
  const formRoot = byId('publish-product-section')?.parentElement;
  document.addEventListener('change', (event) => {
    const { target } = event;
    if (!target?.classList?.contains('store-test-checkbox') || !formRoot?.contains(target)) return;
    if (target.checked) {
      document.querySelectorAll('.store-test-checkbox').forEach((checkbox) => {
        if (checkbox !== target) checkbox.checked = false;
      });
    }
    updateStoreTestsCount();
    refreshPromos(context, token);
    updateButtonState();
  });
  byId('publish-scope-listing')?.addEventListener('change', () => { refreshFields(); updateButtonState(); });
  byId('publish-scope-promos')?.addEventListener('change', () => refreshPromos(context, token));
  byId('publish-languages-checkboxes')?.addEventListener('change', (event) => {
    // English drives promo discovery; other languages only affect the selection count.
    if (event.target.value === 'English') refreshPromos(context, token);
    updateButtonState();
  });
  byId('publish-listing-field-groups')?.addEventListener('change', updateButtonState);
  byId('publish-promo-groups')?.addEventListener('change', (event) => {
    const { target } = event;
    if (target.classList.contains('publish-promo-checkbox') && target.checked) {
      document.querySelectorAll('.publish-promo-variant-checkbox').forEach((variant) => {
        if (variant.dataset.promo === target.value) variant.checked = true;
      });
    }
    updateButtonState();
  });

  byId('publish-languages-select-all')?.addEventListener('click', () => {
    toggleAll('.publish-language-checkbox', () => {
      refreshPromos(context, token);
      updateButtonState();
    });
  });
  byId('publish-listing-select-all')?.addEventListener('click', (event) => {
    event.preventDefault();
    toggleAll('.publish-field-checkbox', updateButtonState);
  });
  byId('publish-button')?.addEventListener('click', () => handlePublish(org, repo, token));
  byId('publish-scope-file-button')?.addEventListener('click', () => byId('publish-scope-file')?.click());
  byId('publish-scope-file')?.addEventListener('change', async (event) => {
    const [file] = event.target.files;
    event.target.value = '';
    if (file) await handleLoadFile(context, token, file);
  });
}

// eslint-disable-next-line import/prefer-default-export
export async function init({ context, token }) {
  const { org, repo } = context;
  if (!byId('publish-button')) return;
  const [languages, products, appLanguageRows] = await Promise.all([
    fetchLanguages({ context, token, configFile: getConfigFileOverride() }),
    fetchProducts({ context, token }),
    fetchAppLanguages({ context, token }),
  ]);
  allLanguages = languages;
  appLanguages = appLanguageRows;
  languageIndexByName = new Map(languages.map((language) => [language.name, language]));
  renderProducts(products);
  renderLanguages(languages);

  [schemaCache, sheetMapCache] = await Promise.all([
    fetchBlockSchema({ context: { org, repo }, token }),
    fetchSheetBlockMap({ context: { org, repo }, token }),
  ]);

  refreshFields();
  setupListeners({ org, repo, token });
  await refreshPromos({ org, repo }, token);
}
