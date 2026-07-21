import { expect } from '@esm-bundle/chai';
import { isFileTooLarge, MAX_WORKBOOK_FILE_BYTES } from '../../../../../tools/aso-dashboard/js/lib/excel-loader.js';

describe('excel-loader', () => {
  describe('isFileTooLarge', () => {
    it('rejects a file over the size cap', () => {
      expect(isFileTooLarge({ size: MAX_WORKBOOK_FILE_BYTES + 1 })).to.be.true;
    });

    it('accepts a file at or under the size cap', () => {
      expect(isFileTooLarge({ size: MAX_WORKBOOK_FILE_BYTES })).to.be.false;
      expect(isFileTooLarge({ size: 1024 })).to.be.false;
    });
  });
});
