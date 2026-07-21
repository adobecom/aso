import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';
import sinon from 'sinon';
import { createSheetData, parseAsoBlocks } from '../../../../tools/aso-dashboard/js/export-legacy-sheet.js';
import { buildProductExportArtifacts } from '../../../../tools/aso-dashboard/js/export.js';
import { createTestExcelJS } from '../helpers/test-exceljs.js';

describe('export parseAsoBlocks', () => {
  let listingHtml;
  const validBlockTypes = ['listing'];

  before(async () => {
    listingHtml = await readFile({ path: '../../../blocks/aso-app/mocks/apple.html' });
  });

  it('leaves placeholder tokens when no constants values are provided', () => {
    const blocks = parseAsoBlocks(listingHtml, validBlockTypes);
    expect(blocks['apple-listing'][0].Description).to.include('{{legal-terms}}');
  });

  it('merges constants into exported field text', () => {
    const blocks = parseAsoBlocks(listingHtml, validBlockTypes, { 'legal-terms': '[Optional access permissions]\nCamera: Scan pages' });
    const description = blocks['apple-listing'][0].Description;
    expect(description).to.include('[Optional access permissions]');
    expect(description).to.include('Camera: Scan pages');
    expect(description).to.not.include('{{legal-terms}}');
  });

  it('merges multiple placeholders and omits unmapped slugs', () => {
    const html = `
      <div class="aso-app listing apple">
        <div>
          <div><p>Description</p></div>
          <div><p>{{legal-terms}} {{privacy-note}}</p></div>
        </div>
      </div>
    `;
    const blocks = parseAsoBlocks(html, validBlockTypes, { 'legal-terms': 'LEGAL' });
    const description = blocks['apple-listing'][0].Description;
    expect(description).to.include('LEGAL');
    expect(description).to.not.include('{{legal-terms}}');
    expect(description).to.not.include('{{privacy-note}}');
  });
});

describe('export createSheetData', () => {
  it('adds aggregated Play blob only for google listing release notes', () => {
    const languages = ['en-us', 'fr-fr'];
    const sheetData = {
      blockType: 'listing',
      google: {
        listing: {
          'en-us': {
            Title: 'EN title',
            'Release Notes': 'EN release notes',
          },
          'fr-fr': {
            Title: 'FR title',
            'Release Notes': 'FR notes',
          },
        },
      },
      apple: {},
    };

    const rows = createSheetData(sheetData, languages, 'listing');
    expect(rows[0][0]).to.equal('Google');
    expect(rows[0]).to.have.lengthOf(4);
    expect(rows[1]).to.deep.equal(['Languages', 'Aggregated (Play paste)', 'en-us', 'fr-fr']);

    const releaseRow = rows.find((row) => row[0] === 'Release Notes');
    expect(releaseRow).to.exist;
    expect(releaseRow[1]).to.equal(
      '<en-US>\n\nEN release notes\n\n</en-US>\n\n'
      + '<fr-FR>\n\nFR notes\n\n</fr-FR>',
    );
    expect(releaseRow[2]).to.equal('EN release notes');
    expect(releaseRow[3]).to.equal('FR notes');

    const titleRow = rows.find((row) => row[0] === 'Title');
    expect(titleRow).to.exist;
    expect(titleRow[1]).to.equal('');
  });

  it('omits Aggregated (Play paste) column for non-listing block types', () => {
    const languages = ['en-us'];
    const sheetData = {
      blockType: 'promo',
      google: { promo: { 'en-us': { 'Release Notes': 'Should not aggregate' } } },
      apple: {},
    };

    const rows = createSheetData(sheetData, languages, 'promo');
    expect(rows[0]).to.have.lengthOf(2);
    expect(rows[1]).to.deep.equal(['Languages', 'en-us']);
    const releaseRow = rows.find((row) => row[0] === 'Release Notes');
    expect(releaseRow).to.exist;
    expect(releaseRow).to.deep.equal(['Release Notes', 'Should not aggregate']);
  });
});

describe('export buildProductExportArtifacts', () => {
  let schema;
  let sheetMap;
  let collectStub;
  let ExcelJS;

  beforeEach(async () => {
    schema = JSON.parse(await readFile({ path: '../mocks/block-schema.json' }));
    sheetMap = JSON.parse(await readFile({ path: '../mocks/sheet-to-block-map.json' }));
    ExcelJS = createTestExcelJS();
    collectStub = sinon.stub().resolves({
      cells: [{
        sheet: 'Metadata',
        device: 'apple',
        blockType: 'listing',
        fieldKey: 'name',
        fieldName: 'App Name',
        pageLeaf: 'metadata/app-name',
        rowRole: 'english-source',
        language: { name: 'German' },
        text: 'Export text',
        hasHtml: true,
      }],
      skipped: [{
        fieldName: 'Subtitle',
        fieldKey: 'subtitle',
        pagePath: '/missing/path',
        rowRole: 'english-source',
        language: 'German',
        reason: 'notFound',
      }],
      stats: {
        fieldRequests: 2,
        uniquePaths: 1,
        cells: 1,
        skipped: 1,
      },
    });
  });

  afterEach(() => {
    sinon.restore();
  });

  it('runs collect → payload → workbook and returns buffer metadata', async () => {
    const german = {
      name: 'German',
      sourcePath: '/source/en-de',
      localizedPath: '/de-de',
      isManagedLocale: true,
    };

    const result = await buildProductExportArtifacts({
      org: 'test-org',
      repo: 'test-repo',
      token: 'token',
      schema,
      sheetMap,
      product: 'adobe-express',
      languages: [german],
      devices: ['apple'],
      releasePeriod: { year: '2026', quarter: 'q1', month: 'may' },
      blockTypes: ['listing'],
      promoContexts: [],
      fetchPage: sinon.stub(),
      ExcelJS,
      productsPath: 'products-redesign',
      collectExportDataFn: collectStub,
    });

    expect(collectStub.calledOnce).to.be.true;
    expect(result.payload.settings.product).to.equal('adobe-express');
    expect(result.payload.languageNames).to.deep.equal(['German']);
    expect(result.payload.metadata.apple[0].englishSource.German).to.equal('Export text');
    expect(result.filename).to.equal('ASO-Export-adobe-express-2026-q1-may.xlsx');
    expect(result.buffer).to.exist;
    expect(result.workbook.getWorksheet('Settings')).to.exist;
    expect(result.workbook.getWorksheet('Metadata')).to.exist;
    expect(result.stats.cells).to.equal(1);
    expect(result.skipped).to.have.length(1);
  });

  it('names store-tests exports with the experiment slug', async () => {
    const german = {
      name: 'German',
      sourcePath: '/source/en-de',
      localizedPath: '/de-de',
      isManagedLocale: true,
    };

    const result = await buildProductExportArtifacts({
      org: 'test-org',
      repo: 'test-repo',
      token: 'token',
      schema,
      sheetMap,
      product: 'adobe-express',
      languages: [german],
      devices: ['apple'],
      releasePeriod: { year: '2026', quarter: 'q1', month: 'may' },
      blockTypes: ['listing'],
      promoContexts: [],
      fetchPage: sinon.stub(),
      ExcelJS,
      storeType: 'store-tests',
      testName: 'icon-test-a',
      collectExportDataFn: collectStub,
    });

    expect(result.filename).to.equal('ASO-Export-adobe-express-2026-q1-may-icon-test-a.xlsx');
    expect(collectStub.firstCall.args[0].storeType).to.equal('store-tests');
    expect(collectStub.firstCall.args[0].testName).to.equal('icon-test-a');
    expect(result.payload.settings.testName).to.equal('icon-test-a');
  });
});
