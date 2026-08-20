import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';
import {
  buildPageHtml,
  buildSpacingSidecarForField,
  parseFieldFromPage,
  parseImageFieldFromPage,
  parsePageFields,
  readSpacingSidecar,
  writeSpacingSidecar,
} from '../../../../../tools/aso-dashboard/js/import-export/html.js';

describe('import-export-html', () => {
  let schema;
  let listingHtml;

  before(async () => {
    schema = JSON.parse(await readFile({ path: '../../mocks/block-schema.json' }));
    listingHtml = await readFile({ path: '../../../../blocks/aso-app/mocks/apple.html' });
  });

  describe('parsePageFields', () => {
    it('extracts listing fields by field key from an aso-app block', () => {
      const fields = parsePageFields(listingHtml, schema, 'apple', 'listing');

      expect(fields.name).to.equal('');
      expect(fields.description).to.include('Major new update');
      expect(fields.description).to.include('{{legal-terms}}');
    });

    it('returns an empty object when the block is missing', () => {
      expect(parsePageFields('<div></div>', schema, 'apple', 'listing')).to.deep.equal({});
    });
  });

  describe('buildPageHtml', () => {
    it('updates an existing field and preserves page structure', () => {
      const html = buildPageHtml(
        { name: 'Adobe Express' },
        schema,
        'apple',
        'listing',
        listingHtml,
      );

      const fields = parsePageFields(html, schema, 'apple', 'listing');
      expect(fields.name).to.equal('Adobe Express');
      expect(fields.description).to.include('Major new update');
    });

    it('decodes literal tag text (e.g. a workbook cell typed as <h1>Title</h1>) into real markup', () => {
      const html = buildPageHtml(
        { description: '<h1>Big News</h1>' },
        schema,
        'apple',
        'listing',
        listingHtml,
      );

      const doc = new DOMParser().parseFromString(html, 'text/html');
      const description = doc.querySelector('.aso-app h1');
      expect(description).to.exist;
      expect(description.textContent).to.equal('Big News');
      expect(html).to.not.include('&lt;h1&gt;');
    });

    it('creates a minimal block shell when no existing html is provided', () => {
      const html = buildPageHtml(
        { name: 'New App Title' },
        schema,
        'apple',
        'listing',
      );

      expect(html).to.include('class="aso-app listing apple"');
      expect(parsePageFields(html, schema, 'apple', 'listing').name).to.equal('New App Title');
    });

    it('wraps a brand-new page in the standard header/main/footer shell', () => {
      const html = buildPageHtml(
        { name: 'New App Title' },
        schema,
        'apple',
        'listing',
      );

      const doc = new DOMParser().parseFromString(html, 'text/html');
      expect(doc.querySelector('header')).to.exist;
      expect(doc.querySelector('footer')).to.exist;
      const section = doc.querySelector('main > div');
      expect(section).to.exist;
      expect(section.querySelector(':scope > .aso-app.listing.apple')).to.exist;
    });

    it('writes one <p> per line, not one <p> per blank-line-separated group', () => {
      const text = [
        'Intro line.',
        '',
        'Simplify your needs:',
        '⦁ Add new objects',
        '⦁ Blur or remove backgrounds',
        '',
        'KEY FEATURES',
        '⦁ Effortlessly select the background.',
      ].join('\n');

      const html = buildPageHtml({ name: text }, schema, 'apple', 'listing');
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const paragraphs = Array.from(doc.querySelectorAll('.aso-app p')).map((p) => p.textContent);

      expect(paragraphs).to.deep.equal([
        'App Name',
        'Intro line.',
        'Simplify your needs:',
        '⦁ Add new objects',
        '⦁ Blur or remove backgrounds',
        'KEY FEATURES',
        '⦁ Effortlessly select the background.',
      ]);
    });

    it('round-trips bullet-list text through import then export using the spacing sidecar', () => {
      const text = [
        'Intro line.',
        '',
        'Simplify your needs:',
        '⦁ Add new objects',
        '⦁ Blur or remove backgrounds',
        '',
        'KEY FEATURES',
        '⦁ Effortlessly select the background.',
      ].join('\n');

      const html = buildPageHtml({ description: text }, schema, 'apple', 'listing');
      const sidecar = buildSpacingSidecarForField(text, 'Description', 'description');

      const result = parseFieldFromPage({
        html,
        schema,
        device: 'apple',
        blockType: 'listing',
        fieldKey: 'description',
        fieldName: 'Description',
        spacingSidecar: sidecar,
      });

      expect(result).to.equal(text);
    });

    it('ignores a stale sidecar whose paragraphCount no longer matches the live content, instead of misapplying section breaks', () => {
      const originalText = ['Intro line.', '', 'Simplify your needs:'].join('\n');
      const sidecar = buildSpacingSidecarForField(originalText, 'Description', 'description');
      expect(sidecar.paragraphCount).to.equal(2);

      // Author added a third paragraph directly in DA after import — live content now has
      // 3 paragraphs, but the sidecar was built from (and still claims) 2.
      const editedText = ['Intro line.', 'Simplify your needs:', 'A brand new paragraph.'].join('\n');
      const html = buildPageHtml({ description: editedText }, schema, 'apple', 'listing');

      const args = {
        html, schema, device: 'apple', blockType: 'listing', fieldKey: 'description', fieldName: 'Description',
      };
      const withStaleSidecar = parseFieldFromPage({ ...args, spacingSidecar: sidecar });
      const withNoSidecar = parseFieldFromPage({ ...args, spacingSidecar: null });

      // Sidecar was ignored as stale — same result as with no sidecar at all, not the wrong
      // result of applying a 2-paragraph mask positionally against 3 live paragraphs.
      expect(withStaleSidecar).to.equal(withNoSidecar);
      expect(withStaleSidecar).to.equal(editedText);
    });
  });

  describe('parseImageFieldFromPage', () => {
    const mediaAssetsHtml = `<div class="aso-app media-assets apple">
      <div><div><p>Screenshot iPhone 1</p></div>
        <div><picture><img src="https://content.da.live/x/y/firefly1.jpeg" loading="lazy"></picture></div>
      </div>
      <div><div><p>Video 1</p></div><div></div></div>
    </div>`;

    it('extracts the image src for a media-assets field', () => {
      const src = parseImageFieldFromPage({
        html: mediaAssetsHtml,
        device: 'apple',
        blockType: 'media-assets',
        fieldName: 'Screenshot iPhone 1',
      });
      expect(src).to.equal('https://content.da.live/x/y/firefly1.jpeg');
    });

    it('returns an empty string when the field has no dropped image', () => {
      const src = parseImageFieldFromPage({
        html: mediaAssetsHtml,
        device: 'apple',
        blockType: 'media-assets',
        fieldName: 'Video 1',
      });
      expect(src).to.equal('');
    });

    it('returns an empty string when the block is missing', () => {
      const src = parseImageFieldFromPage({
        html: '<div></div>',
        device: 'apple',
        blockType: 'media-assets',
        fieldName: 'Screenshot iPhone 1',
      });
      expect(src).to.equal('');
    });
  });

  describe('spacing sidecar', () => {
    it('reads and writes spacing metadata', () => {
      const meta = {
        version: 1,
        fieldName: 'Description',
        fieldKey: 'description',
        paragraphCount: 3,
        sectionBreakAfter: [true, false, true],
        exportLineCount: 5,
      };

      const written = writeSpacingSidecar(meta);
      expect(readSpacingSidecar(JSON.parse(written))).to.deep.equal(meta);
    });

    it('returns null for invalid spacing sidecar input', () => {
      expect(readSpacingSidecar(null)).to.be.null;
      expect(readSpacingSidecar({ version: 2 })).to.be.null;
    });
  });
});
