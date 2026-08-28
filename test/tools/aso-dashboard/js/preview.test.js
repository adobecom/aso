import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';
import sinon from 'sinon';
import { buildLanguageIndex } from '../../../../tools/aso-dashboard/js/lib/translate-paths.js';
import {
  buildPreviewSections,
  probeSectionsExistence,
  toggleExpandAllSections,
} from '../../../../tools/aso-dashboard/js/preview.js';

describe('preview', () => {
  let schema;
  let sheetMap;
  let english;

  beforeEach(async () => {
    schema = JSON.parse(await readFile({ path: '../mocks/block-schema.json' }));
    sheetMap = JSON.parse(await readFile({ path: '../mocks/sheet-to-block-map.json' }));
    const translateData = JSON.parse(await readFile({ path: '../mocks/translate.json' }));
    const languages = buildLanguageIndex(translateData.languages.data, translateData);
    english = languages.find((language) => language.name === 'English');
  });

  afterEach(() => {
    sinon.restore();
  });

  const releasePeriod = { year: '2026', quarter: 'q3', month: 'august' };

  describe('buildPreviewSections', () => {
    it('returns one section per distinct page leaf across listing, images-videos, and media-assets', () => {
      const sections = buildPreviewSections(schema, sheetMap, {
        product: 'firefly',
        language: english,
        device: 'apple',
        releasePeriod,
        storeType: 'store-updates',
      });

      const leaves = sections.map((section) => section.pageLeaf);
      expect(leaves).to.include.members([
        'metadata/app-name',
        'metadata/subtitle',
        'metadata/promotional-text',
        'metadata/description',
        'whats-new',
        'images/copy',
        'videos/copy',
        'images/assets',
        'videos/assets',
      ]);
      expect(new Set(leaves).size).to.equal(leaves.length);
    });

    it('labels each section with its block type and page leaf', () => {
      const sections = buildPreviewSections(schema, sheetMap, {
        product: 'firefly',
        language: english,
        device: 'apple',
        releasePeriod,
        storeType: 'store-updates',
      });

      const metadataSection = sections.find((section) => section.pageLeaf === 'metadata/subtitle');
      expect(metadataSection.label).to.equal('Metadata: metadata/subtitle');

      const mediaAssetSection = sections.find((section) => section.pageLeaf === 'images/assets');
      expect(mediaAssetSection.label).to.equal('Media Assets: images/assets');
    });

    it('does not duplicate a page leaf shared by multiple fields (e.g. every screenshot copy on one page)', () => {
      const sections = buildPreviewSections(schema, sheetMap, {
        product: 'firefly',
        language: english,
        device: 'google',
        releasePeriod,
        storeType: 'store-updates',
      });

      expect(sections.filter((section) => section.pageLeaf === 'images/copy')).to.have.length(1);
    });

    it('returns an empty array when the scope is incomplete', () => {
      expect(buildPreviewSections(schema, sheetMap, {
        product: '',
        language: english,
        device: 'apple',
        releasePeriod,
        storeType: 'store-updates',
      })).to.deep.equal([]);

      expect(buildPreviewSections(schema, sheetMap, {
        product: 'firefly',
        language: english,
        device: 'apple',
        releasePeriod: { year: '', quarter: '', month: '' },
        storeType: 'store-updates',
      })).to.deep.equal([]);
    });

    it('returns an empty array for store-tests scope with no test name selected', () => {
      expect(buildPreviewSections(schema, sheetMap, {
        product: 'firefly',
        language: english,
        device: 'apple',
        releasePeriod,
        storeType: 'store-tests',
        testName: undefined,
      })).to.deep.equal([]);
    });

    it('includes a store-tests page path when a test name is given', () => {
      const sections = buildPreviewSections(schema, sheetMap, {
        product: 'firefly',
        language: english,
        device: 'apple',
        releasePeriod,
        storeType: 'store-tests',
        testName: 'icon-test-a',
      });

      expect(sections.length).to.be.above(0);
      expect(sections.every((section) => section.contentPath.includes('store-tests/icon-test-a'))).to.be.true;
    });

    it('returns an empty array for cpp scope with no name selected', () => {
      expect(buildPreviewSections(schema, sheetMap, {
        product: 'firefly',
        language: english,
        device: 'apple',
        releasePeriod,
        storeType: 'cpp',
        testName: undefined,
      })).to.deep.equal([]);
    });

    it('includes a cpp page path when a name is given', () => {
      const sections = buildPreviewSections(schema, sheetMap, {
        product: 'firefly',
        language: english,
        device: 'apple',
        releasePeriod,
        storeType: 'cpp',
        testName: 'summer-campaign',
      });

      expect(sections.length).to.be.above(0);
      expect(sections.every((section) => section.contentPath.includes('cpp/summer-campaign'))).to.be.true;
    });
  });

  describe('probeSectionsExistence', () => {
    it('keeps only sections whose page actually exists in DA', async () => {
      const sections = [
        { label: 'Metadata: metadata/app-name', pageLeaf: 'metadata/app-name', contentPath: '/a' },
        { label: 'Metadata: metadata/subtitle', pageLeaf: 'metadata/subtitle', contentPath: '/b' },
      ];
      const fetchStub = sinon.stub(window, 'fetch');
      fetchStub.withArgs(sinon.match((url) => url.includes('/a'))).resolves({ ok: true, status: 200, text: async () => '<html></html>' });
      fetchStub.withArgs(sinon.match((url) => url.includes('/b'))).resolves({ ok: false, status: 404 });

      const result = await probeSectionsExistence('adobecom', 'aso', 'token', sections);

      expect(result).to.have.length(1);
      expect(result[0].pageLeaf).to.equal('metadata/app-name');
    });

    it('returns an empty array when no sections exist', async () => {
      sinon.stub(window, 'fetch').resolves({ ok: false, status: 404 });
      const result = await probeSectionsExistence('adobecom', 'aso', 'token', [
        { label: 'Metadata: metadata/app-name', pageLeaf: 'metadata/app-name', contentPath: '/a' },
      ]);
      expect(result).to.deep.equal([]);
    });
  });

  describe('toggleExpandAllSections', () => {
    afterEach(() => {
      document.body.innerHTML = '';
    });

    it('opens every collapsed preview block in one call', () => {
      document.body.innerHTML = `
        <div id="preview-frame-container">
          <details class="preview-block"></details>
          <details class="preview-block"></details>
        </div>
      `;
      toggleExpandAllSections();
      const blocks = [...document.querySelectorAll('.preview-block')];
      expect(blocks.every((block) => block.open)).to.be.true;
    });

    it('closes every block again on a second call once all are open', () => {
      document.body.innerHTML = `
        <div id="preview-frame-container">
          <details class="preview-block" open></details>
          <details class="preview-block" open></details>
        </div>
      `;
      toggleExpandAllSections();
      const blocks = [...document.querySelectorAll('.preview-block')];
      expect(blocks.every((block) => !block.open)).to.be.true;
    });

    it('does nothing when there are no preview blocks', () => {
      document.body.innerHTML = '<div id="preview-frame-container"></div>';
      expect(() => toggleExpandAllSections()).to.not.throw();
    });
  });
});
