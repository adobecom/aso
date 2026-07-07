import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';
import {
  buildConstantsHtml,
  mergeConstantsHtml,
  parseConstantsDocument,
} from '../../../tools/aso-constants/utils.js';

describe('aso-constants tool utils', () => {
  const languages = [
    { label: 'English' },
    { label: 'Japanese' },
  ];

  describe('buildConstantsHtml', () => {
    it('creates empty language rows for each slug', () => {
      const html = buildConstantsHtml({
        slugs: ['legal-terms', 'privacy-policy'],
        languages,
      });
      const parsed = parseConstantsDocument(html);

      expect(parsed.slugs).to.deep.equal(['legal-terms', 'privacy-policy']);
      expect(parsed.blocks['legal-terms'].rows).to.deep.equal([
        { language: 'English', contentHtml: '' },
        { language: 'Japanese', contentHtml: '' },
      ]);
      expect(parsed.blocks['privacy-policy'].rows).to.deep.equal([
        { language: 'English', contentHtml: '' },
        { language: 'Japanese', contentHtml: '' },
      ]);
    });
  });

  describe('parseConstantsDocument', () => {
    it('reads slug blocks and language rows from existing HTML', async () => {
      const existingHtml = await readFile({ path: '../../blocks/aso-app/mocks/apple-constants.html' });
      const parsed = parseConstantsDocument(existingHtml);

      expect(parsed.slugs).to.deep.equal(['legal-terms']);
      expect(parsed.blocks['legal-terms'].rows.find((row) => row.language === 'English')?.contentHtml)
        .to.include('[Optional access permissions]');
      expect(parsed.blocks['legal-terms'].rows.find((row) => row.language === 'Korean')?.contentHtml)
        .to.include('액세스 권한에 대한 정보');
    });
  });

  describe('mergeConstantsHtml', () => {
    it('preserves existing copy and adds rows for new languages', async () => {
      const existingHtml = await readFile({ path: '../../blocks/aso-app/mocks/apple-constants.html' });
      const { html, orphanedSlugs } = mergeConstantsHtml({
        slugs: ['legal-terms'],
        languages,
        existingHtml,
      });

      expect(orphanedSlugs).to.deep.equal([]);
      const parsed = parseConstantsDocument(html);
      const englishRow = parsed.blocks['legal-terms'].rows.find((row) => row.language === 'English');
      const japaneseRow = parsed.blocks['legal-terms'].rows.find((row) => row.language === 'Japanese');
      expect(englishRow?.contentHtml).to.include('[Optional access permissions]');
      expect(japaneseRow?.contentHtml).to.equal('');
    });

    it('adds new slug blocks while preserving existing ones', () => {
      const existingHtml = buildConstantsHtml({
        slugs: ['legal-terms'],
        languages,
        blocks: { 'legal-terms': { rows: [{ language: 'English', contentHtml: '<p>Existing legal copy</p>' }] } },
      });

      const { html, orphanedSlugs } = mergeConstantsHtml({
        slugs: ['legal-terms', 'privacy-policy'],
        languages,
        existingHtml,
      });

      expect(orphanedSlugs).to.deep.equal([]);
      const parsed = parseConstantsDocument(html);
      expect(parsed.slugs).to.deep.equal(['legal-terms', 'privacy-policy']);
      expect(parsed.blocks['legal-terms'].rows[0].contentHtml).to.equal('<p>Existing legal copy</p>');
      expect(parsed.blocks['privacy-policy'].rows).to.deep.equal([
        { language: 'English', contentHtml: '' },
        { language: 'Japanese', contentHtml: '' },
      ]);
    });

    it('adds a language row without changing existing content', () => {
      const existingHtml = buildConstantsHtml({
        slugs: ['legal-terms'],
        languages: [{ label: 'English' }],
        blocks: { 'legal-terms': { rows: [{ language: 'English', contentHtml: '<p>Existing legal copy</p>' }] } },
      });

      const { html } = mergeConstantsHtml({
        slugs: ['legal-terms'],
        languages,
        existingHtml,
      });

      const parsed = parseConstantsDocument(html);
      expect(parsed.blocks['legal-terms'].rows.find((row) => row.language === 'English')?.contentHtml)
        .to.equal('<p>Existing legal copy</p>');
      expect(parsed.blocks['legal-terms'].rows.find((row) => row.language === 'Japanese')?.contentHtml)
        .to.equal('');
    });

    it('treats missing existing HTML as a new scaffold', () => {
      const { html, orphanedSlugs } = mergeConstantsHtml({
        slugs: ['legal-terms'],
        languages,
        existingHtml: null,
      });

      expect(orphanedSlugs).to.deep.equal([]);
      const parsed = parseConstantsDocument(html);
      expect(parsed.slugs).to.deep.equal(['legal-terms']);
      expect(parsed.blocks['legal-terms'].rows).to.deep.equal([
        { language: 'English', contentHtml: '' },
        { language: 'Japanese', contentHtml: '' },
      ]);
    });

    it('keeps orphan slug blocks that are no longer on the listing page', () => {
      const existingHtml = buildConstantsHtml({
        slugs: ['legal-terms', 'retired-slug'],
        languages,
        blocks: {
          'legal-terms': { rows: [{ language: 'English', contentHtml: '<p>Legal</p>' }] },
          'retired-slug': { rows: [{ language: 'English', contentHtml: '<p>Retired</p>' }] },
        },
      });

      const { html, orphanedSlugs } = mergeConstantsHtml({
        slugs: ['legal-terms'],
        languages,
        existingHtml,
      });

      expect(orphanedSlugs).to.deep.equal(['retired-slug']);
      const parsed = parseConstantsDocument(html);
      expect(parsed.slugs).to.deep.equal(['legal-terms', 'retired-slug']);
      expect(parsed.blocks['retired-slug'].rows[0].contentHtml).to.equal('<p>Retired</p>');
    });
  });
});
