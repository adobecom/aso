import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';
import { buildLanguageIndex } from '../../../../../tools/aso-dashboard/js/lib/translate-paths.js';
import {
  AGGREGATED_PLAY_PASTE_LABEL,
  KEYWORD_INSTRUCTIONS,
  buildExportPayload,
  buildPlayReleaseNotesBlob,
  buildWorkbook,
  getRowRole,
  parseWorkbook,
  propagateEnglishSource,
  shouldImportKeywords,
} from '../../../../../tools/aso-dashboard/js/import-export/template.js';
import { ROW_ROLE_ENGLISH_SOURCE, ROW_ROLE_LOCALIZED } from '../../../../../tools/aso-dashboard/js/import-export/paths.js';
import { createTestExcelJS } from '../../helpers/test-exceljs.js';

function getCellValue(ws, row, col) {
  return ws.getRow(row).getCell(col).value;
}

describe('import-export-template', () => {
  let schema;
  let sheetMap;
  let translateData;
  let languages;
  let ExcelJS;

  beforeEach(async () => {
    schema = JSON.parse(await readFile({ path: '../../mocks/block-schema.json' }));
    sheetMap = JSON.parse(await readFile({ path: '../../mocks/sheet-to-block-map.json' }));
    translateData = JSON.parse(await readFile({ path: '../../mocks/translate.json' }));
    languages = buildLanguageIndex(translateData.languages.data, translateData);
    ExcelJS = createTestExcelJS();
  });

  it('detects row roles from Languages column labels', () => {
    expect(getRowRole('English Source Text')).to.equal(ROW_ROLE_ENGLISH_SOURCE);
    expect(getRowRole('English Source Text + KW')).to.equal(`${ROW_ROLE_ENGLISH_SOURCE}-kw`);
    expect(getRowRole('Localized Copies')).to.equal(ROW_ROLE_LOCALIZED);
    expect(getRowRole('Character Count - Max 30')).to.equal('char-count');
    expect(getRowRole(KEYWORD_INSTRUCTIONS)).to.equal('keywords');
  });

  it('shouldImportKeywords only for managed locales with keyword fields', () => {
    const german = languages.find((lang) => lang.name === 'German');
    const romanian = languages.find((lang) => lang.name === 'Romanian');
    const keywordField = { 'keywords injection': 'yes' };
    const plainField = { 'keywords injection': 'no' };

    expect(shouldImportKeywords(german, keywordField)).to.be.true;
    expect(shouldImportKeywords(german, plainField)).to.be.false;
    expect(shouldImportKeywords(romanian, keywordField)).to.be.false;
  });

  it('propagateEnglishSource fills empty managed and unmanaged source cells', () => {
    const fields = [{
      fieldName: 'App Name',
      englishSource: {
        English: 'Express App',
        German: '',
        Romanian: '',
      },
      localized: {},
    }];

    propagateEnglishSource(fields, languages, { englishMarketName: 'English' });

    expect(fields[0].englishSource.German).to.equal('Express App');
    expect(fields[0].englishSource.Romanian).to.equal('Express App');
    expect(fields[0].propagatedFromEnglish).to.include('German');
    expect(fields[0].propagatedFromEnglish).to.include('Romanian');
  });

  it('buildExportPayload groups cells by field and row role', () => {
    const german = languages.find((lang) => lang.name === 'German');
    const payload = buildExportPayload({
      settings: { product: 'adobe-express', year: '2026', quarter: 'q1', month: 'may' },
      languageNames: languages.map((lang) => lang.name),
      schema,
      sheetMap,
      cells: [
        {
          sheet: 'Metadata',
          device: 'apple',
          blockType: 'listing',
          fieldKey: 'name',
          fieldName: 'App Name',
          pageLeaf: 'metadata/app-name',
          rowRole: ROW_ROLE_ENGLISH_SOURCE,
          language: german,
          text: 'Source DE',
        },
        {
          sheet: 'Metadata',
          device: 'apple',
          blockType: 'listing',
          fieldKey: 'name',
          fieldName: 'App Name',
          pageLeaf: 'metadata/app-name',
          rowRole: ROW_ROLE_LOCALIZED,
          language: german,
          text: 'Localized DE',
        },
      ],
    });

    expect(payload.metadata.apple).to.have.length(1);
    expect(payload.metadata.apple[0].englishSource.German).to.equal('Source DE');
    expect(payload.metadata.apple[0].localized.German).to.equal('Localized DE');
  });

  it('buildExportPayload includes keyword values from english-source cells', () => {
    const german = languages.find((lang) => lang.name === 'German');
    const payload = buildExportPayload({
      settings: { product: 'adobe-express', year: '2026', quarter: 'q1', month: 'may' },
      languageNames: languages.map((lang) => lang.name),
      schema,
      sheetMap,
      cells: [{
        sheet: 'Metadata',
        device: 'apple',
        blockType: 'listing',
        fieldKey: 'name',
        fieldName: 'App Name',
        pageLeaf: 'metadata/app-name',
        rowRole: ROW_ROLE_ENGLISH_SOURCE,
        language: german,
        text: 'Source DE',
        keywordText: 'express, design',
      }],
    });

    expect(payload.metadata.apple[0].keywords.German).to.equal('express, design');
  });

  it('buildWorkbook writes settings and metadata values', () => {
    const payload = buildExportPayload({
      settings: { product: 'adobe-express', year: '2026', quarter: 'q1', month: 'may' },
      languageNames: ['English', 'German'],
      schema,
      sheetMap,
      cells: [{
        sheet: 'Metadata',
        device: 'apple',
        blockType: 'listing',
        fieldKey: 'name',
        fieldName: 'App Name',
        pageLeaf: 'metadata/app-name',
        rowRole: ROW_ROLE_ENGLISH_SOURCE,
        language: { name: 'German' },
        text: 'Managed source',
      }],
    });

    const wb = buildWorkbook(ExcelJS, payload);
    const settings = wb.getWorksheet('Settings');
    const metadata = wb.getWorksheet('Metadata');

    expect(getCellValue(settings, 2, 1)).to.equal('Product');
    expect(getCellValue(settings, 2, 2)).to.equal('adobe-express');
    expect(getCellValue(metadata, 3, 1)).to.equal('App Name');
    expect(getCellValue(metadata, 3, 2)).to.equal('English Source Text + KW');
    expect(getCellValue(metadata, 3, 5)).to.equal('Managed source');
  });

  it('parseWorkbook reads settings and metadata field values', async () => {
    const payload = buildExportPayload({
      settings: { product: 'adobe-express', year: '2026', quarter: 'q1', month: 'may' },
      languageNames: ['English', 'German'],
      schema,
      sheetMap,
      cells: [{
        sheet: 'Metadata',
        device: 'google',
        blockType: 'listing',
        fieldKey: 'title',
        fieldName: 'App Title',
        pageLeaf: 'metadata/app-title',
        rowRole: ROW_ROLE_ENGLISH_SOURCE,
        language: { name: 'German' },
        text: 'Google title source',
      }, {
        sheet: 'Metadata',
        device: 'google',
        blockType: 'listing',
        fieldKey: 'title',
        fieldName: 'App Title',
        pageLeaf: 'metadata/app-title',
        rowRole: ROW_ROLE_LOCALIZED,
        language: { name: 'German' },
        text: 'Google title loc',
      }],
    });

    const wb = buildWorkbook(ExcelJS, payload);
    const buffer = await wb.xlsx.writeBuffer();
    const parsed = await parseWorkbook(buffer, ExcelJS);

    expect(parsed.settings.product).to.equal('adobe-express');
    expect(parsed.languageNames).to.deep.equal(['English', 'German']);
    expect(parsed.metadata.google[0].fieldName).to.equal('App Title');
    expect(parsed.metadata.google[0].englishSource.German).to.equal('Google title source');
    expect(parsed.metadata.google[0].localized.German).to.equal('Google title loc');
  });

  it('buildWorkbook adds Aggregated (Play paste) for Google Release Notes only', async () => {
    const english = languages.find((lang) => lang.name === 'English');
    const german = languages.find((lang) => lang.name === 'German');
    const payload = buildExportPayload({
      settings: { product: 'adobe-express', year: '2026', quarter: 'q1', month: 'may' },
      languageNames: ['English', 'German'],
      languages: [english, german],
      schema,
      sheetMap,
      cells: [{
        sheet: 'Metadata',
        device: 'google',
        blockType: 'listing',
        fieldKey: 'releaseNotes',
        fieldName: 'Release Notes',
        pageLeaf: 'metadata/release-notes',
        rowRole: ROW_ROLE_LOCALIZED,
        language: english,
        text: 'EN release notes',
      }, {
        sheet: 'Metadata',
        device: 'google',
        blockType: 'listing',
        fieldKey: 'releaseNotes',
        fieldName: 'Release Notes',
        pageLeaf: 'metadata/release-notes',
        rowRole: ROW_ROLE_LOCALIZED,
        language: german,
        text: 'DE release notes',
      }],
    });

    expect(payload.metadata.google[0].playReleaseNotesBlob).to.include('<en-US>');
    expect(payload.metadata.google[0].playReleaseNotesBlob).to.include('EN release notes');
    expect(payload.metadata.google[0].playReleaseNotesBlob).to.include('<de-DE>');
    expect(payload.metadata.google[0].playReleaseNotesBlob).to.include('DE release notes');

    const wb = buildWorkbook(ExcelJS, payload);
    const metadata = wb.getWorksheet('Metadata');

    expect(getCellValue(metadata, 2, 3)).to.equal(AGGREGATED_PLAY_PASTE_LABEL);
    expect(getCellValue(metadata, 2, 4)).to.equal('English');

    const releaseNotesLocalizedRow = 5;
    expect(getCellValue(metadata, releaseNotesLocalizedRow, 2)).to.equal('Localized Copies');
    expect(getCellValue(metadata, releaseNotesLocalizedRow, 3)).to.equal(
      payload.metadata.google[0].playReleaseNotesBlob,
    );
    expect(getCellValue(metadata, releaseNotesLocalizedRow, 4)).to.equal('EN release notes');
    expect(getCellValue(metadata, releaseNotesLocalizedRow, 5)).to.equal('DE release notes');

    const buffer = await wb.xlsx.writeBuffer();
    const parsed = await parseWorkbook(buffer, ExcelJS);
    expect(parsed.languageNames).to.deep.equal(['English', 'German']);
    expect(parsed.metadata.google[0].localized.English).to.equal('EN release notes');
    expect(parsed.metadata.google[0].localized.German).to.equal('DE release notes');
  });

  it('aligns Apple and Google language columns by giving Apple the same Aggregated (Play paste) column', async () => {
    const payload = buildExportPayload({
      settings: { product: 'adobe-express', year: '2026', quarter: 'q1', month: 'may' },
      languageNames: ['English', 'German'],
      schema,
      sheetMap,
      cells: [{
        sheet: 'Metadata',
        device: 'google',
        blockType: 'listing',
        fieldKey: 'title',
        fieldName: 'App Title',
        pageLeaf: 'metadata/app-title',
        rowRole: ROW_ROLE_LOCALIZED,
        language: { name: 'English' },
        text: 'Google title',
      }, {
        sheet: 'Metadata',
        device: 'apple',
        blockType: 'listing',
        fieldKey: 'name',
        fieldName: 'App Name',
        pageLeaf: 'metadata/app-name',
        rowRole: ROW_ROLE_LOCALIZED,
        language: { name: 'English' },
        text: 'Apple name',
      }],
    });

    const wb = buildWorkbook(ExcelJS, payload);
    const metadata = wb.getWorksheet('Metadata');

    // Google's header row (row 2): Section, Languages, Aggregated (Play paste), English, German.
    expect(getCellValue(metadata, 2, 3)).to.equal(AGGREGATED_PLAY_PASTE_LABEL);
    expect(getCellValue(metadata, 2, 4)).to.equal('English');

    // Apple's block starts after Google's (banner + header + 4 field rows + spacer + banner).
    // Its header row must use the same column layout as Google's for the columns to line up.
    const appleHeaderRow = 9;
    expect(getCellValue(metadata, appleHeaderRow, 3)).to.equal(AGGREGATED_PLAY_PASTE_LABEL);
    expect(getCellValue(metadata, appleHeaderRow, 4)).to.equal('English');
  });

  it('round-trips Images-Videos fields to the correct device — not just Google', async () => {
    // Images-Videos banners are longer variants ("Apple iOS — Screenshots (images page)"),
    // not the exact "Apple iOS" / "Google Play" text Metadata/Promos use. A parser that only
    // matched the exact banner text would silently bucket every device under "google".
    const payload = buildExportPayload({
      settings: { product: 'adobe-express', year: '2026', quarter: 'q1', month: 'may' },
      languageNames: ['English'],
      schema,
      sheetMap,
      cells: [{
        // parseWorkbook only derives languageNames from the Metadata sheet's header row —
        // a workbook with no Metadata content at all would skip Images-Videos parsing
        // entirely regardless of this fix, so a realistic test needs at least one row here.
        sheet: 'Metadata',
        device: 'apple',
        blockType: 'listing',
        fieldKey: 'name',
        fieldName: 'App Name',
        pageLeaf: 'metadata/app-name',
        rowRole: ROW_ROLE_ENGLISH_SOURCE,
        language: { name: 'English' },
        text: 'Adobe Express',
      }, {
        sheet: 'Images-Videos',
        device: 'apple',
        blockType: 'images-videos',
        fieldKey: 'screenshotsiPhoneCopy1',
        fieldName: 'Screenshot iPhone Copy 1',
        pageLeaf: 'images/copy',
        rowRole: ROW_ROLE_ENGLISH_SOURCE,
        language: { name: 'English' },
        text: 'Apple screenshot copy',
      }, {
        sheet: 'Images-Videos',
        device: 'google',
        blockType: 'images-videos',
        fieldKey: 'tabletScreenshotCopy8',
        fieldName: 'Tablet Screenshot Copy 8',
        pageLeaf: 'images/copy',
        rowRole: ROW_ROLE_ENGLISH_SOURCE,
        language: { name: 'English' },
        text: 'Google screenshot copy',
      }],
    });

    const wb = buildWorkbook(ExcelJS, payload);
    const buffer = await wb.xlsx.writeBuffer();
    const parsed = await parseWorkbook(buffer, ExcelJS);

    expect(parsed.imagesVideos.apple.map((f) => f.fieldName)).to.deep.equal(['Screenshot iPhone Copy 1']);
    expect(parsed.imagesVideos.google.map((f) => f.fieldName)).to.deep.equal(['Tablet Screenshot Copy 8']);
  });

  it('buildPlayReleaseNotesBlob returns empty for non-release-notes fields', () => {
    const blob = buildPlayReleaseNotesBlob(
      'App Title',
      { English: 'Title' },
      languages,
      ['English'],
    );
    expect(blob).to.equal('');
  });

  describe('character limit validation', () => {
    it('buildExportPayload carries the schema character count onto the field record', () => {
      const payload = buildExportPayload({
        settings: { product: 'adobe-express', year: '2026', quarter: 'q1', month: 'may' },
        languageNames: ['English'],
        schema,
        sheetMap,
        cells: [{
          sheet: 'Metadata',
          device: 'apple',
          blockType: 'listing',
          fieldKey: 'name',
          fieldName: 'App Name',
          pageLeaf: 'metadata/app-name',
          rowRole: ROW_ROLE_ENGLISH_SOURCE,
          language: { name: 'English' },
          text: 'Photoshop',
        }],
      });

      expect(payload.metadata.apple[0].charLimit).to.equal(30);
    });

    it('buildWorkbook highlights over-limit cells with a fill, and leaves in-limit cells alone', () => {
      const payload = buildExportPayload({
        settings: { product: 'adobe-express', year: '2026', quarter: 'q1', month: 'may' },
        languageNames: ['English'],
        schema,
        sheetMap,
        cells: [{
          sheet: 'Metadata',
          device: 'apple',
          blockType: 'listing',
          fieldKey: 'name',
          fieldName: 'App Name',
          pageLeaf: 'metadata/app-name',
          rowRole: ROW_ROLE_ENGLISH_SOURCE,
          language: { name: 'English' },
          text: 'x'.repeat(35),
        }],
      });

      const wb = buildWorkbook(ExcelJS, payload);
      const metadata = wb.getWorksheet('Metadata');
      // Row 3 = the field's English-source row; column 4 = English (columnStart 4, since
      // this schema field accepts keywords and gets the Aggregated Play Paste column too).
      expect(metadata.getRow(3).getCell(4).fill).to.deep.equal({ type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8D7DA' } });
    });

    it('writes the actual length/limit into the Character Count row, only for over-limit columns', () => {
      const payload = buildExportPayload({
        settings: { product: 'adobe-express', year: '2026', quarter: 'q1', month: 'may' },
        languageNames: ['English', 'German'],
        schema,
        sheetMap,
        cells: [
          {
            sheet: 'Metadata',
            device: 'apple',
            blockType: 'listing',
            fieldKey: 'promotionalText',
            fieldName: 'Promotional Text',
            pageLeaf: 'metadata/promotional-text',
            rowRole: ROW_ROLE_ENGLISH_SOURCE,
            language: { name: 'English' },
            text: 'x'.repeat(200),
          },
          {
            sheet: 'Metadata',
            device: 'apple',
            blockType: 'listing',
            fieldKey: 'promotionalText',
            fieldName: 'Promotional Text',
            pageLeaf: 'metadata/promotional-text',
            rowRole: ROW_ROLE_ENGLISH_SOURCE,
            language: { name: 'German' },
            text: 'short',
          },
        ],
      });

      const wb = buildWorkbook(ExcelJS, payload);
      const metadata = wb.getWorksheet('Metadata');
      // Row 3 = English-source row, row 4 = its Character Count row. Column 4 = English,
      // column 5 = German (columnStart 4, aggregated play column included for every listing field).
      expect(getCellValue(metadata, 4, 4)).to.equal('200/170');
      expect(getCellValue(metadata, 4, 5)).to.equal(null);
    });

    it('adds a second Character Count row after Localized Copies, only when localized text is itself over the limit', () => {
      const payload = buildExportPayload({
        settings: { product: 'adobe-express', year: '2026', quarter: 'q1', month: 'may' },
        languageNames: ['German'],
        schema,
        sheetMap,
        cells: [{
          sheet: 'Metadata',
          device: 'apple',
          blockType: 'listing',
          fieldKey: 'promotionalText',
          fieldName: 'Promotional Text',
          pageLeaf: 'metadata/promotional-text',
          rowRole: ROW_ROLE_LOCALIZED,
          language: { name: 'German' },
          text: 'x'.repeat(180),
        }],
      });

      const wb = buildWorkbook(ExcelJS, payload);
      const metadata = wb.getWorksheet('Metadata');
      // Row 3 = (empty) English-source row, row 4 = its (empty) Character Count row,
      // row 5 = Localized Copies row, row 6 = the new Character Count row for it.
      expect(getCellValue(metadata, 5, 4).fill).to.equal(undefined);
      expect(getCellValue(metadata, 6, 2)).to.equal('Character Count - Max 170');
      expect(getCellValue(metadata, 6, 4)).to.equal('180/170');
    });

    it('does not add a second Character Count row when localized text is within the limit', () => {
      const payload = buildExportPayload({
        settings: { product: 'adobe-express', year: '2026', quarter: 'q1', month: 'may' },
        languageNames: ['German'],
        schema,
        sheetMap,
        cells: [{
          sheet: 'Metadata',
          device: 'apple',
          blockType: 'listing',
          fieldKey: 'promotionalText',
          fieldName: 'Promotional Text',
          pageLeaf: 'metadata/promotional-text',
          rowRole: ROW_ROLE_LOCALIZED,
          language: { name: 'German' },
          text: 'short',
        }],
      });

      const wb = buildWorkbook(ExcelJS, payload);
      const metadata = wb.getWorksheet('Metadata');
      expect(getCellValue(metadata, 5, 2)).to.equal('Localized Copies');
      expect(getCellValue(metadata, 6, 2)).to.not.equal('Character Count - Max 170');
    });
  });

  it('wraps text in language cells and gives them room to display it', () => {
    const payload = buildExportPayload({
      settings: { product: 'adobe-express', year: '2026', quarter: 'q1', month: 'may' },
      languageNames: ['English'],
      schema,
      sheetMap,
      cells: [{
        sheet: 'Metadata',
        device: 'apple',
        blockType: 'listing',
        fieldKey: 'name',
        fieldName: 'App Name',
        pageLeaf: 'metadata/app-name',
        rowRole: ROW_ROLE_ENGLISH_SOURCE,
        language: { name: 'English' },
        text: 'Adobe Photoshop',
      }],
    });

    const wb = buildWorkbook(ExcelJS, payload);
    const metadata = wb.getWorksheet('Metadata');
    expect(metadata.getRow(3).getCell(4).alignment).to.deep.equal({ wrapText: true, vertical: 'top' });
    expect(metadata.getColumn(4).width).to.equal(26);
  });
});
