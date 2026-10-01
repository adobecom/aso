import { expect } from '@esm-bundle/chai';
import {
  convertListingFieldValue,
  createSheetData,
  setupSectionBreakReferences,
} from '../../../tools/aso-dashboard/export.js';
import { buildExportGapMasks } from '../../../tools/aso-dashboard/section-break-template.js';

describe('release field spacing references', () => {
  const fields = [
    { device: 'google', fieldName: 'Release Notes', option: 'googleReleaseNotesReference' },
    { device: 'apple', fieldName: "What's New", option: 'appleWhatsNewReference' },
  ];

  fields.forEach(({ device, fieldName, option }) => {
    it(`applies the custom reference to ${device} ${fieldName}`, () => {
      const el = document.createElement('div');
      el.innerHTML = '<p>First</p><p>Second</p><p>Third</p>';
      const masks = buildExportGapMasks({ [option]: 'First\n\nSecond\nThird' });
      expect(convertListingFieldValue(el, device, fieldName, 'listing', masks))
        .to.equal('First\n\nSecond\nThird');
      expect(el.innerHTML).to.equal('<p>First</p><p>Second</p><p>Third</p>');
      expect(convertListingFieldValue(el, device, fieldName, 'listing', buildExportGapMasks()))
        .to.equal('First\nSecond\nThird');
      expect(convertListingFieldValue(el, device, fieldName, 'promo', masks))
        .to.equal('First\nSecond\nThird');
    });

    it(`skips a mismatched reference for ${device} ${fieldName}`, () => {
      const el = document.createElement('div');
      el.innerHTML = '<p>First</p><p>Second</p>';
      const masks = buildExportGapMasks({ [option]: 'First\n\nSecond\nThird' });
      expect(convertListingFieldValue(el, device, fieldName, 'listing', masks))
        .to.equal('First\nSecond');
    });
  });

  it('preserves custom release spacing in the aggregated Play export', () => {
    const el = document.createElement('div');
    el.innerHTML = '<p>First</p><p>Second</p>';
    const masks = buildExportGapMasks({ googleReleaseNotesReference: 'First\n\nSecond' });
    const value = convertListingFieldValue(el, 'google', 'Release Notes', 'listing', masks);
    const rows = createSheetData({
      google: { listing: { 'en-us': { 'Release Notes': value } } },
      apple: {},
    }, ['en-us'], 'listing');
    const releaseRow = rows.find((row) => row[0] === 'Release Notes');
    expect(releaseRow[1]).to.equal('<en-US>\n\nFirst\n\nSecond\n\n</en-US>');
    expect(releaseRow[2]).to.equal('First\n\nSecond');
  });

  it('loads, summarizes, saves and clears each UI reference independently', async () => {
    const ids = ['google', 'apple', 'google-release-notes', 'apple-whats-new'];
    const original = ids.map((id) => window.localStorage.getItem(`asoSectionBreakRef:${id}`));
    const container = document.createElement('div');
    try {
      const response = await fetch('/tools/aso-dashboard/aso-dashboard.html');
      const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
      container.appendChild(doc.querySelector('.section-break-section'));
      document.body.appendChild(container);
      ids.forEach((id, index) => {
        window.localStorage.setItem(`asoSectionBreakRef:${id}`, `Saved ${index}\n\nNext`);
      });
      setupSectionBreakReferences();
      ids.forEach((id, index) => {
        const input = container.querySelector(`#section-ref-${id}`);
        const summary = container.querySelector(`#section-ref-${id}-summary`);
        expect(input.value).to.equal(`Saved ${index}\n\nNext`);
        expect(summary.textContent).to.include('2 paragraphs');
        input.value = 'New\n\nSecond\nThird';
        input.dispatchEvent(new Event('input'));
        expect(window.localStorage.getItem(`asoSectionBreakRef:${id}`)).to.equal(input.value);
        expect(summary.textContent).to.include('4 export lines (custom reference)');
        input.value = '';
        input.dispatchEvent(new Event('blur'));
        expect(window.localStorage.getItem(`asoSectionBreakRef:${id}`)).to.equal(null);
        expect(summary.textContent).to.include(
          index < 2 ? 'default template' : 'No reference template',
        );
      });
    } finally {
      container.remove();
      ids.forEach((id, index) => {
        const key = `asoSectionBreakRef:${id}`;
        if (original[index] === null) window.localStorage.removeItem(key);
        else window.localStorage.setItem(key, original[index]);
      });
    }
  });
});

describe('export createSheetData', () => {
  it('adds aggregated Play blob only for google listing release notes', () => {
    const languages = ['en-us', 'fr-fr'];
    const sheetData = {
      blockType: 'listing',
      google: {
        listing: {
          'en-us': {
            Title: 'EN title',
            'Release Notes': 'EN release notes',
          },
          'fr-fr': {
            Title: 'FR title',
            'Release Notes': 'FR notes',
          },
        },
      },
      apple: {},
    };

    const rows = createSheetData(sheetData, languages, 'listing');
    expect(rows[0][0]).to.equal('Google');
    expect(rows[0]).to.have.lengthOf(4);
    expect(rows[1]).to.deep.equal(['Languages', 'Aggregated (Play paste)', 'en-us', 'fr-fr']);

    const releaseRow = rows.find((row) => row[0] === 'Release Notes');
    expect(releaseRow).to.exist;
    expect(releaseRow[1]).to.equal(
      '<en-US>\n\nEN release notes\n\n</en-US>\n\n'
      + '<fr-FR>\n\nFR notes\n\n</fr-FR>',
    );
    expect(releaseRow[2]).to.equal('EN release notes');
    expect(releaseRow[3]).to.equal('FR notes');

    const titleRow = rows.find((row) => row[0] === 'Title');
    expect(titleRow).to.exist;
    expect(titleRow[1]).to.equal('');
  });

  it('omits Aggregated (Play paste) column for non-listing block types', () => {
    const languages = ['en-us'];
    const sheetData = {
      blockType: 'promo',
      google: { promo: { 'en-us': { 'Release Notes': 'Should not aggregate' } } },
      apple: {},
    };

    const rows = createSheetData(sheetData, languages, 'promo');
    expect(rows[0]).to.have.lengthOf(2);
    expect(rows[1]).to.deep.equal(['Languages', 'en-us']);
    const releaseRow = rows.find((row) => row[0] === 'Release Notes');
    expect(releaseRow).to.exist;
    expect(releaseRow).to.deep.equal(['Release Notes', 'Should not aggregate']);
  });
});
