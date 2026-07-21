import { expect } from '@esm-bundle/chai';
import {
  buildHtmlSourcePath,
  dedupePaths,
  keywordsSidecarPath,
  resolveKeywordPath,
  resolvePagePath,
  ROW_ROLE_ENGLISH_SOURCE,
  ROW_ROLE_LOCALIZED,
  spacingSidecarPath,
} from '../../../../../tools/aso-dashboard/js/import-export/paths.js';

const english = {
  name: 'English',
  sourcePath: '/',
  localizedPath: '/',
};

const german = {
  name: 'German',
  sourcePath: '/source/en-de',
  localizedPath: '/de-de',
  isManagedLocale: true,
};

const romanian = {
  name: 'Romanian',
  sourcePath: '/',
  localizedPath: '/ro',
};

const settings = {
  productsPath: 'products-redesign',
  product: 'firefly',
  device: 'google',
  year: '2026',
  quarter: 'q1',
  month: 'may',
  pageLeaf: 'metadata/full-description',
};

describe('import-export-paths', () => {
  describe('resolvePagePath', () => {
    it('builds english-source and localized paths from language prefixes', () => {
      expect(resolvePagePath({
        language: german,
        rowRole: ROW_ROLE_ENGLISH_SOURCE,
        ...settings,
      })).to.equal(
        '/source/en-de/products-redesign/firefly/google/2026/q1/may/store-updates/metadata/full-description',
      );

      expect(resolvePagePath({
        language: german,
        rowRole: ROW_ROLE_LOCALIZED,
        ...settings,
      })).to.equal(
        '/de-de/products-redesign/firefly/google/2026/q1/may/store-updates/metadata/full-description',
      );
    });

    it('shares english-source path for unmanaged locales', () => {
      const englishPath = resolvePagePath({
        language: english,
        rowRole: ROW_ROLE_ENGLISH_SOURCE,
        ...settings,
      });
      const romanianPath = resolvePagePath({
        language: romanian,
        rowRole: ROW_ROLE_ENGLISH_SOURCE,
        ...settings,
      });

      expect(englishPath).to.equal(
        '/products-redesign/firefly/google/2026/q1/may/store-updates/metadata/full-description',
      );
      expect(romanianPath).to.equal(englishPath);
    });
  });

  describe('sidecar and html paths', () => {
    it('builds html and spacing sidecar paths from page stem', () => {
      const pagePath = '/de-de/products-redesign/firefly/google/2026/q1/may/store-updates/metadata/full-description';
      expect(buildHtmlSourcePath(pagePath)).to.equal(`${pagePath}.html`);
      expect(spacingSidecarPath(pagePath)).to.equal(
        '/de-de/products-redesign/firefly/google/2026/q1/may/store-updates/metadata/.full-description-spacing.json',
      );
      expect(keywordsSidecarPath(pagePath)).to.equal(`${pagePath}-keywords.json`);
    });

    it('resolves keyword paths for managed locales only', () => {
      expect(resolveKeywordPath({
        language: german,
        ...settings,
      })).to.equal(
        '/source/en-de/products-redesign/firefly/google/2026/q1/may/store-updates/metadata/full-description-keywords.json',
      );
      expect(resolveKeywordPath({
        language: romanian,
        ...settings,
      })).to.equal(null);
    });

    it('builds store-tests page paths when testName is provided', () => {
      expect(resolvePagePath({
        language: german,
        rowRole: ROW_ROLE_LOCALIZED,
        testName: 'icon-test-a',
        storeType: 'store-tests',
        ...settings,
      })).to.equal(
        '/de-de/products-redesign/firefly/google/2026/q1/may/store-tests/icon-test-a/metadata/full-description',
      );
    });
  });

  describe('dedupePaths', () => {
    it('collapses entries that share the same page path', () => {
      const sharedPath = '/products-redesign/firefly/google/2026/q1/may/store-updates/metadata/full-description';
      const deduped = dedupePaths([
        {
          pagePath: sharedPath,
          product: 'firefly',
          device: 'google',
          language: english,
          rowRole: ROW_ROLE_ENGLISH_SOURCE,
          fieldKey: 'description',
        },
        {
          pagePath: sharedPath,
          product: 'firefly',
          device: 'google',
          language: romanian,
          rowRole: ROW_ROLE_ENGLISH_SOURCE,
          fieldKey: 'description',
        },
      ]);

      expect(deduped).to.have.length(1);
      expect(deduped[0].refs).to.have.length(2);
      expect(deduped[0].pagePath).to.equal(sharedPath);
    });

    it('carries charLimit through onto each ref, not just the bucket', () => {
      const deduped = dedupePaths([{
        pagePath: '/products-redesign/firefly/google/2026/q1/may/store-updates/metadata/app-title',
        product: 'firefly',
        device: 'google',
        language: english,
        rowRole: ROW_ROLE_ENGLISH_SOURCE,
        fieldKey: 'title',
        charLimit: 30,
      }]);

      expect(deduped[0].refs[0].charLimit).to.equal(30);
    });
  });
});
