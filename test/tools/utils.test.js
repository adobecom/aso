import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';
import sinon from 'sinon';
import { fetchLanguages } from '../../tools/utils.js';

const expectedLanguages = [
  {
    code: 'en',
    label: 'English',
    name: 'English',
    sourcePath: '/',
    localizedPath: '/',
    isManagedLocale: true,
  },
  {
    code: 'uk',
    label: 'English - British',
    name: 'English - British',
    sourcePath: '/source/en-gb',
    localizedPath: '/uk',
    isManagedLocale: true,
  },
  {
    code: 'de-de',
    label: 'German',
    name: 'German',
    sourcePath: '/source/en-de',
    localizedPath: '/de-de',
    isManagedLocale: true,
  },
  {
    code: 'ro',
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
