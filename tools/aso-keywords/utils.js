import { authFetch } from '../utils.js';

export function updatedColumnName(fieldName) {
  return `${String(fieldName).trim()} (updated)`;
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
      const existingData = merged[key].data;
      existingData.forEach((row) => {
        Object.keys(newFields).forEach((fieldName) => {
          if (!(fieldName in row)) {
            row[fieldName] = '';
          }
        });
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
