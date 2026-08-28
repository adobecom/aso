export const STORE_TYPE_UPDATES = 'store-updates';
export const STORE_TYPE_TESTS = 'store-tests';
export const STORE_TYPE_CPP = 'cpp';
export const STORE_TYPES = Object.freeze([STORE_TYPE_UPDATES, STORE_TYPE_TESTS, STORE_TYPE_CPP]);

// store-tests and cpp both nest under a named instance (a test name / campaign name) inside
// the release period, and both require that name before a page path can be built.
export function storeTypeRequiresInstanceName(storeType) {
  const type = String(storeType ?? '').trim();
  return type === STORE_TYPE_TESTS || type === STORE_TYPE_CPP;
}
export const DEVICES = Object.freeze(['apple', 'google']);
export const QUARTERS = Object.freeze(['q1', 'q2', 'q3', 'q4']);
export const MONTHS = Object.freeze([
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
]);

const YEAR_OPTIONS_START = 2023;

function normalizeSegment(value) {
  if (value == null) return '';
  return String(value).trim().replace(/^\/+|\/+$/g, '');
}

function cartesianProduct(...lists) {
  return lists.reduce(
    (results, list) => results.flatMap((combo) => list.map((item) => combo.concat(item))),
    [[]],
  );
}

function normalizeLanguagePrefix(value) {
  if (value == null || !String(value).trim()) return '';
  let path = String(value).trim();
  if (!path.startsWith('/')) path = `/${path}`;
  path = path.replace(/\/+$/, '');
  return path === '/' ? '' : path;
}

function normalizeProductsPath(productsPath) {
  const raw = productsPath ?? 'products';
  return normalizeSegment(raw);
}

function normalizeQuarter(quarter) {
  const key = normalizeSegment(quarter).toLowerCase();
  if (!QUARTERS.includes(key)) return '';
  return key;
}

function populateSelect(selectId, items, placeholder, selectedValue) {
  const select = document.getElementById(selectId);
  if (!select) return;
  select.innerHTML = '';
  const first = document.createElement('option');
  first.value = '';
  first.textContent = placeholder;
  select.appendChild(first);
  items.forEach((item) => {
    const option = document.createElement('option');
    const value = item.value ?? item;
    const label = item.label ?? item;
    option.value = value;
    option.textContent = label;
    if (selectedValue && value === selectedValue) option.selected = true;
    select.appendChild(option);
  });
}

function buildDeviceBasePath({
  language,
  productsPath,
  product,
  device,
}) {
  const langPrefix = normalizeLanguagePrefix(language);
  const root = normalizeProductsPath(productsPath);
  const tail = [
    root,
    normalizeSegment(product),
    normalizeSegment(device),
  ];

  if (tail.some((segment) => !segment)) return null;
  if (!DEVICES.includes(tail[2])) return null;

  const path = tail.join('/');
  return langPrefix ? `${langPrefix}/${path}` : `/${path}`;
}

function buildContentBasePath(params) {
  const deviceBase = buildDeviceBasePath(params);
  if (!deviceBase) return null;

  const normalizedQuarter = normalizeQuarter(params.quarter);
  const timeSegments = [
    normalizeSegment(params.year),
    normalizedQuarter,
    normalizeSegment(params.month),
  ];
  if (timeSegments.some((segment) => !segment)) return null;
  if (!MONTHS.includes(timeSegments[2])) return null;

  return `${deviceBase}/${timeSegments.join('/')}`;
}

function appendPageLeaf(basePath, pageLeaf) {
  const leaf = normalizeSegment(pageLeaf).replace(/\/+/g, '/');
  if (!leaf) return basePath;
  return `${basePath}/${leaf}`;
}

export function buildStoreUpdatesBasePath(params) {
  const base = buildContentBasePath(params);
  if (!base) return null;
  return `${base}/${STORE_TYPE_UPDATES}`;
}

export function buildStoreInstanceListPath(params, storeType = STORE_TYPE_TESTS) {
  const base = buildContentBasePath(params);
  if (!base) return null;
  return `${base}/${normalizeSegment(storeType) || STORE_TYPE_TESTS}`;
}

export function buildStoreTestsListPath(params) {
  return buildStoreInstanceListPath(params, STORE_TYPE_TESTS);
}

function buildStoreBucketBasePath({
  language,
  productsPath,
  product,
  device,
  year,
  quarter,
  month,
  storeType = STORE_TYPE_UPDATES,
  testName,
}) {
  const type = normalizeSegment(storeType) || STORE_TYPE_UPDATES;
  if (storeTypeRequiresInstanceName(type)) {
    return buildContentPath({
      language,
      productsPath,
      product,
      device,
      year,
      quarter,
      month,
      storeType: type,
      testName,
    });
  }
  return buildStoreUpdatesBasePath({
    language,
    productsPath,
    product,
    device,
    year,
    quarter,
    month,
  });
}

export function buildPromosListPath(params) {
  const base = buildStoreBucketBasePath(params);
  if (!base) return null;
  return `${base}/promos`;
}

export function buildPromoVariantsListPath(params, promoName) {
  const promosPath = buildPromosListPath(params);
  const name = normalizeSegment(promoName);
  if (!promosPath || !name) return null;
  return `${promosPath}/${name}`;
}

export function buildMetadataPagePath(params, pageLeaf) {
  const base = buildStoreUpdatesBasePath(params);
  if (!base || !pageLeaf) return null;
  return appendPageLeaf(base, pageLeaf);
}

export function buildPromoPagePath(params, promoName, variant = 'default') {
  const base = buildStoreUpdatesBasePath(params);
  const name = normalizeSegment(promoName);
  const page = normalizeSegment(variant);
  if (!base || !name || !page) return null;
  return `${base}/promos/${name}/${page}`;
}

export function buildContentPath({
  language,
  productsPath,
  product,
  device,
  year,
  quarter,
  month,
  storeType,
  testName,
  pageLeaf,
}) {
  const type = normalizeSegment(storeType);
  if (type === STORE_TYPE_UPDATES) {
    const base = buildStoreUpdatesBasePath({
      language,
      productsPath,
      product,
      device,
      year,
      quarter,
      month,
    });
    if (!base) return null;
    return pageLeaf ? appendPageLeaf(base, pageLeaf) : base;
  }
  if (storeTypeRequiresInstanceName(type)) {
    const base = buildContentBasePath({
      language,
      productsPath,
      product,
      device,
      year,
      quarter,
      month,
    });
    if (!base) return null;
    const test = normalizeSegment(testName);
    if (!test) return null;
    const testPath = `${base}/${type}/${test}`;
    return pageLeaf ? appendPageLeaf(testPath, pageLeaf) : testPath;
  }
  return null;
}

export function buildExportPagePaths({
  productsPath,
  products,
  languages,
  devices,
  year,
  quarter,
  month,
  storeType,
  testNames = [],
}) {
  const type = normalizeSegment(storeType);
  if (!STORE_TYPES.includes(type)) return [];

  const tests = storeTypeRequiresInstanceName(type) ? testNames : [undefined];

  return cartesianProduct(products, languages, devices, tests)
    .map(([product, language, device, testName]) => {
      const path = buildContentPath({
        language,
        productsPath,
        product,
        device,
        year,
        quarter,
        month,
        storeType: type,
        testName,
      });
      if (!path) return null;
      return {
        product,
        language,
        device,
        ...(testName ? { testName } : {}),
        path,
      };
    })
    .filter(Boolean);
}

export function formatMonthLabel(month) {
  const key = normalizeSegment(month);
  if (!key) return '';
  return key.charAt(0).toUpperCase() + key.slice(1);
}

export function formatQuarterLabel(quarter) {
  const key = normalizeQuarter(quarter);
  if (!key) return '';
  return key.toUpperCase();
}

export function getYearOptions(startYear = YEAR_OPTIONS_START, endYear = new Date().getFullYear()) {
  const years = [];
  for (let y = endYear; y >= startYear; y -= 1) {
    years.push(String(y));
  }
  return years;
}

export function getDefaultReleasePeriod(date = new Date()) {
  const monthIndex = date.getMonth();
  return {
    year: String(date.getFullYear()),
    quarter: QUARTERS[Math.floor(monthIndex / 3)],
    month: MONTHS[monthIndex],
  };
}

export function storeTypeUsesReleasePeriod(storeType) {
  const type = normalizeSegment(storeType);
  return type === STORE_TYPE_UPDATES || storeTypeRequiresInstanceName(type);
}

export function setReleasePeriodGroupVisible(groupId, storeType) {
  const group = document.getElementById(groupId);
  if (!group) return;
  if (storeTypeUsesReleasePeriod(storeType)) {
    group.classList.remove('hidden');
  } else {
    group.classList.add('hidden');
  }
}

export function populateReleasePeriodDropdowns(idPrefix = '') {
  const { year, quarter, month } = getDefaultReleasePeriod();
  populateSelect(
    `${idPrefix}year`,
    getYearOptions().map((value) => ({ value, label: value })),
    'Select a year...',
    year,
  );
  populateSelect(
    `${idPrefix}quarter`,
    QUARTERS.map((value) => ({ value, label: formatQuarterLabel(value) })),
    'Select a quarter...',
    quarter,
  );
  populateSelect(
    `${idPrefix}month`,
    MONTHS.map((value) => ({ value, label: formatMonthLabel(value) })),
    'Select a month...',
    month,
  );
}
