import { getWorkbookSheetForBlock } from '../lib/sheet-to-block-map.js';

export {
  SHEET_IMAGES_VIDEOS,
  SHEET_METADATA,
  SHEET_PROMOS,
} from '../lib/sheet-to-block-map.js';

const BLOCK_TYPE_PROMO = 'promo';
const BLOCK_TYPE_IMAGES_VIDEOS = 'images-videos';
const BLOCK_TYPE_MEDIA_ASSETS = 'media-assets';

function normalizeDevice(device) {
  const key = String(device ?? '').trim().toLowerCase();
  return key === 'apple' || key === 'google' ? key : '';
}

function normalizeBlockType(blockType) {
  return String(blockType ?? '').trim().toLowerCase();
}

function normalizeFieldKey(fieldKey) {
  return String(fieldKey ?? '').trim();
}

function normalizePageLeaf(pageLeaf) {
  return String(pageLeaf ?? '').trim().replace(/^\/+|\/+$/g, '');
}

function buildBlockSchemaKey(device, blockType) {
  const normalizedDevice = normalizeDevice(device);
  const normalizedBlockType = normalizeBlockType(blockType);
  if (!normalizedDevice || !normalizedBlockType) return '';
  return `aso-app (${normalizedDevice}, ${normalizedBlockType})`;
}

function getSchemaBlockData(schema, device, blockType) {
  const blockKey = buildBlockSchemaKey(device, blockType);
  if (!blockKey || !schema?.[blockKey]?.data) return [];
  return schema[blockKey].data;
}

function getFieldKeyFromSchemaField(field) {
  return normalizeFieldKey(field?.['field key'] || field?.fieldKey);
}

function findSchemaFieldByKey(schema, device, blockType, fieldKey) {
  const key = normalizeFieldKey(fieldKey);
  if (!key) return null;
  return getSchemaBlockData(schema, device, blockType)
    .find((field) => getFieldKeyFromSchemaField(field) === key) || null;
}

function parseCharLimit(field) {
  const raw = field?.['character count'];
  if (raw == null || raw === '') return null;
  const parsed = parseInt(String(raw), 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function buildPromoPageLeaf(promoName, template, promoVariant = 'default') {
  const name = normalizePageLeaf(promoName);
  const variant = normalizePageLeaf(promoVariant) || 'default';
  if (!name) return '';

  const pattern = normalizePageLeaf(template);
  if (pattern) {
    return pattern
      .replace(/\{promoName\}/gi, name)
      .replace(/\{promoVariant\}/gi, variant)
      .replace(/\{variant\}/gi, variant)
      .replace(/\{name\}/gi, name);
  }

  return `promos/${name}/${variant}`;
}

function resolveMediaPageLeaf(fieldKey) {
  if (normalizeFieldKey(fieldKey).toLowerCase().startsWith('video')) return 'videos/copy';
  return 'images/copy';
}

function resolveMediaAssetsPageLeaf(fieldKey) {
  if (normalizeFieldKey(fieldKey).toLowerCase().startsWith('video')) return 'videos/assets';
  return 'images/assets';
}

/**
 * media-assets fields don't go through enrichSchemaField/getWorkbookSheetForBlock
 * — they're binary assets with no workbook sheet at all, not text bound for Excel.
 */
export function listMediaAssetFields(schema, device) {
  const normalizedDevice = normalizeDevice(device);
  if (!normalizedDevice || !schema) return [];

  return getSchemaBlockData(schema, normalizedDevice, BLOCK_TYPE_MEDIA_ASSETS)
    .map((field) => {
      const fieldKey = getFieldKeyFromSchemaField(field);
      const fieldName = String(field?.['field name'] ?? '').trim();
      if (!fieldKey || !fieldName) return null;
      return {
        fieldKey,
        fieldName,
        pageLeaf: normalizePageLeaf(field?.['page leaf']) || resolveMediaAssetsPageLeaf(fieldKey),
        blockKey: buildBlockSchemaKey(normalizedDevice, BLOCK_TYPE_MEDIA_ASSETS),
      };
    })
    .filter(Boolean);
}

function resolvePageLeaf({
  blockType,
  field,
  fieldKey,
  promoName,
  promoVariant,
}) {
  const normalizedBlockType = normalizeBlockType(blockType);
  if (normalizedBlockType === BLOCK_TYPE_PROMO) {
    return buildPromoPageLeaf(promoName, field?.['page leaf'], promoVariant);
  }

  const fromSchema = normalizePageLeaf(field?.['page leaf']);
  if (fromSchema) return fromSchema;

  if (normalizedBlockType === BLOCK_TYPE_IMAGES_VIDEOS) {
    return resolveMediaPageLeaf(fieldKey);
  }

  return '';
}

export function fieldAcceptsKeywords(schemaField) {
  return schemaField?.['keywords injection']?.toString().toLowerCase() === 'yes';
}

function enrichSchemaField(
  device,
  blockType,
  field,
  sheetMap,
  promoName,
  promoVariant,
) {
  const blockKey = buildBlockSchemaKey(device, blockType);
  const fieldKey = getFieldKeyFromSchemaField(field);
  if (!blockKey || !fieldKey) return null;

  const sheet = getWorkbookSheetForBlock(sheetMap, blockKey);
  if (!sheet) return null;

  const pageLeaf = resolvePageLeaf({
    blockType,
    field,
    fieldKey,
    promoName,
    promoVariant,
  });
  if (!pageLeaf) return null;

  return {
    fieldKey,
    fieldName: String(field?.['field name'] ?? '').trim(),
    charLimit: parseCharLimit(field),
    acceptsKeywords: fieldAcceptsKeywords(field),
    pageLeaf,
    sheet,
    blockKey,
  };
}

function mapBlockFields(
  schema,
  sheetMap,
  device,
  blockType,
  promoName,
  promoVariant,
  pageLeafFilter,
) {
  return getSchemaBlockData(schema, device, blockType)
    .map((field) => enrichSchemaField(
      device,
      blockType,
      field,
      sheetMap,
      promoName,
      promoVariant,
    ))
    .filter((field) => field && (!pageLeafFilter || field.pageLeaf === pageLeafFilter));
}

export function getFieldPageMapping({
  device,
  blockType,
  fieldKey,
  schema,
  sheetMap,
  promoName,
  promoVariant = 'default',
}) {
  const normalizedDevice = normalizeDevice(device);
  const normalizedBlockType = normalizeBlockType(blockType);
  const normalizedFieldKey = normalizeFieldKey(fieldKey);
  if (!normalizedDevice || !normalizedBlockType || !normalizedFieldKey || !schema || !sheetMap) {
    return null;
  }

  const field = findSchemaFieldByKey(
    schema,
    normalizedDevice,
    normalizedBlockType,
    normalizedFieldKey,
  );
  const enriched = field && enrichSchemaField(
    normalizedDevice,
    normalizedBlockType,
    field,
    sheetMap,
    promoName,
    promoVariant,
  );

  return enriched
    ? { pageLeaf: enriched.pageLeaf, sheet: enriched.sheet, blockKey: enriched.blockKey }
    : null;
}

export function getFieldsForPageLeaf({
  device,
  blockType,
  pageLeaf,
  schema,
  sheetMap,
  promoName,
  promoVariant = 'default',
}) {
  const normalizedDevice = normalizeDevice(device);
  const normalizedBlockType = normalizeBlockType(blockType);
  const normalizedPageLeaf = normalizePageLeaf(pageLeaf);
  if (!normalizedDevice || !normalizedBlockType || !normalizedPageLeaf || !schema || !sheetMap) {
    return [];
  }

  return mapBlockFields(
    schema,
    sheetMap,
    normalizedDevice,
    normalizedBlockType,
    promoName,
    promoVariant,
    normalizedPageLeaf,
  );
}

export function listSchemaFields(schema, sheetMap, device, blockType, promoContext = {}) {
  const normalizedDevice = normalizeDevice(device);
  const normalizedBlockType = normalizeBlockType(blockType);
  if (!normalizedDevice || !normalizedBlockType || !schema || !sheetMap) return [];

  const { promoName, promoVariant = 'default' } = promoContext;
  return mapBlockFields(
    schema,
    sheetMap,
    normalizedDevice,
    normalizedBlockType,
    promoName,
    promoVariant,
  );
}
