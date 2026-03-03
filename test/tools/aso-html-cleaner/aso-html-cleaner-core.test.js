import { expect } from '@esm-bundle/chai';
import {
  buildSourceUrl,
  decodeHtmlEntities,
  hasLiteralTags,
  cleanCellContentForDocument,
} from '../../../tools/aso-html-cleaner/aso-html-cleaner-core.js';

describe('aso-html-cleaner-core', () => {
  describe('buildSourceUrl', () => {
    it('normalizes path with leading slash and adds .html', () => {
      expect(buildSourceUrl('org', 'repo', '/drafts/user/page'))
        .to.equal('https://admin.da.live/source/org/repo/drafts/user/page.html');
    });

    it('adds leading slash when path has none', () => {
      expect(buildSourceUrl('org', 'repo', 'drafts/user/page'))
        .to.equal('https://admin.da.live/source/org/repo/drafts/user/page.html');
    });

    it('does not duplicate .html when path already has it', () => {
      expect(buildSourceUrl('org', 'repo', '/drafts/user/page.html'))
        .to.equal('https://admin.da.live/source/org/repo/drafts/user/page.html');
    });
  });

  describe('decodeHtmlEntities', () => {
    it('decodes &lt; and &gt; to < and >', () => {
      expect(decodeHtmlEntities('&lt;h1&gt;')).to.equal('<h1>');
    });

    it('decodes &amp; to &', () => {
      expect(decodeHtmlEntities('a &amp; b')).to.equal('a & b');
    });

    it('leaves other content unchanged', () => {
      expect(decodeHtmlEntities('plain text')).to.equal('plain text');
    });
  });

  describe('hasLiteralTags', () => {
    it('returns true when escaped h1 tag present', () => {
      expect(hasLiteralTags('&lt;h1&gt;Title&lt;/h1&gt;')).to.be.true;
    });

    it('returns true for h2–h6, b, i, u, strong, em', () => {
      expect(hasLiteralTags('&lt;h2&gt;')).to.be.true;
      expect(hasLiteralTags('&lt;b&gt;')).to.be.true;
      expect(hasLiteralTags('&lt;strong&gt;')).to.be.true;
      expect(hasLiteralTags('&lt;em&gt;')).to.be.true;
    });

    it('returns true for closing tags', () => {
      expect(hasLiteralTags('&lt;/h1&gt;')).to.be.true;
    });

    it('returns false when no escaped tags', () => {
      expect(hasLiteralTags('<h1>real tag</h1>')).to.be.false;
      expect(hasLiteralTags('plain text')).to.be.false;
    });
  });

  describe('cleanCellContentForDocument', () => {
    it('returns same string when no literal tags', () => {
      const html = '<p>Hello</p>';
      expect(cleanCellContentForDocument(html)).to.equal(html);
    });

    it('decodes escaped literal tags only', () => {
      const input = '&lt;h1&gt;Title&lt;/h1&gt;';
      expect(cleanCellContentForDocument(input)).to.equal('<h1>Title</h1>');
    });

    it('preserves existing HTML while decoding literal tags', () => {
      const input = '<p>&lt;h1&gt;Head&lt;/h1&gt; and <ul><li>item</li></ul></p>';
      expect(cleanCellContentForDocument(input))
        .to.equal('<p><h1>Head</h1> and <ul><li>item</li></ul></p>');
    });
  });
});
