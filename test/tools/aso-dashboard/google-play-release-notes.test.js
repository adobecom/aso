import { expect } from '@esm-bundle/chai';
import {
  isReleaseNotesField,
  formatPlayLocaleTag,
  buildGooglePlayReleaseNotesBlob,
} from '../../../tools/aso-dashboard/google-play-release-notes.js';

describe('google-play-release-notes', () => {
  describe('isReleaseNotesField', () => {
    it('is true for release notes labels', () => {
      expect(isReleaseNotesField('Release Notes')).to.be.true;
      expect(isReleaseNotesField('release notes')).to.be.true;
      expect(isReleaseNotesField('  RELEASE  NOTES  ')).to.be.true;
    });

    it('is false for other fields', () => {
      expect(isReleaseNotesField('Title')).to.be.false;
      expect(isReleaseNotesField('Short description')).to.be.false;
    });
  });

  describe('formatPlayLocaleTag', () => {
    it('maps en-us to en-US', () => {
      expect(formatPlayLocaleTag('en-us')).to.equal('en-US');
    });

    it('strips leading slash and maps /en-gb to en-GB', () => {
      expect(formatPlayLocaleTag('/en-gb')).to.equal('en-GB');
    });

    it('maps zh-cn to zh-CN', () => {
      expect(formatPlayLocaleTag('zh-cn')).to.equal('zh-CN');
    });

    it('maps pt-br to pt-BR', () => {
      expect(formatPlayLocaleTag('pt-br')).to.equal('pt-BR');
    });

    it('leaves single-segment codes lowercase', () => {
      expect(formatPlayLocaleTag('fil')).to.equal('fil');
      expect(formatPlayLocaleTag('vi')).to.equal('vi');
    });

    it('returns empty string for null or empty', () => {
      expect(formatPlayLocaleTag(null)).to.equal('');
      expect(formatPlayLocaleTag('')).to.equal('');
      expect(formatPlayLocaleTag('   ')).to.equal('');
    });

    it('maps Latin Spanish path es-mx to Play tag es-419', () => {
      expect(formatPlayLocaleTag('es-mx')).to.equal('es-419');
    });

    it('maps path-style locales to Play language tags via LOCALE_TAG_OVERRIDES', () => {
      expect(formatPlayLocaleTag('/fil-ph')).to.equal('fil');
      expect(formatPlayLocaleTag('id-id')).to.equal('id');
      expect(formatPlayLocaleTag('th-th')).to.equal('th');
      expect(formatPlayLocaleTag('uk-ua')).to.equal('uk');
      expect(formatPlayLocaleTag('vi-vn')).to.equal('vi');
    });

    it('leaves numeric region subtags as digits (e.g. es-419)', () => {
      expect(formatPlayLocaleTag('es-419')).to.equal('es-419');
    });
  });

  describe('buildGooglePlayReleaseNotesBlob', () => {
    it('builds tagged sections in language order', () => {
      const languages = ['en-us', 'de-de'];
      const langData = {
        'en-us': { 'Release Notes': 'First line.\n\nSecond.' },
        'de-de': { 'Release Notes': 'Erste.' },
      };
      const out = buildGooglePlayReleaseNotesBlob(languages, langData, 'Release Notes');
      expect(out).to.equal(
        '<en-US>\n\nFirst line.\n\nSecond.\n\n</en-US>\n\n'
        + '<de-DE>\n\nErste.\n\n</de-DE>',
      );
    });

    it('skips empty locales', () => {
      const languages = ['en-us', 'fr-fr'];
      const langData = {
        'en-us': { 'Release Notes': 'Only EN' },
        'fr-fr': { 'Release Notes': '  ' },
      };
      const out = buildGooglePlayReleaseNotesBlob(languages, langData, 'Release Notes');
      expect(out).to.equal('<en-US>\n\nOnly EN\n\n</en-US>');
    });

    it('returns empty when no languages', () => {
      expect(buildGooglePlayReleaseNotesBlob([], {}, 'Release Notes')).to.equal('');
    });

    it('returns empty when field missing on all locales', () => {
      const languages = ['en-us'];
      const langData = { 'en-us': { Title: 'x' } };
      expect(buildGooglePlayReleaseNotesBlob(languages, langData, 'Release Notes')).to.equal('');
    });
  });
});
