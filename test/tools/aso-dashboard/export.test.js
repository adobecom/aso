import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';
import {
  buildImageFetchOptions,
  buildImageZipPath,
  collectMediaAssetEntries,
  createSheetData,
  getCurrentPreviewRef,
  getExtensionFromUrl,
  isAemPreviewUrl,
  isDaAssetUrl,
  parseAsoBlocks,
  resolvePreviewProxyUrl,
  resolvePublicMediaUrl,
  slugifyLabel,
} from '../../../tools/aso-dashboard/export.js';

describe('export parseAsoBlocks', () => {
  let listingHtml;
  const validBlockTypes = ['listing'];

  before(async () => {
    listingHtml = await readFile({ path: '../../blocks/aso-app/mocks/apple.html' });
  });

  it('leaves placeholder tokens when no constants values are provided', () => {
    const blocks = parseAsoBlocks(listingHtml, validBlockTypes);
    expect(blocks['apple-listing'][0].Description).to.include('{{legal-terms}}');
  });

  it('merges constants into exported field text', () => {
    const blocks = parseAsoBlocks(
      listingHtml,
      validBlockTypes,
      { 'legal-terms': '[Optional access permissions]\nCamera: Scan pages' },
    );
    const description = blocks['apple-listing'][0].Description;
    expect(description).to.include('[Optional access permissions]');
    expect(description).to.include('Camera: Scan pages');
    expect(description).to.not.include('{{legal-terms}}');
  });

  it('merges multiple placeholders and omits unmapped slugs', () => {
    const html = `
      <div class="aso-app listing apple">
        <div>
          <div><p>Description</p></div>
          <div><p>{{legal-terms}} {{privacy-note}}</p></div>
        </div>
      </div>
    `;
    const blocks = parseAsoBlocks(html, validBlockTypes, { 'legal-terms': 'LEGAL' });
    const description = blocks['apple-listing'][0].Description;
    expect(description).to.include('LEGAL');
    expect(description).to.not.include('{{legal-terms}}');
    expect(description).to.not.include('{{privacy-note}}');
  });

  it('excludes media-assets blocks from parsed output', () => {
    const html = `
      <div class="aso-app listing apple">
        <div>
          <div><p>Description</p></div>
          <div><p>Some copy</p></div>
        </div>
      </div>
      <div class="aso-app media-assets apple">
        <div>
          <div><p>Screenshot iPhone 1</p></div>
          <div><picture><img src="https://content.da.live/x/y/firefly1.jpeg"></picture></div>
        </div>
      </div>
    `;
    const blocks = parseAsoBlocks(html, ['listing', 'media-assets']);
    expect(blocks['apple-listing']).to.exist;
    expect(blocks['apple-media-assets']).to.not.exist;
  });
});

describe('export slugifyLabel', () => {
  it('lowercases and hyphenates a field label', () => {
    expect(slugifyLabel('Screenshot iPhone 1')).to.equal('screenshot-iphone-1');
  });

  it('collapses repeated separators and trims edges', () => {
    expect(slugifyLabel('  Phone   Screenshot -- 1  ')).to.equal('phone-screenshot-1');
  });
});

describe('export getExtensionFromUrl', () => {
  it('parses the extension from a plain URL', () => {
    expect(getExtensionFromUrl('https://content.da.live/x/y/firefly1.jpeg')).to.equal('jpeg');
  });

  it('ignores a query string when parsing the extension', () => {
    expect(getExtensionFromUrl('https://content.da.live/x/y/firefly1.png?width=750')).to.equal('png');
  });

  it('returns null when no extension is present, rather than guessing one', () => {
    expect(getExtensionFromUrl('https://content.da.live/x/y/firefly1')).to.equal(null);
  });

  it('ignores a #width=...&height=... fragment left by the EDS media pipeline', () => {
    const url = 'https://main--aso--adobecom.aem.page/media_abc123.png#width=1052&height=592';
    expect(getExtensionFromUrl(url)).to.equal('png');
  });

  it('ignores a fragment combined with a query string', () => {
    const url = 'https://example.com/x/y/firefly1.jpeg?width=750#width=1052&height=592';
    expect(getExtensionFromUrl(url)).to.equal('jpeg');
  });
});

describe('export isDaAssetUrl / isAemPreviewUrl', () => {
  it('recognizes a DA asset host', () => {
    expect(isDaAssetUrl('https://content.da.live/x/y/firefly1.jpeg')).to.equal(true);
  });

  it('does not treat an AEM preview host as a DA asset host', () => {
    expect(isDaAssetUrl('https://main--aso--adobecom.aem.page/media_abc.png')).to.equal(false);
  });

  it('recognizes an .aem.page preview host', () => {
    expect(isAemPreviewUrl('https://main--aso--adobecom.aem.page/media_abc.png')).to.equal(true);
  });

  it('recognizes an .hlx.page preview host', () => {
    expect(isAemPreviewUrl('https://main--aso--adobecom.hlx.page/media_abc.png')).to.equal(true);
  });

  it('does not treat the published .aem.live host as a gated preview host', () => {
    expect(isAemPreviewUrl('https://main--aso--adobecom.aem.live/media_abc.png')).to.equal(false);
  });

  it('does not treat an unrelated external host as anything special', () => {
    expect(isDaAssetUrl('https://example.com/image.png')).to.equal(false);
    expect(isAemPreviewUrl('https://example.com/image.png')).to.equal(false);
  });
});

describe('export buildImageFetchOptions', () => {
  it('sends the DA bearer token only to a DA asset host', () => {
    const options = buildImageFetchOptions('https://content.da.live/x/y/firefly1.jpeg', 'tok123');
    expect(options).to.deep.equal({ headers: { Authorization: 'Bearer tok123' } });
  });

  it('sends no credentials or token to an unrelated external URL', () => {
    const options = buildImageFetchOptions('https://example.com/image.png', 'tok123');
    expect(options).to.deep.equal({});
  });

  it('sends no credentials or token to the published .aem.live host', () => {
    const options = buildImageFetchOptions('https://main--aso--adobecom.aem.live/media_abc.png', 'tok123');
    expect(options).to.deep.equal({});
  });

  it('sends no credentials or token to a gated preview host either — it is resolved to .live before this is called', () => {
    const options = buildImageFetchOptions('https://main--aso--adobecom.aem.page/media_abc.png', 'tok123');
    expect(options).to.deep.equal({});
  });
});

describe('export resolvePublicMediaUrl', () => {
  it('rewrites an .aem.page preview URL to the published .aem.live equivalent', () => {
    const url = 'https://main--aso--adobecom.aem.page/media_abc.png#width=1052&height=592';
    expect(resolvePublicMediaUrl(url)).to.equal(
      'https://main--aso--adobecom.aem.live/media_abc.png#width=1052&height=592',
    );
  });

  it('rewrites an .hlx.page preview URL to the published .hlx.live equivalent', () => {
    const url = 'https://main--aso--adobecom.hlx.page/media_abc.png';
    expect(resolvePublicMediaUrl(url)).to.equal('https://main--aso--adobecom.hlx.live/media_abc.png');
  });

  it('leaves a DA asset URL unchanged', () => {
    const url = 'https://content.da.live/x/y/firefly1.jpeg';
    expect(resolvePublicMediaUrl(url)).to.equal(url);
  });

  it('leaves an already-published .aem.live URL unchanged', () => {
    const url = 'https://main--aso--adobecom.aem.live/media_abc.png';
    expect(resolvePublicMediaUrl(url)).to.equal(url);
  });

  it('leaves an unrelated external URL unchanged', () => {
    const url = 'https://example.com/image.png';
    expect(resolvePublicMediaUrl(url)).to.equal(url);
  });
});

describe('export getCurrentPreviewRef', () => {
  it('extracts the ref when hosted on the authenticated preview domain', () => {
    const hostname = 'stage--aso--adobecom.preview.da.live';
    expect(getCurrentPreviewRef('aso', 'adobecom', hostname)).to.equal('stage');
  });

  it('returns null when hosted on localhost (ref=local skips the preview handshake)', () => {
    expect(getCurrentPreviewRef('aso', 'adobecom', 'localhost')).to.equal(null);
  });

  it('returns null when repo/org do not match the current hostname', () => {
    const hostname = 'stage--other-repo--other-org.preview.da.live';
    expect(getCurrentPreviewRef('aso', 'adobecom', hostname)).to.equal(null);
  });
});

describe('export resolvePreviewProxyUrl', () => {
  it('substitutes the CURRENT ref, not the URL\'s own embedded ref — that\'s the one with a session', () => {
    const url = 'https://main--aso--adobecom.aem.page/media_abc.png#width=1052&height=592';
    expect(resolvePreviewProxyUrl(url, 'stage')).to.equal(
      'https://stage--aso--adobecom.preview.da.live/media_abc.png#width=1052&height=592',
    );
  });

  it('rewrites an .hlx.page preview URL to the same DA preview proxy domain', () => {
    const url = 'https://main--aso--adobecom.hlx.page/media_abc.png';
    expect(resolvePreviewProxyUrl(url, 'main')).to.equal('https://main--aso--adobecom.preview.da.live/media_abc.png');
  });

  it('returns null when there is no known current ref (e.g. ref=local)', () => {
    const url = 'https://main--aso--adobecom.aem.page/media_abc.png';
    expect(resolvePreviewProxyUrl(url, null)).to.equal(null);
  });

  it('returns null for a DA asset URL — nothing to proxy', () => {
    expect(resolvePreviewProxyUrl('https://content.da.live/x/y/firefly1.jpeg', 'main')).to.equal(null);
  });

  it('returns null for an already-published .aem.live URL', () => {
    expect(resolvePreviewProxyUrl('https://main--aso--adobecom.aem.live/media_abc.png', 'main')).to.equal(null);
  });

  it('returns null for an unrelated external URL', () => {
    expect(resolvePreviewProxyUrl('https://example.com/image.png', 'main')).to.equal(null);
  });
});

describe('export collectMediaAssetEntries', () => {
  it('extracts label + image src pairs from media-assets blocks', () => {
    const html = `
      <div class="aso-app media-assets apple">
        <div>
          <div><p>Screenshot iPhone 1</p></div>
          <div><picture><img src="https://content.da.live/x/y/firefly1.jpeg" loading="lazy"></picture></div>
        </div>
        <div>
          <div><p>Screenshot iPhone 2</p></div>
          <div></div>
        </div>
      </div>
    `;
    const entries = collectMediaAssetEntries(html);
    expect(entries).to.have.lengthOf(1);
    expect(entries[0]).to.deep.equal({
      label: 'Screenshot iPhone 1',
      src: 'https://content.da.live/x/y/firefly1.jpeg',
    });
  });

  it('returns an empty array when no media-assets block is present', () => {
    const html = '<div class="aso-app listing apple"><div><div><p>Description</p></div><div></div></div></div>';
    expect(collectMediaAssetEntries(html)).to.deep.equal([]);
  });
});

describe('export buildImageZipPath', () => {
  it('builds a nested product/device/language/images path', () => {
    const path = buildImageZipPath(
      { product: 'adobe-express', device: 'apple', language: 'en-us' },
      'screenshot-iphone-1',
      'jpeg',
    );
    expect(path).to.equal('adobe-express/apple/en-us/images/screenshot-iphone-1.jpeg');
  });

  it('strips a leading slash from the language segment', () => {
    const path = buildImageZipPath(
      { product: 'adobe-express', device: 'google', language: '/en-us' },
      'phone-screenshot-1',
      'png',
    );
    expect(path).to.equal('adobe-express/google/en-us/images/phone-screenshot-1.png');
  });
});

describe('export createSheetData', () => {
  it('adds aggregated Play blob only for google listing release notes', () => {
    const languages = ['en-us', 'fr-fr'];
    const sheetData = {
      blockType: 'listing',
      google: {
        listing: {
          'en-us': {
            Title: 'EN title',
            'Release Notes': 'EN release notes',
          },
          'fr-fr': {
            Title: 'FR title',
            'Release Notes': 'FR notes',
          },
        },
      },
      apple: {},
    };

    const rows = createSheetData(sheetData, languages, 'listing');
    expect(rows[0][0]).to.equal('Google');
    expect(rows[0]).to.have.lengthOf(4);
    expect(rows[1]).to.deep.equal(['Languages', 'Aggregated (Play paste)', 'en-us', 'fr-fr']);

    const releaseRow = rows.find((row) => row[0] === 'Release Notes');
    expect(releaseRow).to.exist;
    expect(releaseRow[1]).to.equal(
      '<en-US>\n\nEN release notes\n\n</en-US>\n\n'
      + '<fr-FR>\n\nFR notes\n\n</fr-FR>',
    );
    expect(releaseRow[2]).to.equal('EN release notes');
    expect(releaseRow[3]).to.equal('FR notes');

    const titleRow = rows.find((row) => row[0] === 'Title');
    expect(titleRow).to.exist;
    expect(titleRow[1]).to.equal('');
  });

  it('omits Aggregated (Play paste) column for non-listing block types', () => {
    const languages = ['en-us'];
    const sheetData = {
      blockType: 'promo',
      google: { promo: { 'en-us': { 'Release Notes': 'Should not aggregate' } } },
      apple: {},
    };

    const rows = createSheetData(sheetData, languages, 'promo');
    expect(rows[0]).to.have.lengthOf(2);
    expect(rows[1]).to.deep.equal(['Languages', 'en-us']);
    const releaseRow = rows.find((row) => row[0] === 'Release Notes');
    expect(releaseRow).to.exist;
    expect(releaseRow).to.deep.equal(['Release Notes', 'Should not aggregate']);
  });
});
