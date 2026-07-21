import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';
import {
  FIELD_BLOCK_TYPES,
  getSelectedFieldsByDeviceBlock,
  initFieldScope,
  refreshFieldCheckboxes,
  restrictFieldCheckboxesToFile,
  setMediaAssetsAvailable,
  setMediaAssetsFieldAvailability,
  toggleAllFieldCheckboxes,
  updateFieldScopeSummary,
} from '../../../../tools/aso-dashboard/js/field-scope-settings.js';

describe('field-scope-settings', () => {
  let schema;
  let sheetMap;

  beforeEach(async () => {
    schema = JSON.parse(await readFile({ path: '../mocks/block-schema.json' }));
    sheetMap = JSON.parse(await readFile({ path: '../mocks/sheet-to-block-map.json' }));
  });

  afterEach(() => {
    document.body.innerHTML = '';
    setMediaAssetsAvailable(false);
    setMediaAssetsFieldAvailability({});
  });

  function buildDom({ listingChecked = true, imagesVideosChecked = true } = {}) {
    document.body.innerHTML = `
      <input type="checkbox" id="export-scope-listing" ${listingChecked ? 'checked' : ''}>
      <input type="checkbox" id="export-scope-images-videos" ${imagesVideosChecked ? 'checked' : ''}>
      <details id="export-listing-fields">
        <summary>
          <span id="export-listing-field-count"></span>
          <button type="button" class="field-scope-select-all" data-block-type="listing">Select All</button>
        </summary>
        <div id="export-listing-field-groups"><p>Select product and device…</p></div>
      </details>
      <details id="export-images-videos-fields">
        <summary>
          <span id="export-images-videos-field-count"></span>
          <button type="button" class="field-scope-select-all" data-block-type="images-videos">Select All</button>
        </summary>
        <div id="export-images-videos-field-groups"><p>Select product and device…</p></div>
      </details>
      <details id="export-media-assets-fields">
        <summary>
          <span id="export-media-assets-field-count"></span>
          <button type="button" class="field-scope-select-all" data-block-type="media-assets">Select All</button>
        </summary>
        <div id="export-media-assets-field-groups"><p>Select product and device…</p></div>
      </details>
    `;
  }

  it('exposes exactly the block types with a field-checkbox UI', () => {
    expect(FIELD_BLOCK_TYPES).to.deep.equal(['listing', 'images-videos', 'media-assets']);
  });

  describe('refreshFieldCheckboxes', () => {
    it('renders one checkbox per schema field, per device, all unchecked by default', () => {
      buildDom();
      refreshFieldCheckboxes(schema, sheetMap, ['apple']);

      const appleListing = document.querySelector('#export-listing-field-groups .promo-device-box[data-device="apple"]');
      expect(appleListing).to.exist;
      const checkboxes = [...appleListing.querySelectorAll('.field-scope-checkbox')];
      expect(checkboxes.length).to.be.above(0);
      expect(checkboxes.every((checkbox) => !checkbox.checked)).to.be.true;
      expect(checkboxes.some((checkbox) => checkbox.value === 'name')).to.be.true;
    });

    it('shows a "not included" message instead of rendering when its scope checkbox is unchecked', () => {
      buildDom({ listingChecked: false });
      refreshFieldCheckboxes(schema, sheetMap, ['apple']);

      expect(document.getElementById('export-listing-field-groups').textContent).to.include('Not included in this export');
      expect(document.querySelectorAll('#export-listing-field-groups .field-scope-checkbox')).to.have.length(0);
    });

    it('shows a placeholder when no devices are selected yet', () => {
      buildDom();
      refreshFieldCheckboxes(schema, sheetMap, []);

      expect(document.getElementById('export-images-videos-field-groups').textContent).to.include('Select product and device');
    });

    it('shows a "no media assets found" message (not "not included") when unavailable', () => {
      buildDom();
      setMediaAssetsAvailable(false);
      refreshFieldCheckboxes(schema, sheetMap, ['apple']);

      expect(document.getElementById('export-media-assets-field-groups').textContent).to.include('No media assets found for this scope.');
      expect(document.querySelectorAll('#export-media-assets-field-groups .field-scope-checkbox')).to.have.length(0);
    });

    it('renders media-assets field checkboxes (no sheetMap needed) once availability is true, unchecked by default', () => {
      buildDom();
      setMediaAssetsAvailable(true);
      setMediaAssetsFieldAvailability({ apple: ['screenshotsiPhone1', 'video1'] });
      refreshFieldCheckboxes(schema, sheetMap, ['apple']);

      const checkboxes = [...document.querySelectorAll('#export-media-assets-field-groups .field-scope-checkbox')];
      expect(checkboxes.length).to.be.above(0);
      expect(checkboxes.every((checkbox) => !checkbox.checked)).to.be.true;
      expect(checkboxes.some((checkbox) => checkbox.value === 'screenshotsiPhone1')).to.be.true;
    });

    it('prunes out media-assets fields the schema defines but that have no available field key (e.g. not on the live page)', () => {
      buildDom();
      setMediaAssetsAvailable(true);
      setMediaAssetsFieldAvailability({ apple: ['screenshotsiPhone1'] });
      refreshFieldCheckboxes(schema, sheetMap, ['apple']);

      const checkboxes = [...document.querySelectorAll('#export-media-assets-field-groups .field-scope-checkbox')];
      expect(checkboxes.map((checkbox) => checkbox.value)).to.deep.equal(['screenshotsiPhone1']);
    });

    it('shows a media-assets-specific empty message for a device with availability true overall but no available fields itself', () => {
      buildDom();
      setMediaAssetsAvailable(true);
      setMediaAssetsFieldAvailability({ apple: [] });
      refreshFieldCheckboxes(schema, sheetMap, ['apple']);

      expect(document.getElementById('export-media-assets-field-groups').textContent).to.include('No screenshots or videos have been added yet.');
    });
  });

  describe('getSelectedFieldsByDeviceBlock', () => {
    it('reflects which checkboxes are checked, keyed by device:blockType', () => {
      buildDom();
      refreshFieldCheckboxes(schema, sheetMap, ['apple', 'google']);

      document.querySelectorAll('.field-scope-checkbox[data-block-type="listing"][data-device="apple"]')
        .forEach((checkbox) => { checkbox.checked = checkbox.value === 'name'; });
      document.querySelectorAll('.field-scope-checkbox[data-block-type="listing"][data-device="google"]')
        .forEach((checkbox) => { checkbox.checked = true; });

      const selection = getSelectedFieldsByDeviceBlock();
      expect(selection['apple:listing']).to.deep.equal(['name']);
      expect(selection['google:listing']?.length).to.be.above(1);
    });
  });

  describe('restrictFieldCheckboxesToFile', () => {
    it('checks only the given field keys and unchecks the rest', () => {
      buildDom();
      refreshFieldCheckboxes(schema, sheetMap, ['apple']);

      restrictFieldCheckboxesToFile('listing', 'apple', ['name']);

      const checkboxes = [...document.querySelectorAll('.field-scope-checkbox[data-block-type="listing"][data-device="apple"]')];
      expect(checkboxes.find((checkbox) => checkbox.value === 'name').checked).to.be.true;
      expect(checkboxes.filter((checkbox) => checkbox.value !== 'name').every((checkbox) => !checkbox.checked)).to.be.true;
    });

    it('updates the summary count after restricting', () => {
      buildDom();
      refreshFieldCheckboxes(schema, sheetMap, ['apple']);

      restrictFieldCheckboxesToFile('listing', 'apple', ['name']);

      expect(document.getElementById('export-listing-field-count').textContent).to.equal('(1 selected)');
    });
  });

  describe('updateFieldScopeSummary', () => {
    it('opens the <details> and shows a live selected-field count when the scope is checked', () => {
      buildDom();
      refreshFieldCheckboxes(schema, sheetMap, ['apple']);

      updateFieldScopeSummary('listing');

      const details = document.getElementById('export-listing-fields');
      const count = document.getElementById('export-listing-field-count');
      expect(details.open).to.be.true;
      expect(count.textContent).to.match(/^\(\d+ selected\)$/);
    });

    it('closes the <details> and shows "not included" when the scope is unchecked', () => {
      buildDom({ listingChecked: false });

      updateFieldScopeSummary('listing');

      const details = document.getElementById('export-listing-fields');
      const count = document.getElementById('export-listing-field-count');
      expect(details.open).to.be.false;
      expect(count.textContent).to.equal('(not included)');
    });

    it('shows "(none found)" rather than "(not included)" for media-assets when unavailable', () => {
      buildDom();
      setMediaAssetsAvailable(false);

      updateFieldScopeSummary('media-assets');

      const details = document.getElementById('export-media-assets-fields');
      const count = document.getElementById('export-media-assets-field-count');
      expect(details.open).to.be.false;
      expect(count.textContent).to.equal('(none found)');
    });

    it('opens the media-assets <details> and shows a selected count once available', () => {
      buildDom();
      setMediaAssetsAvailable(true);
      refreshFieldCheckboxes(schema, sheetMap, ['apple']);

      updateFieldScopeSummary('media-assets');

      const details = document.getElementById('export-media-assets-fields');
      const count = document.getElementById('export-media-assets-field-count');
      expect(details.open).to.be.true;
      expect(count.textContent).to.match(/^\(\d+ selected\)$/);
    });
  });

  describe('initFieldScope', () => {
    it('updates the live count when an individual field checkbox is toggled', () => {
      buildDom();
      refreshFieldCheckboxes(schema, sheetMap, ['apple']);
      initFieldScope();

      const nameCheckbox = document.querySelector(
        '.field-scope-checkbox[data-block-type="listing"][data-device="apple"][value="name"]',
      );
      nameCheckbox.checked = true;
      nameCheckbox.dispatchEvent(new Event('change', { bubbles: true }));

      const countText = document.getElementById('export-listing-field-count').textContent;
      expect(countText).to.equal('(1 selected)');
    });

    it('selects every rendered field for a block type when its "Select All" button is clicked', () => {
      buildDom();
      refreshFieldCheckboxes(schema, sheetMap, ['apple', 'google']);
      initFieldScope();

      document.querySelector('.field-scope-select-all[data-block-type="listing"]')
        .dispatchEvent(new Event('click', { bubbles: true }));

      const checkboxes = [...document.querySelectorAll('.field-scope-checkbox[data-block-type="listing"]')];
      expect(checkboxes.length).to.be.above(0);
      expect(checkboxes.every((checkbox) => checkbox.checked)).to.be.true;
    });

    it('deselects every field for a block type when "Select All" is clicked a second time', () => {
      buildDom();
      refreshFieldCheckboxes(schema, sheetMap, ['apple']);
      initFieldScope();

      const button = document.querySelector('.field-scope-select-all[data-block-type="listing"]');
      button.dispatchEvent(new Event('click', { bubbles: true }));
      button.dispatchEvent(new Event('click', { bubbles: true }));

      const checkboxes = [...document.querySelectorAll('.field-scope-checkbox[data-block-type="listing"]')];
      expect(checkboxes.every((checkbox) => !checkbox.checked)).to.be.true;
      expect(document.getElementById('export-listing-field-count').textContent).to.equal('(0 selected)');
    });
  });

  describe('toggleAllFieldCheckboxes', () => {
    it('does nothing when no fields are rendered for that block type yet', () => {
      buildDom();
      expect(() => toggleAllFieldCheckboxes('listing')).to.not.throw();
    });

    it('checks all then unchecks all on alternating calls, and updates the summary count', () => {
      buildDom();
      refreshFieldCheckboxes(schema, sheetMap, ['apple']);

      toggleAllFieldCheckboxes('listing');
      let checkboxes = [...document.querySelectorAll('.field-scope-checkbox[data-block-type="listing"]')];
      expect(checkboxes.every((checkbox) => checkbox.checked)).to.be.true;
      expect(document.getElementById('export-listing-field-count').textContent)
        .to.equal(`(${checkboxes.length} selected)`);

      toggleAllFieldCheckboxes('listing');
      checkboxes = [...document.querySelectorAll('.field-scope-checkbox[data-block-type="listing"]')];
      expect(checkboxes.every((checkbox) => !checkbox.checked)).to.be.true;
      expect(document.getElementById('export-listing-field-count').textContent).to.equal('(0 selected)');
    });
  });
});
