import { authFetch, fetchLanguages } from '../../../utils.js';
import {
  buildPromosListPath,
  buildPromoVariantsListPath,
  buildStoreTestsListPath,
  STORE_TYPE_TESTS,
} from './content-taxonomy.js';

const productsCache = {};
const listCache = {};

export { authFetch, fetchLanguages };

export async function fetchBlockSchema({ context, token }) {
  const { org, repo } = context;
  return authFetch(
    `https://admin.da.live/source/${org}/${repo}/.da/block-schema.json`,
    token,
    'block-schema',
  );
}

export async function fetchSheetBlockMap({ context, token }) {
  const { org, repo } = context;
  return authFetch(
    `https://admin.da.live/source/${org}/${repo}/.da/sheet-to-block-map.json`,
    token,
    'sheet-to-block-map',
  );
}

export function toDaListPath(listPath) {
  return String(listPath ?? '').trim().replace(/^\/+/, '');
}

export function buildDaListUrl(org, repo, listPath) {
  return `https://admin.da.live/list/${org}/${repo}/${toDaListPath(listPath)}`;
}

export function formatFolderLabel(name) {
  const text = String(name ?? '').trim();
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1).replace(/-/g, ' ');
}

export function parseFolderListItems(data) {
  if (!Array.isArray(data)) return [];
  return data
    .filter((item) => item?.name && item?.path && !item.ext)
    .map((item) => ({
      value: item.name,
      label: formatFolderLabel(item.name),
    }));
}

// Promo variants are pages (e.g. promos/{name}/default.html), not subfolders.
export function parseVariantFileItems(data) {
  if (!Array.isArray(data)) return [];
  return data
    .filter((item) => item?.name && item?.path && item?.ext === 'html')
    .map((item) => ({
      value: item.name,
      label: formatFolderLabel(item.name),
    }));
}

export function clearListCache() {
  Object.keys(listCache).forEach((key) => delete listCache[key]);
}

function isStoreTestsSelectionComplete(selection) {
  const required = ['language', 'productsPath', 'product', 'device', 'year', 'quarter', 'month'];
  return required.every((key) => String(selection?.[key] ?? '').trim());
}

function isPromoListSelectionComplete(selection) {
  if (!isStoreTestsSelectionComplete(selection)) return false;
  const storeType = String(selection?.storeType ?? '').trim();
  if (storeType === STORE_TYPE_TESTS && !String(selection?.testName ?? '').trim()) {
    return false;
  }
  return true;
}

async function fetchListing({ context, token, listPath, parseItems, cacheKind }) {
  if (!listPath) return [];

  const cacheKey = `${cacheKind}:${toDaListPath(listPath)}`;
  if (listCache[cacheKey]) return listCache[cacheKey];

  const { org, repo } = context;
  const url = buildDaListUrl(org, repo, toDaListPath(listPath));
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!resp.ok) return [];
  const data = await resp.json();
  const items = parseItems(data);
  listCache[cacheKey] = items;
  return items;
}

function fetchFolderList({ context, token, listPath }) {
  return fetchListing({ context, token, listPath, parseItems: parseFolderListItems, cacheKind: 'folders' });
}

function fetchFileList({ context, token, listPath }) {
  return fetchListing({ context, token, listPath, parseItems: parseVariantFileItems, cacheKind: 'files' });
}

export async function fetchStoreTests({ context, token, selection }) {
  if (!isStoreTestsSelectionComplete(selection)) return [];

  const listPath = buildStoreTestsListPath({
    language: selection.language,
    productsPath: selection.productsPath,
    product: selection.product,
    device: selection.device,
    year: selection.year,
    quarter: selection.quarter,
    month: selection.month,
  });
  return fetchFolderList({ context, token, listPath });
}

export async function fetchPromoNames({ context, token, selection }) {
  if (!isPromoListSelectionComplete(selection)) return [];
  const listPath = buildPromosListPath(selection);
  return fetchFolderList({ context, token, listPath });
}

export async function fetchPromoVariants({ context, token, selection, promoName }) {
  if (!isPromoListSelectionComplete(selection) || !String(promoName ?? '').trim()) return [];
  const listPath = buildPromoVariantsListPath(selection, promoName);
  return fetchFileList({ context, token, listPath });
}

export function getRelativeProductsPath() {
  const urlParams = new URLSearchParams(window.location.search);
  const path = urlParams.get('productsPath') || 'products-redesign';
  return path.startsWith('/') ? path.slice(1) : path;
}

export function getConfigFileOverride() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('configFile') || undefined;
}

export async function fetchProducts({ context, token }) {
  const productsPath = getRelativeProductsPath();
  if (productsCache[productsPath]) return productsCache[productsPath];
  const { org, repo } = context;
  const data = await authFetch(
    `https://admin.da.live/list/${org}/${repo}/${productsPath}`,
    token,
    'products',
  );
  if (!data) return [];
  const products = data
    .filter((item) => item.name && item.path && !item.ext)
    .map((item) => ({
      value: item.name,
      label: item.name.charAt(0).toUpperCase() + item.name.slice(1).replace(/-/g, ' '),
    }));
  productsCache[productsPath] = products;
  return products;
}
