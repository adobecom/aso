import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';
import sinon from 'sinon';
import { buildLanguageIndex } from '../../../../../tools/aso-dashboard/js/lib/translate-paths.js';
import { collectMediaExportData } from '../../../../../tools/aso-dashboard/js/import-export/media-collect.js';

describe('import-export-media-collect', () => {
  let schema;
  let translateData;
  let languages;
  let mediaAssetsHtml;
  let fetchPage;

  beforeEach(async () => {
    schema = JSON.parse(await readFile({ path: '../../mocks/block-schema.json' }));
    translateData = JSON.parse(await readFile({ path: '../../mocks/translate.json' }));
    languages = buildLanguageIndex(translateData.languages.data, translateData);
    mediaAssetsHtml = `<div class="aso-app media-assets apple">
      <div><div><p>Screenshot iPhone 1</p></div>
        <div><picture><img src="https://content.da.live/x/y/firefly1.jpeg" loading="lazy"></picture></div>
      </div>
      <div><div><p>Video 1</p></div><div></div></div>
    </div>`;

    fetchPage = sinon.stub().callsFake(async (_org, _repo, pagePath) => ({
      html: pagePath.includes('images/assets') ? mediaAssetsHtml : '',
      htmlFound: pagePath.includes('images/assets'),
    }));
  });

  afterEach(() => {
    sinon.restore();
  });

  it('collects an image entry only for the field that has a dropped image', async () => {
    const german = languages.find((lang) => lang.name === 'German');
    const entries = await collectMediaExportData({
      org: 'test-org',
      repo: 'test-repo',
      token: 'token',
      schema,
      products: ['adobe-express'],
      languages: [german],
      devices: ['apple'],
      year: '2026',
      quarter: 'q1',
      month: 'may',
      productsPath: 'products-redesign',
      fetchPage,
    });

    expect(entries).to.have.length(1);
    expect(entries[0]).to.deep.equal({
      product: 'adobe-express',
      device: 'apple',
      language: german,
      fieldName: 'Screenshot iPhone 1',
      src: 'https://content.da.live/x/y/firefly1.jpeg',
    });
  });

  it('fetches the images/assets and videos/assets page leaves, not metadata pages', async () => {
    const german = languages.find((lang) => lang.name === 'German');
    await collectMediaExportData({
      org: 'test-org',
      repo: 'test-repo',
      token: 'token',
      schema,
      products: ['adobe-express'],
      languages: [german],
      devices: ['apple'],
      year: '2026',
      quarter: 'q1',
      month: 'may',
      productsPath: 'products-redesign',
      fetchPage,
    });

    const fetchedPaths = fetchPage.getCalls().map((call) => call.args[2]);
    expect(fetchedPaths.some((path) => path.includes('images/assets'))).to.be.true;
    expect(fetchedPaths.some((path) => path.includes('videos/assets'))).to.be.true;
  });

  it('returns no entries when the page is not found', async () => {
    const german = languages.find((lang) => lang.name === 'German');
    const notFoundFetch = sinon.stub().resolves({ html: '', htmlFound: false });
    const entries = await collectMediaExportData({
      org: 'test-org',
      repo: 'test-repo',
      token: 'token',
      schema,
      products: ['adobe-express'],
      languages: [german],
      devices: ['apple'],
      year: '2026',
      quarter: 'q1',
      month: 'may',
      productsPath: 'products-redesign',
      fetchPage: notFoundFetch,
    });

    expect(entries).to.deep.equal([]);
  });

  describe('selection.fieldsByDeviceBlock', () => {
    it('excludes a media-assets field that is unchecked for that device', async () => {
      const german = languages.find((lang) => lang.name === 'German');
      const entries = await collectMediaExportData({
        org: 'test-org',
        repo: 'test-repo',
        token: 'token',
        schema,
        products: ['adobe-express'],
        languages: [german],
        devices: ['apple'],
        year: '2026',
        quarter: 'q1',
        month: 'may',
        productsPath: 'products-redesign',
        fetchPage,
        selection: { fieldsByDeviceBlock: { 'apple:media-assets': ['video1'] } },
      });

      expect(entries).to.deep.equal([]);
    });

    it('fetches every field when the device:blockType key is absent from the selection', async () => {
      const german = languages.find((lang) => lang.name === 'German');
      const entries = await collectMediaExportData({
        org: 'test-org',
        repo: 'test-repo',
        token: 'token',
        schema,
        products: ['adobe-express'],
        languages: [german],
        devices: ['apple'],
        year: '2026',
        quarter: 'q1',
        month: 'may',
        productsPath: 'products-redesign',
        fetchPage,
        selection: { fieldsByDeviceBlock: {} },
      });

      expect(entries).to.have.length(1);
      expect(entries[0].fieldName).to.equal('Screenshot iPhone 1');
    });
  });
});
