import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { readFile } from '@web/test-runner-commands';
import {
  applyDevices,
  applyLanguages,
  applyProduct,
  applyReleasePeriod,
  applyScope,
  applyStoreType,
  applyTestName,
  devicesFromParsed,
  fieldKeysWithContent,
  findMissingPromos,
  populateProductDropdown,
  refreshMediaAssetsAvailability,
  renderExportSummary,
  restrictFieldScopeToFile,
  restrictPromoCheckboxesToFile,
} from '../../../../tools/aso-dashboard/js/export.js';
import { refreshFieldCheckboxes } from '../../../../tools/aso-dashboard/js/field-scope-settings.js';

describe('export "load scope from file" helpers', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('applyProduct', () => {
    it('selects the product matching the file', () => {
      document.body.innerHTML = `
        <select id="export-product">
          <option value="product-a">Product A</option>
          <option value="product-b">Product B</option>
        </select>
      `;
      applyProduct('product-b');
      expect(document.getElementById('export-product').value).to.equal('product-b');
    });
  });

  describe('populateProductDropdown', () => {
    it('renders a placeholder option first, so nothing is auto-selected', () => {
      document.body.innerHTML = '<select id="export-product"><option value="">Loading products…</option></select>';
      populateProductDropdown([
        { value: 'product-a', label: 'Product A' },
        { value: 'product-b', label: 'Product B' },
      ]);

      const select = document.getElementById('export-product');
      expect(select.value).to.equal('');
      expect(select.options).to.have.length(3);
      expect(select.options[1].value).to.equal('product-a');
      expect(select.options[2].value).to.equal('product-b');
    });

    it('shows an empty-state option when no products are found', () => {
      document.body.innerHTML = '<select id="export-product"></select>';
      populateProductDropdown([]);
      expect(document.getElementById('export-product').textContent).to.include('No products found');
    });
  });

  describe('applyLanguages', () => {
    it('checks languages present in the file and reports names with no matching checkbox', () => {
      document.body.innerHTML = `
        <input type="checkbox" class="language-checkbox" value="English">
        <input type="checkbox" class="language-checkbox" value="German" checked>
        <input type="checkbox" class="language-checkbox" value="French">
      `;
      const missing = applyLanguages(['English', 'German', 'Klingon']);
      expect(document.querySelector('[value="English"]').checked).to.be.true;
      expect(document.querySelector('[value="German"]').checked).to.be.true;
      expect(document.querySelector('[value="French"]').checked).to.be.false;
      expect(missing).to.deep.equal(['Klingon']);
    });
  });

  describe('applyDevices', () => {
    it('checks only the devices present in the set', () => {
      document.body.innerHTML = `
        <input type="checkbox" id="device-apple" checked>
        <input type="checkbox" id="device-google">
      `;
      applyDevices(new Set(['google']));
      expect(document.getElementById('device-apple').checked).to.be.false;
      expect(document.getElementById('device-google').checked).to.be.true;
    });
  });

  describe('devicesFromParsed', () => {
    it('derives devices from metadata, imagesVideos, and promos', () => {
      const parsed = {
        metadata: { apple: [{ fieldName: 'App Name' }], google: [] },
        imagesVideos: { apple: [], google: [] },
        promos: [{ promoName: 'p', devices: { google: { variants: { default: {} } } } }],
      };
      expect(devicesFromParsed(parsed)).to.deep.equal(new Set(['apple', 'google']));
    });

    it('returns an empty set when nothing has content', () => {
      const parsed = {
        metadata: { apple: [], google: [] },
        imagesVideos: { apple: [], google: [] },
        promos: [],
      };
      expect(devicesFromParsed(parsed)).to.deep.equal(new Set());
    });
  });

  describe('applyReleasePeriod', () => {
    it('sets year/quarter/month selects to matching option values', () => {
      document.body.innerHTML = `
        <select id="release-period-year"><option value="2025">2025</option><option value="2026">2026</option></select>
        <select id="release-period-quarter"><option value="q1">Q1</option><option value="q3">Q3</option></select>
        <select id="release-period-month"><option value="may">May</option><option value="august">August</option></select>
      `;
      applyReleasePeriod({ year: '2026', quarter: 'q3', month: 'august' });
      expect(document.getElementById('release-period-year').value).to.equal('2026');
      expect(document.getElementById('release-period-quarter').value).to.equal('q3');
      expect(document.getElementById('release-period-month').value).to.equal('august');
    });
  });

  describe('applyStoreType', () => {
    it('checks the store-tests radio and reveals the store-tests fields', () => {
      document.body.innerHTML = `
        <input type="radio" name="store-type" id="store-type-updates" value="store-updates" checked>
        <input type="radio" name="store-type" id="store-type-tests" value="store-tests">
        <div id="store-tests-fields" class="hidden"></div>
      `;
      applyStoreType('store-tests');
      expect(document.getElementById('store-type-tests').checked).to.be.true;
      expect(document.getElementById('store-type-updates').checked).to.be.false;
      expect(document.getElementById('store-tests-fields').classList.contains('hidden')).to.be.false;
    });

    it('checks the store-updates radio and hides the store-tests fields', () => {
      document.body.innerHTML = `
        <input type="radio" name="store-type" id="store-type-updates" value="store-updates">
        <input type="radio" name="store-type" id="store-type-tests" value="store-tests" checked>
        <div id="store-tests-fields"></div>
      `;
      applyStoreType('store-updates');
      expect(document.getElementById('store-type-updates').checked).to.be.true;
      expect(document.getElementById('store-tests-fields').classList.contains('hidden')).to.be.true;
    });

    it('checks the cpp radio and reveals the shared instance-name fields', () => {
      document.body.innerHTML = `
        <input type="radio" name="store-type" id="store-type-updates" value="store-updates" checked>
        <input type="radio" name="store-type" id="store-type-tests" value="store-tests">
        <input type="radio" name="store-type" id="store-type-cpp" value="cpp">
        <div id="store-tests-fields" class="hidden">
          <span id="store-tests-label">Experiments</span>
        </div>
      `;
      applyStoreType('cpp');
      expect(document.getElementById('store-type-cpp').checked).to.be.true;
      expect(document.getElementById('store-type-updates').checked).to.be.false;
      expect(document.getElementById('store-type-tests').checked).to.be.false;
      expect(document.getElementById('store-tests-fields').classList.contains('hidden')).to.be.false;
      expect(document.getElementById('store-tests-label').textContent).to.equal('CPP campaigns');
    });
  });

  describe('applyTestName', () => {
    it('checks only the matching test checkbox', () => {
      document.body.innerHTML = `
        <input type="checkbox" class="store-test-checkbox" value="icon-test-a" checked>
        <input type="checkbox" class="store-test-checkbox" value="icon-test-b">
        <span id="store-tests-count"></span>
      `;
      applyTestName('icon-test-b');
      expect(document.querySelector('[value="icon-test-a"]').checked).to.be.false;
      expect(document.querySelector('[value="icon-test-b"]').checked).to.be.true;
    });

    it('does nothing when testName is empty', () => {
      document.body.innerHTML = '<input type="checkbox" class="store-test-checkbox" value="icon-test-a" checked>';
      applyTestName('');
      expect(document.querySelector('[value="icon-test-a"]').checked).to.be.true;
    });
  });

  describe('applyScope', () => {
    it('checks scope boxes based on which sheets had content', () => {
      document.body.innerHTML = `
        <input type="checkbox" id="export-scope-listing">
        <input type="checkbox" id="export-scope-promos" checked>
        <input type="checkbox" id="export-scope-images-videos">
        <details id="export-promo-fields" open><span id="export-promo-count"></span></details>
      `;
      applyScope({
        metadata: { apple: [{ fieldName: 'App Name' }], google: [] },
        promos: [],
        imagesVideos: { apple: [], google: [{ fieldName: 'Screenshot' }] },
      });
      expect(document.getElementById('export-scope-listing').checked).to.be.true;
      expect(document.getElementById('export-scope-promos').checked).to.be.false;
      expect(document.getElementById('export-scope-images-videos').checked).to.be.true;
      expect(document.getElementById('export-promo-fields').open).to.be.false;
      expect(document.getElementById('export-promo-count').textContent).to.equal('(not included)');
    });
  });

  describe('restrictPromoCheckboxesToFile', () => {
    function buildPromoDom() {
      document.body.innerHTML = `
        <input type="checkbox" class="promo-name-checkbox" value="promo-a" data-device="apple" checked>
        <input type="checkbox" class="promo-variant-checkbox" data-promo="promo-a" data-device="apple" value="default" checked>
        <input type="checkbox" class="promo-variant-checkbox" data-promo="promo-a" data-device="apple" value="v2" checked>
        <input type="checkbox" class="promo-name-checkbox" value="promo-b" data-device="google" checked>
        <input type="checkbox" class="promo-variant-checkbox" data-promo="promo-b" data-device="google" value="default" checked>
      `;
    }

    it('checks only the promo/device/variant combinations present in the file', () => {
      buildPromoDom();
      restrictPromoCheckboxesToFile([
        { promoName: 'promo-a', devices: { apple: { variants: { default: {} } } } },
      ]);

      expect(document.querySelector('.promo-name-checkbox[value="promo-a"]').checked).to.be.true;
      expect(document.querySelector('.promo-name-checkbox[value="promo-b"]').checked).to.be.false;
      expect(document.querySelector('.promo-variant-checkbox[value="default"][data-promo="promo-a"]').checked).to.be.true;
      expect(document.querySelector('.promo-variant-checkbox[value="v2"]').checked).to.be.false;
      expect(document.querySelector('.promo-variant-checkbox[data-promo="promo-b"]').checked).to.be.false;
    });

    it('unchecks everything when the file has no promos', () => {
      buildPromoDom();
      restrictPromoCheckboxesToFile([]);
      document.querySelectorAll('.promo-name-checkbox, .promo-variant-checkbox').forEach((checkbox) => {
        expect(checkbox.checked).to.be.false;
      });
    });
  });

  describe('findMissingPromos', () => {
    it('reports promo/device pairs from the file with no live checkbox', () => {
      document.body.innerHTML = `
        <input type="checkbox" class="promo-name-checkbox" value="promo-a" data-device="apple">
      `;
      const missing = findMissingPromos([
        { promoName: 'promo-a', devices: { apple: { variants: {} } } },
        { promoName: 'deleted-promo', devices: { google: { variants: {} } } },
      ]);
      expect(missing).to.deep.equal(['deleted-promo (google)']);
    });
  });

  describe('fieldKeysWithContent', () => {
    const schemaFields = [
      { fieldName: 'App Name', fieldKey: 'name' },
      { fieldName: 'Subtitle', fieldKey: 'subtitle' },
    ];

    it('keeps only fields with a non-empty englishSource in any language', () => {
      const fields = [
        { fieldName: 'App Name', englishSource: { English: '', German: 'Foto' } },
        { fieldName: 'Subtitle', englishSource: { English: '' } },
      ];
      expect(fieldKeysWithContent(fields, schemaFields)).to.deep.equal(['name']);
    });

    it('returns an empty array when nothing has content, or fields is missing', () => {
      expect(fieldKeysWithContent([{ fieldName: 'Subtitle', englishSource: {} }], schemaFields))
        .to.deep.equal([]);
      expect(fieldKeysWithContent(undefined, schemaFields)).to.deep.equal([]);
    });
  });

  describe('restrictFieldScopeToFile', () => {
    let schema;
    let sheetMap;

    beforeEach(async () => {
      schema = JSON.parse(await readFile({ path: '../mocks/block-schema.json' }));
      sheetMap = JSON.parse(await readFile({ path: '../mocks/sheet-to-block-map.json' }));
    });

    it('checks only the fields that had content in the file, for every device', () => {
      document.body.innerHTML = `
        <input type="checkbox" id="export-scope-listing" checked>
        <input type="checkbox" id="export-scope-images-videos" checked>
        <div id="export-listing-field-groups"></div>
        <div id="export-images-videos-field-groups"></div>
      `;
      refreshFieldCheckboxes(schema, sheetMap, ['apple']);

      restrictFieldScopeToFile({
        metadata: { apple: [{ fieldName: 'App Name', englishSource: { English: 'Photoshop' } }] },
        imagesVideos: {},
      }, schema, sheetMap);

      const appleListingCheckboxes = [
        ...document.querySelectorAll('.field-scope-checkbox[data-block-type="listing"][data-device="apple"]'),
      ];
      expect(appleListingCheckboxes.find((checkbox) => checkbox.value === 'name').checked).to.be.true;
      expect(appleListingCheckboxes.filter((checkbox) => checkbox.value !== 'name')
        .every((checkbox) => !checkbox.checked)).to.be.true;
    });

    it('does nothing when schema or sheetMap is missing', () => {
      document.body.innerHTML = '<div id="export-listing-field-groups"></div>';
      expect(() => restrictFieldScopeToFile({ metadata: {} }, null, null)).to.not.throw();
    });

    it('survives a subsequent refreshMediaAssetsAvailability call, matching handleLoadScopeFile\'s real order', async () => {
      // Regression: refreshMediaAssetsAvailability used to call the broad refreshFieldCheckboxes
      // (all block types), which re-renders listing/images-videos from scratch and wipes out
      // whatever restrictFieldScopeToFile just set, since handleLoadScopeFile calls
      // restrictFieldScopeToFile then refreshMediaAssetsAvailability in that order.
      document.body.innerHTML = `
        <input type="checkbox" id="export-scope-listing" checked>
        <input type="checkbox" id="export-scope-images-videos" checked>
        <div id="export-listing-field-groups"></div>
        <div id="export-images-videos-field-groups"></div>
        <button id="export-images-button" class="hidden" disabled></button>
        <select id="release-period-year"><option value="" selected></option></select>
        <select id="release-period-quarter"><option value="" selected></option></select>
        <select id="release-period-month"><option value="" selected></option></select>
      `;
      refreshFieldCheckboxes(schema, sheetMap, ['apple']);
      restrictFieldScopeToFile({
        metadata: { apple: [{ fieldName: 'App Name', englishSource: { English: 'Photoshop' } }] },
        imagesVideos: {},
      }, schema, sheetMap);

      // Incomplete release period takes the early-return branch — no fetch needed to prove this.
      await refreshMediaAssetsAvailability('adobecom', 'aso', 'token', schema, { product: '', languages: [], devices: ['apple'] });

      const appleListingCheckboxes = [
        ...document.querySelectorAll('.field-scope-checkbox[data-block-type="listing"][data-device="apple"]'),
      ];
      expect(appleListingCheckboxes.find((checkbox) => checkbox.value === 'name').checked).to.be.true;
      expect(appleListingCheckboxes.filter((checkbox) => checkbox.value !== 'name')
        .every((checkbox) => !checkbox.checked)).to.be.true;
    });
  });

  describe('renderExportSummary', () => {
    it('shows a short note when fields were skipped, with no per-entry list or links', () => {
      document.body.innerHTML = '<div id="export-summary"></div>';
      const container = document.getElementById('export-summary');

      renderExportSummary(container, {
        product: 'adobe-express',
        stats: { cells: 10, uniquePaths: 5, skipped: 2 },
        skipped: [
          { fieldName: 'App Name', language: 'German', rowRole: 'localized', pagePath: '/a' },
          { fieldName: 'Subtitle', language: 'French', rowRole: 'localized', pagePath: '/b' },
        ],
      });

      expect(container.querySelectorAll('a')).to.have.length(0);
      expect(container.textContent).to.include('2 skipped');
      expect(container.textContent).to.include('Fields not yet created in DA were skipped, not exported.');
    });

    it('omits the skipped note entirely when nothing was skipped', () => {
      document.body.innerHTML = '<div id="export-summary"></div>';
      const container = document.getElementById('export-summary');

      renderExportSummary(container, {
        product: 'adobe-express',
        stats: { cells: 5, uniquePaths: 5, skipped: 0 },
        skipped: [],
      });

      expect(container.textContent).to.not.include('skipped, not exported');
    });
  });

  describe('refreshMediaAssetsAvailability', () => {
    const schema = {
      'aso-app (apple, media-assets)': {
        data: [
          { 'field key': 'screenshotsiPhone1', 'field name': 'Screenshot iPhone 1' },
          { 'field key': 'video1', 'field name': 'Video 1' },
        ],
      },
    };
    const english = { name: 'English', localizedPath: '/', sourcePath: '/' };

    function buildDom() {
      document.body.innerHTML = `
        <button id="export-images-button" class="hidden" disabled></button>
        <select id="release-period-year"><option value="2026" selected>2026</option></select>
        <select id="release-period-quarter"><option value="q3" selected>q3</option></select>
        <select id="release-period-month"><option value="august" selected>august</option></select>
      `;
    }

    afterEach(() => {
      sinon.restore();
      document.body.innerHTML = '';
    });

    it('keeps the button hidden when the scope is incomplete (no schema/product/devices/languages)', async () => {
      buildDom();
      await refreshMediaAssetsAvailability('adobecom', 'aso', 'token', schema, {
        product: '',
        languages: [english],
        devices: ['apple'],
      });
      expect(document.getElementById('export-images-button').classList.contains('hidden')).to.be.true;
    });

    it('shows the button once at least one media-assets page is found to exist', async () => {
      buildDom();
      const populatedHtml = `<div class="aso-app media-assets apple">
        <div><div><p>Screenshot iPhone 1</p></div>
          <div><picture><img src="https://content.da.live/x/y/firefly1.jpeg" loading="lazy"></picture></div>
        </div>
        <div><div><p>Video 1</p></div><div></div></div>
      </div>`;
      sinon.stub(window, 'fetch').resolves({ ok: true, status: 200, text: async () => populatedHtml });

      await refreshMediaAssetsAvailability('adobecom', 'aso', 'token', schema, {
        product: 'firefly',
        languages: [english],
        devices: ['apple'],
      });

      expect(document.getElementById('export-images-button').classList.contains('hidden')).to.be.false;
    });

    it('only renders a field-scope checkbox for the field actually populated on the live page, not every schema-defined slot', async () => {
      document.body.innerHTML = `
        <button id="export-images-button" class="hidden" disabled></button>
        <select id="release-period-year"><option value="2026" selected>2026</option></select>
        <select id="release-period-quarter"><option value="q3" selected>q3</option></select>
        <select id="release-period-month"><option value="august" selected>august</option></select>
        <details id="export-media-assets-fields">
          <summary><span id="export-media-assets-field-count"></span></summary>
          <div id="export-media-assets-field-groups"></div>
        </details>
      `;
      const populatedHtml = `<div class="aso-app media-assets apple">
        <div><div><p>Screenshot iPhone 1</p></div>
          <div><picture><img src="https://content.da.live/x/y/firefly1.jpeg" loading="lazy"></picture></div>
        </div>
        <div><div><p>Video 1</p></div><div></div></div>
      </div>`;
      sinon.stub(window, 'fetch').resolves({ ok: true, status: 200, text: async () => populatedHtml });

      await refreshMediaAssetsAvailability('adobecom', 'aso', 'token', schema, {
        product: 'firefly',
        languages: [english],
        devices: ['apple'],
      });

      const checkboxes = [
        ...document.querySelectorAll('#export-media-assets-field-groups .field-scope-checkbox'),
      ];
      expect(checkboxes.map((checkbox) => checkbox.value)).to.deep.equal(['screenshotsiPhone1']);
    });

    it("surfaces a field that only exists on a non-English language's page, not just the first language checked", async () => {
      document.body.innerHTML = `
        <button id="export-images-button" class="hidden" disabled></button>
        <select id="release-period-year"><option value="2026" selected>2026</option></select>
        <select id="release-period-quarter"><option value="q3" selected>q3</option></select>
        <select id="release-period-month"><option value="august" selected>august</option></select>
        <details id="export-media-assets-fields">
          <summary><span id="export-media-assets-field-count"></span></summary>
          <div id="export-media-assets-field-groups"></div>
        </details>
      `;
      const german = { name: 'German', localizedPath: '/de', sourcePath: '/de' };
      const screenshotOnlyHtml = `<div class="aso-app media-assets apple">
        <div><div><p>Screenshot iPhone 1</p></div>
          <div><picture><img src="https://content.da.live/x/y/firefly1.jpeg" loading="lazy"></picture></div>
        </div>
        <div><div><p>Video 1</p></div><div></div></div>
      </div>`;
      const bothFieldsHtml = `<div class="aso-app media-assets apple">
        <div><div><p>Screenshot iPhone 1</p></div>
          <div><picture><img src="https://content.da.live/x/y/firefly1.jpeg" loading="lazy"></picture></div>
        </div>
        <div><div><p>Video 1</p></div>
          <div><picture><img src="https://content.da.live/x/y/firefly-de.mp4" loading="lazy"></picture></div>
        </div>
      </div>`;
      sinon.stub(window, 'fetch').callsFake(async (url) => ({
        ok: true,
        status: 200,
        text: async () => (String(url).includes('/de/') ? bothFieldsHtml : screenshotOnlyHtml),
      }));

      await refreshMediaAssetsAvailability('adobecom', 'aso', 'token', schema, {
        product: 'firefly',
        languages: [english, german],
        devices: ['apple'],
      });

      const checkboxes = [
        ...document.querySelectorAll('#export-media-assets-field-groups .field-scope-checkbox'),
      ];
      expect(checkboxes.map((checkbox) => checkbox.value).sort()).to.deep.equal(['screenshotsiPhone1', 'video1']);
    });

    it('keeps the button hidden when no media-assets page is found (all probes 404)', async () => {
      buildDom();
      sinon.stub(window, 'fetch').resolves({ ok: false, status: 404 });

      await refreshMediaAssetsAvailability('adobecom', 'aso', 'token', schema, {
        product: 'firefly',
        languages: [english],
        devices: ['apple'],
      });

      expect(document.getElementById('export-images-button').classList.contains('hidden')).to.be.true;
    });
  });
});
