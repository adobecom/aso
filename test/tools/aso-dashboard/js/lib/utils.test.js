import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import {
  buildDaListUrl,
  clearListCache,
  fetchPromoNames,
  fetchPromoVariants,
  fetchStoreTests,
  formatFolderLabel,
  parseFolderListItems,
  parseVariantFileItems,
  toDaListPath,
} from '../../../../../tools/aso-dashboard/js/lib/utils.js';
import { STORE_TYPE_TESTS, STORE_TYPE_UPDATES } from '../../../../../tools/aso-dashboard/js/lib/content-taxonomy.js';

describe('aso-dashboard utils', () => {
  describe('toDaListPath', () => {
    it('strips leading slashes', () => {
      expect(toDaListPath('/en-us/products/adobe-express/apple/2024/q2/may/store-tests'))
        .to.equal('en-us/products/adobe-express/apple/2024/q2/may/store-tests');
    });
  });

  describe('buildDaListUrl', () => {
    it('builds admin list URL', () => {
      expect(buildDaListUrl('adobecom', 'aso', 'products'))
        .to.equal('https://admin.da.live/list/adobecom/aso/products');
    });
  });

  describe('formatFolderLabel', () => {
    it('title-cases hyphenated folder names', () => {
      expect(formatFolderLabel('adobe-express')).to.equal('Adobe express');
    });
  });

  describe('parseFolderListItems', () => {
    it('maps folders and skips files', () => {
      const items = parseFolderListItems([
        { name: 'icon-test-a', path: '/en-us/products/adobe-express/apple/2024/q2/may/store-tests/icon-test-a' },
        { name: 'page', path: '/en-us/products/adobe-express/apple/2024/q2/may/store-tests/page.html', ext: 'html' },
        { name: '', path: '/bad' },
      ]);

      expect(items).to.deep.equal([
        { value: 'icon-test-a', label: 'Icon test a' },
      ]);
    });

    it('returns empty array for null data', () => {
      expect(parseFolderListItems(null)).to.deep.equal([]);
    });
  });

  describe('parseVariantFileItems', () => {
    it('maps html files and skips folders and other extensions', () => {
      const items = parseVariantFileItems([
        { name: 'default', path: '/promos/comic-creator/default.html', ext: 'html' },
        { name: 'alt', path: '/promos/comic-creator/alt.html', ext: 'html' },
        { name: 'comic-creator', path: '/promos/comic-creator' },
        { name: 'default-keywords', path: '/promos/comic-creator/default-keywords.json', ext: 'json' },
        { name: '', path: '/bad' },
      ]);

      expect(items).to.deep.equal([
        { value: 'default', label: 'Default' },
        { value: 'alt', label: 'Alt' },
      ]);
    });

    it('returns empty array for null data', () => {
      expect(parseVariantFileItems(null)).to.deep.equal([]);
    });
  });

  describe('fetchStoreTests', () => {
    let fetchStub;

    beforeEach(() => {
      clearListCache();
      fetchStub = sinon.stub(window, 'fetch');
    });

    afterEach(() => {
      fetchStub.restore();
      clearListCache();
    });

    it('returns empty array without calling fetch when selection is incomplete', async () => {
      const result = await fetchStoreTests({
        context: { org: 'adobecom', repo: 'aso' },
        token: 'token',
        selection: { language: 'en-us', product: 'adobe-express' },
      });

      expect(result).to.deep.equal([]);
      expect(fetchStub.called).to.be.false;
    });

    it('lists folders under store-tests when selection is complete', async () => {
      fetchStub.resolves({
        ok: true,
        json: async () => ([
          {
            name: 'icon-test-a',
            path: '/en-us/products/adobe-express/apple/2024/q2/may/store-tests/icon-test-a',
          },
          {
            name: 'icon-test-b',
            path: '/en-us/products/adobe-express/apple/2024/q2/may/store-tests/icon-test-b',
          },
        ]),
      });

      const result = await fetchStoreTests({
        context: { org: 'adobecom', repo: 'aso' },
        token: 'token',
        selection: {
          language: 'en-us',
          productsPath: 'products',
          product: 'adobe-express',
          device: 'apple',
          year: '2024',
          quarter: 'q2',
          month: 'may',
        },
      });

      expect(fetchStub.calledOnce).to.be.true;
      const [url] = fetchStub.firstCall.args;
      expect(url).to.equal(
        'https://admin.da.live/list/adobecom/aso/en-us/products/adobe-express/apple/2024/q2/may/store-tests',
      );
      expect(result).to.deep.equal([
        { value: 'icon-test-a', label: 'Icon test a' },
        { value: 'icon-test-b', label: 'Icon test b' },
      ]);
    });

    it('uses cached list results on repeat calls', async () => {
      fetchStub.resolves({
        ok: true,
        json: async () => ([
          { name: 'icon-test-a', path: '/en-us/products/adobe-express/apple/2024/q2/may/store-tests/icon-test-a' },
        ]),
      });

      const context = { org: 'adobecom', repo: 'aso' };
      const selection = {
        language: 'en-us',
        productsPath: 'products',
        product: 'adobe-express',
        device: 'apple',
        year: '2024',
        quarter: 'q2',
        month: 'may',
      };

      await fetchStoreTests({ context, token: 'token', selection });
      await fetchStoreTests({ context, token: 'token', selection });

      expect(fetchStub.calledOnce).to.be.true;
    });
  });

  describe('fetchPromoNames', () => {
    let fetchStub;

    beforeEach(() => {
      clearListCache();
      fetchStub = sinon.stub(window, 'fetch');
    });

    afterEach(() => {
      fetchStub.restore();
      clearListCache();
    });

    it('returns empty array when store-tests selection lacks testName', async () => {
      const result = await fetchPromoNames({
        context: { org: 'adobecom', repo: 'aso' },
        token: 'token',
        selection: {
          language: 'en-us',
          productsPath: 'products-redesign',
          product: 'adobe-express',
          device: 'apple',
          year: '2026',
          quarter: 'q1',
          month: 'may',
          storeType: STORE_TYPE_TESTS,
        },
      });

      expect(result).to.deep.equal([]);
      expect(fetchStub.called).to.be.false;
    });

    it('lists promo folders under store-updates', async () => {
      fetchStub.resolves({
        ok: true,
        json: async () => ([
          {
            name: 'comic-creator',
            path: '/en-us/products-redesign/adobe-express/apple/2026/q1/may/store-updates/promos/comic-creator',
          },
        ]),
      });

      const result = await fetchPromoNames({
        context: { org: 'adobecom', repo: 'aso' },
        token: 'token',
        selection: {
          language: 'en-us',
          productsPath: 'products-redesign',
          product: 'adobe-express',
          device: 'apple',
          year: '2026',
          quarter: 'q1',
          month: 'may',
          storeType: STORE_TYPE_UPDATES,
        },
      });

      expect(fetchStub.calledOnce).to.be.true;
      const [url] = fetchStub.firstCall.args;
      expect(url).to.equal(
        'https://admin.da.live/list/adobecom/aso/en-us/products-redesign/adobe-express/apple/2026/q1/may/store-updates/promos',
      );
      expect(result).to.deep.equal([
        { value: 'comic-creator', label: 'Comic creator' },
      ]);
    });
  });

  describe('fetchPromoVariants', () => {
    let fetchStub;

    beforeEach(() => {
      clearListCache();
      fetchStub = sinon.stub(window, 'fetch');
    });

    afterEach(() => {
      fetchStub.restore();
      clearListCache();
    });

    it('lists variant pages (files) for a promo', async () => {
      fetchStub.resolves({
        ok: true,
        json: async () => ([
          { name: 'default', path: '/en-us/products-redesign/adobe-express/apple/2026/q1/may/store-updates/promos/comic-creator/default.html', ext: 'html' },
          { name: 'alt', path: '/en-us/products-redesign/adobe-express/apple/2026/q1/may/store-updates/promos/comic-creator/alt.html', ext: 'html' },
        ]),
      });

      const result = await fetchPromoVariants({
        context: { org: 'adobecom', repo: 'aso' },
        token: 'token',
        selection: {
          language: 'en-us',
          productsPath: 'products-redesign',
          product: 'adobe-express',
          device: 'apple',
          year: '2026',
          quarter: 'q1',
          month: 'may',
          storeType: STORE_TYPE_UPDATES,
        },
        promoName: 'comic-creator',
      });

      expect(fetchStub.calledOnce).to.be.true;
      const [url] = fetchStub.firstCall.args;
      expect(url).to.equal(
        'https://admin.da.live/list/adobecom/aso/en-us/products-redesign/adobe-express/apple/2026/q1/may/store-updates/promos/comic-creator',
      );
      expect(result).to.deep.equal([
        { value: 'default', label: 'Default' },
        { value: 'alt', label: 'Alt' },
      ]);
    });
  });
});
