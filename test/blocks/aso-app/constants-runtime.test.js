import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';
import sinon from 'sinon';
import {
  constantsPathFromListingPath,
  getLocaleCodeFromPath,
  languageNameForPath,
  loadConstantsValuesForPage,
  localeCodesFromTranslateEntry,
  matchTranslateLanguage,
  resetConstantsRuntimeCache,
  applyConstantsToDisplay,
  stripLanguagePrefixFromPagePath,
  stripLocaleFromPagePath,
} from '../../../blocks/aso-app/constants-runtime.js';

const translateLanguages = [
  {
    name: 'English',
    location: '/langstore/en',
    locales: 'en, en-us, /ca',
  },
  {
    name: 'Korean',
    location: '/langstore/ko',
    locales: 'ko',
  },
];

describe('constants-runtime', () => {
  let fetchStub;
  let appleConstants;

  before(async () => {
    appleConstants = await readFile({ path: './mocks/apple-constants.html' });
  });

  beforeEach(() => {
    resetConstantsRuntimeCache();
    fetchStub = sinon.stub(window, 'fetch');
    fetchStub.withArgs('/.da/block-schema.json').resolves({ ok: false });
    fetchStub.withArgs('/.da/translate.json').resolves({
      ok: true,
      json: async () => ({ languages: { data: translateLanguages } }),
    });
  });

  afterEach(() => {
    fetchStub.restore();
    resetConstantsRuntimeCache();
  });

  describe('paths and locale', () => {
    it('reads the first path segment as a locale code', () => {
      expect(getLocaleCodeFromPath('/ko/products/apple')).to.equal('ko');
      expect(getLocaleCodeFromPath('/en-us/products/apple')).to.equal('en-us');
      expect(getLocaleCodeFromPath('/')).to.equal(undefined);
    });

    it('matches translate.json by location for langstore paths', () => {
      const match = matchTranslateLanguage('/langstore/ko/products/apple', translateLanguages);
      expect(match.lang.name).to.equal('Korean');
      expect(match.prefix).to.equal('/langstore/ko');
      expect(stripLanguagePrefixFromPagePath('/langstore/ko/products/apple', match.prefix))
        .to.equal('/products/apple');
      expect(constantsPathFromListingPath('/langstore/ko/products/apple.html', translateLanguages))
        .to.equal('/products/apple-constants');
      expect(languageNameForPath('/langstore/ko/products/apple', translateLanguages)).to.equal('Korean');
    });

    it('matches translate.json by locales for regional paths', () => {
      expect(localeCodesFromTranslateEntry('en, en-us, /ca')).to.deep.equal(['en', 'en-us', 'ca']);
      expect(languageNameForPath('/ko/products/apple', translateLanguages)).to.equal('Korean');
      expect(languageNameForPath('/en-us/products/apple', translateLanguages)).to.equal('English');
      expect(languageNameForPath('/ca/products/apple', translateLanguages)).to.equal('English');
      expect(stripLocaleFromPagePath('/ko/products/apple.html')).to.equal('/products/apple');
      expect(constantsPathFromListingPath('/ca/products/apple.html', translateLanguages))
        .to.equal('/products/apple-constants');
    });

    it('uses the full path for locale-free source listings', () => {
      expect(constantsPathFromListingPath('/products/acrobat-reader/apple', translateLanguages))
        .to.equal('/products/acrobat-reader/apple-constants');
      expect(constantsPathFromListingPath('/products/acrobat-reader/apple', null))
        .to.equal('/products/acrobat-reader/apple-constants');
    });

    it('treats target-preview paths as langstore using translate.json location', () => {
      const languages = [{
        name: 'French',
        location: '/langstore/fr',
        locales: 'fr',
      }];
      expect(matchTranslateLanguage('/target-preview/fr/products/apple', languages).lang.name)
        .to.equal('French');
      expect(matchTranslateLanguage('/target-preview/fr/products/apple', languages).prefix)
        .to.equal('/langstore/fr');
      expect(constantsPathFromListingPath('/target-preview/fr/products/apple', languages))
        .to.equal('/products/apple-constants');
    });
  });

  describe('loadConstantsValuesForPage', () => {
    it('loads constants for regional listing paths', async () => {
      fetchStub.withArgs('/products/apple-constants').resolves({
        ok: true,
        text: async () => appleConstants,
      });

      const values = await loadConstantsValuesForPage({
        pathname: '/ko/products/apple',
        fetch: fetchStub,
      });

      expect(values['legal-terms']).to.include('[선택적 액세스 권한]');
    });

    it('loads constants for langstore listing paths', async () => {
      fetchStub.withArgs('/products/apple-constants').resolves({
        ok: true,
        text: async () => appleConstants,
      });

      const values = await loadConstantsValuesForPage({
        pathname: '/langstore/ko/products/apple',
        fetch: fetchStub,
      });

      expect(values['legal-terms']).to.include('[선택적 액세스 권한]');
    });

    it('loads constants for target-preview listing paths', async () => {
      resetConstantsRuntimeCache();
      fetchStub.withArgs('/.da/translate.json').resolves({
        ok: true,
        json: async () => ({
          languages: {
            data: [{ name: 'Korean', location: '/langstore/ko', locales: 'ko' }],
          },
        }),
      });
      fetchStub.withArgs('/products/apple-constants').resolves({
        ok: true,
        text: async () => appleConstants,
      });

      const values = await loadConstantsValuesForPage({
        pathname: '/target-preview/ko/products/apple',
        fetch: fetchStub,
      });

      expect(values['legal-terms']).to.include('[선택적 액세스 권한]');
    });

    it('loads constants for locale-free source listing paths', async () => {
      fetchStub.withArgs('/products/acrobat-reader/apple-constants').resolves({
        ok: true,
        text: async () => appleConstants,
      });

      const values = await loadConstantsValuesForPage({
        pathname: '/products/acrobat-reader/apple',
        fetch: fetchStub,
      });

      expect(values['legal-terms']).to.include('[Optional access permissions]');
    });

    it('returns empty values when the constants file is missing', async () => {
      fetchStub.withArgs('/products/apple-constants').resolves({ ok: false, status: 404 });

      const values = await loadConstantsValuesForPage({
        pathname: '/en/products/apple',
        fetch: fetchStub,
      });

      expect(values).to.deep.equal({});
    });

    it('fetches translate.json only once across concurrent page loads', async () => {
      fetchStub.withArgs('/products/apple-constants').resolves({
        ok: true,
        text: async () => appleConstants,
      });
      fetchStub.withArgs('/products/firefly-constants').resolves({
        ok: true,
        text: async () => appleConstants,
      });

      await Promise.all([
        loadConstantsValuesForPage({ pathname: '/ko/products/apple', fetch: fetchStub }),
        loadConstantsValuesForPage({ pathname: '/langstore/ko/products/firefly', fetch: fetchStub }),
      ]);

      expect(fetchStub.withArgs('/.da/translate.json').callCount).to.equal(1);
    });
  });

  describe('display guard', () => {
    it('does not rewrite display when preview substitution is disabled', () => {
      const dataEl = document.createElement('div');
      dataEl.innerHTML = '<p>{{legal-terms}}</p>';
      applyConstantsToDisplay(dataEl, { 'legal-terms': '<p>LEGAL</p>' }, { resolveForDisplay: false });
      expect(dataEl.innerHTML).to.include('{{legal-terms}}');
    });
  });
});
