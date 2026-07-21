import { resolveFieldText } from '../../../blocks/aso-app/aso-utils.js';
import {
  buildGooglePlayReleaseNotesBlob,
  isReleaseNotesField,
} from './google-play-release-notes.js';

export function parseAsoBlocks(html, validBlockTypes, constantsValues = {}) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const blocks = {};
  doc.querySelectorAll('.aso-app').forEach((block) => {
    const classes = Array.from(block.classList);
    const device = classes.find((c) => c === 'apple' || c === 'google');
    const blockType = classes.find((c) => validBlockTypes.includes(c));
    if (!blockType || !device) return;
    const key = `${device}-${blockType}`;
    const fields = {};
    block.querySelectorAll(':scope > div').forEach((row) => {
      const children = Array.from(row.children);
      if (children.length >= 2) {
        const fieldName = children[0].textContent.trim();
        const fieldValue = resolveFieldText(
          children[1],
          constantsValues,
          { addParagraphBreaks: true },
        );
        if (fieldName) fields[fieldName] = fieldValue;
      }
    });
    if (!blocks[key]) blocks[key] = [];
    blocks[key].push(fields);
  });
  return blocks;
}

export function createSheetData(sheetData, languages, blockType) {
  const includeAggregatedPlayColumn = blockType === 'listing';
  const rows = [];
  ['google', 'apple'].forEach((device) => {
    if (Object.keys(sheetData[device]).length === 0) return;
    const deviceHeader = [device.charAt(0).toUpperCase() + device.slice(1)];
    const deviceSpanCols = includeAggregatedPlayColumn ? languages.length + 1 : languages.length;
    for (let i = 0; i < deviceSpanCols; i += 1) deviceHeader.push('');
    rows.push(deviceHeader);
    Object.entries(sheetData[device]).forEach(([, langData]) => {
      rows.push(
        includeAggregatedPlayColumn
          ? ['Languages', 'Aggregated (Play paste)', ...languages]
          : ['Languages', ...languages],
      );
      const allFields = new Set();
      Object.values(langData).forEach((fields) => {
        Object.keys(fields).forEach((field) => allFields.add(field));
      });
      Array.from(allFields).forEach((fieldName) => {
        const fieldRow = includeAggregatedPlayColumn ? [fieldName, ''] : [fieldName];
        if (
          includeAggregatedPlayColumn
          && device === 'google'
          && isReleaseNotesField(fieldName)
        ) {
          fieldRow[1] = buildGooglePlayReleaseNotesBlob(languages, langData, fieldName);
        }
        languages.forEach((lang) => fieldRow.push(langData[lang]?.[fieldName] || ''));
        rows.push(fieldRow);
      });
      rows.push([]);
    });
    rows.push([]);
  });
  return rows;
}
