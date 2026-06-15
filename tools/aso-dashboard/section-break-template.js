import { DEFAULT_APPLE_REFERENCE, DEFAULT_GOOGLE_REFERENCE } from './section-break-defaults.js';

export const LISTING_DESCRIPTION_FIELD = {
  google: 'Full Description',
  apple: 'Description',
};

const STORAGE_PREFIX = 'asoSectionBreakRef:';

function normalizeReferenceText(plainText) {
  let text = plainText.trim();
  if (text.startsWith('"') && text.endsWith('"')) {
    text = text.slice(1, -1);
  }
  return text;
}

/**
 * Derive section-break template from golden plain-text export.
 * Each non-empty line = one <p>. Blank lines = section breaks (extra export line).
 */
export function parseReferenceText(plainText) {
  const lines = normalizeReferenceText(plainText).split('\n');
  const sectionBreakAfter = [];
  let paragraphCount = 0;
  let pendingBreak = false;

  lines.forEach((line) => {
    if (!line.trim()) {
      pendingBreak = true;
      return;
    }
    if (paragraphCount > 0) {
      sectionBreakAfter.push(pendingBreak);
    }
    pendingBreak = false;
    paragraphCount += 1;
  });

  const sectionBreakCount = sectionBreakAfter.filter(Boolean).length;
  return {
    paragraphCount,
    sectionBreakAfter,
    sectionBreakCount,
    exportLineCount: paragraphCount + sectionBreakCount,
  };
}

export function gapMaskKey(device, fieldName) {
  return `${device}:listing:${fieldName}`;
}

export function formatTemplateSummary(template, { usingDefault = false } = {}) {
  const source = usingDefault ? 'default template' : 'custom reference';
  return `${template.paragraphCount} paragraphs · ${template.sectionBreakCount} section breaks · `
    + `${template.exportLineCount} export lines (${source})`;
}

export function resolveReferenceText(device, authorText) {
  const trimmed = authorText?.trim();
  if (trimmed) return trimmed;
  return device === 'google' ? DEFAULT_GOOGLE_REFERENCE : DEFAULT_APPLE_REFERENCE;
}

export function buildExportGapMasks({ googleReference = '', appleReference = '' } = {}) {
  const masks = {};
  const googleTemplate = parseReferenceText(resolveReferenceText('google', googleReference));
  const appleTemplate = parseReferenceText(resolveReferenceText('apple', appleReference));

  masks[gapMaskKey('google', LISTING_DESCRIPTION_FIELD.google)] = {
    ...googleTemplate,
    usingDefault: !googleReference?.trim(),
  };
  masks[gapMaskKey('apple', LISTING_DESCRIPTION_FIELD.apple)] = {
    ...appleTemplate,
    usingDefault: !appleReference?.trim(),
  };
  return masks;
}

export function loadStoredReference(device) {
  try {
    return window.localStorage.getItem(`${STORAGE_PREFIX}${device}`) || '';
  } catch {
    return '';
  }
}

export function saveStoredReference(device, text) {
  try {
    const key = `${STORAGE_PREFIX}${device}`;
    if (text?.trim()) {
      window.localStorage.setItem(key, text);
    } else {
      window.localStorage.removeItem(key);
    }
  } catch {
    // ignore quota / private mode
  }
}

export function getDefaultPreviewText(device) {
  const template = parseReferenceText(resolveReferenceText(device, ''));
  return formatTemplateSummary(template, { usingDefault: true });
}
