import { buildContentPath, STORE_TYPE_UPDATES } from '../lib/content-taxonomy.js';

const ROW_ROLE_ENGLISH_SOURCE = 'english-source';
const ROW_ROLE_LOCALIZED = 'localized';

const ROW_ROLES = Object.freeze([
  ROW_ROLE_ENGLISH_SOURCE,
  ROW_ROLE_LOCALIZED,
]);

function normalizePagePath(pagePath) {
  return String(pagePath ?? '').trim().replace(/\.html$/i, '');
}

function buildDaEditUrl(org, repo, pagePath) {
  return `https://da.live/edit#/${org}/${repo}${pagePath}`;
}

function resolveLanguagePrefix(language, rowRole) {
  if (rowRole === ROW_ROLE_LOCALIZED) return language?.localizedPath ?? '';
  return language?.sourcePath ?? '';
}

function resolvePagePath({
  language,
  rowRole,
  pageLeaf,
  productsPath,
  product,
  device,
  year,
  quarter,
  month,
  storeType = STORE_TYPE_UPDATES,
  testName,
}) {
  const langPrefix = resolveLanguagePrefix(language, rowRole);
  if (!langPrefix || !pageLeaf) return null;

  return buildContentPath({
    language: langPrefix,
    productsPath,
    product,
    device,
    year,
    quarter,
    month,
    storeType,
    testName,
    pageLeaf,
  });
}

function buildHtmlSourcePath(pagePath) {
  const base = normalizePagePath(pagePath);
  if (!base) return '';
  return `${base}.html`;
}

function spacingSidecarPath(pagePath) {
  const base = normalizePagePath(pagePath);
  if (!base) return '';
  const lastSlash = base.lastIndexOf('/');
  const folder = base.slice(0, lastSlash + 1);
  const filename = base.slice(lastSlash + 1);
  return `${folder}.${filename}-spacing.json`;
}

function keywordsSidecarPath(pagePath) {
  const base = normalizePagePath(pagePath);
  if (!base) return '';
  return `${base}-keywords.json`;
}

function resolveKeywordPath(params) {
  const { language } = params;
  if (!language?.isManagedLocale) return null;

  const pagePath = resolvePagePath({
    ...params,
    rowRole: ROW_ROLE_ENGLISH_SOURCE,
  });
  if (!pagePath) return null;

  return keywordsSidecarPath(pagePath);
}

/**
 * Collapse entries that share the same page path (e.g. English + unmanaged markets).
 * Returns one item per unique path with `refs` listing all column targets.
 */
function dedupePaths(entries) {
  const byPath = new Map();

  entries.forEach((entry) => {
    const key = normalizePagePath(entry.pagePath || entry.path);
    if (!key) return;

    if (!byPath.has(key)) {
      byPath.set(key, {
        ...entry,
        pagePath: key,
        refs: [],
      });
    }

    const bucket = byPath.get(key);
    bucket.refs.push({
      product: entry.product,
      device: entry.device,
      language: entry.language,
      rowRole: entry.rowRole,
      fieldKey: entry.fieldKey,
      fieldName: entry.fieldName,
      acceptsKeywords: entry.acceptsKeywords,
      charLimit: entry.charLimit,
      blockType: entry.blockType,
      blockKey: entry.blockKey,
      sheet: entry.sheet,
      pageLeaf: entry.pageLeaf,
      promoName: entry.promoName,
      promoVariant: entry.promoVariant,
    });
  });

  return [...byPath.values()];
}

export {
  ROW_ROLE_ENGLISH_SOURCE,
  ROW_ROLE_LOCALIZED,
  ROW_ROLES,
  buildDaEditUrl,
  buildHtmlSourcePath,
  dedupePaths,
  keywordsSidecarPath,
  resolveKeywordPath,
  resolvePagePath,
  spacingSidecarPath,
};
