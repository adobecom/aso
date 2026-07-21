function getHostname(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

export function isDaAssetUrl(url) {
  return getHostname(url).endsWith('.da.live');
}

export function isAemPreviewUrl(url) {
  const hostname = getHostname(url);
  return hostname.includes('.aem.page') || hostname.includes('.hlx.page');
}

export function getCurrentPreviewRef(repo, org, hostname = window.location.hostname) {
  const suffix = `--${repo}--${org}.preview.da.live`;
  return hostname.endsWith(suffix) ? hostname.slice(0, -suffix.length) : null;
}

function parseAemPreviewHostname(hostname) {
  const match = hostname.match(/^(.+)\.(?:aem|hlx)\.page$/);
  if (!match) return null;
  const parts = match[1].split('--');
  return parts.length === 3 ? { repo: parts[1], org: parts[2] } : null;
}

export function resolvePreviewProxyUrl(url, currentRef) {
  if (!isAemPreviewUrl(url) || !currentRef) return null;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const parts = parseAemPreviewHostname(parsed.hostname);
  if (!parts) return null;
  return `https://${currentRef}--${parts.repo}--${parts.org}.preview.da.live${parsed.pathname}${parsed.hash}`;
}

export function resolvePublicMediaUrl(url) {
  if (!isAemPreviewUrl(url)) return url;
  return url.replace('.aem.page', '.aem.live').replace('.hlx.page', '.hlx.live');
}

export function buildImageFetchOptions(url, token) {
  if (isDaAssetUrl(url)) return { headers: { Authorization: `Bearer ${token}` } };
  return {};
}

export function getExtensionFromUrl(url) {
  const withoutFragment = url.split('#')[0];
  const withoutQuery = withoutFragment.split('?')[0];
  const match = withoutQuery.match(/\.([a-zA-Z0-9]+)$/);
  return match ? match[1].toLowerCase() : null;
}

export function slugifyLabel(label) {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function buildImageZipPath({ product, device, languageSegment }, slug, ext) {
  return `${product}/${device}/${languageSegment}/images/${slug}.${ext}`;
}

async function fetchWithProxyFallback(src, currentRef) {
  const proxyUrl = resolvePreviewProxyUrl(src, currentRef);
  if (!proxyUrl) return null;
  try {
    const response = await fetch(proxyUrl, { credentials: 'include' });
    return response.ok ? response : null;
  } catch {
    return null;
  }
}

export async function fetchImageBlob(src, token, currentRef) {
  const proxyResponse = await fetchWithProxyFallback(src, currentRef);
  if (proxyResponse) return proxyResponse.blob();

  const url = resolvePublicMediaUrl(src);
  const response = await fetch(url, buildImageFetchOptions(url, token));
  if (!response.ok) return null;
  return response.blob();
}
