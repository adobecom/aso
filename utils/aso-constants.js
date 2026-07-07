export const CONSTANT_SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const CONSTANT_TOKEN_PATTERN = /\{\{([a-z0-9]+(-[a-z0-9]+)*)\}\}/g;

export const DEFAULT_SOURCE_LANGUAGE_LABEL = 'English';

export function isConstantSlug(text) {
  if (!text || typeof text !== 'string') return false;
  return CONSTANT_SLUG_PATTERN.test(text.trim());
}

export function constantsPathFromPagePath(pagePath) {
  if (!pagePath || typeof pagePath !== 'string') return '';
  const cleanPath = pagePath.replace(/\.html$/i, '').replace(/\/$/, '');
  return `${cleanPath}-constants`;
}

function parseHtml(html) {
  return new DOMParser().parseFromString(html, 'text/html');
}

export function getSlugFromConstantsBlock(block) {
  if (!block) return null;
  const slugClasses = [...block.classList].filter((className) => className !== 'aso-constants');
  if (slugClasses.length !== 1) return null;
  const slug = slugClasses[0];
  return isConstantSlug(slug) ? slug : null;
}

export function getConstantsBlock(doc, slug) {
  if (!doc) return null;
  if (slug) return doc.querySelector(`div.aso-constants.${slug}`);
  return doc.querySelector('div.aso-constants');
}

function getConstantsRowHtml(block, languageLabel) {
  if (!block || !languageLabel) return '';
  return Array.from(block.children).reduce((match, row) => {
    if (match || row.tagName !== 'DIV' || row.children.length < 2) return match;
    const label = row.children[0].textContent.trim();
    if (label !== languageLabel) return match;
    return row.children[1].innerHTML.trim();
  }, '');
}

export function hasConstantTokens(text) {
  if (!text || typeof text !== 'string') return false;
  return new RegExp(CONSTANT_TOKEN_PATTERN.source, CONSTANT_TOKEN_PATTERN.flags).test(text);
}

export function collectConstantSlugsFromText(text) {
  if (!text || typeof text !== 'string') return [];
  const slugs = new Set();
  const pattern = new RegExp(CONSTANT_TOKEN_PATTERN.source, CONSTANT_TOKEN_PATTERN.flags);
  let match = pattern.exec(text);
  while (match) {
    const slug = match[1];
    if (isConstantSlug(slug)) slugs.add(slug);
    match = pattern.exec(text);
  }
  return [...slugs].sort();
}

export function collectConstantSlugsFromHtml(html) {
  return collectConstantSlugsFromText(html);
}

export function passthroughPlaceholderValue(slug) {
  return `{{${slug}}}`;
}

export function passthroughPlaceholdersForSlugs(slugs = []) {
  return slugs.reduce((acc, slug) => {
    if (isConstantSlug(slug)) acc[slug] = passthroughPlaceholderValue(slug);
    return acc;
  }, {});
}

export function collectConstantSlugsFromBlocks(root = document, blockSelector = '.aso-app') {
  if (!root?.querySelectorAll) return [];
  const slugs = new Set();
  root.querySelectorAll(blockSelector).forEach((block) => {
    collectConstantSlugsFromText(block.innerHTML).forEach((slug) => slugs.add(slug));
  });
  return [...slugs].sort();
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function soleTokenParagraphPattern(slug) {
  return new RegExp(`<p\\b[^>]*>\\s*\\{\\{${escapeRegex(slug)}\\}\\}\\s*</p>`, 'gi');
}

function constantValueForParagraphSubstitution(value) {
  if (/<\s*(p|ul|ol|div|h[1-6]|blockquote)\b/i.test(value)) return value;
  return `<p>${value}</p>`;
}

function sectionBreakParagraph() {
  const paragraph = document.createElement('p');
  paragraph.className = 'aso-constants-break';
  paragraph.appendChild(document.createElement('br'));
  return paragraph;
}

function wrapBlockSubstitution(replacement) {
  return `<p class="aso-constants-break"><br></p>${replacement}<p class="aso-constants-break"><br></p>`;
}

function isSoleTokenParagraph(element, slug) {
  return element?.tagName === 'P' && element.innerHTML.trim() === `{{${slug}}}`;
}

export function substituteConstantTokens(text, values = {}) {
  if (!text || typeof text !== 'string') return text;
  if (!values || Object.keys(values).length === 0) return text;

  let result = text;
  Object.keys(values)
    .sort((a, b) => b.length - a.length)
    .forEach((slug) => {
      const value = values[slug];
      if (!value) return;
      const replacement = constantValueForParagraphSubstitution(value);
      result = result.replace(
        soleTokenParagraphPattern(slug),
        () => wrapBlockSubstitution(replacement),
      );
    });

  return result.replace(
    new RegExp(CONSTANT_TOKEN_PATTERN.source, CONSTANT_TOKEN_PATTERN.flags),
    (_, slug) => values[slug] ?? '',
  );
}

export function substituteConstantTokensInDom(root, values = {}) {
  if (!root?.querySelectorAll || !values || Object.keys(values).length === 0) return;

  Object.keys(values)
    .sort((a, b) => b.length - a.length)
    .forEach((slug) => {
      const value = values[slug];
      if (!value) return;
      const blockHtml = constantValueForParagraphSubstitution(value);
      [...root.querySelectorAll('p')].forEach((paragraph) => {
        if (!isSoleTokenParagraph(paragraph, slug)) return;
        const fragment = document.createDocumentFragment();
        fragment.appendChild(sectionBreakParagraph());
        fragment.appendChild(document.createRange().createContextualFragment(blockHtml));
        fragment.appendChild(sectionBreakParagraph());
        paragraph.replaceWith(fragment);
      });
    });

  if (hasConstantTokens(root.innerHTML)) {
    root.innerHTML = substituteConstantTokens(root.innerHTML, values);
  }
}

export function parseConstantsForLanguage(html, { slug, languageLabel } = {}) {
  if (!html || typeof html !== 'string' || !languageLabel) return '';
  const doc = parseHtml(html);
  const block = getConstantsBlock(doc, slug);
  return getConstantsRowHtml(block, languageLabel);
}

export function parseConstantsByLanguageLabel(html, slug) {
  const byLanguage = {};
  if (!html || typeof html !== 'string') return byLanguage;
  const doc = parseHtml(html);
  const block = getConstantsBlock(doc, slug);
  if (!block) return byLanguage;
  Array.from(block.children).forEach((row) => {
    if (row.tagName !== 'DIV' || row.children.length < 2) return;
    const label = row.children[0].textContent.trim();
    const value = row.children[1].innerHTML.trim();
    if (label && value) byLanguage[label] = value;
  });
  return byLanguage;
}

export function parseAllConstantsForLanguage(html, languageLabel) {
  const values = {};
  if (!html || typeof html !== 'string' || !languageLabel) return values;
  const doc = parseHtml(html);
  doc.querySelectorAll('div.aso-constants').forEach((block) => {
    const blockSlug = getSlugFromConstantsBlock(block);
    if (!blockSlug) return;
    const value = getConstantsRowHtml(block, languageLabel);
    if (value) values[blockSlug] = value;
  });
  return values;
}
