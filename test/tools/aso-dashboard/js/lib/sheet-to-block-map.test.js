import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';
import {
  getBlockKeyForSheet,
  getWorkbookSheetForBlock,
  listBlockKeysForSheet,
  SHEET_METADATA,
  SHEET_PROMOS,
} from '../../../../../tools/aso-dashboard/js/lib/sheet-to-block-map.js';

describe('sheet-to-block-map', () => {
  let sheetMap;

  beforeEach(async () => {
    sheetMap = JSON.parse(await readFile({ path: '../../mocks/sheet-to-block-map.json' }));
  });

  describe('getBlockKeyForSheet', () => {
    it('returns the block key for a workbook sheet and device', () => {
      expect(getBlockKeyForSheet(sheetMap, SHEET_METADATA, 'apple')).to.equal('aso-app (apple, listing)');
      expect(getBlockKeyForSheet(sheetMap, SHEET_PROMOS, 'google')).to.equal('aso-app (google, promo)');
    });

    it('returns null for unknown sheet or device', () => {
      expect(getBlockKeyForSheet(sheetMap, SHEET_METADATA, 'windows')).to.be.null;
    });
  });

  describe('listBlockKeysForSheet', () => {
    it('returns all block keys on a shared workbook sheet', () => {
      expect(listBlockKeysForSheet(sheetMap, SHEET_METADATA)).to.deep.equal([
        'aso-app (apple, listing)',
        'aso-app (google, listing)',
      ]);
    });
  });

  describe('getWorkbookSheetForBlock', () => {
    it('returns the workbook sheet for a block key', () => {
      expect(getWorkbookSheetForBlock(sheetMap, 'aso-app (apple, images-videos)')).to.equal('Images-Videos');
    });
  });
});
