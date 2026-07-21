import { expect } from '@esm-bundle/chai';
import {
  buildImageFetchOptions,
  buildImageZipPath,
  getCurrentPreviewRef,
  getExtensionFromUrl,
  isAemPreviewUrl,
  isDaAssetUrl,
  resolvePreviewProxyUrl,
  resolvePublicMediaUrl,
  slugifyLabel,
} from '../../../../../tools/aso-dashboard/js/lib/media-fetch.js';

describe('media-fetch isDaAssetUrl / isAemPreviewUrl', () => {
  it('recognizes a DA content asset host', () => {
    expect(isDaAssetUrl('https://content.da.live/x/y/firefly1.jpeg')).to.equal(true);
  });

  it('recognizes an .aem.page preview host', () => {
    expect(isAemPreviewUrl('https://main--aso--adobecom.aem.page/media_abc.png')).to.equal(true);
  });

  it('recognizes an .hlx.page preview host', () => {
    expect(isAemPreviewUrl('https://main--aso--adobecom.hlx.page/media_abc.png')).to.equal(true);
  });

  it('does not treat a published .aem.live host as a preview host', () => {
    expect(isAemPreviewUrl('https://main--aso--adobecom.aem.live/media_abc.png')).to.equal(false);
  });

  it('does not treat an unrelated external URL as either', () => {
    expect(isDaAssetUrl('https://example.com/image.png')).to.equal(false);
    expect(isAemPreviewUrl('https://example.com/image.png')).to.equal(false);
  });
});

describe('media-fetch buildImageFetchOptions', () => {
  it('sends the DA bearer token only to a DA asset host', () => {
    const options = buildImageFetchOptions('https://content.da.live/x/y/firefly1.jpeg', 'tok123');
    expect(options).to.deep.equal({ headers: { Authorization: 'Bearer tok123' } });
  });

  it('sends no credentials or token to an unrelated external URL', () => {
    expect(buildImageFetchOptions('https://example.com/image.png', 'tok123')).to.deep.equal({});
  });

  it('sends no credentials or token to the published .aem.live host', () => {
    const url = 'https://main--aso--adobecom.aem.live/media_abc.png';
    expect(buildImageFetchOptions(url, 'tok123')).to.deep.equal({});
  });
});

describe('media-fetch getCurrentPreviewRef', () => {
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

describe('media-fetch resolvePreviewProxyUrl', () => {
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
    expect(resolvePreviewProxyUrl('https://main--aso--adobecom.aem.page/media_abc.png', null)).to.equal(null);
  });

  it('returns null for a DA asset URL — nothing to proxy', () => {
    expect(resolvePreviewProxyUrl('https://content.da.live/x/y/firefly1.jpeg', 'main')).to.equal(null);
  });
});

describe('media-fetch resolvePublicMediaUrl', () => {
  it('rewrites an .aem.page preview URL to the published .aem.live equivalent', () => {
    const url = 'https://main--aso--adobecom.aem.page/media_abc.png#width=1052&height=592';
    expect(resolvePublicMediaUrl(url)).to.equal(
      'https://main--aso--adobecom.aem.live/media_abc.png#width=1052&height=592',
    );
  });

  it('leaves a DA asset URL unchanged', () => {
    const url = 'https://content.da.live/x/y/firefly1.jpeg';
    expect(resolvePublicMediaUrl(url)).to.equal(url);
  });
});

describe('media-fetch slugifyLabel', () => {
  it('lowercases and hyphenates a field label', () => {
    expect(slugifyLabel('Screenshot iPhone 1')).to.equal('screenshot-iphone-1');
  });

  it('collapses repeated separators and trims edges', () => {
    expect(slugifyLabel('  Phone   Screenshot -- 1  ')).to.equal('phone-screenshot-1');
  });
});

describe('media-fetch getExtensionFromUrl', () => {
  it('parses the extension from a plain URL', () => {
    expect(getExtensionFromUrl('https://content.da.live/x/y/firefly1.jpeg')).to.equal('jpeg');
  });

  it('ignores a query string and a fragment when parsing the extension', () => {
    expect(getExtensionFromUrl('https://x/y/firefly1.png?width=750')).to.equal('png');
    expect(getExtensionFromUrl('https://x/y/media_abc.png#width=1052&height=592')).to.equal('png');
  });

  it('returns null when no extension is present, rather than guessing one', () => {
    expect(getExtensionFromUrl('https://content.da.live/x/y/firefly1')).to.equal(null);
  });
});

describe('media-fetch buildImageZipPath', () => {
  it('builds a nested product/device/language/images path', () => {
    const path = buildImageZipPath(
      { product: 'adobe-express', device: 'apple', languageSegment: 'de-de' },
      'screenshot-iphone-1',
      'jpeg',
    );
    expect(path).to.equal('adobe-express/apple/de-de/images/screenshot-iphone-1.jpeg');
  });
});
