import { DEVICES, STORE_TYPE_UPDATES } from '../lib/content-taxonomy.js';
import {
  getKeywordsSidecar,
  getSpacingSidecar,
  getSourceText,
} from '../lib/da-source-client.js';
import { readKeywordFromSidecar } from './keywords.js';
import { parseFieldFromPage } from './html.js';
import { listSchemaFields } from './page-map.js';
import {
  buildHtmlSourcePath,
  dedupePaths,
  ROW_ROLE_ENGLISH_SOURCE,
  ROW_ROLES,
  resolvePagePath,
} from './paths.js';

const DEFAULT_BLOCK_TYPES = Object.freeze(['listing', 'promo', 'images-videos']);

function blockTypeFromBlockKey(blockKey) {
  const match = String(blockKey ?? '').match(/aso-app\s*\([^,]+,\s*([^)]+)\)/i);
  return match ? match[1].trim().toLowerCase() : '';
}

function deviceFromBlockKey(blockKey) {
  const match = String(blockKey ?? '').match(/aso-app\s*\(([^,]+),/i);
  return match ? match[1].trim().toLowerCase() : '';
}

function matchesSelection(selection, entry) {
  if (!selection) return true;

  if (selection.blockTypes?.length && !selection.blockTypes.includes(entry.blockType)) {
    return false;
  }

  if (entry.blockType === 'promo' && selection.promoContexts?.length) {
    const allowed = selection.promoContexts.some(
      (context) => context.promoName === entry.promoName
        && (context.promoVariant == null || context.promoVariant === entry.promoVariant)
        && (context.device == null || context.device === entry.device),
    );
    if (!allowed) return false;
  }

  if (selection.fieldsByDeviceBlock) {
    const key = `${entry.device}:${entry.blockType}`;
    // A key only exists once the field-checkbox UI has rendered for that device/blockType —
    // an empty array there means every field got unchecked (export nothing), which is
    // different from the key being absent entirely (no field UI touched this combo, e.g.
    // promos, so leave it unrestricted).
    if (Object.prototype.hasOwnProperty.call(selection.fieldsByDeviceBlock, key)) {
      const allowedFields = selection.fieldsByDeviceBlock[key];
      if (!allowedFields.includes(entry.fieldKey)) return false;
    }
  }

  return true;
}

function buildFieldRequests({
  schema,
  sheetMap,
  products,
  languages,
  devices,
  year,
  quarter,
  month,
  productsPath,
  storeType,
  blockTypes,
  promoContexts,
  rowRoles,
  selection,
  testName,
}) {
  const requests = [];

  products.forEach((product) => {
    devices.forEach((device) => {
      blockTypes.forEach((blockType) => {
        // A promoContext with a device only applies to that device (promos can be device-specific).
        const contexts = blockType === 'promo' && promoContexts.length
          ? promoContexts.filter((ctx) => ctx.device == null || ctx.device === device)
          : [{}];

        contexts.forEach((promoContext) => {
          const fields = listSchemaFields(schema, sheetMap, device, blockType, promoContext);
          fields.forEach((field) => {
            languages.forEach((language) => {
              rowRoles.forEach((rowRole) => {
                const pagePath = resolvePagePath({
                  language,
                  rowRole,
                  pageLeaf: field.pageLeaf,
                  productsPath,
                  product,
                  device,
                  year,
                  quarter,
                  month,
                  storeType,
                  testName,
                });
                if (!pagePath) return;

                const entry = {
                  product,
                  device,
                  language,
                  rowRole,
                  fieldKey: field.fieldKey,
                  fieldName: field.fieldName,
                  acceptsKeywords: field.acceptsKeywords,
                  charLimit: field.charLimit,
                  blockType,
                  blockKey: field.blockKey,
                  sheet: field.sheet,
                  pageLeaf: field.pageLeaf,
                  pagePath,
                  promoName: promoContext.promoName,
                  promoVariant: promoContext.promoVariant,
                };
                if (!matchesSelection(selection, entry)) return;
                requests.push(entry);
              });
            });
          });
        });
      });
    });
  });

  return requests;
}

function buildSkippedEntries(cells) {
  return cells
    .filter((cell) => !cell.hasHtml)
    .map((cell) => ({
      fieldName: cell.fieldName,
      fieldKey: cell.fieldKey,
      pagePath: cell.pagePath,
      rowRole: cell.rowRole,
      language: cell.language?.name,
      reason: 'notFound',
    }));
}

// Unlike buildSkippedEntries's payload-based predecessor, this reads straight off the
// fetched cells — so each over-limit entry carries its own pagePath for a direct edit link.
function findOverCharLimitCells(cells) {
  return cells
    .filter((cell) => cell.hasHtml && cell.charLimit && cell.text.length > cell.charLimit)
    .map((cell) => ({
      fieldName: cell.fieldName,
      fieldKey: cell.fieldKey,
      pagePath: cell.pagePath,
      rowRole: cell.rowRole,
      language: cell.language?.name,
      length: cell.text.length,
      charLimit: cell.charLimit,
    }));
}

async function defaultFetchPage(org, repo, pagePath, token) {
  const htmlPath = buildHtmlSourcePath(pagePath);
  const [html, spacingJson, keywordsJson] = await Promise.all([
    getSourceText(org, repo, htmlPath, token),
    getSpacingSidecar(org, repo, pagePath, token),
    getKeywordsSidecar(org, repo, pagePath, token),
  ]);

  return {
    html: html ?? '',
    htmlFound: html !== null,
    spacingSidecar: spacingJson,
    keywordsSidecar: keywordsJson,
  };
}

function expandFetchedPages(dedupedPages, {
  schema,
  constantsValues,
}) {
  const cells = [];

  dedupedPages.forEach((page) => {
    page.refs.forEach((ref) => {
      const blockType = ref.blockType || blockTypeFromBlockKey(ref.blockKey);
      const device = ref.device || deviceFromBlockKey(ref.blockKey);
      const text = page.html
        ? parseFieldFromPage({
          html: page.html,
          schema,
          device,
          blockType,
          fieldKey: ref.fieldKey,
          fieldName: ref.fieldName,
          constantsValues: page.constantsValues ?? constantsValues,
          spacingSidecar: page.spacingSidecar,
        })
        : '';

      const keywordText = ref.acceptsKeywords
        && ref.rowRole === ROW_ROLE_ENGLISH_SOURCE
        && ref.language?.isManagedLocale
        && page.keywordsSidecar
        ? readKeywordFromSidecar(
          page.keywordsSidecar,
          ref.blockKey,
          ref.fieldName,
          ref.language.name,
        )
        : '';

      cells.push({
        ...ref,
        pagePath: page.pagePath,
        text,
        keywordText,
        hasHtml: page.htmlFound !== false,
        spacingSidecar: page.spacingSidecar,
      });
    });
  });

  return cells;
}

async function collectExportData({
  org,
  repo,
  token,
  schema,
  sheetMap,
  products,
  languages,
  devices = DEVICES,
  year,
  quarter,
  month,
  productsPath = 'products-redesign',
  storeType = STORE_TYPE_UPDATES,
  blockTypes = DEFAULT_BLOCK_TYPES,
  promoContexts = [],
  rowRoles = ROW_ROLES,
  selection = null,
  testName,
  constantsValues = {},
  fetchPage = defaultFetchPage,
}) {
  const requests = buildFieldRequests({
    schema,
    sheetMap,
    products,
    languages,
    devices,
    year,
    quarter,
    month,
    productsPath,
    storeType,
    blockTypes,
    promoContexts,
    rowRoles,
    selection,
    testName,
  });

  const deduped = dedupePaths(requests);

  const pages = await Promise.all(deduped.map(async (entry) => {
    const fetched = await fetchPage(org, repo, entry.pagePath, token);
    return {
      pagePath: entry.pagePath,
      html: fetched.html,
      htmlFound: fetched.htmlFound !== false,
      spacingSidecar: fetched.spacingSidecar,
      keywordsSidecar: fetched.keywordsSidecar,
      constantsValues: fetched.constantsValues,
      refs: entry.refs,
    };
  }));

  const allCells = expandFetchedPages(pages, { schema, constantsValues });
  const cells = allCells.filter((cell) => cell.hasHtml);
  const skipped = buildSkippedEntries(allCells);
  const overLimit = findOverCharLimitCells(cells);

  return {
    pages,
    cells,
    skipped,
    overLimit,
    stats: {
      fieldRequests: requests.length,
      uniquePaths: deduped.length,
      cells: cells.length,
      skipped: skipped.length,
    },
  };
}

export { collectExportData, findOverCharLimitCells };
