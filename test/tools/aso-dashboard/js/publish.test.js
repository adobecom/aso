import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';
import sinon from 'sinon';
import { formatPublishTimestamp, buildPublishPayload, publishSelection } from '../../../../tools/aso-dashboard/js/publish.js';
import { buildLanguageIndex } from '../../../../tools/aso-dashboard/js/lib/translate-paths.js';

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

    it(`omits ${platform} metadata when its localizations are empty`, () => {
      const payload = buildPublishPayload([], { product: 'app', platform, languages: [{ code: 'en' }, { code: 'ja-jp' }], blockTypes: ['listing'] });
      expect(payload).not.to.have.property('metadata');
      expect(JSON.parse(JSON.stringify(payload))).not.to.have.property('metadata');
      expect(payload.app).to.equal('app');
      if (platform === 'google') {
        expect(payload.platform).to.equal('google');
        expect(payload).to.have.property('track');
      }
    });

    it(`omits ${platform} metadata when no languages are selected`, () => {
      const payload = buildPublishPayload([], { product: 'app', platform, languages: [], blockTypes: ['listing'] });
      expect(payload).not.to.have.property('metadata');
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
      { referenceName: 'p3' },
    ]);
  });

  it('omits empty metadata and promo localizations without removing promo reference names', () => {
    const payload = buildPublishPayload([], {
      product: 'app',
      platform: 'apple',
      languages: [{ code: 'en' }],
      promoNames: ['p1'],
    });
    expect(payload).to.deep.equal({ app: 'app', promos: [{ referenceName: 'p1' }] });
  });

  it('omits promos when no promo names are selected', () => {
    const payload = buildPublishPayload([], {
      product: 'app',
      platform: 'apple',
      languages: [{ code: 'en' }],
      promoNames: [],
    });
    expect(payload).to.deep.equal({ app: 'app' });
  });

  describe('publishSelection', () => {
    const filePath = '/.da/storepublish/request/2026-10-04-t-06-09-55-062.json';
    const serviceResult = { requestId: 'b9bf6f64-58a3-42b3-a4f6-c1361643547a', status: 'queued' };
    let options;
    let fetchStub;

    beforeEach(async () => {
      const schema = JSON.parse(await readFile({ path: '../mocks/block-schema.json' }));
      const sheetMap = JSON.parse(await readFile({ path: '../mocks/sheet-to-block-map.json' }));
      const translateData = JSON.parse(await readFile({ path: '../mocks/translate.json' }));
      const listingHtml = await readFile({ path: '../../../blocks/aso-app/mocks/apple.html' });
      const languages = buildLanguageIndex(translateData.languages.data, translateData);
      options = {
        org: 'test-org',
        repo: 'test-repo',
        token: 'token',
        schema,
        sheetMap,
        product: 'adobe-express',
        platform: 'apple',
        languages: languages.filter((language) => language.name === 'German'),
        releasePeriod: { year: '2026', quarter: 'q4', month: 'october' },
        blockTypes: ['listing'],
        fetchPage: sinon.stub().resolves({ html: listingHtml, htmlFound: true }),
        now: new Date('2026-10-04T06:09:55.062Z'),
      };
      fetchStub = sinon.stub(window, 'fetch');
      fetchStub.onCall(0).resolves(new Response(null, { status: 201 }));
      fetchStub.onCall(1).resolves(new Response(JSON.stringify(serviceResult), { status: 202 }));
      fetchStub.onCall(2).resolves(new Response(null, { status: 200 }));
    });

    afterEach(() => sinon.restore());

    async function expectFailure(message) {
      let failure;
      try {
        await publishSelection(options);
      } catch (error) {
        failure = error;
      }
      expect(failure).to.be.instanceOf(Error);
      expect(failure.message).to.include(message);
    }

    it('submits the saved path and adds the service fields to the same file', async () => {
      const result = await publishSelection(options);
      expect(fetchStub.callCount).to.equal(3);
      const [sourceUrl, initialWrite] = fetchStub.firstCall.args;
      const [serviceUrl, submission] = fetchStub.secondCall.args;
      const [updateUrl, updatedWrite] = fetchStub.thirdCall.args;
      expect(sourceUrl).to.equal(`https://admin.da.live/source/test-org/test-repo${filePath}`);
      expect(initialWrite.method).to.equal('POST');
      const initialPayload = JSON.parse(await initialWrite.body.get('data').text());
      expect(initialPayload.app).to.equal('adobe-express');
      expect(initialPayload).not.to.have.property('requestId');
      expect(serviceUrl).to.equal('https://14257-asopublisher-develop.adobeioruntime.net/api/v1/web/aso-publisher/publish-to-appstore');
      expect(submission).to.deep.equal({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ daPayloadPath: filePath.slice(1) }),
      });
      expect(updateUrl).to.equal(sourceUrl);
      expect(JSON.parse(await updatedWrite.body.get('data').text())).to.deep.equal({ ...initialPayload, ...serviceResult });
      expect(result).to.deep.equal({ ok: true, status: 200, filePath, requestId: serviceResult.requestId, publishStatus: 'queued' });
    });

    it('does not call the service if saving the initial file fails', async () => {
      fetchStub.onCall(0).resolves(new Response(null, { status: 500 }));
      fetchStub.onCall(1).resolves(new Response(null, { status: 500, statusText: 'Write failed' }));
      const result = await publishSelection(options);
      expect(result).to.deep.equal({ ok: false, status: 500, statusText: 'Write failed', filePath });
      expect(fetchStub.callCount).to.equal(2);
      expect(fetchStub.secondCall.args[0]).to.equal(fetchStub.firstCall.args[0]);
    });

    it('does not update the file when the service rejects the request', async () => {
      fetchStub.onCall(1).resolves(new Response(JSON.stringify(serviceResult), { status: 500 }));
      await expectFailure('Publish service failed (500');
      expect(fetchStub.callCount).to.equal(2);
    });

    [400, 200].forEach((status) => {
      it(`displays the service error and activation ID for HTTP ${status}`, async () => {
        const errorResponse = {
          activationId: 'bb78f0d7af384448b8f0d7af3804486e',
          error: 'daPayloadPath must be a relative .da/ path to a JSON file',
        };
        fetchStub.onCall(1).resolves(new Response(JSON.stringify(errorResponse), { status }));
        await expectFailure(
          `${errorResponse.error}. Activation ID: ${errorResponse.activationId}.`,
        );
        expect(fetchStub.callCount).to.equal(2);
      });
    });

    it('displays a service error without an activation ID', async () => {
      fetchStub.onCall(1).resolves(new Response(JSON.stringify({ error: 'Invalid path' }), { status: 400 }));
      await expectFailure('Invalid path.');
      expect(fetchStub.callCount).to.equal(2);
    });

    it('displays non-JSON service failures with their HTTP status', async () => {
      fetchStub.onCall(1).resolves(new Response('Service unavailable', { status: 503 }));
      await expectFailure('Publish service failed (503 ): Service unavailable.');
      expect(fetchStub.callCount).to.equal(2);
    });

    it('displays the HTTP failure when the service response is empty', async () => {
      fetchStub.onCall(1).resolves(new Response(null, { status: 500 }));
      await expectFailure('Publish service failed (500');
      expect(fetchStub.callCount).to.equal(2);
    });

    [
      {},
      { status: 'queued' },
      { requestId: '', status: 'queued' },
      { requestId: 123, status: 'queued' },
      { requestId: serviceResult.requestId },
      { requestId: serviceResult.requestId, status: ' ' },
      null,
    ].forEach((response) => {
      it(`does not update the file for an invalid service response: ${JSON.stringify(response)}`, async () => {
        fetchStub.onCall(1).resolves(new Response(JSON.stringify(response)));
        await expectFailure('missing a valid requestId or status');
        expect(fetchStub.callCount).to.equal(2);
      });
    });

    it('surfaces a service network failure without updating the file', async () => {
      fetchStub.onCall(1).rejects(new Error('Network failed'));
      await expectFailure('Network failed');
      expect(fetchStub.callCount).to.equal(2);
    });

    it('surfaces invalid response JSON without updating the file', async () => {
      fetchStub.onCall(1).resolves(new Response('not JSON'));
      await expectFailure('JSON');
      expect(fetchStub.callCount).to.equal(2);
    });

    it('reports an accepted request when its response cannot be saved', async () => {
      fetchStub.onCall(2).resolves(new Response(null, { status: 500 }));
      fetchStub.onCall(3).resolves(new Response(null, { status: 500, statusText: 'Write failed' }));
      await expectFailure(`Publish request ${serviceResult.requestId} was accepted (queued)`);
      expect(fetchStub.callCount).to.equal(4);
      expect(fetchStub.getCall(3).args[0]).to.equal(fetchStub.firstCall.args[0]);
      const initialPayload = JSON.parse(await fetchStub.firstCall.args[1].body.get('data').text());
      const updatedPayload = JSON.parse(fetchStub.getCall(3).args[1].body);
      expect(updatedPayload).to.deep.equal({ ...initialPayload, ...serviceResult });
    });

    it('reports an accepted request when its response write encounters a network failure', async () => {
      fetchStub.onCall(2).rejects(new Error('Network failed'));
      await expectFailure(`Publish request ${serviceResult.requestId} was accepted (queued)`);
      expect(fetchStub.callCount).to.equal(3);
    });
  });
});
