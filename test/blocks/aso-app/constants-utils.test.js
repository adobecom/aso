import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';
import {
  CONSTANT_TOKEN_PATTERN,
  collectConstantSlugsFromHtml,
  collectConstantSlugsFromText,
  collectConstantSlugsFromBlocks,
  constantsPathFromPagePath,
  hasConstantTokens,
  isConstantSlug,
  parseAllConstantsForLanguage,
  parseConstantsByLanguageLabel,
  parseConstantsForLanguage,
  passthroughPlaceholderValue,
  passthroughPlaceholdersForSlugs,
  substituteConstantTokens,
} from '../../../blocks/aso-app/constants-utils.js';

describe('constants-utils', () => {
  let appleListing;
  let appleConstants;

  before(async () => {
    [appleListing, appleConstants] = await Promise.all([
      readFile({ path: './mocks/apple.html' }),
      readFile({ path: './mocks/apple-constants.html' }),
    ]);
  });

  describe('paths and slug detection', () => {
    it('builds constants path from page path', () => {
      expect(constantsPathFromPagePath('/en/products/acrobat/apple.html'))
        .to.equal('/en/products/acrobat/apple-constants');
      expect(constantsPathFromPagePath('/en/products/acrobat/apple'))
        .to.equal('/en/products/acrobat/apple-constants');
    });

    it('validates constant slugs', () => {
      expect(isConstantSlug('legal-terms')).to.equal(true);
      expect(isConstantSlug('access-permissions')).to.equal(true);
      expect(isConstantSlug('Legal Terms')).to.equal(false);
      expect(isConstantSlug('legal_terms')).to.equal(false);
    });

    it('detects and collects {{slug}} tokens from text and html', () => {
      const text = 'Intro {{legal-terms}} outro';
      expect(hasConstantTokens(text)).to.equal(true);
      expect(collectConstantSlugsFromText(text)).to.deep.equal(['legal-terms']);
      expect(collectConstantSlugsFromHtml(appleListing)).to.deep.equal(['legal-terms']);
    });

    it('detects and collects multiple distinct {{slug}} tokens from text', () => {
      const text = '<p>Intro {{legal-terms}} {{legal-terms-1}} <strong>{{legal-terms-2}}</strong> {{legal-terms-3}} outro</p>';
      expect(hasConstantTokens(text)).to.equal(true);
      expect(collectConstantSlugsFromText(text)).to.deep.equal([
        'legal-terms',
        'legal-terms-1',
        'legal-terms-2',
        'legal-terms-3',
      ]);
    });

    it('deduplicates slugs when the same token appears more than once', () => {
      expect(collectConstantSlugsFromText('{{legal-terms}} and again {{legal-terms}}'))
        .to.deep.equal(['legal-terms']);
    });

    it('ignores invalid token shapes (no greedy or partial matches)', () => {
      expect(CONSTANT_TOKEN_PATTERN.flags).to.include('g');
      expect(CONSTANT_TOKEN_PATTERN.test('{{Legal Terms}}')).to.equal(false);
      expect(CONSTANT_TOKEN_PATTERN.test('{{legal_terms}}')).to.equal(false);
      expect(collectConstantSlugsFromText('{{Legal Terms}} {{legal_terms}} {{}}')).to.deep.equal([]);
    });

    it('does not conflate slugs that share a prefix', () => {
      const text = '{{legal-terms}} {{legal-terms-extra}}';
      expect(collectConstantSlugsFromText(text)).to.deep.equal(['legal-terms', 'legal-terms-extra']);
      expect(substituteConstantTokens(text, {
        'legal-terms': 'SHORT',
        'legal-terms-extra': 'LONG',
      })).to.equal('SHORT LONG');
    });

    it('builds milo passthrough placeholders for constant slugs', () => {
      expect(passthroughPlaceholderValue('legal-terms')).to.equal('{{legal-terms}}');
      expect(passthroughPlaceholdersForSlugs(['legal-terms', 'privacy-note'])).to.deep.equal({
        'legal-terms': '{{legal-terms}}',
        'privacy-note': '{{privacy-note}}',
      });
    });

    it('collects slugs from aso-app blocks in the document', () => {
      document.body.innerHTML = `
        <div class="aso-app listing apple">
          <div><div>Description</div><div><p>{{legal-terms}} {{privacy-note}}</p></div></div>
        </div>
      `;
      expect(collectConstantSlugsFromBlocks(document)).to.deep.equal(['legal-terms', 'privacy-note']);
    });
  });

  describe('token transforms', () => {
    it('substitutes {{slug}} tokens with constant HTML', () => {
      const english = parseConstantsForLanguage(appleConstants, {
        slug: 'legal-terms',
        languageLabel: 'English',
      });
      const resolved = substituteConstantTokens('Before {{legal-terms}} after', {
        'legal-terms': english,
      });
      expect(resolved).to.include('[Optional access permissions]');
      expect(resolved).to.not.include('{{legal-terms}}');
    });

    it('replaces every repeated occurrence of the same token in one pass', () => {
      const text = '<p>{{legal-terms}}</p><p>middle</p><p>{{legal-terms}}</p>';
      const merged = substituteConstantTokens(text, { 'legal-terms': 'LEGAL' });
      expect(merged).to.equal('<p>LEGAL</p><p>middle</p><p>LEGAL</p>');
      expect(merged).to.not.include('{{legal-terms}}');
    });

    it('replaces a token-only paragraph with block constant HTML without nesting', () => {
      const value = '<p>Line one</p><p>Line two</p>';
      const merged = substituteConstantTokens(
        '<p>Before</p><p>{{legal-terms}}</p><p>After</p>',
        { 'legal-terms': value },
      );
      expect(merged).to.equal('<p>Before</p><p>Line one</p><p>Line two</p><p>After</p>');
      expect(merged).not.to.include('<p></p>');
    });

    it('substitutes constants into listing html for export and char count', () => {
      const english = parseConstantsForLanguage(appleConstants, {
        slug: 'legal-terms',
        languageLabel: 'English',
      });
      const merged = substituteConstantTokens(appleListing, { 'legal-terms': english });
      expect(merged).to.not.include('{{legal-terms}}');
      expect(merged).to.include('[Optional access permissions]');
      expect(merged).to.include('Camera: Scan pages, create new pages from images');
    });

    it('leaves tokens unchanged when there are no values to substitute', () => {
      expect(substituteConstantTokens('a {{unknown-slug}} b', {})).to.equal('a {{unknown-slug}} b');
    });

    it('substitutes multiple slugs when all values are present', () => {
      const merged = substituteConstantTokens(
        'Start {{legal-terms}} middle {{privacy-note}} end',
        {
          'legal-terms': 'LEGAL',
          'privacy-note': 'PRIVACY',
        },
      );
      expect(merged).to.equal('Start LEGAL middle PRIVACY end');
    });

    it('substitutes only mapped slugs and clears unmapped ones when values exist', () => {
      const merged = substituteConstantTokens(
        'Start {{legal-terms}} middle {{privacy-note}} end',
        { 'legal-terms': 'LEGAL' },
      );
      expect(merged).to.equal('Start LEGAL middle  end');
      expect(merged).to.not.include('{{privacy-note}}');
    });

    it('parses multiple slug blocks for one language label', () => {
      const constantsHtml = `
        <body><main>
          <div class="aso-constants legal-terms">
            <div><div><p>Japanese</p></div><div><p>LEGAL JA</p></div></div>
          </div>
          <div class="aso-constants privacy-note">
            <div><div><p>Japanese</p></div><div><p>PRIVACY JA</p></div></div>
          </div>
        </main></body>
      `;
      expect(parseAllConstantsForLanguage(constantsHtml, 'Japanese')).to.deep.equal({
        'legal-terms': '<p>LEGAL JA</p>',
        'privacy-note': '<p>PRIVACY JA</p>',
      });
    });

    it('parses only populated slug blocks when others are blank for a language', () => {
      const constantsHtml = `
        <body><main>
          <div class="aso-constants legal-terms">
            <div><div><p>Japanese</p></div><div><p>LEGAL JA</p></div></div>
          </div>
          <div class="aso-constants privacy-note">
            <div><div><p>Japanese</p></div><div></div></div>
          </div>
        </main></body>
      `;
      expect(parseAllConstantsForLanguage(constantsHtml, 'Japanese')).to.deep.equal({
        'legal-terms': '<p>LEGAL JA</p>',
      });
    });

    it('substitutes empty string for tokens with no matching value when values exist', () => {
      expect(substituteConstantTokens('a {{unknown-slug}} b', { 'legal-terms': 'X' })).to.equal('a  b');
    });

    it('substitutes Korean constants for regional listings', () => {
      const korean = parseConstantsForLanguage(appleConstants, {
        slug: 'legal-terms',
        languageLabel: 'Korean',
      });
      const merged = substituteConstantTokens('<p>{{legal-terms}}</p>', { 'legal-terms': korean });
      expect(merged).to.include('[선택적 액세스 권한]');
      expect(merged).to.not.include('{{legal-terms}}');
    });
  });

  describe('constants file parse', () => {
    it('parses a language row for a slug', () => {
      const english = parseConstantsForLanguage(appleConstants, {
        slug: 'legal-terms',
        languageLabel: 'English',
      });
      expect(english).to.include('<p>[Optional access permissions]</p>');
      expect(english).to.include('Notifications: Receive update and alert push notifications from Adobe');
    });

    it('parses Korean constants row', () => {
      const korean = parseConstantsForLanguage(appleConstants, {
        slug: 'legal-terms',
        languageLabel: 'Korean',
      });
      expect(korean).to.include('[선택적 액세스 권한]');
      expect(korean).to.include('카메라: 페이지 스캔, 이미지로 새 페이지 만들기');
    });

    it('returns empty string when the language row is blank', () => {
      expect(parseConstantsForLanguage(appleConstants, {
        slug: 'legal-terms',
        languageLabel: 'German',
      })).to.equal('');
    });

    it('parses all populated language rows for a slug', () => {
      expect(parseConstantsByLanguageLabel(appleConstants, 'legal-terms')).to.have.keys(['English', 'Korean']);
    });

    it('parses all slug blocks for a language label', () => {
      expect(parseAllConstantsForLanguage(appleConstants, 'English')).to.deep.equal({
        'legal-terms': parseConstantsForLanguage(appleConstants, {
          slug: 'legal-terms',
          languageLabel: 'English',
        }),
      });
      expect(parseAllConstantsForLanguage(appleConstants, 'Korean')).to.deep.equal({
        'legal-terms': parseConstantsForLanguage(appleConstants, {
          slug: 'legal-terms',
          languageLabel: 'Korean',
        }),
      });
    });
  });
});
