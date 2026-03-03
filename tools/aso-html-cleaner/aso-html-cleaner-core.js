const ESCAPED_TAG_PATTERN = /&lt;\/?(h[1-6]|b|i|u|strong|em)([\s\S]*?)&gt;/i;

export function buildSourceUrl(org, repo, path) {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const withExt = normalized.endsWith('.html') ? normalized : `${normalized}.html`;
  return `https://admin.da.live/source/${org}/${repo}${withExt}`;
}

export function decodeHtmlEntities(str) {
  return str.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

export function hasLiteralTags(html) {
  return ESCAPED_TAG_PATTERN.test(html);
}

export function cleanCellContentForDocument(html) {
  if (!hasLiteralTags(html)) return html;
  return decodeHtmlEntities(html);
}
