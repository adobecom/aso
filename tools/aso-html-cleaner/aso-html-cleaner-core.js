const ESCAPED_TAG_PATTERN = /&lt;\/?(h[1-6]|b|i|u|strong|em)([\s\S]*?)&gt;/i;
const ESCAPED_TAG_PATTERN_GLOBAL = /&lt;\/?(h[1-6]|b|i|u|strong|em)([\s\S]*?)&gt;/gi;

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

// Decodes only the matched whitelisted-tag occurrences, not the whole cell — an unrelated
// escaped sequence elsewhere in the same cell (e.g. an escaped <script>) that happens to sit
// next to a legitimate escaped <h1>/<b>/etc. is left encoded, not reintroduced as real markup.
export function cleanCellContentForDocument(html) {
  if (!hasLiteralTags(html)) return html;
  return html.replace(ESCAPED_TAG_PATTERN_GLOBAL, (match) => decodeHtmlEntities(match));
}
