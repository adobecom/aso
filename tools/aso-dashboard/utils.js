import { authFetch, fetchLanguages } from '../utils.js';

const productsCache = {};

export { authFetch, fetchLanguages };

export function getRelativeProductsPath() {
  const urlParams = new URLSearchParams(window.location.search);
  const path = urlParams.get('productsPath') || 'products';
  return path.startsWith('/') ? path.slice(1) : path;
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
