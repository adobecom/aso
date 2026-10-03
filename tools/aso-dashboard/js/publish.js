import { readStoreType, STORE_TYPE_UPDATES } from './store-scope-settings.js';
import { collectExportData } from './import-export/collect.js';
import { putJsonSource } from './lib/da-source-client.js';
import { getRelativeProductsPath } from './lib/utils.js';

export const PUBLISH_REQUEST_PATH = '/.da/storepublish/request';

const PUBLISH_BLOCK_TYPES = ['listing', 'promo'];

const pad = (value, length = 2) => String(value).padStart(length, '0');

// Publish request filename: YYYY-MM-DD-t-HH-MI-SS-SSS (24-hour clock, UTC).
export function formatPublishTimestamp(date = new Date()) {
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    't',
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
    pad(date.getUTCMilliseconds(), 3),
  ].join('-');
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

export function buildPublishPayload(cells, options) {
  const {
    product,
    platform,
    languages,
    promoNames = [],
    blockTypes = PUBLISH_BLOCK_TYPES,
  } = options;
  const cellIndex = new Map();
  cells.forEach((cell) => {
    const key = `${cell.language.code}|${cell.device}|${cell.blockType}|${cell.fieldKey}|${cell.promoName ?? ''}`;
    if (!cellIndex.has(key) || cell.hasHtml) cellIndex.set(key, cell.text);
  });

  const langCodes = languages.map((l) => l.code);

  if (platform === 'apple') {
    const listingFields = ['name', 'subtitle', 'description', 'keywords', 'marketingUrl', 'promotionalText', 'supportUrl'];
    const payload = { app: product };
    if (blockTypes.includes('listing')) {
      payload.metadata = { localizations: langCodes.map((code) => buildLocalization(cellIndex, code, 'apple', 'listing', listingFields)) };
    }

    if (blockTypes.includes('promo') && promoNames.length) {
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
  const payload = {
    app: product,
    platform: 'google',
    track: readStoreType() === STORE_TYPE_UPDATES ? 'production' : readStoreType(),
  };
  if (blockTypes.includes('listing')) {
    payload.metadata = { localizations: langCodes.map((code) => buildLocalization(cellIndex, code, 'google', 'listing', googleFields)) };
  }
  return payload;
}

// Builds and writes a publish payload for a single product/platform to the store request
// queue. Shares the Export tab's product/language/device/release-period selections and its
// "Content to publish" filters (block types, selected promos/variants, per-field selection),
// plus the DA fetch plumbing — callers (export.js) pass in an already-authenticated fetchPage.
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
  blockTypes = PUBLISH_BLOCK_TYPES,
  promoContexts = [],
  selection = {},
  now = new Date(),
}) {
  const platformPromoContexts = promoContexts.filter(
    (context) => !context.device || context.device === platform,
  );
  const effectiveBlockTypes = blockTypes.filter(
    (blockType) => PUBLISH_BLOCK_TYPES.includes(blockType)
      && (blockType !== 'promo' || platformPromoContexts.length),
  );
  const promoNames = effectiveBlockTypes.includes('promo')
    ? [...new Set(platformPromoContexts.map((context) => context.promoName))]
    : [];

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
    blockTypes: effectiveBlockTypes,
    promoContexts: platformPromoContexts,
    selection: {
      ...selection,
      blockTypes: effectiveBlockTypes,
      promoContexts: platformPromoContexts,
    },
    rowRoles: ['localized'],
    fetchPage,
  });

  const payload = buildPublishPayload(cells, {
    product,
    platform,
    languages,
    promoNames,
    blockTypes: effectiveBlockTypes,
  });

  const filePath = `${PUBLISH_REQUEST_PATH}/${formatPublishTimestamp(now)}.json`;
  const result = await putJsonSource(org, repo, filePath, payload, token);

  return { ok: result.ok, status: result.status, statusText: result.statusText, filePath };
}
