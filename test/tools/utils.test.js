import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';
import sinon from 'sinon';
import {
  fetchLanguages,
  filterLanguagesForApp,
  normalizeEnv,
  resolveStorePublishApi,
} from '../../tools/utils.js';

const expectedLanguages = [
  {
    code: 'en',
    translateCode: 'en',
    label: 'English',
    name: 'English',
    sourcePath: '/',
    localizedPath: '/',
    isManagedLocale: true,
  },
  {
    code: 'uk',
    translateCode: 'en-GB',
    label: 'English - British',
    name: 'English - British',
    sourcePath: '/source/en-gb',
    localizedPath: '/uk',
    isManagedLocale: true,
  },
  {
    code: 'de-de',
    translateCode: 'de',
    label: 'German',
    name: 'German',
    sourcePath: '/source/en-de',
    localizedPath: '/de-de',
    isManagedLocale: true,
  },
  {
    code: 'ro',
    translateCode: 'ro',
    label: 'Romanian',
    name: 'Romanian',
    sourcePath: '/',
    localizedPath: '/ro',
    isManagedLocale: false,
  },
];

describe('fetchLanguages', () => {
  let fetchStub;
  let translateData;

  beforeEach(async () => {
    translateData = JSON.parse(await readFile({ path: './aso-dashboard/mocks/translate.json' }));
    fetchStub = sinon.stub(window, 'fetch');
  });

  afterEach(() => {
    fetchStub.restore();
  });

  it('returns language options from translate.json', async () => {
    fetchStub.resolves({ ok: true, json: async () => translateData });

    const languages = await fetchLanguages({
      context: { org: 'adobecom', repo: 'aso' },
      token: 'token',
      configFile: 'utils-fetch-a.json',
    });

    expect(languages).to.deep.equal(expectedLanguages);
  });

  it('returns empty array when translate.json fetch fails', async () => {
    fetchStub.resolves({ ok: false, status: 404 });

    const languages = await fetchLanguages({
      context: { org: 'adobecom', repo: 'aso' },
      token: 'token',
      configFile: 'utils-fetch-b.json',
    });

    expect(languages).to.deep.equal([]);
  });
});

describe('store-publish config helpers', () => {
  const config = {
    config: {
      data: [
        { key: 'store-publish.api', value: 'https://prod.example.test/api/' },
        { key: 'store-publish.api.stage', value: 'https://stage.example.test/api' },
        { key: 'store-publish.api.dev', value: ' https://dev.example.test/api ' },
      ],
    },
  };

  it('normalizes env by lowercasing and removing spaces', () => {
    expect(normalizeEnv(' St Age ')).to.equal('stage');
    expect(normalizeEnv(undefined)).to.equal('');
  });

  it('resolves the api for the default and env-specific keys', () => {
    expect(resolveStorePublishApi(config)).to.equal('https://prod.example.test/api');
    expect(resolveStorePublishApi(config, 'Stage')).to.equal('https://stage.example.test/api');
    expect(resolveStorePublishApi(config, ' DEV ')).to.equal('https://dev.example.test/api');
  });

  it('throws when the key is missing', () => {
    expect(() => resolveStorePublishApi(config, 'qa')).to.throw('store-publish.api.qa');
    expect(() => resolveStorePublishApi({})).to.throw('store-publish.api');
  });

  it('filters languages for the app and platform, leaving unlisted apps untouched', () => {
    const languages = [{ translateCode: 'en' }, { translateCode: 'de' }, { translateCode: 'pt-PT' }];
    const rows = [{ app: 'Firefly', platform: 'google', languages: 'en, DE' }];
    expect(filterLanguagesForApp(languages, rows, 'firefly', 'google').map((l) => l.translateCode))
      .to.deep.equal(['en', 'de']);
    expect(filterLanguagesForApp(languages, rows, 'firefly', 'apple')).to.equal(languages);
    expect(filterLanguagesForApp(languages, rows, 'psx', 'google')).to.equal(languages);
  });
});
