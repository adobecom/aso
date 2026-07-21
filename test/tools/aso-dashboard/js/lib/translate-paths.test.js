import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';
import sinon from 'sinon';
import {
  buildLanguageIndex,
  fetchLanguageIndex,
  getLanguageByName,
} from '../../../../../tools/aso-dashboard/js/lib/translate-paths.js';

const expectedLanguageIndex = [
  {
    name: 'English',
    code: 'en',
    sourcePath: '/',
    localizedPath: '/',
    localizedCode: 'en',
    isManagedLocale: true,
  },
  {
    name: 'English - British',
    code: 'en-GB',
    sourcePath: '/source/en-gb',
    localizedPath: '/uk',
    localizedCode: 'uk',
    isManagedLocale: true,
  },
  {
    name: 'German',
    code: 'de',
    sourcePath: '/source/en-de',
    localizedPath: '/de-de',
    localizedCode: 'de-de',
    isManagedLocale: true,
  },
  {
    name: 'Romanian',
    code: 'ro',
    sourcePath: '/',
    localizedPath: '/ro',
    localizedCode: 'ro',
    isManagedLocale: false,
  },
];

describe('translate-paths', () => {
  let translateData;
  let languages;

  beforeEach(async () => {
    translateData = JSON.parse(await readFile({ path: '../../mocks/translate.json' }));
    languages = translateData.languages.data;
  });

  describe('buildLanguageIndex', () => {
    it('returns empty array when languages are missing', () => {
      expect(buildLanguageIndex([], translateData)).to.deep.equal([]);
    });

    it('builds language index from translate.json', () => {
      expect(buildLanguageIndex(languages, translateData)).to.deep.equal(expectedLanguageIndex);
    });

    it('omits rows without location', () => {
      const withBadRow = [
        ...languages,
        { name: 'Bad', code: 'xx', source: '/source/en-xx' },
      ];
      expect(buildLanguageIndex(withBadRow, translateData)).to.deep.equal(expectedLanguageIndex);
    });

    it('omits rows without name', () => {
      const withBadRow = [
        ...languages,
        { code: 'xx', location: '/xx', source: '/source/en-xx' },
      ];
      expect(buildLanguageIndex(withBadRow, translateData)).to.deep.equal(expectedLanguageIndex);
    });

    it('normalizes path prefixes on language entries', () => {
      const withSlashes = [{
        name: 'Test',
        code: 'te',
        location: 'te-te/',
        source: 'source/en-te',
      }];
      expect(buildLanguageIndex(withSlashes, translateData)).to.deep.equal([{
        name: 'Test',
        code: 'te',
        sourcePath: '/source/en-te',
        localizedPath: '/te-te',
        localizedCode: 'te-te',
        isManagedLocale: false,
      }]);
    });
  });

  describe('getLanguageByName', () => {
    it('returns language by translate.json name', () => {
      expect(getLanguageByName('English - British', languages, translateData)).to.deep.equal(
        expectedLanguageIndex[1],
      );
    });

    it('returns null for unknown name', () => {
      expect(getLanguageByName('Nope', languages, translateData)).to.equal(null);
    });

    it('returns null for blank name', () => {
      expect(getLanguageByName('  ', languages, translateData)).to.equal(null);
    });
  });

  describe('fetchLanguageIndex', () => {
    let fetchImpl;

    beforeEach(() => {
      fetchImpl = sinon.stub();
    });

    it('builds index from translate.json via fetchImpl', async () => {
      fetchImpl.resolves(translateData);

      const index = await fetchLanguageIndex({
        context: { org: 'adobecom', repo: 'aso' },
        token: 'token',
        configFile: 'translate-fetch-a.json',
        fetchImpl,
      });

      expect(fetchImpl.calledOnce).to.be.true;
      expect(fetchImpl.firstCall.args[0]).to.equal(
        'https://admin.da.live/source/adobecom/aso/.da/translate-fetch-a.json',
      );
      expect(index).to.deep.equal(expectedLanguageIndex);
    });

    it('returns cached index on subsequent calls', async () => {
      fetchImpl.resolves(translateData);

      const params = {
        context: { org: 'adobecom', repo: 'aso' },
        token: 'token',
        configFile: 'translate-fetch-b.json',
        fetchImpl,
      };

      await fetchLanguageIndex(params);
      await fetchLanguageIndex(params);

      expect(fetchImpl.calledOnce).to.be.true;
    });

    it('returns empty array when fetch fails', async () => {
      fetchImpl.resolves(null);

      const index = await fetchLanguageIndex({
        context: { org: 'adobecom', repo: 'aso' },
        token: 'token',
        configFile: 'translate-fetch-c.json',
        fetchImpl,
      });

      expect(index).to.deep.equal([]);
    });
  });
});
