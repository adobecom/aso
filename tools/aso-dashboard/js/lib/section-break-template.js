/**
 * Derive paragraph spacing metadata from golden plain-text export.
 * Each non-empty line is one paragraph; blank lines between paragraphs are section breaks.
 */
function parseReferenceText(text) {
  const lines = String(text ?? '').replace(/\r\n/g, '\n').split('\n');
  const sectionBreakAfter = [];
  let paragraphCount = 0;
  let i = 0;

  while (i < lines.length) {
    while (i < lines.length && lines[i].trim() === '') i += 1;
    if (i >= lines.length) break;

    paragraphCount += 1;
    i += 1;
    if (i >= lines.length) break;

    if (lines[i].trim() === '') {
      sectionBreakAfter.push(true);
      while (i < lines.length && lines[i].trim() === '') i += 1;
    } else {
      sectionBreakAfter.push(false);
    }
  }

  const exportLineCount = paragraphCount + sectionBreakAfter.filter(Boolean).length;

  return {
    paragraphCount,
    sectionBreakAfter,
    exportLineCount,
  };
}

function buildSpacingSidecarFromText({ text, fieldName, fieldKey, version = 1 }) {
  const parsed = parseReferenceText(text);
  return {
    version,
    fieldName: String(fieldName ?? '').trim(),
    fieldKey: String(fieldKey ?? '').trim(),
    paragraphCount: parsed.paragraphCount,
    sectionBreakAfter: parsed.sectionBreakAfter,
    exportLineCount: parsed.exportLineCount,
  };
}

export { buildSpacingSidecarFromText, parseReferenceText };
