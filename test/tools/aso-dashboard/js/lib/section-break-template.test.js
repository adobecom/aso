import { expect } from '@esm-bundle/chai';
import { convertTags, applySectionBreakMask } from '../../../../../blocks/aso-app/aso-utils.js';
import {
  buildSpacingSidecarFromText,
  parseReferenceText,
} from '../../../../../tools/aso-dashboard/js/lib/section-break-template.js';

function loadExpectedText(raw) {
  const trimmed = raw.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function trimLineEnds(text) {
  return text.split('\n').map((line) => line.trimEnd()).join('\n');
}

function getDescriptionFromHtml(html, label, sectionBreakAfter = null) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const block = doc.querySelector('.aso-app.listing.google, .aso-app.listing.apple');
  const row = Array.from(block.querySelectorAll(':scope > div')).find((element) => {
    const children = Array.from(element.children);
    return children.length >= 2 && children[0].textContent.trim() === label;
  });
  if (!row) return null;
  let dataEl = row.children[1];
  if (sectionBreakAfter?.length) {
    dataEl = applySectionBreakMask(dataEl, sectionBreakAfter);
  }
  return convertTags(dataEl, { addParagraphBreaks: true });
}

describe('section-break-template', () => {
  describe('parseReferenceText', () => {
    it('derives paragraph count and section breaks from blank lines', () => {
      const parsed = parseReferenceText('Line one\n\nLine two\nLine three');
      expect(parsed.paragraphCount).to.equal(3);
      expect(parsed.sectionBreakAfter).to.deep.equal([true, false]);
      expect(parsed.exportLineCount).to.equal(4);
    });

    it('matches Google Full Description golden export (25 paragraphs, 34 lines)', async () => {
      const resp = await fetch('/misc/aso-newline-issue/original-source.html');
      const text = loadExpectedText(await resp.text());
      const parsed = parseReferenceText(text);

      expect(parsed.paragraphCount).to.equal(25);
      expect(parsed.sectionBreakAfter.filter(Boolean).length).to.equal(9);
      expect(parsed.exportLineCount).to.equal(34);
    });

    it('matches Apple Description golden export (28 paragraphs, 38 lines)', async () => {
      const resp = await fetch('/misc/aso-newline-issue/consolidated/originals/apple.html');
      const text = loadExpectedText(await resp.text());
      const parsed = parseReferenceText(text);

      expect(parsed.paragraphCount).to.equal(28);
      expect(parsed.sectionBreakAfter.filter(Boolean).length).to.equal(10);
      expect(parsed.exportLineCount).to.equal(38);
    });
  });

  describe('buildSpacingSidecarFromText', () => {
    it('builds a v1 spacing sidecar payload', () => {
      const sidecar = buildSpacingSidecarFromText({
        text: 'One\n\nTwo',
        fieldName: 'Full Description',
        fieldKey: 'description',
      });

      expect(sidecar).to.deep.equal({
        version: 1,
        fieldName: 'Full Description',
        fieldKey: 'description',
        paragraphCount: 2,
        sectionBreakAfter: [true],
        exportLineCount: 3,
      });
    });
  });

  describe('applySectionBreakMask', () => {
    it('restores blank-line export spacing on minified HTML using saved sidecar', async () => {
      const [minifiedHtml, expectedText, goldenText, appleHtml] = await Promise.all([
        fetch('/misc/aso-newline-issue/live-page.html').then((resp) => resp.text()),
        fetch('/misc/aso-newline-issue/original-source.html').then((resp) => resp.text()),
        fetch('/misc/aso-newline-issue/consolidated/originals/apple.html').then((resp) => resp.text()),
        fetch('/misc/aso-newline-issue/apple-us-da.html').then((resp) => resp.text()),
      ]);

      const googleSidecar = buildSpacingSidecarFromText({
        text: loadExpectedText(expectedText),
        fieldName: 'Full Description',
        fieldKey: 'description',
      });

      const googleResult = getDescriptionFromHtml(
        minifiedHtml,
        'Full Description',
        googleSidecar.sectionBreakAfter,
      );
      expect(googleResult.split('\n').length).to.equal(34);
      expect(trimLineEnds(googleResult)).to.equal(trimLineEnds(loadExpectedText(expectedText)));

      const appleSidecar = buildSpacingSidecarFromText({
        text: loadExpectedText(goldenText),
        fieldName: 'Description',
        fieldKey: 'description',
      });
      const appleResult = getDescriptionFromHtml(
        appleHtml,
        'Description',
        appleSidecar.sectionBreakAfter,
      );
      expect(appleResult.split('\n').length).to.equal(38);
      expect(trimLineEnds(appleResult)).to.equal(trimLineEnds(loadExpectedText(goldenText)));
    });
  });
});
