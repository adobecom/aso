import {
  buildKeywordsJSON,
  mergeKeywordsJSON,
  updatedColumnName,
} from '../../../aso-keywords/utils.js';

function formatBlockKey(blockKey) {
  const match = String(blockKey ?? '').match(/^([^(]+)\s*\(([^)]+)\)$/);
  if (!match) {
    const trimmed = String(blockKey ?? '').trim();
    return { formattedKey: trimmed, classes: [trimmed] };
  }
  const [, blockName, variants] = match;
  const sortedVariants = variants.split(',').map((v) => v.trim()).sort();
  const formattedKey = `${blockName.trim()} (${sortedVariants.join(', ')})`;
  const classes = [blockName.trim(), ...sortedVariants];
  return { formattedKey, classes };
}

function isSingleSheetKeywords(json) {
  return json?.[':type'] === 'sheet' && Array.isArray(json.data);
}

function resolveBlockIdentifier(json, formattedKey) {
  if (!json) return `${formattedKey} (1)`;
  if (isSingleSheetKeywords(json)) return 'sheet';
  const match = Object.keys(json).find(
    (key) => !key.startsWith(':') && key.startsWith(`${formattedKey} (`),
  );
  return match || `${formattedKey} (1)`;
}

function readFromSheetData(data, fieldName, languageName) {
  if (!Array.isArray(data)) return '';
  const row = data.find((entry) => entry?.language === languageName);
  if (!row || row[fieldName] == null) return '';
  return String(row[fieldName]).trim();
}

function readKeywordFromSidecar(keywordsJson, blockKey, fieldName, languageName) {
  if (!keywordsJson || !fieldName || !languageName) return '';

  if (isSingleSheetKeywords(keywordsJson)) {
    return readFromSheetData(keywordsJson.data, fieldName, languageName);
  }

  const { formattedKey } = formatBlockKey(blockKey);
  const blockKeys = Object.keys(keywordsJson).filter(
    (key) => !key.startsWith(':') && key.startsWith(`${formattedKey} (`),
  );

  for (let index = 0; index < blockKeys.length; index += 1) {
    const value = readFromSheetData(keywordsJson[blockKeys[index]]?.data, fieldName, languageName);
    if (value) return value;
  }

  return '';
}

function setKeywordInBlock(json, blockIdentifier, fieldName, languageName, value) {
  const updatedLabel = updatedColumnName(fieldName);

  if (isSingleSheetKeywords(json)) {
    let row = json.data.find((entry) => entry?.language === languageName);
    if (!row) {
      row = { language: languageName };
      json.data.push(row);
    }
    row[fieldName] = value;
    row[updatedLabel] = 'yes';
    json.total = json.data.length;
    json.limit = json.data.length;
    return json;
  }

  if (!json[blockIdentifier]) {
    json[blockIdentifier] = {
      total: 0,
      offset: 0,
      limit: 0,
      data: [],
    };
    json[':names'] = [...new Set([...(json[':names'] || []), blockIdentifier])];
    json[':type'] = 'multi-sheet';
  }

  const block = json[blockIdentifier];
  let row = block.data.find((entry) => entry?.language === languageName);
  if (!row) {
    row = { language: languageName };
    block.data.push(row);
  }
  row[fieldName] = value;
  row[updatedLabel] = 'yes';
  block.total = block.data.length;
  block.offset = 0;
  block.limit = block.data.length;
  return json;
}

function buildColWidths(row) {
  return Object.keys(row || {}).map(() => 300);
}

// Every keyword sidecar we write is scoped to exactly one page, so it only ever holds
// one block — but a multi-sheet wrapper around a single block still 400s on AEM preview
// (Helix's admin API only accepts flat single-sheet JSON for a one-table document; DA's
// own sheet editor flattens this shape on save). Mirror that flattening here so both
// freshly created and previously-written sidecars stay previewable.
function flattenSingleBlockSheet(json, blockIdentifier) {
  if (isSingleSheetKeywords(json)) return json;
  const blockKeys = Object.keys(json).filter((key) => !key.startsWith(':'));
  if (blockKeys.length !== 1 || blockKeys[0] !== blockIdentifier) return json;

  const block = json[blockIdentifier];
  return {
    total: block.total,
    limit: block.limit,
    offset: block.offset,
    data: block.data,
    ':colWidths': buildColWidths(block.data[0]),
    ':sheetname': blockIdentifier,
    ':type': 'sheet',
  };
}

function applyKeywordUpdates(existingJson, {
  blockKey,
  updates,
  languages = [],
}) {
  const { formattedKey } = formatBlockKey(blockKey);
  const blockIdentifier = resolveBlockIdentifier(existingJson, formattedKey);
  const fieldNames = [...new Set(updates.map((update) => update.fieldName))];

  let json = existingJson;
  if (!json) {
    json = buildKeywordsJSON(
      [{ blockIdentifier: `${formattedKey} (1)`, fields: fieldNames }],
      languages.map((language) => ({ label: language.name })),
    );
  } else if (!isSingleSheetKeywords(json) && !json[blockIdentifier]) {
    const template = buildKeywordsJSON(
      [{ blockIdentifier: `${formattedKey} (1)`, fields: fieldNames }],
      languages.map((language) => ({ label: language.name })),
    );
    ({ json } = mergeKeywordsJSON(template, json));
  }

  const targetBlock = resolveBlockIdentifier(json, formattedKey);
  updates.forEach(({ fieldName, languageName, value }) => {
    setKeywordInBlock(json, targetBlock, fieldName, languageName, value);
  });

  return flattenSingleBlockSheet(json, targetBlock);
}

export {
  applyKeywordUpdates,
  formatBlockKey,
  readKeywordFromSidecar,
  resolveBlockIdentifier,
};
