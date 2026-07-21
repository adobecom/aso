import { expect } from '@esm-bundle/chai';
import {
  applyKeywordUpdates,
  readKeywordFromSidecar,
} from '../../../../../tools/aso-dashboard/js/import-export/keywords.js';

const blockKey = 'aso-app (apple, listing)';

describe('import-export-keywords', () => {
  it('reads keyword values from multi-sheet sidecars', () => {
    const sidecar = {
      ':type': 'multi-sheet',
      ':names': ['aso-app (apple, listing) (1)'],
      'aso-app (apple, listing) (1)': {
        data: [
          {
            language: 'German',
            'App Name': 'express, design',
            'App Name (updated)': 'yes',
          },
        ],
      },
    };

    expect(readKeywordFromSidecar(sidecar, blockKey, 'App Name', 'German'))
      .to.equal('express, design');
    expect(readKeywordFromSidecar(sidecar, blockKey, 'App Name', 'Romanian'))
      .to.equal('');
  });

  it('merges keyword updates into an existing sidecar, and flattens the single-block result to single-sheet so it stays previewable', () => {
    // AEM's preview pipeline 400s on a multi-sheet wrapper around exactly one block —
    // DA's own sheet editor flattens this shape on save, and so must we.
    const existing = {
      ':type': 'multi-sheet',
      ':names': ['aso-app (apple, listing) (1)'],
      'aso-app (apple, listing) (1)': {
        data: [{ language: 'German', 'App Name': 'old', 'App Name (updated)': '' }],
        total: 1,
        offset: 0,
        limit: 1,
      },
    };

    const merged = applyKeywordUpdates(existing, {
      blockKey,
      updates: [{ fieldName: 'App Name', languageName: 'German', value: 'new, keywords' }],
      languages: [{ name: 'German' }, { name: 'English' }],
    });

    expect(merged[':type']).to.equal('sheet');
    expect(merged[':sheetname']).to.equal('aso-app (apple, listing) (1)');
    expect(merged.data[0]['App Name']).to.equal('new, keywords');
    expect(merged.data[0]['App Name (updated)']).to.equal('yes');
  });

  it('creates a sidecar when none exists, as flat single-sheet JSON', () => {
    const created = applyKeywordUpdates(null, {
      blockKey,
      updates: [{ fieldName: 'App Name', languageName: 'English', value: 'photo, edit' }],
      languages: [{ name: 'English' }],
    });

    expect(created[':type']).to.equal('sheet');
    expect(created[':sheetname']).to.equal('aso-app (apple, listing) (1)');
    expect(created.data[0]['App Name']).to.equal('photo, edit');
  });

  it('keeps the multi-sheet shape when a sidecar legitimately holds more than one block', () => {
    const existing = {
      ':type': 'multi-sheet',
      ':names': ['aso-app (apple, listing) (1)', 'aso-app (apple, listing) (2)'],
      'aso-app (apple, listing) (1)': {
        data: [{ language: 'German', 'App Name': 'old', 'App Name (updated)': '' }],
        total: 1,
        offset: 0,
        limit: 1,
      },
      'aso-app (apple, listing) (2)': {
        data: [{ language: 'German', 'App Name': 'other', 'App Name (updated)': '' }],
        total: 1,
        offset: 0,
        limit: 1,
      },
    };

    const merged = applyKeywordUpdates(existing, {
      blockKey,
      updates: [{ fieldName: 'App Name', languageName: 'German', value: 'new, keywords' }],
      languages: [{ name: 'German' }],
    });

    expect(merged[':type']).to.equal('multi-sheet');
    expect(merged['aso-app (apple, listing) (1)'].data[0]['App Name']).to.equal('new, keywords');
    expect(merged['aso-app (apple, listing) (2)'].data[0]['App Name']).to.equal('other');
  });
});
