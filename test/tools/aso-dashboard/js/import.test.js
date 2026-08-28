import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { readFile } from '@web/test-runner-commands';
import { buildLanguageIndex } from '../../../../tools/aso-dashboard/js/lib/translate-paths.js';
import {
  buildAemPreviewUrl,
  buildBulkPreviewUrl,
  buildDaEditUrl,
  buildImportSummaryHtml,
  buildImportWriteRequests,
  buildKeywordImportWrites,
  buildLocProjectUrl,
  buildMediaAssetsPageGroups,
  buildMediaAssetsPageRequests,
  collectBulkPreviewPaths,
  createMissingMediaAssetsPages,
  dedupeImportWrites,
  extractMarketSourceLabel,
  findOverCharLimitWrites,
  groupImportResultsByPage,
  groupWritesByPagePath,
  markKeywordPages,
  markOverLimitPages,
  renderBulkPreviewButton,
  renderCopyEnglishButton,
  renderImportPageList,
  renderMediaAssetsPageTable,
  runImport,
} from '../../../../tools/aso-dashboard/js/import.js';
import {
  ROW_ROLE_ENGLISH_SOURCE,
  ROW_ROLE_LOCALIZED,
} from '../../../../tools/aso-dashboard/js/import-export/paths.js';

describe('import buildImportWriteRequests', () => {
  let schema;
  let sheetMap;
  let languageIndex;

  beforeEach(async () => {
    schema = JSON.parse(await readFile({ path: '../mocks/block-schema.json' }));
    sheetMap = JSON.parse(await readFile({ path: '../mocks/sheet-to-block-map.json' }));
    const translateData = JSON.parse(await readFile({ path: '../mocks/translate.json' }));
    languageIndex = buildLanguageIndex(translateData.languages.data, translateData);
  });

  it('creates english-source writes from metadata rows, and never writes localized copy', () => {
    const requests = buildImportWriteRequests({
      parsed: {
        settings: {
          product: 'adobe-express',
          year: '2026',
          quarter: 'q1',
          month: 'may',
        },
        languageNames: ['German'],
        metadata: {
          google: [],
          apple: [{
            fieldName: 'App Name',
            englishSource: { German: 'Managed DE source' },
            localized: { German: 'Localized DE' },
          }],
        },
        promos: [],
        imagesVideos: { google: [], apple: [] },
      },
      schema,
      sheetMap,
      languageIndex,
      productsPath: 'products-redesign',
    });

    const sourceWrite = requests.find(
      (request) => request.rowRole === ROW_ROLE_ENGLISH_SOURCE && request.language.name === 'German',
    );
    expect(sourceWrite).to.exist;
    expect(sourceWrite.pagePath).to.include('/source/en-de/products-redesign/adobe-express/apple/2026/q1/may/store-updates/metadata/app-name');
    expect(sourceWrite.text).to.equal('Managed DE source');

    // Localized copy is never pushed by import — translations come from DA's own loc pipeline.
    expect(requests.every((request) => request.rowRole === ROW_ROLE_ENGLISH_SOURCE)).to.be.true;
    expect(requests).to.have.length(1);
    // App Name's schema character count (30) travels with the request for later validation.
    expect(sourceWrite.charLimit).to.equal(30);
  });

  it('only propagates English source to languages present in the workbook', () => {
    const field = {
      fieldName: 'App Name',
      englishSource: { English: 'Base English copy' },
      localized: {},
    };

    buildImportWriteRequests({
      parsed: {
        settings: {
          product: 'adobe-express',
          year: '2026',
          quarter: 'q1',
          month: 'may',
        },
        languageNames: ['English', 'Romanian'],
        metadata: {
          google: [],
          apple: [field],
        },
        promos: [],
        imagesVideos: { google: [], apple: [] },
      },
      schema,
      sheetMap,
      languageIndex,
      productsPath: 'products-redesign',
    });

    expect(field.propagatedFromEnglish).to.deep.equal(['Romanian']);
    expect(field.propagatedFromEnglish).to.not.include('German');
  });

  it('creates store-tests writes from settings test name', () => {
    const requests = buildImportWriteRequests({
      parsed: {
        settings: {
          product: 'adobe-express',
          storeType: 'store-tests',
          testName: 'icon-test-a',
          year: '2026',
          quarter: 'q1',
          month: 'may',
        },
        languageNames: ['German'],
        metadata: {
          google: [],
          apple: [{
            fieldName: 'App Name',
            englishSource: { German: 'Managed DE source' },
            localized: { German: 'Localized DE' },
          }],
        },
        promos: [],
        imagesVideos: { google: [], apple: [] },
      },
      schema,
      sheetMap,
      languageIndex,
      productsPath: 'products-redesign',
    });

    const sourceWrite = requests.find((request) => request.rowRole === ROW_ROLE_ENGLISH_SOURCE);
    expect(sourceWrite.pagePath).to.include(
      '/source/en-de/products-redesign/adobe-express/apple/2026/q1/may/store-tests/icon-test-a/metadata/app-name',
    );
  });

  it('creates cpp writes from settings test name, mirroring store-tests', () => {
    const requests = buildImportWriteRequests({
      parsed: {
        settings: {
          product: 'adobe-express',
          storeType: 'cpp',
          testName: 'summer-campaign',
          year: '2026',
          quarter: 'q1',
          month: 'may',
        },
        languageNames: ['German'],
        metadata: {
          google: [],
          apple: [{
            fieldName: 'App Name',
            englishSource: { German: 'Managed DE source' },
            localized: { German: 'Localized DE' },
          }],
        },
        promos: [],
        imagesVideos: { google: [], apple: [] },
      },
      schema,
      sheetMap,
      languageIndex,
      productsPath: 'products-redesign',
    });

    const sourceWrite = requests.find((request) => request.rowRole === ROW_ROLE_ENGLISH_SOURCE);
    expect(sourceWrite.pagePath).to.include(
      '/source/en-de/products-redesign/adobe-express/apple/2026/q1/may/cpp/summer-campaign/metadata/app-name',
    );
  });

  it('dedupes shared source paths for import writes', () => {
    const requests = [
      {
        pagePath: '/source/en-us/products-redesign/adobe-express/apple/2026/q1/may/store-updates/metadata/app-name',
        text: 'Shared source',
      },
      {
        pagePath: '/source/en-us/products-redesign/adobe-express/apple/2026/q1/may/store-updates/metadata/app-name',
        text: 'Shared source duplicate',
      },
    ];
    const deduped = dedupeImportWrites(requests);
    expect(deduped).to.have.length(1);
    expect(deduped[0].text).to.equal('Shared source');
  });

  it('keeps separate writes for different fields that share the same page path', () => {
    const sharedPath = '/products-redesign/adobe-express/apple/2026/q1/may/store-updates/images/copy';
    const requests = [
      { pagePath: sharedPath, fieldKey: 'screenshotsiPhoneCopy1', text: 'Copy 1 text' },
      { pagePath: sharedPath, fieldKey: 'screenshotsiPhoneCopy2', text: 'Copy 2 text' },
    ];

    const deduped = dedupeImportWrites(requests);
    expect(deduped).to.have.length(2);
    expect(deduped.map((request) => request.text)).to.deep.equal(['Copy 1 text', 'Copy 2 text']);
  });

  it('creates keyword sidecar writes for managed locales', () => {
    const writes = buildKeywordImportWrites({
      parsed: {
        settings: {
          product: 'adobe-express',
          year: '2026',
          quarter: 'q1',
          month: 'may',
        },
        languageNames: ['German'],
        metadata: {
          google: [],
          apple: [{
            fieldName: 'App Name',
            englishSource: { German: 'Managed DE source' },
            localized: {},
            keywords: { German: 'express, design' },
          }],
        },
        promos: [],
        imagesVideos: { google: [], apple: [] },
      },
      schema,
      sheetMap,
      languageIndex,
      productsPath: 'products-redesign',
    });

    expect(writes).to.have.length(1);
    expect(writes[0].pagePath).to.include('/source/en-de/products-redesign/adobe-express/apple/2026/q1/may/store-updates/metadata/app-name');
    expect(writes[0].updates[0].value).to.equal('express, design');
  });
});

describe('findOverCharLimitWrites', () => {
  it('reports writes whose text exceeds the schema character count, with the page path to link to', () => {
    const writes = [
      { fieldName: 'App Name', language: { name: 'German' }, pagePath: '/source/en-de/.../app-name', text: 'x'.repeat(35), charLimit: 30 },
      { fieldName: 'Subtitle', language: { name: 'French' }, pagePath: '/source/en-fr/.../subtitle', text: 'short', charLimit: 30 },
    ];

    expect(findOverCharLimitWrites(writes)).to.deep.equal([
      { fieldName: 'App Name', language: 'German', pagePath: '/source/en-de/.../app-name', length: 35, charLimit: 30 },
    ]);
  });

  it('does not flag a write with no known charLimit', () => {
    const writes = [
      { fieldName: 'Custom Field', language: { name: 'English' }, text: 'x'.repeat(500), charLimit: null },
    ];
    expect(findOverCharLimitWrites(writes)).to.deep.equal([]);
  });

  it('returns an empty array when nothing exceeds its limit', () => {
    const writes = [
      { fieldName: 'App Name', language: { name: 'German' }, text: 'ok', charLimit: 30 },
    ];
    expect(findOverCharLimitWrites(writes)).to.deep.equal([]);
  });
});

describe('import page summary helpers', () => {
  let languageIndex;

  beforeEach(async () => {
    const translateData = JSON.parse(await readFile({ path: '../mocks/translate.json' }));
    languageIndex = buildLanguageIndex(translateData.languages.data, translateData);
  });

  it('buildDaEditUrl builds a da.live edit link from org/repo/pagePath', () => {
    const url = buildDaEditUrl('adobecom', 'aso', '/products/adobe-express/apple/2026/q1/may/store-updates/metadata/app-name');
    expect(url).to.equal('https://da.live/edit#/adobecom/aso/products/adobe-express/apple/2026/q1/may/store-updates/metadata/app-name');
  });

  it('extractMarketSourceLabel reads the last segment of a managed locale source path', () => {
    const german = languageIndex.find((language) => language.name === 'German');
    expect(extractMarketSourceLabel(german)).to.equal('en-de');
  });

  it('extractMarketSourceLabel falls back to the code when there is no source path segment', () => {
    expect(extractMarketSourceLabel({ sourcePath: '/', code: 'ro' })).to.equal('ro');
  });

  it('groupImportResultsByPage puts the base English write on englishPath, market writes in sourcePages, and ignores any localized result', () => {
    const english = languageIndex.find((language) => language.name === 'English');
    const german = languageIndex.find((language) => language.name === 'German');

    const results = [
      {
        ok: true,
        device: 'apple',
        blockType: 'listing',
        fieldName: 'App Name',
        pageLeaf: 'metadata/app-name',
        rowRole: ROW_ROLE_ENGLISH_SOURCE,
        language: english,
        pagePath: '/products-redesign/adobe-express/apple/2026/q1/may/store-updates/metadata/app-name',
      },
      {
        ok: true,
        device: 'apple',
        blockType: 'listing',
        fieldName: 'App Name',
        pageLeaf: 'metadata/app-name',
        rowRole: ROW_ROLE_ENGLISH_SOURCE,
        language: german,
        pagePath: '/source/en-de/products-redesign/adobe-express/apple/2026/q1/may/store-updates/metadata/app-name',
      },
      // Import never produces a ROW_ROLE_LOCALIZED result — this simulates one anyway to lock
      // in that grouping actively ignores it rather than surfacing it as an "Other page".
      {
        ok: true,
        device: 'apple',
        blockType: 'listing',
        fieldName: 'App Name',
        pageLeaf: 'metadata/app-name',
        rowRole: ROW_ROLE_LOCALIZED,
        language: german,
        pagePath: '/de-de/products-redesign/adobe-express/apple/2026/q1/may/store-updates/metadata/app-name',
      },
      {
        ok: false,
        device: 'apple',
        blockType: 'listing',
        fieldName: 'Subtitle',
        pageLeaf: 'metadata/subtitle',
        rowRole: ROW_ROLE_ENGLISH_SOURCE,
        language: english,
        pagePath: '/products-redesign/adobe-express/apple/2026/q1/may/store-updates/metadata/subtitle',
      },
    ];

    const groups = groupImportResultsByPage(results);
    expect(groups).to.have.length(1);

    const [group] = groups;
    expect(group.englishPath).to.equal('/products-redesign/adobe-express/apple/2026/q1/may/store-updates/metadata/app-name');
    expect(group.sourcePages).to.deep.equal([{
      label: 'en-de',
      pagePath: '/source/en-de/products-redesign/adobe-express/apple/2026/q1/may/store-updates/metadata/app-name',
    }]);
    expect(group.localizedPages).to.be.undefined;
  });

  it('groupImportResultsByPage ignores failed writes', () => {
    const english = languageIndex.find((language) => language.name === 'English');
    const groups = groupImportResultsByPage([{
      ok: false,
      device: 'apple',
      blockType: 'listing',
      fieldName: 'App Name',
      pageLeaf: 'metadata/app-name',
      rowRole: ROW_ROLE_ENGLISH_SOURCE,
      language: english,
      pagePath: '/products-redesign/adobe-express/apple/2026/q1/may/store-updates/metadata/app-name',
    }]);
    expect(groups).to.have.length(0);
  });

  it('groupImportResultsByPage clubs fields that share one page (e.g. images-videos copy fields) into a single row', () => {
    const english = languageIndex.find((language) => language.name === 'English');
    const german = languageIndex.find((language) => language.name === 'German');
    const sharedPath = '/products-redesign/adobe-express/apple/2026/q1/may/store-updates/images/copy';
    const sharedSourcePath = '/source/en-de/products-redesign/adobe-express/apple/2026/q1/may/store-updates/images/copy';

    const groups = groupImportResultsByPage([
      {
        ok: true,
        device: 'apple',
        blockType: 'images-videos',
        fieldKey: 'screenshotsiPhoneCopy1',
        fieldName: 'Screenshot iPhone Copy 1',
        pageLeaf: 'images/copy',
        rowRole: ROW_ROLE_ENGLISH_SOURCE,
        language: english,
        pagePath: sharedPath,
      },
      {
        ok: true,
        device: 'apple',
        blockType: 'images-videos',
        fieldKey: 'screenshotsiPhoneCopy1',
        fieldName: 'Screenshot iPhone Copy 1',
        pageLeaf: 'images/copy',
        rowRole: ROW_ROLE_ENGLISH_SOURCE,
        language: german,
        pagePath: sharedSourcePath,
      },
      {
        ok: true,
        device: 'apple',
        blockType: 'images-videos',
        fieldKey: 'screenshotsiPhoneCopy2',
        fieldName: 'Screenshot iPhone Copy 2',
        pageLeaf: 'images/copy',
        rowRole: ROW_ROLE_ENGLISH_SOURCE,
        language: english,
        pagePath: sharedPath,
      },
      {
        ok: true,
        device: 'apple',
        blockType: 'images-videos',
        fieldKey: 'screenshotsiPhoneCopy2',
        fieldName: 'Screenshot iPhone Copy 2',
        pageLeaf: 'images/copy',
        rowRole: ROW_ROLE_ENGLISH_SOURCE,
        language: german,
        pagePath: sharedSourcePath,
      },
    ]);

    expect(groups).to.have.length(1);
    const [group] = groups;
    expect(group.fieldNames).to.deep.equal([
      'Screenshot iPhone Copy 1',
      'Screenshot iPhone Copy 2',
    ]);
    expect(group.englishPath).to.equal(sharedPath);
    // Both fields reported the same en-de source page — deduped to one chip, not two.
    expect(group.sourcePages).to.deep.equal([{ label: 'en-de', pagePath: sharedSourcePath }]);
  });

  it('markKeywordPages labels a group with the pages that got a successful keyword write', () => {
    const english = languageIndex.find((language) => language.name === 'English');
    const german = languageIndex.find((language) => language.name === 'German');

    const groups = groupImportResultsByPage([
      {
        ok: true,
        device: 'apple',
        blockType: 'listing',
        fieldName: 'App Name',
        pageLeaf: 'metadata/app-name',
        rowRole: ROW_ROLE_ENGLISH_SOURCE,
        language: english,
        pagePath: '/products-redesign/adobe-express/apple/2026/q1/may/store-updates/metadata/app-name',
      },
      {
        ok: true,
        device: 'apple',
        blockType: 'listing',
        fieldName: 'App Name',
        pageLeaf: 'metadata/app-name',
        rowRole: ROW_ROLE_ENGLISH_SOURCE,
        language: german,
        pagePath: '/source/en-de/products-redesign/adobe-express/apple/2026/q1/may/store-updates/metadata/app-name',
      },
    ]);

    const keywordResults = [
      {
        ok: true,
        pagePath: '/source/en-de/products-redesign/adobe-express/apple/2026/q1/may/store-updates/metadata/app-name',
        updates: [{ fieldName: 'App Name', languageName: 'German', value: 'foto, bearbeiten' }],
      },
      {
        ok: false,
        pagePath: '/products-redesign/adobe-express/apple/2026/q1/may/store-updates/metadata/app-name',
        updates: [{ fieldName: 'App Name', languageName: 'English', value: 'photo, edit' }],
      },
    ];

    markKeywordPages(groups, keywordResults);

    expect(groups[0].keywordLabels).to.deep.equal(['en-de']);
  });

  it('markKeywordPages leaves keywordLabels empty when there are no keyword writes', () => {
    const english = languageIndex.find((language) => language.name === 'English');
    const groups = groupImportResultsByPage([{
      ok: true,
      device: 'apple',
      blockType: 'listing',
      fieldName: 'App Name',
      pageLeaf: 'metadata/app-name',
      rowRole: ROW_ROLE_ENGLISH_SOURCE,
      language: english,
      pagePath: '/products-redesign/adobe-express/apple/2026/q1/may/store-updates/metadata/app-name',
    }]);

    markKeywordPages(groups, []);

    expect(groups[0].keywordLabels).to.deep.equal([]);
  });

  it('markOverLimitPages matches an over-limit write to its page, labeled by locale', () => {
    const english = languageIndex.find((language) => language.name === 'English');
    const german = languageIndex.find((language) => language.name === 'German');
    const englishPath = '/products-redesign/adobe-express/apple/2026/q1/may/store-updates/metadata/app-name';
    const dePath = '/source/en-de/products-redesign/adobe-express/apple/2026/q1/may/store-updates/metadata/app-name';

    const groups = groupImportResultsByPage([
      {
        ok: true, device: 'apple', blockType: 'listing', fieldName: 'App Name', pageLeaf: 'metadata/app-name', rowRole: ROW_ROLE_ENGLISH_SOURCE, language: english, pagePath: englishPath,
      },
      {
        ok: true, device: 'apple', blockType: 'listing', fieldName: 'App Name', pageLeaf: 'metadata/app-name', rowRole: ROW_ROLE_ENGLISH_SOURCE, language: german, pagePath: dePath,
      },
    ]);

    markOverLimitPages(groups, [
      { fieldName: 'App Name', language: 'German', pagePath: dePath, length: 35, charLimit: 30 },
      // Different field entirely — must not attach to this group.
      { fieldName: 'Subtitle', language: 'German', pagePath: dePath, length: 40, charLimit: 30 },
    ]);

    expect(groups[0].overLimitEntries).to.deep.equal([
      {
        fieldName: 'App Name', language: 'German', pagePath: dePath, length: 35, charLimit: 30, label: 'en-de',
      },
    ]);
  });

  it('markOverLimitPages leaves overLimitEntries empty when nothing is over limit', () => {
    const english = languageIndex.find((language) => language.name === 'English');
    const groups = groupImportResultsByPage([{
      ok: true, device: 'apple', blockType: 'listing', fieldName: 'App Name', pageLeaf: 'metadata/app-name', rowRole: ROW_ROLE_ENGLISH_SOURCE, language: english, pagePath: '/products-redesign/adobe-express/apple/2026/q1/may/store-updates/metadata/app-name',
    }]);

    markOverLimitPages(groups, []);

    expect(groups[0].overLimitEntries).to.deep.equal([]);
  });

  it('renderCopyEnglishButton dedupes English paths shared by multiple fields on one page', () => {
    const sharedPath = '/products-redesign/adobe-express/apple/2026/q1/may/store-updates/images/copy';
    const otherPath = '/products-redesign/adobe-express/apple/2026/q1/may/store-updates/metadata/app-name';
    const groups = [
      { englishPath: sharedPath, sourcePages: [], localizedPages: [] },
      { englishPath: sharedPath, sourcePages: [], localizedPages: [] },
      { englishPath: otherPath, sourcePages: [], localizedPages: [] },
    ];

    const html = renderCopyEnglishButton(groups, 'aso', 'adobecom');
    expect(html).to.include('Copy paths & open Loc Project (2)');

    const match = html.match(/data-copy-paths="([^"]*)"/);
    const paths = decodeURIComponent(match[1]).split('\n');
    expect(paths).to.deep.equal([
      `https://main--aso--adobecom.aem.page${sharedPath}`,
      `https://main--aso--adobecom.aem.page${otherPath}`,
    ]);
  });

  it('renderCopyEnglishButton folds in extraEnglishPaths (media-assets pages) alongside the text groups, deduped', () => {
    const textPath = '/products-redesign/adobe-express/apple/2026/q1/may/store-updates/metadata/app-name';
    const mediaAssetsPath = '/products-redesign/adobe-express/apple/2026/q1/may/store-updates/images/assets';
    const groups = [{ englishPath: textPath, sourcePages: [], localizedPages: [] }];

    const html = renderCopyEnglishButton(groups, 'aso', 'adobecom', [mediaAssetsPath, mediaAssetsPath]);
    expect(html).to.include('Copy paths & open Loc Project (2)');

    const match = html.match(/data-copy-paths="([^"]*)"/);
    const paths = decodeURIComponent(match[1]).split('\n');
    expect(paths).to.deep.equal([
      `https://main--aso--adobecom.aem.page${textPath}`,
      `https://main--aso--adobecom.aem.page${mediaAssetsPath}`,
    ]);
  });

  it('buildAemPreviewUrl builds a full main--repo--org.aem.page URL DA\'s loc tool can parse', () => {
    const url = buildAemPreviewUrl('aso', 'adobecom', '/products-redesign/adobe-express/apple/2026/q1/may/store-updates/metadata/app-name');
    expect(url).to.equal('https://main--aso--adobecom.aem.page/products-redesign/adobe-express/apple/2026/q1/may/store-updates/metadata/app-name');
  });

  it('renderCopyEnglishButton always targets main, matching DA\'s own Preview action', () => {
    const pagePath = '/products-redesign/adobe-express/apple/2026/q1/may/store-updates/metadata/app-name';
    const groups = [{ englishPath: pagePath, sourcePages: [], localizedPages: [] }];

    const html = renderCopyEnglishButton(groups, 'aso', 'adobecom');
    const match = html.match(/data-copy-paths="([^"]*)"/);
    const paths = decodeURIComponent(match[1]).split('\n');
    expect(paths).to.deep.equal([`https://main--aso--adobecom.aem.page${pagePath}`]);
    expect(html).to.include('Copy paths & open Loc Project (1)');
  });

  it('renderCopyEnglishButton opens a blank Loc Project for the org/repo after copying, since Loc (unlike Bulk) has no query-param pre-fill', () => {
    const pagePath = '/products-redesign/adobe-express/apple/2026/q1/may/store-updates/metadata/app-name';
    const groups = [{ englishPath: pagePath, sourcePages: [], localizedPages: [] }];

    const html = renderCopyEnglishButton(groups, 'aso', 'adobecom');
    expect(html).to.include('data-open-after-copy="https://da.live/apps/loc?nx=aso-redesign#/basics/adobecom/aso"');
    expect(buildLocProjectUrl('adobecom', 'aso')).to.equal('https://da.live/apps/loc?nx=aso-redesign#/basics/adobecom/aso');
  });

  it('collectBulkPreviewPaths includes the English page, each market-review source page, and their keyword sidecars', () => {
    const englishPath = '/products-redesign/adobe-express/apple/2026/q1/may/store-updates/metadata/app-name';
    const dePath = '/source/en-de/products-redesign/adobe-express/apple/2026/q1/may/store-updates/metadata/app-name';
    const groups = [{
      englishPath,
      sourcePages: [{ label: 'en-de', pagePath: dePath }],
      keywordLabels: ['English', 'en-de'],
    }];

    const paths = collectBulkPreviewPaths(groups);
    expect(paths).to.deep.equal([
      englishPath,
      dePath,
      `${englishPath}-keywords.json`,
      `${dePath}-keywords.json`,
    ]);
  });

  it('collectBulkPreviewPaths dedupes paths shared by multiple groups', () => {
    const sharedPath = '/products-redesign/adobe-express/apple/2026/q1/may/store-updates/images/copy';
    const groups = [
      { englishPath: sharedPath, sourcePages: [], keywordLabels: [] },
      { englishPath: sharedPath, sourcePages: [], keywordLabels: [] },
    ];

    expect(collectBulkPreviewPaths(groups)).to.deep.equal([sharedPath]);
  });

  it('buildBulkPreviewUrl builds a da.live bulk-app deep link with newline-joined URLs', () => {
    const urls = [
      'https://main--aso--adobecom.aem.page/a',
      'https://main--aso--adobecom.aem.page/b',
    ];
    const url = buildBulkPreviewUrl(urls);
    expect(url).to.equal(`https://da.live/apps/bulk?urls=${encodeURIComponent(urls.join('\n'))}`);
  });

  it('renderBulkPreviewButton links to the bulk app with every collected path, and is empty when there are none', () => {
    const pagePath = '/products-redesign/adobe-express/apple/2026/q1/may/store-updates/metadata/app-name';
    const groups = [{ englishPath: pagePath, sourcePages: [], keywordLabels: [] }];

    const html = renderBulkPreviewButton(groups, 'aso', 'adobecom');
    expect(html).to.include('Bulk Preview in DA (1)');
    expect(html).to.include(encodeURIComponent(`https://main--aso--adobecom.aem.page${pagePath}`));

    expect(renderBulkPreviewButton([{ sourcePages: [], keywordLabels: [] }], 'aso', 'adobecom')).to.equal('');
  });

  it('renderBulkPreviewButton falls back to a copy button when the direct link would be too long for da.live, and opens the blank app after copying', () => {
    const groups = Array.from({ length: 60 }, (_, index) => ({
      englishPath: `/products-redesign/adobe-express/apple/2026/q1/may/store-updates/metadata/field-${index}`,
      sourcePages: [],
      keywordLabels: [],
    }));

    const html = renderBulkPreviewButton(groups, 'aso', 'adobecom');
    expect(html).to.not.include('<a ');
    expect(html).to.include('<button');
    expect(html).to.include('Copy paths & open Bulk Preview (60)');
    expect(html).to.include('data-open-after-copy="https://da.live/apps/bulk"');

    const urls = groups.map((group) => `https://main--aso--adobecom.aem.page${group.englishPath}`);
    expect(html).to.include(encodeURIComponent(urls.join('\n')));
  });

  it('renderCopyEnglishButton and renderBulkPreviewButton return bare elements (no wrapper row), so the caller can place them side by side', () => {
    const pagePath = '/products-redesign/adobe-express/apple/2026/q1/may/store-updates/metadata/app-name';
    const groups = [{ englishPath: pagePath, sourcePages: [], keywordLabels: [] }];

    expect(renderCopyEnglishButton(groups, 'aso', 'adobecom')).to.not.include('import-copy-row');
    expect(renderBulkPreviewButton(groups, 'aso', 'adobecom')).to.not.include('import-copy-row');
  });

  it('renderImportPageList shows an Over Limit cell linking to the offending page, or a dash when none', () => {
    const withOverLimit = [{
      device: 'apple',
      blockType: 'listing',
      fieldNames: ['App Name'],
      englishPath: null,
      sourcePages: [],
      keywordLabels: [],
      overLimitEntries: [{
        fieldName: 'App Name', language: 'German', pagePath: '/source/en-de/.../app-name', length: 35, charLimit: 30, label: 'en-de',
      }],
    }];

    const html = renderImportPageList(withOverLimit, 'adobecom', 'aso');
    expect(html).to.include('Over Limit');
    expect(html).to.include('App Name (en-de): 35/30');
    expect(html).to.include(buildDaEditUrl('adobecom', 'aso', '/source/en-de/.../app-name'));

    const withoutOverLimit = [{
      device: 'apple', blockType: 'listing', fieldNames: ['App Name'], englishPath: null, sourcePages: [], keywordLabels: [], overLimitEntries: [],
    }];
    const cleanHtml = renderImportPageList(withoutOverLimit, 'adobecom', 'aso');
    expect(cleanHtml).to.include('<div class="import-page-over-limit"><span class="import-page-missing">—</span></div>');
  });

  it('renderImportPageList keeps exactly 7 grid cells per row even with multiple over-limit entries', () => {
    // Regression test: a <p> auto-closes when it hits a block-level child like <div>,
    // so stacking over-limit entries as <div>s inside a <p> would silently promote
    // them to extra siblings of .inner and corrupt the 7-column grid.
    const groups = [{
      device: 'apple',
      blockType: 'listing',
      fieldNames: ['App Name'],
      englishPath: null,
      sourcePages: [],
      keywordLabels: [],
      overLimitEntries: [
        {
          fieldName: 'App Name', language: 'German', pagePath: '/source/en-de/.../app-name', length: 35, charLimit: 30, label: 'en-de',
        },
        {
          fieldName: 'App Name', language: 'French', pagePath: '/source/en-fr/.../app-name', length: 35, charLimit: 30, label: 'en-fr',
        },
        {
          fieldName: 'App Name', language: 'Italian', pagePath: '/source/en-it/.../app-name', length: 35, charLimit: 30, label: 'en-it',
        },
      ],
    }];

    const html = renderImportPageList(groups, 'adobecom', 'aso');
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const inner = doc.querySelector('.inner');
    expect(inner.children).to.have.lengthOf(7);
    expect(inner.querySelectorAll('.import-page-over-limit a')).to.have.lengthOf(3);
  });
});

describe('import concurrency helpers', () => {
  it('groupWritesByPagePath keeps writes to the same page together, in order', () => {
    const writes = [
      { pagePath: '/a', fieldKey: 'x', text: '1' },
      { pagePath: '/b', fieldKey: 'y', text: '2' },
      { pagePath: '/a', fieldKey: 'z', text: '3' },
    ];

    const chains = groupWritesByPagePath(writes);
    expect(chains).to.have.length(2);
    expect(chains[0]).to.deep.equal([writes[0], writes[2]]);
    expect(chains[1]).to.deep.equal([writes[1]]);
  });
});

describe('buildMediaAssetsPageRequests', () => {
  let schema;
  let languageIndex;

  beforeEach(async () => {
    schema = JSON.parse(await readFile({ path: '../mocks/block-schema.json' }));
    const translateData = JSON.parse(await readFile({ path: '../mocks/translate.json' }));
    languageIndex = buildLanguageIndex(translateData.languages.data, translateData);
  });

  const baseScope = {
    productsPath: 'products-redesign',
    product: 'adobe-express',
    year: '2026',
    quarter: 'q1',
    month: 'may',
    storeType: 'store-updates',
  };

  it('returns one English-source request per device per distinct page leaf, not per field, for English alone', () => {
    const requests = buildMediaAssetsPageRequests({
      devices: ['apple', 'google'],
      schema,
      languageIndex,
      languageNames: ['English'],
      ...baseScope,
    });

    const leaves = requests.map((request) => `${request.device}:${request.pageLeaf}`);
    expect(new Set(leaves).size).to.equal(leaves.length);
    expect(leaves).to.include.members([
      'apple:images/assets',
      'apple:videos/assets',
      'google:images/assets',
      'google:videos/assets',
    ]);
  });

  it('resolves the English source path, not a localized one', () => {
    const requests = buildMediaAssetsPageRequests({
      devices: ['apple'],
      schema,
      languageIndex,
      languageNames: ['English'],
      ...baseScope,
    });

    const imagesRequest = requests.find((request) => request.pageLeaf === 'images/assets');
    expect(imagesRequest.pagePath).to.include('/adobe-express/apple/2026/q1/may/store-updates/images/assets');
  });

  it('returns nothing for a device with no media-assets fields in schema', () => {
    const requests = buildMediaAssetsPageRequests({
      devices: ['windows'],
      schema,
      languageIndex,
      languageNames: ['English'],
      ...baseScope,
    });

    expect(requests).to.deep.equal([]);
  });

  it('also creates a market-review source page for each managed language in the workbook', () => {
    const requests = buildMediaAssetsPageRequests({
      devices: ['apple'],
      schema,
      languageIndex,
      languageNames: ['English', 'German'],
      ...baseScope,
    });

    const germanRequest = requests.find(
      (request) => request.pageLeaf === 'images/assets' && request.language.name === 'German',
    );
    expect(germanRequest).to.exist;
    expect(germanRequest.pagePath).to.include('/source/en-de/');
    expect(germanRequest.pagePath).to.include('/adobe-express/apple/2026/q1/may/store-updates/images/assets');

    // Still exactly one English request per page leaf, not swallowed by adding German.
    const englishRequests = requests.filter(
      (request) => request.pageLeaf === 'images/assets' && request.language.name === 'English',
    );
    expect(englishRequests).to.have.length(1);
  });

  it('does not create a duplicate page for an unmanaged language that shares the English source path', () => {
    const requests = buildMediaAssetsPageRequests({
      devices: ['apple'],
      schema,
      languageIndex,
      languageNames: ['English', 'Romanian'],
      ...baseScope,
    });

    // Romanian's sourcePath is '/', same as English's — same pagePath, deduped to one request.
    const imagesRequests = requests.filter((request) => request.pageLeaf === 'images/assets');
    expect(imagesRequests).to.have.length(1);
  });
});

describe('createMissingMediaAssetsPages', () => {
  let schema;

  beforeEach(async () => {
    schema = JSON.parse(await readFile({ path: '../mocks/block-schema.json' }));
  });

  afterEach(() => {
    sinon.restore();
  });

  it('skips a page that already exists, without attempting to write to it', async () => {
    const fetchStub = sinon.stub(window, 'fetch')
      .resolves({ ok: true, status: 200, text: async () => '<html>already here</html>' });

    const request = {
      device: 'apple',
      pageLeaf: 'images/assets',
      pagePath: '/products-redesign/adobe-express/apple/2026/q1/may/store-updates/images/assets',
    };
    const result = await createMissingMediaAssetsPages('adobecom', 'aso', 'token', schema, [request]);

    expect(result).to.deep.equal([{ ...request, created: false, ok: true }]);
    expect(fetchStub.callCount).to.equal(1);
  });

  it('creates a blank scaffold with a row per field on that page leaf, when the page does not exist yet', async () => {
    let capturedHtml;
    sinon.stub(window, 'fetch').callsFake(async (url, init = {}) => {
      if (!init.method || init.method === 'GET') return { ok: false, status: 404 };
      capturedHtml = await init.body.get('data').text();
      return { ok: true, status: 200 };
    });

    const request = {
      device: 'apple',
      pageLeaf: 'images/assets',
      pagePath: '/products-redesign/adobe-express/apple/2026/q1/may/store-updates/images/assets',
    };
    const result = await createMissingMediaAssetsPages('adobecom', 'aso', 'token', schema, [request]);

    expect(result).to.deep.equal([{ ...request, created: true, ok: true }]);
    expect(capturedHtml).to.include('aso-app media-assets apple');
    expect(capturedHtml).to.include('Screenshot iPhone 1');
    expect(capturedHtml).to.not.include('Video 1');
  });
});

describe('buildMediaAssetsPageGroups', () => {
  const english = { name: 'English', sourcePath: '/' };
  const german = { name: 'German', sourcePath: '/source/en-de' };

  it('collapses English + market-review pages for the same device/page-leaf into one group, like text content', () => {
    const englishPath = '/products-redesign/adobe-express/apple/2026/q1/may/store-updates/images/assets';
    const germanPath = '/source/en-de/products-redesign/adobe-express/apple/2026/q1/may/store-updates/images/assets';
    const groups = buildMediaAssetsPageGroups([
      {
        device: 'apple', pageLeaf: 'images/assets', pagePath: englishPath, language: english, created: true, ok: true,
      },
      {
        device: 'apple', pageLeaf: 'images/assets', pagePath: germanPath, language: german, created: true, ok: true,
      },
    ]);

    expect(groups).to.have.length(1);
    expect(groups[0].englishPath).to.equal(englishPath);
    expect(groups[0].sourcePages).to.deep.equal([{ label: 'en-de', pagePath: germanPath }]);
  });

  it('returns nothing for an empty or missing list', () => {
    expect(buildMediaAssetsPageGroups([])).to.deep.equal([]);
    expect(buildMediaAssetsPageGroups(undefined)).to.deep.equal([]);
  });
});

describe('renderMediaAssetsPageTable', () => {
  const english = { name: 'English', sourcePath: '/' };
  const german = { name: 'German', sourcePath: '/source/en-de' };

  it('renders its own table, separate from renderImportPageList, with a Device/Page/English/Also layout', () => {
    const englishPath = '/products-redesign/adobe-express/apple/2026/q1/may/store-updates/images/assets';
    const germanPath = '/source/en-de/products-redesign/adobe-express/apple/2026/q1/may/store-updates/images/assets';
    const html = renderMediaAssetsPageTable([
      {
        device: 'apple', pageLeaf: 'images/assets', pagePath: englishPath, language: english, created: true, ok: true,
      },
      {
        device: 'apple', pageLeaf: 'images/assets', pagePath: germanPath, language: german, created: true, ok: true,
      },
      {
        device: 'google', pageLeaf: 'videos/assets', pagePath: '/products-redesign/adobe-express/google/2026/q1/may/store-updates/videos/assets', language: english, created: false, ok: true,
      },
    ], 'adobecom', 'aso');

    expect(html).to.include('import-media-assets-section');
    expect(html).to.include('Media Assets');
    expect(html).to.include('Apple');
    expect(html).to.include('images/assets');
    expect(html).to.include('Google');
    expect(html).to.include('videos/assets');
    expect(html).to.include(buildDaEditUrl('adobecom', 'aso', englishPath));
    expect(html).to.include(buildDaEditUrl('adobecom', 'aso', germanPath));
    // No Keywords/Over Limit columns at all in this table, unlike renderImportPageList.
    expect(html).to.not.include('Keywords');
    expect(html).to.not.include('Over Limit');
  });

  it('returns nothing when there are no media-assets pages', () => {
    expect(renderMediaAssetsPageTable([], 'adobecom', 'aso')).to.equal('');
    expect(renderMediaAssetsPageTable(undefined, 'adobecom', 'aso')).to.equal('');
  });
});

describe('runImport', () => {
  afterEach(() => {
    sinon.restore();
  });

  it('takes plain params with no DOM/container argument, and surfaces a clear error when remote config fails to load', async () => {
    // A future headless/skill caller has no document/container to hand in — runImport's
    // only inputs are org/repo/token/buffer plus the two values that'd otherwise come from
    // the URL in the browser (productsPath, configFile). This stubs every fetch to fail,
    // which is enough to prove the call succeeds up to that point using only those params.
    sinon.stub(window, 'fetch').resolves({ ok: false, status: 404 });

    let error;
    try {
      await runImport({
        org: 'adobecom',
        repo: 'aso',
        token: 'fake-token',
        buffer: new ArrayBuffer(0),
        productsPath: 'products-redesign',
        configFile: 'translate.json',
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).to.exist;
    expect(error.message).to.include('Could not load');
  });
});

describe('buildImportSummaryHtml', () => {
  it('renders the summary as a plain string, with no container/DOM argument', () => {
    const html = buildImportSummaryHtml({
      product: 'adobe-express',
      year: '2026',
      quarter: 'q1',
      month: 'may',
      storeType: 'store-updates',
      writeCount: 3,
      keywordWriteCount: 0,
      skippedEmpty: 1,
      propagatedManaged: ['German'],
      propagatedUnmanaged: [],
      overLimit: [],
      failures: [],
      results: [],
      keywordResults: [],
    }, 'adobecom', 'aso');

    expect(html).to.be.a('string');
    expect(html).to.include('adobe-express / 2026 / q1 / may / store-updates');
    expect(html).to.include('3 page write(s)');
    expect(html).to.include('Propagated English source (market-review pages created): German');
  });

  it('notes that media assets need manual authoring, and renders them in their own dedicated table, not mixed into the main one', () => {
    const mediaAssetsPath = '/products-redesign/adobe-express/apple/2026/q1/may/store-updates/images/assets';
    const html = buildImportSummaryHtml({
      product: 'adobe-express',
      year: '2026',
      quarter: 'q1',
      month: 'may',
      storeType: 'store-updates',
      writeCount: 3,
      keywordWriteCount: 0,
      skippedEmpty: 1,
      propagatedManaged: [],
      propagatedUnmanaged: [],
      overLimit: [],
      failures: [],
      results: [],
      keywordResults: [],
      mediaAssetsPages: [
        {
          device: 'apple', pageLeaf: 'images/assets', pagePath: mediaAssetsPath, language: { name: 'English', sourcePath: '/' }, created: true, ok: true,
        },
      ],
    }, 'adobecom', 'aso');

    expect(html).to.include('drag &amp; drop your screenshots and videos directly into each page');
    expect(html).to.include('Copy paths & open Loc Project (1)');
    // In its own dedicated table (renderMediaAssetsPageTable), not a row of the main one.
    expect(html).to.include('import-media-assets-section');
    expect(html).to.include(buildDaEditUrl('adobecom', 'aso', mediaAssetsPath));
  });

  it('omits the media-assets note entirely when nothing was created or found', () => {
    const html = buildImportSummaryHtml({
      product: 'adobe-express',
      year: '2026',
      quarter: 'q1',
      month: 'may',
      storeType: 'store-updates',
      writeCount: 3,
      keywordWriteCount: 0,
      skippedEmpty: 1,
      propagatedManaged: [],
      propagatedUnmanaged: [],
      overLimit: [],
      failures: [],
      results: [],
      keywordResults: [],
      mediaAssetsPages: [],
    }, 'adobecom', 'aso');

    expect(html).to.not.include('Media assets');
  });
});
