import { expect } from '@esm-bundle/chai';
import { createSheetData } from '../../../tools/aso-dashboard/export.js';

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
