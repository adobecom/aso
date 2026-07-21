import { getSourceText } from '../lib/da-source-client.js';
import { parseImageFieldFromPage } from './html.js';
import { listMediaAssetFields } from './page-map.js';
import {
  buildHtmlSourcePath,
  dedupePaths,
  ROW_ROLE_LOCALIZED,
  resolvePagePath,
} from './paths.js';

const BLOCK_TYPE_MEDIA_ASSETS = 'media-assets';

// Matches collect.js's matchesSelection contract for the fieldsByDeviceBlock key: a
// `${device}:media-assets` key is only present once the field-checkbox UI has rendered for
// that device, so its absence means unrestricted (fetch every field), not "exclude all".
function isFieldSelected(selection, device, fieldKey) {
  if (!selection?.fieldsByDeviceBlock) return true;
  const key = `${device}:${BLOCK_TYPE_MEDIA_ASSETS}`;
  if (!Object.prototype.hasOwnProperty.call(selection.fieldsByDeviceBlock, key)) return true;
  return selection.fieldsByDeviceBlock[key].includes(fieldKey);
}

function buildMediaFieldRequests({
  schema,
  products,
  devices,
  languages,
  year,
  quarter,
  month,
  productsPath,
  storeType,
  testName,
  selection,
}) {
  const requests = [];

  products.forEach((product) => {
    devices.forEach((device) => {
      const fields = listMediaAssetFields(schema, device)
        .filter((field) => isFieldSelected(selection, device, field.fieldKey));
      fields.forEach((field) => {
        languages.forEach((language) => {
          const pagePath = resolvePagePath({
            language,
            rowRole: ROW_ROLE_LOCALIZED,
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

          requests.push({
            product,
            device,
            language,
            fieldKey: field.fieldKey,
            fieldName: field.fieldName,
            blockKey: field.blockKey,
            pagePath,
          });
        });
      });
    });
  });

  return requests;
}

async function defaultFetchMediaPage(org, repo, pagePath, token) {
  const htmlPath = buildHtmlSourcePath(pagePath);
  const html = await getSourceText(org, repo, htmlPath, token);
  return { html: html ?? '', htmlFound: html !== null };
}

/**
 * Separate from collectExportData — media-assets fields have no workbook
 * sheet at all (nothing goes into an Excel cell), so they don't belong in
 * DEFAULT_BLOCK_TYPES or the text-extraction pipeline in collect.js.
 */
// eslint-disable-next-line import/prefer-default-export
export async function collectMediaExportData({
  org,
  repo,
  token,
  schema,
  products,
  languages,
  devices,
  year,
  quarter,
  month,
  productsPath,
  storeType,
  testName,
  selection,
  fetchPage = defaultFetchMediaPage,
}) {
  const requests = buildMediaFieldRequests({
    schema,
    products,
    devices,
    languages,
    year,
    quarter,
    month,
    productsPath,
    storeType,
    testName,
    selection,
  });

  const deduped = dedupePaths(requests);

  const pages = await Promise.all(deduped.map(async (entry) => {
    const fetched = await fetchPage(org, repo, entry.pagePath, token);
    return {
      html: fetched.html,
      htmlFound: fetched.htmlFound !== false,
      refs: entry.refs,
    };
  }));

  const entries = [];
  pages.forEach((page) => {
    if (!page.htmlFound) return;
    page.refs.forEach((ref) => {
      const src = parseImageFieldFromPage({
        html: page.html,
        device: ref.device,
        blockType: BLOCK_TYPE_MEDIA_ASSETS,
        fieldName: ref.fieldName,
      });
      if (src) {
        entries.push({
          product: ref.product,
          device: ref.device,
          language: ref.language,
          fieldName: ref.fieldName,
          src,
        });
      }
    });
  });

  return entries;
}
