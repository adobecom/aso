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
      fetch('/misc/aso-newline-issue/da.html'),
      fetch('/misc/aso-newline-issue/original-source.html'),
    ]);
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

  it('does not collapse to 25-line minified spacing', async () => {
    const shrunkResp = await fetch('/misc/aso-newline-issue/post-da-workflow-itr2.html');
    const shrunkText = trimLineEnds(loadExpectedText(await shrunkResp.text()));
    const result = trimLineEnds(getDescriptionFromHtml(daHtml, 'Full Description'));
    expect(result).to.not.equal(shrunkText);
    expect(result.split('\n').length).to.be.above(25);
  });

  it('uses blank lines only where DA source has whitespace between p tags', () => {
    const result = getDescriptionFromHtml(daHtml, 'Full Description');
    expect(result).to.include('wherever you are.\n\nFirefly is your intuitive AI partner');
    expect(result).to.include('single text prompt.\n\nWhat can Adobe Firefly do?');
    expect(result).to.include('What can Adobe Firefly do?\nText to image AI image generator');
    expect(result).to.not.include('What can Adobe Firefly do?\n\nText to image AI image generator');
  });

  it('uses minified spacing on EDS-rendered page HTML without DA gaps', async () => {
    const liveResp = await fetch('/misc/aso-newline-issue/live-page.html');
    const result = getDescriptionFromHtml(await liveResp.text(), 'Full Description');
    expect(result.length).to.equal(3233);
    expect(result.split('\n').length).to.equal(25);
  });

  it('uses consolidated google.html gaps: space between tags is blank line, minified is single line', async () => {
    const htmlResp = await fetch('/misc/aso-newline-issue/consolidated/htmls/google.html');
    const result = getDescriptionFromHtml(await htmlResp.text(), 'Full Description');
    expect(result.split('\n').length).to.equal(34);
    expect(result).to.include('wherever you are.\n\nFirefly is your intuitive AI partner');
    expect(result).to.include('What can Adobe Firefly do?\nText to image AI image generator');
    expect(result).to.not.include('What can Adobe Firefly do?\n\nText to image AI image generator');
  });

  it('matches Apple US description export spacing from DA source gaps', async () => {
    const [htmlResp, expectedResp] = await Promise.all([
      fetch('/misc/aso-newline-issue/apple-us-da.html'),
      fetch('/misc/aso-newline-issue/consolidated/originals/apple.html'),
    ]);
    const result = getDescriptionFromHtml(await htmlResp.text(), 'Description');
    const expected = loadExpectedText(await expectedResp.text());
    expect(result.split('\n').length).to.equal(38);
    expect(trimLineEnds(result)).to.equal(trimLineEnds(expected));
    expect(result).to.include('Prompt to Edit.\n\nGenerate AI videos and sound effects');
  });
});
