import { expect } from '@esm-bundle/chai';
import {
  buildKeywordsJSON,
  mergeKeywordsJSON,
  updatedColumnName,
} from '../../../tools/aso-keywords/utils.js';

describe('aso-keywords utils', () => {
  describe('updatedColumnName', () => {
    it('builds canonical updated column names from trimmed field names', () => {
      expect(updatedColumnName('Short Description')).to.equal('Short Description (updated)');
      expect(updatedColumnName(' Short Description ')).to.equal('Short Description (updated)');
    });
  });

  describe('buildKeywordsJSON', () => {
    it('creates value and updated columns for each keyword field', () => {
      const result = buildKeywordsJSON(
        [{ blockIdentifier: 'aso-app (google, listing) (1)', fields: ['Short Description'] }],
        [{ label: 'Japanese' }],
      );

      expect(result['aso-app (google, listing) (1)'].data[0]).to.deep.equal({
        language: 'Japanese',
        'Short Description': '',
        'Short Description (updated)': '',
      });
    });
  });

  describe('mergeKeywordsJSON', () => {
    it('adds missing updated columns to legacy keyword files', () => {
      const newJSON = buildKeywordsJSON(
        [{ blockIdentifier: 'aso-app (google, listing) (1)', fields: ['Short Description'] }],
        [{ label: 'Japanese' }],
      );
      const existingJSON = {
        ':type': 'multi-sheet',
        ':names': ['aso-app (google, listing) (1)'],
        'aso-app (google, listing) (1)': {
          data: [{
            language: 'Japanese',
            'Short Description': 'existing keywords',
          }],
        },
      };

      const { json } = mergeKeywordsJSON(newJSON, existingJSON);

      expect(json['aso-app (google, listing) (1)'].data[0]).to.deep.equal({
        language: 'Japanese',
        'Short Description': 'existing keywords',
        'Short Description (updated)': '',
      });
    });

    it('adds missing updated columns to legacy single-sheet keyword files', () => {
      const newJSON = buildKeywordsJSON(
        [{ blockIdentifier: 'aso-app (apple, listing) (1)', fields: ['Subtitle', 'Description'] }],
        [{ label: 'Japanese' }],
      );
      const existingJSON = {
        ':type': 'sheet',
        total: 1,
        offset: 0,
        limit: 1,
        data: [{
          language: 'Japanese',
          Subtitle: 'existing subtitle',
          Description: 'existing description',
        }],
      };

      const { json } = mergeKeywordsJSON(newJSON, existingJSON);

      expect(json[':type']).to.equal('sheet');
      expect(json.data[0]).to.deep.equal({
        language: 'Japanese',
        Subtitle: 'existing subtitle',
        'Subtitle (updated)': '',
        Description: 'existing description',
        'Description (updated)': '',
      });
      expect(Object.keys(json.data[0])).to.deep.equal([
        'language',
        'Subtitle',
        'Subtitle (updated)',
        'Description',
        'Description (updated)',
      ]);
    });
  });
});
