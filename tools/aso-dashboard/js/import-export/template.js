import {
  buildGooglePlayReleaseNotesBlob,
  isReleaseNotesField,
} from '../google-play-release-notes.js';
import { fieldAcceptsKeywords, listSchemaFields } from './page-map.js';
import {
  SHEET_IMAGES_VIDEOS,
  SHEET_METADATA,
  SHEET_PROMOS,
} from '../lib/sheet-to-block-map.js';
import { ROW_ROLE_ENGLISH_SOURCE, ROW_ROLE_LOCALIZED } from './paths.js';

const SHEET_SETTINGS = 'Settings';

const ROW_ROLE_ENGLISH_SOURCE_LABEL = 'English Source Text';
const ROW_ROLE_ENGLISH_SOURCE_KW_LABEL = 'English Source Text + KW';
const ROW_ROLE_LOCALIZED_LABEL = 'Localized Copies';

const KEYWORD_INSTRUCTIONS = (
  "Core + Net KW's Only (100 MAX). REQUIREMENTS: "
  + "List in terms of priority; No plurals; No duplicates; No english for loc KW's"
);

const AGGREGATED_PLAY_PASTE_LABEL = 'Aggregated (Play paste)';

const STORE_BANNERS = Object.freeze({
  google: 'Google Play',
  apple: 'Apple iOS',
});

const SETTINGS_ROWS = Object.freeze([
  ['Product', 'product'],
  ['Store type', 'storeType'],
  ['Test name', 'testName'],
  ['Year', 'year'],
  ['Quarter', 'quarter'],
  ['Month', 'month'],
]);

const GRAY_ITALIC = { italic: true, color: { argb: 'FF666666' } };
const BOLD = { bold: true };
const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E8E8' } };
const STORE_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6EAF8' } };
const LABEL_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
const OVER_LIMIT_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8D7DA' } };

function isOverCharLimit(text, charLimit) {
  return Boolean(charLimit) && String(text ?? '').length > charLimit;
}

function normalizeCellText(value) {
  if (value == null) return '';
  if (typeof value === 'object' && value.text != null) return String(value.text).trim();
  if (typeof value === 'object' && value.richText) {
    return value.richText.map((part) => part.text || '').join('').trim();
  }
  return String(value).trim();
}

function getRowRole(languagesValue) {
  const label = normalizeCellText(languagesValue);
  if (!label) return null;
  if (label === ROW_ROLE_ENGLISH_SOURCE_LABEL) return ROW_ROLE_ENGLISH_SOURCE;
  if (label === ROW_ROLE_ENGLISH_SOURCE_KW_LABEL) return `${ROW_ROLE_ENGLISH_SOURCE}-kw`;
  if (label === ROW_ROLE_LOCALIZED_LABEL) return ROW_ROLE_LOCALIZED;
  if (label.startsWith('Character Count - Max')) return 'char-count';
  if (label === KEYWORD_INSTRUCTIONS) return 'keywords';
  return null;
}

function shouldImportKeywords(language, field) {
  const acceptsKeywords = field?.acceptsKeywords ?? fieldAcceptsKeywords(field);
  return Boolean(language?.isManagedLocale && acceptsKeywords);
}

function isAggregatedPlayPasteLabel(value) {
  return normalizeCellText(value) === AGGREGATED_PLAY_PASTE_LABEL;
}

function languageColumnStart(includeAggregatedPlayColumn) {
  return includeAggregatedPlayColumn ? 4 : 3;
}

function marketColumnCount(languageNames, includeAggregatedPlayColumn = false) {
  return languageNames.length + (includeAggregatedPlayColumn ? 1 : 0);
}

function readLanguageNamesFromSheet(ws) {
  const rowCount = ws.rowCount || ws.lastRow?.number || 0;
  for (let rowNumber = 1; rowNumber <= Math.min(rowCount, 20); rowNumber += 1) {
    const row = ws.getRow(rowNumber);
    const isHeaderRow = normalizeCellText(row.getCell(1).value) === 'Section'
      && normalizeCellText(row.getCell(2).value) === 'Languages';
    if (isHeaderRow) {
      const languageNames = [];
      for (let col = 3; col <= 100; col += 1) {
        const value = normalizeCellText(row.getCell(col).value);
        if (!value) break;
        if (!isAggregatedPlayPasteLabel(value)) languageNames.push(value);
      }
      return languageNames;
    }
  }
  return [];
}

function readLanguageColumnValues(row, languageNames, columnStart = 3) {
  const values = {};
  languageNames.forEach((languageName, index) => {
    const cell = row.getCell(columnStart + index);
    values[languageName] = normalizeCellText(cell.value);
  });
  return values;
}

function writeLanguageColumnValues(
  row,
  languageNames,
  values = {},
  columnStart = 3,
  charLimit = null,
) {
  languageNames.forEach((languageName, index) => {
    const text = values[languageName];
    if (text != null && text !== '') {
      const cell = row.getCell(columnStart + index);
      cell.value = text;
      cell.alignment = { wrapText: true, vertical: 'top' };
      if (isOverCharLimit(text, charLimit)) cell.fill = OVER_LIMIT_FILL;
    }
  });
}

// Only the over-limit columns get a value here — everything within limit stays blank,
// same as today, so this doesn't add noise to fields that are already fine.
function writeCharCountOverages(row, languageNames, values, columnStart, charLimit) {
  languageNames.forEach((languageName, index) => {
    const text = values[languageName];
    if (isOverCharLimit(text, charLimit)) {
      row.getCell(columnStart + index).value = `${String(text).length}/${charLimit}`;
    }
  });
}

function hasCharLimitOverage(languageNames, values, charLimit) {
  return languageNames.some((languageName) => isOverCharLimit(values[languageName], charLimit));
}

function buildPlayReleaseNotesBlob(fieldName, localized, languages, languageNames) {
  if (!isReleaseNotesField(fieldName) || !languages?.length) return '';

  const selectedLanguages = languages.filter((language) => languageNames.includes(language.name));
  const langData = {};
  selectedLanguages.forEach((language) => {
    langData[language.name] = { [fieldName]: localized[language.name] ?? '' };
  });

  return buildGooglePlayReleaseNotesBlob(selectedLanguages, langData, fieldName);
}

function charCountLabel(charLimit) {
  return charLimit ? `Character Count - Max ${charLimit}` : 'Character Count';
}

function sourceRowLabel(acceptsKeywords) {
  return acceptsKeywords ? ROW_ROLE_ENGLISH_SOURCE_KW_LABEL : ROW_ROLE_ENGLISH_SOURCE_LABEL;
}

function imagesVideosBanner(device, pageLeaf) {
  const isVideo = String(pageLeaf || '').includes('videos');
  if (device === 'google') {
    return isVideo ? 'Google Play — Videos (videos page)' : 'Google Play — Screenshots (images page)';
  }
  return isVideo ? 'Apple iOS — Videos (videos page)' : 'Apple iOS — Screenshots (images page)';
}

function fieldGroupKey(cell) {
  return [
    cell.sheet,
    cell.device,
    cell.blockType,
    cell.fieldKey,
    cell.promoName || '',
    cell.promoVariant || '',
  ].join('|');
}

function buildFieldRecord(base, cells) {
  const englishSource = {};
  const localized = {};
  const keywords = {};
  cells.forEach((cell) => {
    const languageName = cell.language?.name;
    if (!languageName) return;
    if (cell.rowRole === ROW_ROLE_ENGLISH_SOURCE) {
      englishSource[languageName] = cell.text ?? '';
      if (cell.keywordText) {
        keywords[languageName] = cell.keywordText;
      }
    } else if (cell.rowRole === ROW_ROLE_LOCALIZED) {
      localized[languageName] = cell.text ?? '';
    }
  });

  return {
    fieldKey: base.fieldKey,
    fieldName: base.fieldName,
    charLimit: base.charLimit ?? null,
    acceptsKeywords: Boolean(base.acceptsKeywords),
    pageLeaf: base.pageLeaf,
    englishSource,
    localized,
    keywords,
  };
}

function buildExportPayload({
  settings,
  cells,
  languageNames,
  languages = [],
  schema,
  sheetMap,
  skipped = [],
}) {
  const byGroup = new Map();

  cells.forEach((cell) => {
    const key = fieldGroupKey(cell);
    if (!byGroup.has(key)) {
      byGroup.set(key, {
        sheet: cell.sheet,
        device: cell.device,
        blockType: cell.blockType,
        fieldKey: cell.fieldKey,
        fieldName: cell.fieldName,
        pageLeaf: cell.pageLeaf,
        promoName: cell.promoName,
        promoVariant: cell.promoVariant,
        cells: [],
      });
    }
    byGroup.get(key).cells.push(cell);
  });

  const metadata = { google: [], apple: [] };
  const promosByName = new Map();
  const imagesVideos = { google: [], apple: [] };

  byGroup.forEach((group) => {
    const schemaField = listSchemaFields(
      schema,
      sheetMap,
      group.device,
      group.blockType,
      { promoName: group.promoName, promoVariant: group.promoVariant },
    ).find((field) => field.fieldKey === group.fieldKey);

    const record = buildFieldRecord({
      fieldKey: group.fieldKey,
      fieldName: group.fieldName,
      charLimit: schemaField?.charLimit,
      acceptsKeywords: schemaField?.acceptsKeywords,
      pageLeaf: group.pageLeaf,
    }, group.cells);

    if (group.sheet === SHEET_METADATA && metadata[group.device]) {
      if (group.device === 'google' && isReleaseNotesField(record.fieldName)) {
        record.playReleaseNotesBlob = buildPlayReleaseNotesBlob(
          record.fieldName,
          record.localized,
          languages,
          languageNames,
        );
      }
      metadata[group.device].push(record);
      return;
    }

    if (group.sheet === SHEET_IMAGES_VIDEOS && imagesVideos[group.device]) {
      record.banner = imagesVideosBanner(group.device, group.pageLeaf);
      imagesVideos[group.device].push(record);
      return;
    }

    if (group.sheet === SHEET_PROMOS && group.promoName) {
      if (!promosByName.has(group.promoName)) {
        promosByName.set(group.promoName, { promoName: group.promoName, devices: {} });
      }
      const promo = promosByName.get(group.promoName);
      if (!promo.devices[group.device]) {
        promo.devices[group.device] = { variants: {} };
      }
      const variantKey = group.promoVariant || 'default';
      const deviceBucket = promo.devices[group.device];
      if (!deviceBucket.variants[variantKey]) {
        deviceBucket.variants[variantKey] = { variantLabel: variantKey, fields: [] };
      }
      deviceBucket.variants[variantKey].fields.push(record);
    }
  });

  ['google', 'apple'].forEach((device) => {
    if (schema && sheetMap) {
      const order = listSchemaFields(schema, sheetMap, device, 'listing')
        .map((field) => field.fieldKey);
      metadata[device].sort((a, b) => {
        const ai = order.indexOf(a.fieldKey);
        const bi = order.indexOf(b.fieldKey);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      });
    }
  });

  return {
    settings,
    languageNames,
    metadata,
    promos: [...promosByName.values()],
    imagesVideos,
    skipped,
  };
}

function propagateEnglishSource(fieldBlocks, languageIndex, options = {}) {
  const englishLanguageName = options.englishLanguageName
    || languageIndex.find((entry) => entry.name === options.sourceLanguageName)?.name
    || languageIndex.find((entry) => entry.isManagedLocale && entry.sourcePath?.endsWith('/en-us'))?.name
    || languageIndex[0]?.name;

  if (!englishLanguageName) return fieldBlocks;

  fieldBlocks.forEach((field) => {
    const englishText = field.englishSource?.[englishLanguageName] ?? '';
    if (!englishText.trim()) return;

    languageIndex.forEach((language) => {
      if (language.name === englishLanguageName) return;
      const current = field.englishSource?.[language.name] ?? '';
      if (current.trim()) return;
      field.englishSource[language.name] = englishText;
      field.propagatedFromEnglish = field.propagatedFromEnglish || [];
      field.propagatedFromEnglish.push(language.name);
    });
  });

  return fieldBlocks;
}

function applyWorksheetStyles(ws, row, col, styles = {}) {
  const cell = ws.getRow(row).getCell(col);
  if (styles.font) cell.font = styles.font;
  if (styles.fill) cell.fill = styles.fill;
}

function writeStoreBanner(ws, row, title, totalMarketColumns) {
  ws.mergeCells(row, 1, row, 2 + totalMarketColumns);
  const cell = ws.getRow(row).getCell(1);
  cell.value = title;
  cell.font = BOLD;
  cell.fill = STORE_FILL;
  return row + 1;
}

function writeTableHeader(ws, row, languageNames, options = {}) {
  const { includeAggregatedPlayColumn = false } = options;
  const headers = ['Section', 'Languages'];
  if (includeAggregatedPlayColumn) {
    headers.push(AGGREGATED_PLAY_PASTE_LABEL);
  }
  headers.push(...languageNames);
  headers.forEach((header, index) => {
    const cell = ws.getRow(row).getCell(index + 1);
    cell.value = header;
    cell.font = BOLD;
    cell.fill = HEADER_FILL;
  });
  return row + 1;
}

function writeMetadataFieldBlock(ws, startRow, field, languageNames, options = {}) {
  const {
    includeAggregatedPlayColumn = false,
    playReleaseNotesBlob = '',
  } = options;
  const columnStart = languageColumnStart(includeAggregatedPlayColumn);
  let row = startRow;

  ws.getRow(row).getCell(1).value = field.fieldName;
  ws.getRow(row).getCell(2).value = sourceRowLabel(field.acceptsKeywords);
  writeLanguageColumnValues(
    ws.getRow(row),
    languageNames,
    field.englishSource,
    columnStart,
    field.charLimit,
  );
  row += 1;

  applyWorksheetStyles(ws, row, 2, { font: GRAY_ITALIC });
  const sourceCharCountRow = ws.getRow(row);
  sourceCharCountRow.getCell(2).value = charCountLabel(field.charLimit);
  writeCharCountOverages(
    sourceCharCountRow,
    languageNames,
    field.englishSource,
    columnStart,
    field.charLimit,
  );
  row += 1;

  if (field.acceptsKeywords) {
    applyWorksheetStyles(ws, row, 2, { font: GRAY_ITALIC });
    ws.getRow(row).getCell(2).value = KEYWORD_INSTRUCTIONS;
    writeLanguageColumnValues(ws.getRow(row), languageNames, field.keywords, columnStart);
    row += 1;
  }

  ws.getRow(row).getCell(2).value = ROW_ROLE_LOCALIZED_LABEL;
  if (includeAggregatedPlayColumn && playReleaseNotesBlob) {
    ws.getRow(row).getCell(3).value = playReleaseNotesBlob;
  }
  writeLanguageColumnValues(
    ws.getRow(row),
    languageNames,
    field.localized,
    columnStart,
    field.charLimit,
  );
  row += 1;

  // Only add a second character-count row when localized text is actually over the limit —
  // the English-source one above always exists, but this stays out of the way otherwise.
  if (hasCharLimitOverage(languageNames, field.localized, field.charLimit)) {
    applyWorksheetStyles(ws, row, 2, { font: GRAY_ITALIC });
    const localizedCharCountRow = ws.getRow(row);
    localizedCharCountRow.getCell(2).value = charCountLabel(field.charLimit);
    writeCharCountOverages(
      localizedCharCountRow,
      languageNames,
      field.localized,
      columnStart,
      field.charLimit,
    );
    row += 1;
  }

  return row;
}

function writeMediaFieldBlock(ws, startRow, field, languageNames) {
  let row = startRow;
  ws.getRow(row).getCell(1).value = field.fieldName;
  ws.getRow(row).getCell(2).value = ROW_ROLE_ENGLISH_SOURCE_LABEL;
  writeLanguageColumnValues(ws.getRow(row), languageNames, field.englishSource);
  row += 1;

  ws.getRow(row).getCell(2).value = ROW_ROLE_LOCALIZED_LABEL;
  writeLanguageColumnValues(ws.getRow(row), languageNames, field.localized);
  return row + 1;
}

function buildSettingsSheet(wb, settings) {
  const ws = wb.addWorksheet(SHEET_SETTINGS);
  ws.getColumn(1).width = 22;
  ws.getColumn(2).width = 40;

  applyWorksheetStyles(ws, 1, 1, { font: BOLD, fill: HEADER_FILL });
  applyWorksheetStyles(ws, 1, 2, { font: BOLD, fill: HEADER_FILL });
  ws.getRow(1).getCell(1).value = 'Setting';
  ws.getRow(1).getCell(2).value = 'Value';

  SETTINGS_ROWS.forEach(([label, key], index) => {
    const row = index + 2;
    applyWorksheetStyles(ws, row, 1, { font: BOLD, fill: LABEL_FILL });
    ws.getRow(row).getCell(1).value = label;
    ws.getRow(row).getCell(2).value = settings?.[key] ?? '';
  });
}

function buildMetadataSheet(wb, payload) {
  const { languageNames, metadata } = payload;
  const ws = wb.addWorksheet(SHEET_METADATA);
  ws.getColumn(1).width = 28;
  ws.getColumn(2).width = 36;
  ws.getColumn(3).width = 30;
  languageNames.forEach((_, index) => {
    ws.getColumn(index + 4).width = 26;
  });

  let row = 1;
  ['google', 'apple'].forEach((device) => {
    const fields = metadata?.[device] || [];
    if (!fields.length) return;

    const includeAggregatedPlayColumn = true;
    const totalMarketColumns = marketColumnCount(languageNames, includeAggregatedPlayColumn);

    row = writeStoreBanner(ws, row, STORE_BANNERS[device], totalMarketColumns);
    row = writeTableHeader(ws, row, languageNames, { includeAggregatedPlayColumn });
    fields.forEach((field) => {
      row = writeMetadataFieldBlock(ws, row, field, languageNames, {
        includeAggregatedPlayColumn,
        playReleaseNotesBlob: field.playReleaseNotesBlob,
      });
    });
    row += 1;
  });

  ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 1, topLeftCell: 'C2', activeCell: 'C2' }];
}

function buildPromosSheet(wb, payload) {
  const { languageNames, promos } = payload;
  if (!promos?.length) return;

  const ws = wb.addWorksheet(SHEET_PROMOS);
  ws.getColumn(1).width = 28;
  ws.getColumn(2).width = 36;
  languageNames.forEach((_, index) => {
    ws.getColumn(index + 3).width = 26;
  });

  let row = 1;
  promos.forEach((promo) => {
    row += 1;
    applyWorksheetStyles(ws, row, 1, { font: BOLD, fill: LABEL_FILL });
    ws.getRow(row).getCell(1).value = 'Promo name';
    ws.getRow(row).getCell(2).value = promo.promoName;
    if (languageNames.length) {
      ws.mergeCells(row, 2, row, 2 + languageNames.length);
    }
    row += 1;

    ['google', 'apple'].forEach((device) => {
      const deviceData = promo.devices?.[device];
      const variants = Object.values(deviceData?.variants || {});
      if (!variants.length) return;

      row = writeStoreBanner(ws, row, STORE_BANNERS[device], languageNames.length);
      row = writeTableHeader(ws, row, languageNames);
      variants.forEach((variant) => {
        ws.getRow(row).getCell(1).value = variant.variantLabel;
        ws.getRow(row).getCell(1).font = BOLD;
        row += 1;
        variant.fields.forEach((field) => {
          row = writeMetadataFieldBlock(ws, row, field, languageNames);
        });
      });
      row += 1;
    });
    row += 1;
  });

  ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 1, topLeftCell: 'C2', activeCell: 'C2' }];
}

function buildImagesVideosSheet(wb, payload) {
  const { languageNames, imagesVideos } = payload;
  const hasContent = ['google', 'apple'].some((device) => (imagesVideos?.[device] || []).length);
  if (!hasContent) return;

  const ws = wb.addWorksheet(SHEET_IMAGES_VIDEOS);
  ws.getColumn(1).width = 34;
  ws.getColumn(2).width = 36;
  languageNames.forEach((_, index) => {
    ws.getColumn(index + 3).width = 14;
  });

  let row = 1;
  ['google', 'apple'].forEach((device) => {
    const fields = imagesVideos?.[device] || [];
    if (!fields.length) return;

    const banners = [...new Set(
      fields.map((field) => field.banner || imagesVideosBanner(device, field.pageLeaf)),
    )];
    banners.forEach((banner) => {
      const bannerFields = fields.filter(
        (field) => (field.banner || imagesVideosBanner(device, field.pageLeaf)) === banner,
      );
      if (!bannerFields.length) return;

      row = writeStoreBanner(ws, row, banner, languageNames.length);
      row = writeTableHeader(ws, row, languageNames);
      bannerFields.forEach((field) => {
        row = writeMediaFieldBlock(ws, row, field, languageNames);
      });
      row += 1;
    });
  });

  ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 1, topLeftCell: 'C2', activeCell: 'C2' }];
}

function buildWorkbook(ExcelJS, payload) {
  const wb = new ExcelJS.Workbook();
  buildSettingsSheet(wb, payload.settings || {});
  buildMetadataSheet(wb, payload);
  buildPromosSheet(wb, payload);
  buildImagesVideosSheet(wb, payload);
  return wb;
}

function parseSettingsSheet(ws) {
  const settings = {};
  const labelToKey = Object.fromEntries(SETTINGS_ROWS.map(([label, key]) => [label, key]));
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const label = normalizeCellText(row.getCell(1).value);
    const key = labelToKey[label];
    if (key) settings[key] = normalizeCellText(row.getCell(2).value);
  });
  return settings;
}

function parseFieldBlockRows(ws, languageNames, startRow, rowCount, context) {
  const row = ws.getRow(startRow);
  const section = normalizeCellText(row.getCell(1).value);
  const languages = normalizeCellText(row.getCell(2).value);
  const role = getRowRole(languages);
  const isSourceRow = role === ROW_ROLE_ENGLISH_SOURCE || role === `${ROW_ROLE_ENGLISH_SOURCE}-kw`;
  if (!section || !isSourceRow) {
    return { nextRow: startRow + 1, field: null };
  }

  const columnStart = context.languageColumnStart ?? 3;
  const field = {
    fieldName: section,
    device: context.currentStore,
    variantLabel: context.currentVariant,
    acceptsKeywords: role === `${ROW_ROLE_ENGLISH_SOURCE}-kw`,
    englishSource: readLanguageColumnValues(row, languageNames, columnStart),
    localized: {},
    keywords: {},
  };
  let rowNumber = startRow + 1;

  const charCountRole = rowNumber <= rowCount
    ? getRowRole(ws.getRow(rowNumber).getCell(2).value)
    : null;
  if (charCountRole === 'char-count') rowNumber += 1;

  const keywordRole = rowNumber <= rowCount
    ? getRowRole(ws.getRow(rowNumber).getCell(2).value)
    : null;
  if (keywordRole === 'keywords') {
    field.keywords = readLanguageColumnValues(
      ws.getRow(rowNumber),
      languageNames,
      columnStart,
    );
    rowNumber += 1;
  }

  const localizedRole = rowNumber <= rowCount
    ? getRowRole(ws.getRow(rowNumber).getCell(2).value)
    : null;
  if (localizedRole === ROW_ROLE_LOCALIZED) {
    field.localized = readLanguageColumnValues(
      ws.getRow(rowNumber),
      languageNames,
      columnStart,
    );
    rowNumber += 1;
  }

  return { nextRow: rowNumber, field };
}

function parseContentSheetRows(ws, languageNames, options = {}) {
  const fields = [];
  const promos = [];
  const context = {
    currentStore: options.defaultStore || '',
    currentPromo: null,
    currentVariant: null,
    languageColumnStart: 3,
  };
  let rowNumber = 1;
  const rowCount = ws.rowCount || ws.lastRow?.number || 0;

  while (rowNumber <= rowCount) {
    const row = ws.getRow(rowNumber);
    const section = normalizeCellText(row.getCell(1).value);
    const languages = normalizeCellText(row.getCell(2).value);
    const role = getRowRole(languages);

    if (section === 'Promo name') {
      context.currentPromo = {
        promoName: normalizeCellText(row.getCell(2).value),
        devices: {},
      };
      promos.push(context.currentPromo);
      rowNumber += 1;
    } else if (
      section.startsWith(STORE_BANNERS.google) || section.startsWith(STORE_BANNERS.apple)
    ) {
      // Images-Videos banners are longer variants (e.g. "Apple iOS — Screenshots (images
      // page)"), not the exact "Apple iOS" / "Google Play" used on Metadata/Promos — match
      // the prefix so both round-trip correctly.
      context.currentStore = section.startsWith(STORE_BANNERS.google) ? 'google' : 'apple';
      rowNumber += 1;
    } else if (section === 'Section' && languages === 'Languages') {
      context.languageColumnStart = isAggregatedPlayPasteLabel(row.getCell(3).value) ? 4 : 3;
      rowNumber += 1;
    } else if (section && !role && !languages) {
      context.currentVariant = section;
      if (context.currentPromo && context.currentStore) {
        if (!context.currentPromo.devices[context.currentStore]) {
          context.currentPromo.devices[context.currentStore] = { variants: {} };
        }
        if (!context.currentPromo.devices[context.currentStore].variants[context.currentVariant]) {
          context.currentPromo.devices[context.currentStore].variants[context.currentVariant] = {
            variantLabel: context.currentVariant,
            fields: [],
          };
        }
      }
      rowNumber += 1;
    } else {
      const parsed = parseFieldBlockRows(ws, languageNames, rowNumber, rowCount, context);
      rowNumber = parsed.nextRow;
      if (parsed.field) {
        const { currentPromo, currentStore, currentVariant } = context;
        if (currentPromo && currentStore && currentVariant) {
          currentPromo.devices[currentStore].variants[currentVariant].fields.push(parsed.field);
        } else {
          fields.push(parsed.field);
        }
      }
    }
  }

  return { fields, promos };
}

async function parseWorkbook(arrayBuffer, ExcelJS) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(arrayBuffer);

  const settingsWs = wb.getWorksheet(SHEET_SETTINGS);
  const settings = settingsWs ? parseSettingsSheet(settingsWs) : {};

  const metadataWs = wb.getWorksheet(SHEET_METADATA);
  const promosWs = wb.getWorksheet(SHEET_PROMOS);
  const mediaWs = wb.getWorksheet(SHEET_IMAGES_VIDEOS);

  let languageNames = [];
  if (metadataWs) {
    languageNames = readLanguageNamesFromSheet(metadataWs);
  }

  const metadata = { google: [], apple: [] };
  if (metadataWs && languageNames.length) {
    const parsed = parseContentSheetRows(metadataWs, languageNames);
    parsed.fields.forEach((field) => {
      const device = field.device === 'apple' ? 'apple' : 'google';
      metadata[device].push(field);
    });
  }

  const promos = promosWs && languageNames.length
    ? parseContentSheetRows(promosWs, languageNames).promos
    : [];

  const imagesVideos = { google: [], apple: [] };
  if (mediaWs && languageNames.length) {
    const parsed = parseContentSheetRows(mediaWs, languageNames, { mediaSheet: true });
    parsed.fields.forEach((field) => {
      const device = field.device === 'apple' ? 'apple' : 'google';
      imagesVideos[device].push(field);
    });
  }

  return {
    settings,
    languageNames,
    metadata,
    promos,
    imagesVideos,
  };
}

export {
  AGGREGATED_PLAY_PASTE_LABEL,
  KEYWORD_INSTRUCTIONS,
  ROW_ROLE_ENGLISH_SOURCE_LABEL,
  ROW_ROLE_ENGLISH_SOURCE_KW_LABEL,
  ROW_ROLE_LOCALIZED_LABEL,
  SHEET_SETTINGS,
  buildExportPayload,
  buildPlayReleaseNotesBlob,
  buildWorkbook,
  getRowRole,
  parseWorkbook,
  propagateEnglishSource,
  shouldImportKeywords,
};
