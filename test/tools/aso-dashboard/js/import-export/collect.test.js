import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';
import sinon from 'sinon';
import { buildLanguageIndex } from '../../../../../tools/aso-dashboard/js/lib/translate-paths.js';
import { collectExportData, findOverCharLimitCells } from '../../../../../tools/aso-dashboard/js/import-export/collect.js';
import { ROW_ROLE_ENGLISH_SOURCE, ROW_ROLE_LOCALIZED } from '../../../../../tools/aso-dashboard/js/import-export/paths.js';

describe('import-export-collect', () => {
  let schema;
  let sheetMap;
  let translateData;
  let listingHtml;
  let languages;
  let fetchPage;

  beforeEach(async () => {
    schema = JSON.parse(await readFile({ path: '../../mocks/block-schema.json' }));
    sheetMap = JSON.parse(await readFile({ path: '../../mocks/sheet-to-block-map.json' }));
    translateData = JSON.parse(await readFile({ path: '../../mocks/translate.json' }));
    listingHtml = await readFile({ path: '../../../../blocks/aso-app/mocks/apple.html' });
    languages = buildLanguageIndex(translateData.languages.data, translateData);

    fetchPage = sinon.stub().callsFake(async (_org, _repo, pagePath) => ({
      html: pagePath.includes('metadata/app-name') ? listingHtml : '',
      htmlFound: pagePath.includes('metadata/app-name'),
      spacingSidecar: null,
    }));
  });

  afterEach(() => {
    sinon.restore();
  });

  it('dedupes shared english-source paths across unmanaged locales', async () => {
    const result = await collectExportData({
      org: 'test-org',
      repo: 'test-repo',
      token: 'token',
      schema,
      sheetMap,
      products: ['adobe-express'],
      languages: languages.filter((lang) => ['English', 'Romanian'].includes(lang.name)),
      devices: ['apple'],
      year: '2026',
      quarter: 'q1',
      month: 'may',
      blockTypes: ['listing'],
      rowRoles: [ROW_ROLE_ENGLISH_SOURCE],
      fetchPage,
    });

    const sharedPaths = result.pages.filter((page) => page.pagePath.includes('metadata/app-name'));
    expect(sharedPaths).to.have.length(1);
    expect(sharedPaths[0].refs.length).to.be.at.least(2);
    expect(fetchPage.callCount).to.equal(result.stats.uniquePaths);
  });

  it('returns parsed cell text for fetched pages', async () => {
    const german = languages.find((lang) => lang.name === 'German');
    const result = await collectExportData({
      org: 'test-org',
      repo: 'test-repo',
      token: 'token',
      schema,
      sheetMap,
      products: ['adobe-express'],
      languages: [german],
      devices: ['apple'],
      year: '2026',
      quarter: 'q1',
      month: 'may',
      blockTypes: ['listing'],
      rowRoles: [ROW_ROLE_LOCALIZED],
      fetchPage,
    });

    const nameCell = result.cells.find((cell) => cell.fieldKey === 'name');
    expect(nameCell).to.exist;
    expect(nameCell.text).to.equal('');
    expect(nameCell.rowRole).to.equal(ROW_ROLE_LOCALIZED);
    expect(nameCell.pagePath).to.include('/de-de/products-redesign/adobe-express/apple/2026/q1/may/store-updates/metadata/app-name');
  });

  it('collects both row roles for each language', async () => {
    const german = languages.find((lang) => lang.name === 'German');
    const result = await collectExportData({
      org: 'test-org',
      repo: 'test-repo',
      token: 'token',
      schema,
      sheetMap,
      products: ['adobe-express'],
      languages: [german],
      devices: ['apple'],
      year: '2026',
      quarter: 'q1',
      month: 'may',
      blockTypes: ['listing'],
      fetchPage,
    });

    const roles = new Set(result.cells.map((cell) => cell.rowRole));
    expect(roles.has(ROW_ROLE_ENGLISH_SOURCE)).to.be.true;
    expect(roles.has(ROW_ROLE_LOCALIZED)).to.be.true;
  });

  it('attaches keyword text from sidecars on english-source cells', async () => {
    const german = languages.find((lang) => lang.name === 'German');
    fetchPage = sinon.stub().callsFake(async (_org, _repo, pagePath) => ({
      html: pagePath.includes('metadata/app-name') ? listingHtml : '',
      htmlFound: pagePath.includes('metadata/app-name'),
      spacingSidecar: null,
      keywordsSidecar: pagePath.includes('metadata/app-name') ? {
        ':type': 'multi-sheet',
        'aso-app (apple, listing) (1)': { data: [{ language: 'German', 'App Name': 'express, design' }] },
      } : null,
    }));

    const result = await collectExportData({
      org: 'test-org',
      repo: 'test-repo',
      token: 'token',
      schema,
      sheetMap,
      products: ['adobe-express'],
      languages: [german],
      devices: ['apple'],
      year: '2026',
      quarter: 'q1',
      month: 'may',
      blockTypes: ['listing'],
      rowRoles: [ROW_ROLE_ENGLISH_SOURCE],
      fetchPage,
    });

    const nameCell = result.cells.find((cell) => cell.fieldKey === 'name');
    expect(nameCell?.keywordText).to.equal('express, design');
  });

  it('scopes a device-tagged promo context to its own device, not every device', async () => {
    fetchPage = sinon.stub().callsFake(async (_org, _repo, pagePath) => ({
      html: '',
      htmlFound: pagePath.includes('promos/apple-promo/default'),
      spacingSidecar: null,
    }));

    await collectExportData({
      org: 'test-org',
      repo: 'test-repo',
      token: 'token',
      schema,
      sheetMap,
      products: ['adobe-express'],
      languages: languages.filter((lang) => lang.name === 'English'),
      devices: ['apple', 'google'],
      year: '2026',
      quarter: 'q1',
      month: 'may',
      blockTypes: ['promo'],
      promoContexts: [{ promoName: 'apple-promo', promoVariant: 'default', device: 'apple' }],
      rowRoles: [ROW_ROLE_ENGLISH_SOURCE],
      fetchPage,
    });

    const requestedPaths = fetchPage.getCalls().map((call) => call.args[2]);
    expect(requestedPaths.some((path) => path.includes('/apple/') && path.includes('promos/apple-promo'))).to.be.true;
    expect(requestedPaths.some((path) => path.includes('/google/'))).to.be.false;
  });

  it('applies a promo context with no device to every requested device', async () => {
    fetchPage = sinon.stub().callsFake(async () => ({ html: '', htmlFound: true, spacingSidecar: null }));

    await collectExportData({
      org: 'test-org',
      repo: 'test-repo',
      token: 'token',
      schema,
      sheetMap,
      products: ['adobe-express'],
      languages: languages.filter((lang) => lang.name === 'English'),
      devices: ['apple', 'google'],
      year: '2026',
      quarter: 'q1',
      month: 'may',
      blockTypes: ['promo'],
      promoContexts: [{ promoName: 'shared-promo', promoVariant: 'default' }],
      rowRoles: [ROW_ROLE_ENGLISH_SOURCE],
      fetchPage,
    });

    const requestedPaths = fetchPage.getCalls().map((call) => call.args[2]);
    expect(requestedPaths.some((path) => path.includes('/apple/') && path.includes('promos/shared-promo'))).to.be.true;
    expect(requestedPaths.some((path) => path.includes('/google/') && path.includes('promos/shared-promo'))).to.be.true;
  });

  describe('selection.fieldsByDeviceBlock', () => {
    it('restricts a device/blockType to only the listed field keys', async () => {
      const result = await collectExportData({
        org: 'test-org',
        repo: 'test-repo',
        token: 'token',
        schema,
        sheetMap,
        products: ['adobe-express'],
        languages: languages.filter((lang) => lang.name === 'English'),
        devices: ['apple'],
        year: '2026',
        quarter: 'q1',
        month: 'may',
        blockTypes: ['listing'],
        rowRoles: [ROW_ROLE_ENGLISH_SOURCE],
        selection: { fieldsByDeviceBlock: { 'apple:listing': ['name'] } },
        fetchPage,
      });

      const fieldKeys = new Set(result.cells.map((cell) => cell.fieldKey));
      expect(fieldKeys).to.deep.equal(new Set(['name']));
    });

    it('excludes every field for a device/blockType when its key maps to an empty array (all unchecked)', async () => {
      const result = await collectExportData({
        org: 'test-org',
        repo: 'test-repo',
        token: 'token',
        schema,
        sheetMap,
        products: ['adobe-express'],
        languages: languages.filter((lang) => lang.name === 'English'),
        devices: ['apple'],
        year: '2026',
        quarter: 'q1',
        month: 'may',
        blockTypes: ['listing'],
        rowRoles: [ROW_ROLE_ENGLISH_SOURCE],
        selection: { fieldsByDeviceBlock: { 'apple:listing': [] } },
        fetchPage,
      });

      expect(result.cells).to.have.length(0);
    });

    it('leaves a device/blockType unrestricted when it has no entry in fieldsByDeviceBlock', async () => {
      fetchPage = sinon.stub().callsFake(async () => ({ html: '', htmlFound: true, spacingSidecar: null }));

      const result = await collectExportData({
        org: 'test-org',
        repo: 'test-repo',
        token: 'token',
        schema,
        sheetMap,
        products: ['adobe-express'],
        languages: languages.filter((lang) => lang.name === 'English'),
        devices: ['apple'],
        year: '2026',
        quarter: 'q1',
        month: 'may',
        blockTypes: ['promo'],
        promoContexts: [{ promoName: 'apple-promo', promoVariant: 'default', device: 'apple' }],
        rowRoles: [ROW_ROLE_ENGLISH_SOURCE],
        // Only listing has a field-checkbox UI; promo has no key here at all, so it's untouched.
        selection: { fieldsByDeviceBlock: { 'apple:listing': ['name'] } },
        fetchPage,
      });

      expect(result.stats.fieldRequests).to.be.above(0);
    });
  });

  describe('findOverCharLimitCells', () => {
    it('reports cells whose text exceeds their schema charLimit, carrying pagePath through for a direct edit link', () => {
      const cells = [
        {
          fieldName: 'App Name',
          fieldKey: 'name',
          language: { name: 'German' },
          rowRole: ROW_ROLE_ENGLISH_SOURCE,
          pagePath: '/source/en-de/.../app-name',
          text: 'x'.repeat(35),
          charLimit: 30,
          hasHtml: true,
        },
        {
          fieldName: 'Subtitle',
          fieldKey: 'subtitle',
          language: { name: 'French' },
          rowRole: ROW_ROLE_LOCALIZED,
          pagePath: '/fr-fr/.../subtitle',
          text: 'short',
          charLimit: 30,
          hasHtml: true,
        },
      ];

      expect(findOverCharLimitCells(cells)).to.deep.equal([{
        fieldName: 'App Name',
        fieldKey: 'name',
        pagePath: '/source/en-de/.../app-name',
        rowRole: ROW_ROLE_ENGLISH_SOURCE,
        language: 'German',
        length: 35,
        charLimit: 30,
      }]);
    });

    it('ignores cells with no charLimit or that were never fetched', () => {
      const cells = [
        { fieldName: 'A', text: 'x'.repeat(50), charLimit: 0, hasHtml: true },
        { fieldName: 'B', text: 'x'.repeat(50), charLimit: 30, hasHtml: false },
      ];
      expect(findOverCharLimitCells(cells)).to.deep.equal([]);
    });
  });

  it('collectExportData carries each field\'s schema charLimit through onto its cells', async () => {
    const result = await collectExportData({
      org: 'test-org',
      repo: 'test-repo',
      token: 'token',
      schema,
      sheetMap,
      products: ['adobe-express'],
      languages: languages.filter((lang) => lang.name === 'English'),
      devices: ['apple'],
      year: '2026',
      quarter: 'q1',
      month: 'may',
      blockTypes: ['listing'],
      rowRoles: [ROW_ROLE_ENGLISH_SOURCE],
      fetchPage,
    });

    const nameCell = result.cells.find((cell) => cell.fieldKey === 'name');
    expect(nameCell.charLimit).to.equal(30);
  });
});
