import { authFetch, fetchLanguages } from '../utils.js';

let productsCache = null;

export { authFetch, fetchLanguages };

export async function fetchProducts({ context, token }) {
  if (productsCache) return productsCache;
  const { org, repo } = context;
  const data = await authFetch(
    `https://admin.da.live/list/${org}/${repo}/products`,
    token,
    'products',
  );
  if (!data) return [];
  productsCache = data
    .filter((item) => item.name && item.path && !item.ext)
    .map((item) => ({
      value: item.name,
      label: item.name.charAt(0).toUpperCase() + item.name.slice(1).replace(/-/g, ' '),
    }));
  return productsCache;
}
