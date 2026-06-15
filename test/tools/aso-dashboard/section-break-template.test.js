import { expect } from '@esm-bundle/chai';
import { convertTags, applySectionBreakMask } from '../../../blocks/aso-app/aso-utils.js';
import {
  buildExportGapMasks,
  parseReferenceText,
  resolveReferenceText,
} from '../../../tools/aso-dashboard/section-break-template.js';

function getFieldEl(html, label, device = 'google') {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const block = doc.querySelector(`.aso-app.listing.${device}`);
  const row = Array.from(block.querySelectorAll(':scope > div')).find((element) => {
    const children = Array.from(element.children);
    return children.length >= 2 && children[0].textContent.trim() === label;
  });
  return row?.children[1] ?? null;
}

describe('section-break-template', () => {
  it('parses default google reference to 25 paragraphs and 34 export lines', () => {
    const template = parseReferenceText(resolveReferenceText('google', ''));
    expect(template.paragraphCount).to.equal(25);
    expect(template.sectionBreakCount).to.equal(9);
    expect(template.exportLineCount).to.equal(34);
  });

  it('parses default apple reference to 28 paragraphs and 38 export lines', () => {
    const template = parseReferenceText(resolveReferenceText('apple', ''));
    expect(template.paragraphCount).to.equal(28);
    expect(template.sectionBreakCount).to.equal(10);
    expect(template.exportLineCount).to.equal(38);
  });

  it('applies default template to minified google HTML and yields 34 lines', async () => {
    const gapMasks = buildExportGapMasks();
    const resp = await fetch('/misc/aso-newline-issue/live-page.html');
    const html = await resp.text();
    const fieldEl = getFieldEl(html, 'Full Description', 'google');
    expect(fieldEl).to.exist;
    const template = gapMasks['google:listing:Full Description'];
    const el = fieldEl.cloneNode(true);
    const applied = applySectionBreakMask(el, template.sectionBreakAfter);
    expect(applied.applied).to.equal(true);
    const result = convertTags(el, { addParagraphBreaks: true });
    expect(result.split('\n').length).to.equal(34);
    expect(result).to.include('wherever you are.\n\nFirefly is your intuitive AI partner');
  });

  it('applies default template to minified apple HTML when paragraph count matches', async () => {
    const gapMasks = buildExportGapMasks();
    const resp = await fetch('/misc/aso-newline-issue/apple-us-da.html');
    const html = await resp.text();
    const fieldEl = getFieldEl(html, 'Description', 'apple');
    expect(fieldEl).to.exist;
    const template = gapMasks['apple:listing:Description'];
    const el = fieldEl.cloneNode(true);
    const applied = applySectionBreakMask(el, template.sectionBreakAfter);
    expect(applied.applied).to.equal(true);
    const result = convertTags(el, { addParagraphBreaks: true });
    expect(result.split('\n').length).to.equal(38);
  });
});
