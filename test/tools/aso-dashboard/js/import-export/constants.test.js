import { expect } from '@esm-bundle/chai';
import {
  buildConstantsImportWrites,
  extractConstantsFromText,
  mergeConstantsUpdates,
  MARK_START,
  MARK_END,
} from '../../../../../tools/aso-dashboard/js/import-export/constants.js';
import { readMarkedCellText } from '../../../../../tools/aso-dashboard/js/import-export/template.js';
import { parseConstantsDocument } from '../../../../../tools/aso-constants/utils.js';

const mark = (text) => `${MARK_START}${text}${MARK_END}`;

describe('import-export-constants', () => {
  describe('extractConstantsFromText', () => {
    it('pulls an embedded non-Latin span into a field-keyed token and records the value', () => {
      const { text, constants } = extractConstantsFromText('Try 한국인 today', 'Korean', 'App Name');
      expect(constants).to.deep.equal([
        { slug: 'constant-app-name', language: 'Korean', value: '한국인' },
      ]);
      expect(text).to.equal('Try {{constant-app-name}} today');
    });

    it('keeps surrounding whitespace and punctuation in the English text', () => {
      const { text } = extractConstantsFromText('Hello, 한국 — bye', 'Korean', 'subtitle');
      // The comma and spaces stay English; only the letter core is tokenized.
      expect(text).to.equal('Hello, {{constant-subtitle}} — bye');
    });

    it('tokenizes a cell that is entirely non-Latin', () => {
      const { text, constants } = extractConstantsFromText('한국인', 'Korean', 'app-name');
      expect(constants).to.have.lengthOf(1);
      expect(text).to.equal('{{constant-app-name}}');
    });

    it('leaves pure-Latin text untouched with no constants', () => {
      const { text, constants } = extractConstantsFromText('Download the app now', 'French', 'app-name');
      expect(text).to.equal('Download the app now');
      expect(constants).to.have.lengthOf(0);
    });

    it('reuses one slug for a repeated value and records it once', () => {
      const { text, constants } = extractConstantsFromText('日本 and 日本', 'Japanese', 'app-name');
      expect(constants).to.have.lengthOf(1);
      expect(text).to.equal('{{constant-app-name}} and {{constant-app-name}}');
    });

    it('gives a second distinct span in the same field a -2 suffix', () => {
      const { text, constants } = extractConstantsFromText('Get 한국 and 서울', 'Korean', 'app-name');
      expect(constants.map((c) => c.slug)).to.deep.equal([
        'constant-app-name',
        'constant-app-name-2',
      ]);
      expect(text).to.equal('Get {{constant-app-name}} and {{constant-app-name-2}}');
    });

    it('produces the same slug for the same field across languages', () => {
      const kr = extractConstantsFromText('버전', 'Korean', 'App Name').constants[0].slug;
      const ja = extractConstantsFromText('日本', 'Japanese', 'App Name').constants[0].slug;
      expect(kr).to.equal('constant-app-name');
      expect(ja).to.equal('constant-app-name');
    });

    it('leaves HTML tags intact and tokenizes only the text', () => {
      const { text, constants } = extractConstantsFromText('<b>강조</b>', 'Korean', 'promo-text');
      expect(constants[0].value).to.equal('강조');
      expect(text).to.equal('<b>{{constant-promo-text}}</b>');
    });

    it('pulls a marked Latin-script span (German/French) into a constant', () => {
      const { text, constants } = extractConstantsFromText(
        `Entdecke ${mark('Kreativität')} heute`,
        'German',
        'app-name',
      );
      expect(constants).to.deep.equal([
        { slug: 'constant-app-name', language: 'German', value: 'Kreativität' },
      ]);
      expect(text).to.equal('Entdecke {{constant-app-name}} heute');
    });

    it('moves whitespace marked inside the span back outside the token', () => {
      const { text, constants } = extractConstantsFromText(`Get${mark(' Créativité ')}now`, 'French', 'subtitle');
      expect(constants[0].value).to.equal('Créativité');
      expect(text).to.equal('Get {{constant-subtitle}} now');
    });

    it('carries bold/italic markup from a marked span into the constant value', () => {
      const { text, constants } = extractConstantsFromText(
        `Try ${mark('<b>강조</b>')} now`,
        'Korean',
        'subtitle',
      );
      expect(constants[0].value).to.equal('<b>강조</b>');
      expect(text).to.equal('Try {{constant-subtitle}} now');
    });

    it('handles a marked span and an auto-detected non-Latin span in one field', () => {
      const { constants } = extractConstantsFromText(
        `${mark('Créativité')} 한국`,
        'French',
        'app-name',
      );
      expect(constants.map((c) => c.value)).to.deep.equal(['Créativité', '한국']);
      expect(constants.map((c) => c.slug)).to.deep.equal([
        'constant-app-name',
        'constant-app-name-2',
      ]);
    });
  });

  describe('readMarkedCellText', () => {
    const red = { color: { argb: 'FFFF0000' } };

    it('wraps a colored run in sentinels and leaves plain runs alone', () => {
      const value = { richText: [{ text: 'Try ' }, { text: 'Kreativität', font: red }, { text: ' now' }] };
      expect(readMarkedCellText(value)).to.equal(`Try ${mark('Kreativität')} now`);
    });

    it('marks any non-default colour, whatever the shade', () => {
      const crimson = { richText: [{ text: 'X', font: { color: { argb: 'FFDC143C' } } }] };
      const themeColour = { richText: [{ text: 'Y', font: { color: { theme: 5 } } }] };
      expect(readMarkedCellText(crimson)).to.equal(mark('X'));
      expect(readMarkedCellText(themeColour)).to.equal(mark('Y'));
    });

    it('does NOT mark bold-only runs (bold is ordinary emphasis)', () => {
      const value = { richText: [{ text: 'a' }, { text: 'B', font: { bold: true } }] };
      expect(readMarkedCellText(value)).to.equal('aB');
    });

    it('merges consecutive coloured runs (even different shades) into one span', () => {
      const value = {
        richText: [
          { text: 'Cré', font: { color: { argb: 'FFFF0000' } } },
          { text: 'ativité', font: { color: { argb: 'FFCC0000' } } },
        ],
      };
      expect(readMarkedCellText(value)).to.equal(mark('Créativité'));
    });

    it('does not mark plain black, default theme, or automatic-indexed text', () => {
      const black = { richText: [{ text: 'a', font: { color: { argb: 'FF000000' } } }] };
      const defaultTheme = { richText: [{ text: 'b', font: { color: { theme: 1 } } }] };
      const auto = { richText: [{ text: 'c', font: { color: { indexed: 64 } } }] };
      expect(readMarkedCellText(black)).to.equal('a');
      expect(readMarkedCellText(defaultTheme)).to.equal('b');
      expect(readMarkedCellText(auto)).to.equal('c');
    });

    it('wraps a bold marked run in <b> and an italic one in <i>', () => {
      const value = {
        richText: [
          { text: 'Neu ', font: red },
          { text: 'Kreativität', font: { color: red.color, bold: true } },
          { text: ' ' },
          { text: 'jetzt', font: { color: red.color, italic: true } },
        ],
      };
      // "Neu " and "jetzt" are coloured (marked); the unmarked space between splits the span.
      expect(readMarkedCellText(value)).to.equal(
        `${mark('Neu <b>Kreativität</b>')} ${mark('<i>jetzt</i>')}`,
      );
    });

    it('escapes HTML-special characters inside a marked run', () => {
      const value = { richText: [{ text: 'A & B <x>', font: red }] };
      expect(readMarkedCellText(value)).to.equal(mark('A &amp; B &lt;x&gt;'));
    });

    it('leaves unmarked runs as raw plain text (no escaping, no formatting)', () => {
      const value = { richText: [{ text: 'a & b', font: { bold: true } }] };
      expect(readMarkedCellText(value)).to.equal('a & b');
    });

    it('wraps each line of a bold run so a paragraph split cannot tear the tag', () => {
      const value = { richText: [{ text: 'line1\nline2', font: { color: red.color, bold: true } }] };
      expect(readMarkedCellText(value)).to.equal(mark('<b>line1</b>\n<b>line2</b>'));
      const { constants } = extractConstantsFromText(readMarkedCellText(value), 'Korean', 'app-name');
      const html = mergeConstantsUpdates(null, constants);
      expect(parseConstantsDocument(html).blocks['constant-app-name'].rows[0].contentHtml)
        .to.equal('<p><b>line1</b></p><p><b>line2</b></p>');
    });

    it('passes a plain string through unchanged', () => {
      expect(readMarkedCellText('just text')).to.equal('just text');
    });
  });

  describe('mergeConstantsUpdates', () => {
    it('builds a fresh constants document, saving the value as <p> like a field body', () => {
      const html = mergeConstantsUpdates(null, [
        { slug: 'constant-1', language: 'Korean', value: '한국인' },
      ]);
      const parsed = parseConstantsDocument(html);
      expect(parsed.slugs).to.deep.equal(['constant-1']);
      expect(parsed.blocks['constant-1'].rows).to.deep.equal([
        { language: 'Korean', contentHtml: '<p>한국인</p>' },
      ]);
    });

    it('stores one <p> per line, blank line → <br><br> (matches authored constants)', () => {
      const html = mergeConstantsUpdates(null, [
        {
          slug: 'legal',
          language: 'English',
          value: 'About access permissions\n\n[Optional access permissions]\nCamera: scan\nFiles: access',
        },
      ]);
      const { contentHtml } = parseConstantsDocument(html).blocks.legal.rows[0];
      expect(contentHtml).to.equal(
        '<p>About access permissions<br><br>[Optional access permissions]</p>'
        + '<p>Camera: scan</p><p>Files: access</p>',
      );
    });

    it('keeps bold/italic markup in the value', () => {
      const html = mergeConstantsUpdates(null, [
        { slug: 'promo', language: 'German', value: 'Neu <b>Kreativität</b> <i>jetzt</i>' },
      ]);
      const { contentHtml } = parseConstantsDocument(html).blocks.promo.rows[0];
      expect(contentHtml).to.equal('<p>Neu <b>Kreativität</b> <i>jetzt</i></p>');
    });

    it('adds a new language row while preserving existing slugs and languages', () => {
      const existing = mergeConstantsUpdates(null, [
        { slug: 'greeting', language: 'Korean', value: '안녕' },
        { slug: 'other', language: 'Korean', value: '다른' },
      ]);
      const merged = mergeConstantsUpdates(existing, [
        { slug: 'greeting', language: 'Japanese', value: 'こんにちは' },
      ]);
      const parsed = parseConstantsDocument(merged);
      expect(parsed.slugs).to.deep.equal(['greeting', 'other']);
      expect(parsed.blocks.greeting.rows).to.deep.equal([
        { language: 'Korean', contentHtml: '<p>안녕</p>' },
        { language: 'Japanese', contentHtml: '<p>こんにちは</p>' },
      ]);
      expect(parsed.blocks.other.rows).to.deep.equal([
        { language: 'Korean', contentHtml: '<p>다른</p>' },
      ]);
    });

    it('overwrites the value of an existing language row', () => {
      const existing = mergeConstantsUpdates(null, [
        { slug: 'greeting', language: 'Korean', value: 'old' },
      ]);
      const merged = mergeConstantsUpdates(existing, [
        { slug: 'greeting', language: 'Korean', value: 'new' },
      ]);
      const parsed = parseConstantsDocument(merged);
      expect(parsed.blocks.greeting.rows).to.deep.equal([
        { language: 'Korean', contentHtml: '<p>new</p>' },
      ]);
    });
  });

  describe('buildConstantsImportWrites', () => {
    it('groups constants by their sibling constants path, de-duping (slug, language) pairs', () => {
      const writes = buildConstantsImportWrites([
        {
          constantsPath: '/source/en-kr/a-constants',
          pageLeaf: 'listing',
          constants: [
            { slug: 'c1', language: 'Korean', value: '가' },
            { slug: 'c1', language: 'Korean', value: '가' },
          ],
        },
        {
          constantsPath: '/source/en-kr/a-constants',
          pageLeaf: 'listing',
          constants: [{ slug: 'c2', language: 'Korean', value: '나' }],
        },
        {
          constantsPath: '/source/en-fr/a-constants',
          pageLeaf: 'listing',
          constants: [{ slug: 'c3', language: 'French', value: 'Été' }],
        },
      ]);

      expect(writes).to.have.lengthOf(2);
      const kr = writes.find((w) => w.constantsPath === '/source/en-kr/a-constants');
      expect(kr.updates).to.deep.equal([
        { slug: 'c1', language: 'Korean', value: '가' },
        { slug: 'c2', language: 'Korean', value: '나' },
      ]);
      expect(kr.seen).to.equal(undefined);
    });

    it('ignores requests with no extracted constants', () => {
      const writes = buildConstantsImportWrites([
        { pagePath: '/x', text: 'plain', constants: [] },
        { pagePath: '/y', text: 'plain' },
      ]);
      expect(writes).to.have.lengthOf(0);
    });
  });
});
