import { authFetch } from '../utils.js';

export function updatedColumnName(fieldName) {
  return `${String(fieldName).trim()} (updated)`;
}

function isSingleSheetKeywords(json) {
  return json?.[':type'] === 'sheet' && Array.isArray(json.data);
}

function isUpdatedColumn(key) {
  return String(key).trim().endsWith(' (updated)');
}

function templateRowFromNewJSON(newJSON) {
  const blockKey = Object.keys(newJSON).find((key) => !key.startsWith(':'));
  return blockKey ? newJSON[blockKey].data[0] : null;
}

function keywordFieldNamesFromTemplateRow(templateRow) {
  if (!templateRow) return [];
  const fields = [];
  Object.keys(templateRow).forEach((key) => {
    const name = String(key).trim();
    if (name === 'language' || isUpdatedColumn(name)) return;
    fields.push(name);
  });
  return fields;
}

function orderKeywordRow(row, fieldNames) {
  const ordered = {};
  if (row?.language !== undefined) {
    ordered.language = row.language;
  }
  fieldNames.forEach((fieldName) => {
    ordered[fieldName] = row[fieldName] ?? '';
    ordered[updatedColumnName(fieldName)] = row[updatedColumnName(fieldName)] ?? '';
  });
  return ordered;
}

function applyTemplateFieldsToRows(rows, templateRow) {
  if (!templateRow) return rows;
  const fieldNames = keywordFieldNamesFromTemplateRow(templateRow);
  return rows.map((row) => orderKeywordRow(row, fieldNames));
}

export function buildKeywordsJSON(blocksFound, languages) {
  const json = {};
  const names = [];
  blocksFound.forEach(({ blockIdentifier, fields }) => {
    names.push(blockIdentifier);
    const data = languages.map((lang) => {
      const entry = { language: lang.label };
      fields.forEach((fieldName) => {
        entry[fieldName] = '';
        entry[updatedColumnName(fieldName)] = '';
      });
      return entry;
    });
    const total = languages.length;
    json[blockIdentifier] = {
      total,
      offset: 0,
      limit: total,
      data,
    };
  });
  json[':names'] = names;
  json[':type'] = 'multi-sheet';
  return json;
}

export function mergeKeywordsJSON(newJSON, existingJSON) {
  if (!existingJSON) return { json: newJSON, orphanedBlocks: [] };

  if (isSingleSheetKeywords(existingJSON)) {
    const templateRow = templateRowFromNewJSON(newJSON);
    const data = applyTemplateFieldsToRows(existingJSON.data, templateRow);
    return {
      json: {
        ...existingJSON,
        data,
        total: data.length,
        offset: 0,
        limit: data.length,
        ':type': 'sheet',
      },
      orphanedBlocks: [],
    };
  }

  const merged = { ...existingJSON };
  const allNames = new Set(existingJSON[':names'] || []);
  const newBlockKeys = new Set(Object.keys(newJSON).filter((k) => !k.startsWith(':')));
  const orphanedBlocks = [];
  Object.keys(merged).forEach((key) => {
    if (key.startsWith(':')) return;
    if (!newBlockKeys.has(key)) {
      orphanedBlocks.push(key);
    }
  });
  Object.keys(newJSON).forEach((key) => {
    if (key.startsWith(':')) return;
    if (!merged[key]) {
      merged[key] = newJSON[key];
      allNames.add(key);
    } else {
      const newFields = newJSON[key].data[0];
      const fieldNames = keywordFieldNamesFromTemplateRow(newFields);
      const existingData = merged[key].data;
      existingData.forEach((row, index) => {
        existingData[index] = orderKeywordRow(row, fieldNames);
      });
      merged[key].total = existingData.length;
      merged[key].offset = 0;
      merged[key].limit = existingData.length;
    }
  });
  merged[':names'] = Array.from(allNames);
  merged[':type'] = 'multi-sheet';
  return { json: merged, orphanedBlocks };
}

export async function fetchHTML(url, token, errorContext = 'HTML', cacheBust = false) {
  return authFetch(url, token, errorContext, 'html', cacheBust);
}

export function parseHTML(htmlString) {
  const parser = new DOMParser();
  return parser.parseFromString(htmlString, 'text/html');
}
