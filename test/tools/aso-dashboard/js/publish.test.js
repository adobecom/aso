import { expect } from '@esm-bundle/chai';
import { formatPublishTimestamp, buildPublishPayload } from '../../../../tools/aso-dashboard/js/publish.js';

describe('publish', () => {
  it('formats the request filename as YYYY-DD-MM-T-HH-MI-SS-SSS (24h, UTC)', () => {
    const date = new Date(Date.UTC(2025, 2, 7, 15, 4, 5, 9));
    expect(formatPublishTimestamp(date)).to.equal('2025-07-03-T-15-04-05-009');
  });

  it('omits metadata when listing is not selected', () => {
    const cells = [{
      language: { code: 'en-US' }, device: 'apple', blockType: 'promo', fieldKey: 'eventName', promoName: 'p1', text: 'Hi', hasHtml: true,
    }];
    const payload = buildPublishPayload(cells, { product: 'app', platform: 'apple', languages: [{ code: 'en-US' }], promoNames: ['p1'], blockTypes: ['promo'] });
    expect(payload.metadata).to.equal(undefined);
    expect(payload.promos[0].localizations[0]).to.deep.equal({ locale: 'en-US', eventName: 'Hi' });
  });
});
