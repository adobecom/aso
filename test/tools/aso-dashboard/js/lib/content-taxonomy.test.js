import { expect } from '@esm-bundle/chai';
import {
  buildContentPath,
  buildExportPagePaths,
  buildMetadataPagePath,
  buildPromoPagePath,
  buildPromosListPath,
  buildPromoVariantsListPath,
  buildStoreTestsListPath,
  buildStoreUpdatesBasePath,
  formatMonthLabel,
  formatQuarterLabel,
  getDefaultReleasePeriod,
  getYearOptions,
  populateReleasePeriodDropdowns,
  storeTypeUsesReleasePeriod,
  STORE_TYPE_TESTS,
  STORE_TYPE_UPDATES,
} from '../../../../../tools/aso-dashboard/js/lib/content-taxonomy.js';

describe('content-taxonomy', () => {
  const baseSelection = {
    language: 'en-us',
    productsPath: 'products-redesign',
    product: 'adobe-express',
    device: 'apple',
    year: '2026',
    quarter: 'q1',
    month: 'may',
  };

  const storeUpdatesPath = '/en-us/products-redesign/adobe-express/apple/2026/q1/may/store-updates';

  describe('buildStoreUpdatesBasePath', () => {
    it('includes year quarter month and store-updates', () => {
      expect(buildStoreUpdatesBasePath(baseSelection)).to.equal(storeUpdatesPath);
    });

    it('builds English root path without a language segment', () => {
      expect(buildStoreUpdatesBasePath({
        ...baseSelection,
        language: '/',
        device: 'google',
      })).to.equal('/products-redesign/adobe-express/google/2026/q1/may/store-updates');
    });

    it('builds managed English source path prefix', () => {
      expect(buildStoreUpdatesBasePath({
        ...baseSelection,
        language: '/source/en-de',
        device: 'google',
      })).to.equal('/source/en-de/products-redesign/adobe-express/google/2026/q1/may/store-updates');
    });

    it('normalizes language segment keys with a leading slash', () => {
      expect(buildStoreUpdatesBasePath({
        ...baseSelection,
        language: 'de-de',
      })).to.equal('/de-de/products-redesign/adobe-express/apple/2026/q1/may/store-updates');
    });

    it('strips slashes from productsPath', () => {
      expect(buildStoreUpdatesBasePath({
        ...baseSelection,
        productsPath: '/products/',
      })).to.equal('/en-us/products/adobe-express/apple/2026/q1/may/store-updates');
    });

    it('returns null for invalid device', () => {
      expect(buildStoreUpdatesBasePath({ ...baseSelection, device: 'windows' })).to.be.null;
    });

    it('returns null for invalid quarter', () => {
      expect(buildStoreUpdatesBasePath({ ...baseSelection, quarter: 'q5' })).to.be.null;
    });

    it('returns null for invalid month', () => {
      expect(buildStoreUpdatesBasePath({ ...baseSelection, month: 'May' })).to.be.null;
    });
  });

  describe('buildContentPath', () => {
    it('builds store-updates path with year quarter month', () => {
      expect(buildContentPath({
        ...baseSelection,
        storeType: STORE_TYPE_UPDATES,
      })).to.equal(storeUpdatesPath);
    });

    it('appends pageLeaf for store-updates', () => {
      expect(buildContentPath({
        ...baseSelection,
        storeType: STORE_TYPE_UPDATES,
        pageLeaf: 'metadata/full-description',
      })).to.equal(`${storeUpdatesPath}/metadata/full-description`);
    });

    it('builds store-tests path with testName', () => {
      expect(buildContentPath({
        ...baseSelection,
        storeType: STORE_TYPE_TESTS,
        testName: 'icon-test-a',
      })).to.equal(
        '/en-us/products-redesign/adobe-express/apple/2026/q1/may/store-tests/icon-test-a',
      );
    });

    it('returns null for store-tests without testName', () => {
      expect(buildContentPath({
        ...baseSelection,
        storeType: STORE_TYPE_TESTS,
      })).to.be.null;
    });
  });

  describe('buildMetadataPagePath', () => {
    it('builds metadata page path under store-updates', () => {
      expect(buildMetadataPagePath(baseSelection, 'metadata/description')).to.equal(
        `${storeUpdatesPath}/metadata/description`,
      );
    });
  });

  describe('buildPromoPagePath', () => {
    it('builds promo page path under store-updates', () => {
      expect(buildPromoPagePath(baseSelection, 'launch', 'default')).to.equal(
        `${storeUpdatesPath}/promos/launch/default`,
      );
    });
  });

  describe('buildPromosListPath', () => {
    it('points at promos under store-updates', () => {
      expect(buildPromosListPath({
        ...baseSelection,
        storeType: STORE_TYPE_UPDATES,
      })).to.equal(`${storeUpdatesPath}/promos`);
    });

    it('points at promos under store-tests when testName is set', () => {
      expect(buildPromosListPath({
        ...baseSelection,
        storeType: STORE_TYPE_TESTS,
        testName: 'icon-test-a',
      })).to.equal(
        '/en-us/products-redesign/adobe-express/apple/2026/q1/may/store-tests/icon-test-a/promos',
      );
    });

    it('returns null for store-tests without testName', () => {
      expect(buildPromosListPath({
        ...baseSelection,
        storeType: STORE_TYPE_TESTS,
      })).to.be.null;
    });
  });

  describe('buildPromoVariantsListPath', () => {
    it('points at variant folders for a promo', () => {
      expect(buildPromoVariantsListPath({
        ...baseSelection,
        storeType: STORE_TYPE_UPDATES,
      }, 'comic-creator')).to.equal(`${storeUpdatesPath}/promos/comic-creator`);
    });
  });

  describe('buildStoreTestsListPath', () => {
    it('points at the store-tests folder for DA listing', () => {
      expect(buildStoreTestsListPath(baseSelection)).to.equal(
        '/en-us/products-redesign/adobe-express/apple/2026/q1/may/store-tests',
      );
    });
  });

  describe('storeTypeUsesReleasePeriod', () => {
    it('returns true for store-updates and store-tests', () => {
      expect(storeTypeUsesReleasePeriod(STORE_TYPE_UPDATES)).to.be.true;
      expect(storeTypeUsesReleasePeriod(STORE_TYPE_TESTS)).to.be.true;
    });
  });

  describe('buildExportPagePaths', () => {
    it('cartesian-products multi-select dimensions for store-updates', () => {
      const paths = buildExportPagePaths({
        ...baseSelection,
        products: ['adobe-express'],
        languages: ['de-de', '/source/en-de'],
        devices: ['apple'],
        storeType: STORE_TYPE_UPDATES,
      });

      expect(paths).to.have.lengthOf(2);
      expect(paths[0].path).to.equal('/de-de/products-redesign/adobe-express/apple/2026/q1/may/store-updates');
      expect(paths[1].path).to.equal('/source/en-de/products-redesign/adobe-express/apple/2026/q1/may/store-updates');
    });

    it('includes testName in paths for store-tests', () => {
      const paths = buildExportPagePaths({
        ...baseSelection,
        products: ['adobe-express'],
        languages: ['en-us'],
        devices: ['google'],
        storeType: STORE_TYPE_TESTS,
        testNames: ['test-a', 'test-b'],
      });

      expect(paths).to.have.lengthOf(2);
      expect(paths[0]).to.deep.include({ testName: 'test-a', device: 'google' });
      expect(paths[0].path).to.include('/store-tests/test-a');
    });

    it('returns empty array for invalid store type', () => {
      expect(buildExportPagePaths({
        ...baseSelection,
        products: ['adobe-express'],
        languages: ['en-us'],
        devices: ['apple'],
        storeType: 'invalid',
      })).to.deep.equal([]);
    });
  });

  describe('getYearOptions', () => {
    it('returns descending years from start to end', () => {
      expect(getYearOptions(2023, 2025)).to.deep.equal(['2025', '2024', '2023']);
    });
  });

  describe('formatMonthLabel', () => {
    it('title-cases lowercase month folder names', () => {
      expect(formatMonthLabel('may')).to.equal('May');
      expect(formatMonthLabel('december')).to.equal('December');
    });
  });

  describe('formatQuarterLabel', () => {
    it('title-cases quarter for UI labels', () => {
      expect(formatQuarterLabel('q2')).to.equal('Q2');
    });

    it('normalizes uppercase input', () => {
      expect(formatQuarterLabel('Q2')).to.equal('Q2');
    });

    it('returns empty string for invalid quarters', () => {
      expect(formatQuarterLabel('Q5')).to.equal('');
    });
  });

  describe('getDefaultReleasePeriod', () => {
    it('maps may to Q2', () => {
      expect(getDefaultReleasePeriod(new Date(2026, 4, 15))).to.deep.equal({
        year: '2026',
        quarter: 'q2',
        month: 'may',
      });
    });

    it('maps january to Q1', () => {
      expect(getDefaultReleasePeriod(new Date(2024, 0, 1))).to.deep.equal({
        year: '2024',
        quarter: 'q1',
        month: 'january',
      });
    });

    it('maps december to Q4', () => {
      expect(getDefaultReleasePeriod(new Date(2023, 11, 1))).to.deep.equal({
        year: '2023',
        quarter: 'q4',
        month: 'december',
      });
    });
  });

  describe('populateReleasePeriodDropdowns', () => {
    beforeEach(() => {
      document.body.innerHTML = `
        <select id="year"></select>
        <select id="quarter"></select>
        <select id="month"></select>
      `;
    });

    it('populates year, quarter, and month selects', () => {
      populateReleasePeriodDropdowns();
      expect(document.getElementById('year').options.length).to.be.greaterThan(1);
      expect(document.getElementById('quarter').options.length).to.equal(5);
      expect(document.getElementById('month').options.length).to.equal(13);
    });

    it('supports an id prefix for export controls', () => {
      document.body.innerHTML = `
        <select id="export-year"></select>
        <select id="export-quarter"></select>
        <select id="export-month"></select>
      `;
      populateReleasePeriodDropdowns('export-');
      expect(document.getElementById('export-year').options.length).to.be.greaterThan(1);
      expect(document.getElementById('export-quarter').options.length).to.equal(5);
      expect(document.getElementById('export-month').options.length).to.equal(13);
    });
  });
});
