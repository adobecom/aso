import { authFetch } from '../utils.js';
import { getSlugFromConstantsBlock } from '../../utils/aso-constants.js';

export function parseHtml(html) {
  return new DOMParser().parseFromString(html, 'text/html');
}

function rowsFromBlock(block) {
  return Array.from(block.children).reduce((rows, row) => {
    if (row.tagName !== 'DIV' || row.children.length < 2) return rows;
    const language = row.children[0].textContent.trim();
    if (!language) return rows;
    return [...rows, { language, contentHtml: row.children[1].innerHTML.trim() }];
  }, []);
}

export function parseConstantsDocument(html) {
  const blocks = {};
  const slugs = [];
  if (!html || typeof html !== 'string') return { slugs, blocks };

  const doc = parseHtml(html);
  doc.querySelectorAll('div.aso-constants').forEach((block) => {
    const slug = getSlugFromConstantsBlock(block);
    if (!slug) return;
    slugs.push(slug);
    blocks[slug] = { rows: rowsFromBlock(block) };
  });

  return { slugs: [...new Set(slugs)], blocks };
}

function buildConstantsBlock(doc, slug, rows) {
  const block = doc.createElement('div');
  block.className = `aso-constants ${slug}`;
  rows.forEach(({ language, contentHtml }) => {
    const row = doc.createElement('div');
    const labelCell = doc.createElement('div');
    const label = doc.createElement('p');
    label.textContent = language;
    labelCell.appendChild(label);
    const contentCell = doc.createElement('div');
    if (contentHtml) contentCell.innerHTML = contentHtml;
    row.append(labelCell, contentCell);
    block.appendChild(row);
  });
  return block;
}

export function buildConstantsHtml({ slugs, languages, blocks = {} }) {
  const doc = parseHtml('<body><main><div></div></main></body>');
  const container = doc.querySelector('main > div');
  slugs.forEach((slug) => {
    const rows = blocks[slug]?.rows ?? languages.map(({ label }) => ({
      language: label,
      contentHtml: '',
    }));
    container.appendChild(buildConstantsBlock(doc, slug, rows));
  });
  return `<body>\n${doc.body.innerHTML}\n</body>`;
}

export function mergeConstantsHtml({ slugs, languages, existingHtml }) {
  if (!existingHtml) {
    return { html: buildConstantsHtml({ slugs, languages }), orphanedSlugs: [] };
  }

  const parsed = parseConstantsDocument(existingHtml);
  const slugSet = new Set(slugs);
  const orphanedSlugs = parsed.slugs.filter((existingSlug) => !slugSet.has(existingSlug)).sort();
  const allSlugs = [...slugs];
  orphanedSlugs.forEach((orphanSlug) => {
    if (!allSlugs.includes(orphanSlug)) allSlugs.push(orphanSlug);
  });

  const languageLabels = new Set(languages.map(({ label }) => label));
  const blocks = {};

  allSlugs.forEach((slug) => {
    const existingRows = parsed.blocks[slug]?.rows ?? [];
    const rowByLang = new Map(existingRows.map((row) => [row.language, row.contentHtml]));
    const rows = languages.map(({ label }) => ({
      language: label,
      contentHtml: rowByLang.get(label) ?? '',
    }));
    existingRows.forEach(({ language, contentHtml }) => {
      if (!languageLabels.has(language)) rows.push({ language, contentHtml });
    });
    blocks[slug] = { rows };
  });

  return {
    html: buildConstantsHtml({ slugs: allSlugs, languages, blocks }),
    orphanedSlugs,
  };
}

export async function fetchHTML(url, token, errorContext = 'HTML', cacheBust = false) {
  return authFetch(url, token, errorContext, 'html', cacheBust);
}
