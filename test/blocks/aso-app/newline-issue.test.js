import { expect } from '@esm-bundle/chai';
import { convertTags } from '../../../blocks/aso-app/aso-utils.js';

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

function getDescriptionFromHtml(html, label) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const block = doc.querySelector('.aso-app.listing.google, .aso-app.listing.apple');
  const row = Array.from(block.querySelectorAll(':scope > div')).find((element) => {
    const children = Array.from(element.children);
    return children.length >= 2 && children[0].textContent.trim() === label;
  });
  if (!row) return null;
  return convertTags(row.children[1], { addParagraphBreaks: true });
}

describe('newline issue fixtures', () => {
  let daHtml;
  let expectedText;

  before(async () => {
    const [daResp, expectedResp] = await Promise.all([
      fetch('/test/blocks/aso-app/mocks/newline-google.html'),
      fetch('/test/blocks/aso-app/mocks/newline-google.txt'),
    ]);
    expect(daResp.ok).to.equal(true);
    expect(expectedResp.ok).to.equal(true);
    daHtml = await daResp.text();
    expectedText = loadExpectedText(await expectedResp.text());
  });

  it('DA export matches original-source spacing (34 lines)', () => {
    const result = getDescriptionFromHtml(daHtml, 'Full Description');
    expect(result).to.be.a('string');
    expect(result).to.not.match(/\n{3,}/);
    expect(result.split('\n').length).to.equal(34);
    expect(trimLineEnds(result)).to.equal(trimLineEnds(expectedText));
  });

  it('does not collapse to 25-line minified spacing', () => {
    const shrunkText = trimLineEnds(expectedText).replace(/\n\n/g, '\n');
    const result = trimLineEnds(getDescriptionFromHtml(daHtml, 'Full Description'));
    expect(result).to.not.equal(shrunkText);
    expect(result.split('\n').length).to.be.above(25);
  });

  it('uses blank lines only where DA source has whitespace between p tags', () => {
    const result = getDescriptionFromHtml(daHtml, 'Full Description');
    expect(result).to.include('wherever you are.\n\nAn intuitive AI partner');
    expect(result).to.include('single text prompt.\n\nWhat can the app do?');
    expect(result).to.include('What can the app do?\nGenerate images');
    expect(result).to.not.include('What can the app do?\n\nGenerate images');
  });

  it('uses minified spacing on page HTML without DA gaps', () => {
    const minifiedHtml = daHtml.replace(/>\s+</g, '><');
    const result = getDescriptionFromHtml(minifiedHtml, 'Full Description');
    expect(trimLineEnds(result)).to.equal(trimLineEnds(expectedText).replace(/\n\n/g, '\n'));
    expect(result.split('\n').length).to.equal(25);
  });

  it('keeps space-separated section breaks when the page is on one line', () => {
    const result = getDescriptionFromHtml(daHtml.replace(/\n/g, ''), 'Full Description');
    expect(result.split('\n').length).to.equal(34);
    expect(trimLineEnds(result)).to.equal(trimLineEnds(expectedText));
    expect(result).to.include('wherever you are.\n\nAn intuitive AI partner');
    expect(result).to.include('What can the app do?\nGenerate images');
    expect(result).to.not.include('What can the app do?\n\nGenerate images');
  });

  it('matches Apple US description export spacing from DA source gaps', async () => {
    const [htmlResp, expectedResp] = await Promise.all([
      fetch('/test/blocks/aso-app/mocks/newline-apple.html'),
      fetch('/test/blocks/aso-app/mocks/newline-apple.txt'),
    ]);
    expect(htmlResp.ok).to.equal(true);
    expect(expectedResp.ok).to.equal(true);
    const result = getDescriptionFromHtml(await htmlResp.text(), 'Description');
    const expected = loadExpectedText(await expectedResp.text());
    expect(result.split('\n').length).to.equal(38);
    expect(trimLineEnds(result)).to.equal(trimLineEnds(expected));
    expect(result).to.include('Prompt to Edit.\n\nGenerate AI videos and sound effects');
  });
});
