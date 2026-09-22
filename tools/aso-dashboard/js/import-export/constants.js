import { parseConstantsDocument, buildConstantsHtml } from '../../../aso-constants/utils.js';

// Non-Latin letter runs are auto-detected as do-not-translate spans.
const NON_LATIN_RUN = /[^\p{Script=Latin}]+/gu;
const LETTER = /\p{L}/u;
const TAG_OR_TEXT = /<[^>]*>|[^<]+/g;

// Sentinels wrap a PM-marked (coloured) run so Latin-script spans are caught too.
export const MARK_START = '';
export const MARK_END = '';
const MARKED_SPAN = new RegExp(`${MARK_START}([\\s\\S]*?)${MARK_END}`, 'g');
const OUTER_WHITESPACE = /^(\s*)([\s\S]*?)(\s*)$/;

// Constant values are stored as HTML, so text is escaped before any <b>/<i>/<br> is added.
export function escapeHtml(text) {
  return String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const PARA_BREAK = '';

// Matches authored constants: one <p> per line, blank line → <br><br>; value carries any <b>/<i>.
function valueToConstantHtml(value) {
  return String(value ?? '')
    .replace(/\n{2,}/g, PARA_BREAK)
    .split('\n')
    .filter((line) => line.trim() !== '' || line.includes(PARA_BREAK))
    .map((line) => `<p>${line.split(PARA_BREAK).join('<br><br>')}</p>`)
    .join('');
}

// Slugs are keyed off the field, so the same field yields one stable slug across languages.
function slugifyFieldKey(fieldKey) {
  return String(fieldKey ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Tokenize the non-Latin letter core, leaving surrounding punctuation/whitespace in place.
function tokenizeSegment(segment, assignSlug) {
  return segment.replace(NON_LATIN_RUN, (run) => {
    const chars = [...run];
    const first = chars.findIndex((ch) => LETTER.test(ch));
    if (first === -1) return run;
    let last = chars.length - 1;
    while (last > first && !LETTER.test(chars[last])) last -= 1;

    const prefix = chars.slice(0, first).join('');
    const value = escapeHtml(chars.slice(first, last + 1).join(''));
    const suffix = chars.slice(last + 1).join('');
    return `${prefix}{{${assignSlug(value)}}}${suffix}`;
  });
}

// A marked run is a constant whatever its script; only outer whitespace stays outside the token.
function tokenizeMarked(markedText, assignSlug) {
  const [, pre, core, post] = markedText.match(OUTER_WHITESPACE);
  if (!core) return markedText;
  return `${pre}{{${assignSlug(core)}}}${post}`;
}

// Returns tokenized text plus the extracted constants. Marked spans win; else non-Latin runs.
export function extractConstantsFromText(text, languageLabel, fieldKey) {
  const source = String(text ?? '');
  if (!source || !languageLabel) return { text: source, constants: [] };

  const prefix = slugifyFieldKey(fieldKey) ? `constant-${slugifyFieldKey(fieldKey)}` : 'constant';
  const constants = [];
  const slugByValue = new Map();
  const assignSlug = (value) => {
    if (slugByValue.has(value)) return slugByValue.get(value);
    const ordinal = slugByValue.size + 1;
    const slug = ordinal === 1 ? prefix : `${prefix}-${ordinal}`;
    slugByValue.set(value, slug);
    constants.push({ slug, language: languageLabel, value });
    return slug;
  };

  // Split on marked spans: odd indices are the marked runs, even indices unmarked text.
  const tokenized = source
    .split(MARKED_SPAN)
    .map((part, index) => {
      if (index % 2 === 1) return tokenizeMarked(part, assignSlug);
      return part.replace(
        TAG_OR_TEXT,
        (chunk) => (chunk.startsWith('<') ? chunk : tokenizeSegment(chunk, assignSlug)),
      );
    })
    .join('');

  return { text: tokenized, constants };
}

// Merge per-language values into an existing constants document, preserving other slugs/rows.
export function mergeConstantsUpdates(existingHtml, updates = []) {
  const parsed = parseConstantsDocument(existingHtml || '');
  const blocks = {};
  const order = [];

  parsed.slugs.forEach((slug) => {
    order.push(slug);
    blocks[slug] = { rows: (parsed.blocks[slug]?.rows ?? []).map((row) => ({ ...row })) };
  });

  updates.forEach(({ slug, language, value }) => {
    if (!slug || !language) return;
    if (!blocks[slug]) {
      blocks[slug] = { rows: [] };
      order.push(slug);
    }
    const contentHtml = valueToConstantHtml(value);
    const existingRow = blocks[slug].rows.find((row) => row.language === language);
    if (existingRow) existingRow.contentHtml = contentHtml;
    else blocks[slug].rows.push({ language, contentHtml });
  });

  return buildConstantsHtml({ slugs: order, languages: [], blocks });
}

// Group extracted constants by their sibling -constants.html path, one write per file.
export function buildConstantsImportWrites(requests = []) {
  const byPath = new Map();

  requests.forEach((request) => {
    if (!request?.constantsPath || !request.constants?.length) return;
    if (!byPath.has(request.constantsPath)) {
      byPath.set(request.constantsPath, {
        constantsPath: request.constantsPath,
        pageLeaf: request.pageLeaf,
        updates: [],
        seen: new Set(),
      });
    }
    const entry = byPath.get(request.constantsPath);
    request.constants.forEach(({ slug, language, value }) => {
      const key = `${slug}::${language}`;
      if (entry.seen.has(key)) return;
      entry.seen.add(key);
      entry.updates.push({ slug, language, value });
    });
  });

  return [...byPath.values()].map(({ seen, ...write }) => write);
}
