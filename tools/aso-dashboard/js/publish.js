import { readStoreType, STORE_TYPE_UPDATES } from './store-scope-settings.js';
import { collectExportData } from './import-export/collect.js';
import { buildPromosListPath } from './lib/content-taxonomy.js';
import { listDirectory, putJsonSource } from './lib/da-source-client.js';
import { getRelativeProductsPath } from './lib/utils.js';

export const PUBLISH_REQUEST_PATH = '/.da/storepublish/request';

// ponytail: promos auto-listed from DA; CPP/store-tests support can be added when needed
async function listPromoNames(org, repo, token, {
  product, platform, year, quarter, month, englishLanguage,
}) {
  if (!englishLanguage) return [];
  const promosPath = buildPromosListPath({
    language: englishLanguage.localizedPath,
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

export function buildPublishPayload(cells, { product, platform, languages, promoNames }) {
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
      metadata: { localizations: langCodes.map((code) => buildLocalization(cellIndex, code, 'apple', 'listing', listingFields)) },
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
    metadata: { localizations: langCodes.map((code) => buildLocalization(cellIndex, code, 'google', 'listing', googleFields)) },
  };
}

// Builds and writes a publish payload for a single product/platform to the store request
// queue. Shares the Export tab's product/language/device/release-period selections and DA
// fetch plumbing — callers (export.js) pass in an already-authenticated fetchPage.
// eslint-disable-next-line import/prefer-default-export
export async function publishSelection({
  org,
  repo,
  token,
  schema,
  sheetMap,
  product,
  platform,
  languages,
  releasePeriod,
  fetchPage,
  englishLanguage,
}) {
  const promoNames = platform === 'apple'
    ? await listPromoNames(
      org,
      repo,
      token,
      { product, platform, ...releasePeriod, englishLanguage },
    )
    : [];

  const promoContexts = promoNames.map((promoName) => ({ promoName, promoVariant: 'default', device: platform }));
  const blockTypes = promoNames.length ? ['listing', 'promo'] : ['listing'];

  const { cells } = await collectExportData({
    org,
    repo,
    token,
    schema,
    sheetMap,
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

  const payload = buildPublishPayload(cells, { product, platform, languages, promoNames });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = `${PUBLISH_REQUEST_PATH}/${timestamp}.json`;
  const result = await putJsonSource(org, repo, filePath, payload, token);

  return { ok: result.ok, status: result.status, statusText: result.statusText, filePath };
}
