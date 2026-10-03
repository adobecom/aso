import { expect } from '@esm-bundle/chai';
import { formatPublishTimestamp, buildPublishPayload } from '../../../../tools/aso-dashboard/js/publish.js';

describe('publish', () => {
  it('formats the request filename as YYYY-MM-DD-t-HH-MI-SS-SSS (24h, UTC)', () => {
    const date = new Date(Date.UTC(2025, 2, 7, 15, 4, 5, 9));
    expect(formatPublishTimestamp(date)).to.equal('2025-03-07-t-15-04-05-009');
  });

  it('omits metadata when listing is not selected', () => {
    const cells = [{
      language: { code: 'en-US' }, device: 'apple', blockType: 'promo', fieldKey: 'eventName', promoName: 'p1', text: 'Hi', hasHtml: true,
    }];
    const payload = buildPublishPayload(cells, { product: 'app', platform: 'apple', languages: [{ code: 'en-US' }], promoNames: ['p1'], blockTypes: ['promo'] });
    expect(payload.metadata).to.equal(undefined);
    expect(payload.promos[0].localizations[0]).to.deep.equal({ locale: 'en-US', eventName: 'Hi' });
  });

  ['apple', 'google'].forEach((platform) => {
    it(`omits empty ${platform} metadata localizations`, () => {
      const fieldKey = platform === 'apple' ? 'name' : 'title';
      const cells = [
        {
          language: { code: 'en-US' }, device: platform, blockType: 'listing', fieldKey, text: 'App', hasHtml: true,
        },
        {
          language: { code: 'en' }, device: platform, blockType: 'listing', fieldKey, text: '', hasHtml: true,
        },
        {
          language: { code: 'ja-jp' }, device: platform, blockType: 'listing', fieldKey: 'unrecognized', text: 'Ignored', hasHtml: true,
        },
      ];
      const payload = buildPublishPayload(cells, {
        product: 'app',
        platform,
        languages: [{ code: 'en' }, { code: 'en-US' }, { code: 'ja-jp' }],
        blockTypes: ['listing'],
      });
      expect(payload.metadata.localizations).to.deep.equal([{ locale: 'en-US', [fieldKey]: 'App' }]);
    });

    it(`keeps an empty localization array when ${platform} metadata has no content`, () => {
      const payload = buildPublishPayload([], { product: 'app', platform, languages: [{ code: 'en' }, { code: 'ja-jp' }], blockTypes: ['listing'] });
      expect(payload.metadata.localizations).to.deep.equal([]);
    });
  });

  it('omits empty Apple promo localizations independently for each promo', () => {
    const cells = [
      {
        language: { code: 'en' }, device: 'apple', blockType: 'promo', fieldKey: 'eventName', promoName: 'p1', text: 'Event', hasHtml: true,
      },
      {
        language: { code: 'ja-jp' }, device: 'apple', blockType: 'promo', fieldKey: 'eventName', promoName: 'p1', text: '', hasHtml: true,
      },
      {
        language: { code: 'ja-jp' }, device: 'apple', blockType: 'promo', fieldKey: 'shortDescription', promoName: 'p2', text: 'Description', hasHtml: true,
      },
    ];
    const payload = buildPublishPayload(cells, {
      product: 'app',
      platform: 'apple',
      languages: [{ code: 'en' }, { code: 'ja-jp' }],
      promoNames: ['p1', 'p2', 'p3'],
      blockTypes: ['promo'],
    });
    expect(payload.promos).to.deep.equal([
      { referenceName: 'p1', localizations: [{ locale: 'en', eventName: 'Event' }] },
      { referenceName: 'p2', localizations: [{ locale: 'ja-jp', shortDescription: 'Description' }] },
      { referenceName: 'p3', localizations: [] },
    ]);
  });
});
