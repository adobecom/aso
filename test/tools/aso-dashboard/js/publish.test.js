import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';
import sinon from 'sinon';
import {
  formatPublishTimestamp,
  buildPublishPayload,
  createPublishProgressModal,
  publishSelection,
  waitForPublishCompletion,
} from '../../../../tools/aso-dashboard/js/publish.js';
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
        expect(payload).not.to.have.property('track');
      }
    });

    it(`omits ${platform} metadata when no languages are selected`, () => {
      const payload = buildPublishPayload([], { product: 'app', platform, languages: [], blockTypes: ['listing'] });
      expect(payload).not.to.have.property('metadata');
    });
  });

  it('includes only supported metadata in the Google payload', () => {
    const language = { code: 'en-US' };
    const cells = [
      ...['title', 'shortDescription', 'fullDescription', 'releaseNotes'].map((fieldKey) => ({
        language, device: 'google', blockType: 'listing', fieldKey, text: fieldKey, hasHtml: true,
      })),
      {
        language, device: 'google', blockType: 'promo', fieldKey: 'eventName', promoName: 'p1', text: 'Event', hasHtml: true,
      },
    ];
    const payload = buildPublishPayload(cells, {
      product: 'app',
      platform: 'google',
      languages: [language],
      promoNames: ['p1'],
    });
    expect(payload).to.deep.equal({
      app: 'app',
      platform: 'google',
      metadata: {
        localizations: [{
          locale: 'en-US',
          title: 'title',
          shortDescription: 'shortDescription',
          fullDescription: 'fullDescription',
        }],
      },
    });
  });

  it('omits Google metadata when only unsupported release notes are populated', () => {
    const language = { code: 'en-US' };
    const payload = buildPublishPayload([{
      language, device: 'google', blockType: 'listing', fieldKey: 'releaseNotes', text: 'New release', hasHtml: true,
    }], {
      product: 'app',
      platform: 'google',
      languages: [language],
    });
    expect(payload).to.deep.equal({ app: 'app', platform: 'google' });
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

  describe('createPublishProgressModal', () => {
    let button;
    let progress;

    beforeEach(() => {
      button = document.createElement('button');
      button.textContent = 'Publish to Store';
      document.body.append(button);
    });

    afterEach(() => {
      progress?.close();
      progress = undefined;
      button.remove();
      sinon.restore();
    });

    it('opens immediately with progress text before a request ID is available', () => {
      progress = createPublishProgressModal(button);
      const modal = document.querySelector('.publish-progress-modal');
      expect(modal.open).to.equal(true);
      expect(modal.querySelector('h2').textContent).to.equal('Starting to Publish...');
      expect(modal.querySelector('[role="status"]').textContent).to.equal('Preparing publish request...');
      expect(modal.querySelector('.publish-progress-reference').hidden).to.equal(true);
      expect(modal.querySelector('button').textContent).to.equal('\u00d7');
      expect(modal.querySelector('button').getAttribute('aria-label')).to.equal('Close');
      expect(modal.querySelector('button').hidden).to.equal(true);
      expect(modal.querySelector('button').disabled).to.equal(true);
      expect(button.disabled).to.equal(true);
      expect(button.classList.contains('hidden')).to.equal(false);
    });

    it('adds the request ID as soon as the request is accepted', () => {
      progress = createPublishProgressModal(button);
      progress.setRequestId('request-123');
      const modal = document.querySelector('.publish-progress-modal');
      const reference = modal.querySelector('.publish-progress-reference');
      expect(modal.querySelector('h2').textContent).to.equal('Publishing in progress');
      expect(reference.hidden).to.equal(false);
      expect(reference.textContent).to.equal('Request ID: request-123');
      expect(modal.querySelector('[role="status"]').textContent).to.equal('Waiting for publish completion...');
      expect(modal.querySelector('button').hidden).to.equal(true);
      expect(modal.querySelector('button').disabled).to.equal(true);
    });

    it('keeps a submission error visible until Close is clicked', () => {
      progress = createPublishProgressModal(button);
      const modal = document.querySelector('.publish-progress-modal');
      const error = 'Invalid <path>. Activation ID: activation-123.';
      progress.finish('Publish failed', error, true);
      expect(modal.open).to.equal(true);
      expect(modal.querySelector('h2').textContent).to.equal('Publish failed');
      expect(modal.querySelector('[role="alert"]').textContent).to.equal(error);
      expect(modal.querySelector('[role="alert"]').children.length).to.equal(0);
      expect(modal.querySelector('.publish-progress-reference').hidden).to.equal(true);
      expect(button.disabled).to.equal(false);
      expect(button.classList.contains('hidden')).to.equal(false);
      expect(modal.querySelector('button').hidden).to.equal(false);
      expect(modal.querySelector('button').disabled).to.equal(false);
      modal.querySelector('button').click();
      expect(document.querySelector('.publish-progress-modal')).to.equal(null);
    });

    it('retains the request ID when displaying an error after acceptance', () => {
      progress = createPublishProgressModal(button);
      progress.setRequestId('request-123');
      progress.finish('Publish failed', 'Response could not be saved', true);
      const modal = document.querySelector('.publish-progress-modal');
      expect(modal.querySelector('.publish-progress-reference').textContent).to.equal('Request ID: request-123');
      expect(modal.querySelector('[role="alert"]').textContent).to.equal('Response could not be saved');
    });

    it('blocks Escape while preparing and publishing', () => {
      progress = createPublishProgressModal(button);
      const modal = document.querySelector('.publish-progress-modal');
      const preparingCancel = new Event('cancel', { cancelable: true });
      modal.dispatchEvent(preparingCancel);
      expect(preparingCancel.defaultPrevented).to.equal(true);
      expect(modal.open).to.equal(true);
      progress.setRequestId('request-123');
      const publishingCancel = new Event('cancel', { cancelable: true });
      modal.dispatchEvent(publishingCancel);
      expect(publishingCancel.defaultPrevented).to.equal(true);
      expect(modal.open).to.equal(true);
      expect(button.disabled).to.equal(true);
      expect(button.classList.contains('hidden')).to.equal(false);
    });

    it('prevents Close during polling and allows it after success', async () => {
      const clock = sinon.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
      const fetchStub = sinon.stub(window, 'fetch').callsFake(async () => ({
        ok: true,
        status: 200,
        statusText: '',
        text: async () => JSON.stringify(
          { overallStatus: fetchStub.callCount === 1 ? 'queued' : 'success' },
        ),
      }));
      progress = createPublishProgressModal(button);
      const modal = document.querySelector('.publish-progress-modal');
      modal.querySelector('button').click();
      expect(modal.open).to.equal(true);
      progress.setRequestId('request-123');
      modal.querySelector('button').click();
      const completion = waitForPublishCompletion({ requestId: 'request-123', token: 'token' });
      await clock.tickAsync(0);
      expect(fetchStub.callCount).to.equal(1);
      expect(button.disabled).to.equal(true);
      expect(button.classList.contains('hidden')).to.equal(false);
      expect(modal.open).to.equal(true);
      await clock.tickAsync(10000);
      expect(await completion).to.deep.equal({ overallStatus: 'success', timedOut: false });
      progress.finish('Published', 'Published');
      expect(modal.open).to.equal(true);
      expect(modal.querySelector('button').hidden).to.equal(false);
      expect(modal.querySelector('button').disabled).to.equal(false);
      modal.querySelector('button').click();
      expect(document.querySelector('.publish-progress-modal')).to.equal(null);
      expect(button.disabled).to.equal(false);
      expect(button.classList.contains('hidden')).to.equal(false);
      expect(clock.countTimers()).to.equal(0);
    });

    it('keeps completion visible until dismissed and preserves original button states', () => {
      button.classList.add('hidden');
      button.disabled = true;
      progress = createPublishProgressModal(button);
      progress.finish('Published', 'Published');
      const modal = document.querySelector('.publish-progress-modal');
      expect(modal.open).to.equal(true);
      expect(modal.querySelector('h2').textContent).to.equal('Published');
      expect(modal.querySelector('[role="status"]').textContent).to.equal('Published');
      expect(button.classList.contains('hidden')).to.equal(true);
      expect(button.disabled).to.equal(true);
    });

    it('allows Escape after success or failure', () => {
      [false, true].forEach((isError) => {
        progress = createPublishProgressModal(button);
        const modal = document.querySelector('.publish-progress-modal');
        progress.finish(isError ? 'Publish failed' : 'Published', 'Result', isError);
        modal.dispatchEvent(new Event('cancel', { cancelable: true }));
        expect(modal.open).to.equal(false);
        expect(document.querySelector('.publish-progress-modal')).to.equal(null);
      });
    });

    it('allows dismissal after monitoring fails to confirm completion', () => {
      progress = createPublishProgressModal(button);
      progress.finish('Publish not yet confirmed', 'Do not resubmit this request.', true);
      const modal = document.querySelector('.publish-progress-modal');
      expect(modal.querySelector('[role="alert"]').textContent).to.equal('Do not resubmit this request.');
      expect(modal.querySelector('button').hidden).to.equal(false);
      modal.querySelector('button').click();
      expect(document.querySelector('.publish-progress-modal')).to.equal(null);
    });

    it('cleans up if the dialog cannot be shown', () => {
      sinon.stub(HTMLDialogElement.prototype, 'showModal').throws(new Error('Dialog failed'));
      expect(() => createPublishProgressModal(button)).to.throw('Dialog failed');
      expect(document.querySelector('.publish-progress-modal')).to.equal(null);
      expect(button.disabled).to.equal(false);
      expect(button.classList.contains('hidden')).to.equal(false);
    });
  });

  describe('waitForPublishCompletion', () => {
    const requestId = '110ef56b-28d4-4c23-8e18-d9cf3efff4d9';
    let clock;
    let fetchStub;

    function logResponse(body, status = 200) {
      const response = new Response(null, { status });
      sinon.stub(response, 'text').resolves(JSON.stringify(body));
      return response;
    }

    beforeEach(() => {
      clock = sinon.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
      fetchStub = sinon.stub(window, 'fetch').callsFake(async () => (
        logResponse({ overallStatus: 'queued' })
      ));
    });

    afterEach(() => {
      sinon.restore();
    });

    function monitor() {
      return waitForPublishCompletion({ requestId, token: 'da-token' });
    }

    function expectRestored() {
      expect(document.querySelector('.publish-progress-modal')).to.equal(null);
      expect(clock.countTimers()).to.equal(0);
    }

    it('immediately polls with the request ID and DA token at ten-second intervals', async () => {
      fetchStub.onCall(1).resolves(logResponse({ overallStatus: 'success' }));
      const completion = monitor();
      await clock.tickAsync(0);
      expect(fetchStub.callCount).to.equal(1);
      const [url, request] = fetchStub.firstCall.args;
      expect(url).to.equal(`https://14257-asopublisher-develop.adobeioruntime.net/api/v1/web/aso-publisher/get-publish-log?requestId=${requestId}`);
      expect(request.method).to.equal('GET');
      expect(request.headers).to.deep.equal({ Authorization: 'Bearer da-token' });
      expect(request.signal).to.be.instanceOf(AbortSignal);
      await clock.tickAsync(9999);
      expect(fetchStub.callCount).to.equal(1);
      await clock.tickAsync(1);
      expect(await completion).to.deep.equal({ overallStatus: 'success', timedOut: false });
      expect(fetchStub.callCount).to.equal(2);
      expectRestored();
    });

    it('stops immediately when the first log reports success', async () => {
      fetchStub.resolves(logResponse({ overallStatus: 'success' }));
      expect(await monitor()).to.deep.equal({ overallStatus: 'success', timedOut: false });
      await clock.tickAsync(60000);
      expect(fetchStub.callCount).to.equal(1);
      expectRestored();
    });

    it('polls six times over one minute and reports a timeout instead of success', async () => {
      const completion = monitor();
      await clock.tickAsync(59999);
      expect(fetchStub.callCount).to.equal(6);
      expect(clock.countTimers()).to.equal(2);
      await clock.tickAsync(1);
      expect(await completion).to.deep.equal({ overallStatus: 'queued', timedOut: true });
      expect(fetchStub.callCount).to.equal(6);
      expectRestored();
      await clock.tickAsync(10000);
      expect(fetchStub.callCount).to.equal(6);
    });

    it('recognizes success on the last poll before the deadline', async () => {
      fetchStub.onCall(5).resolves(logResponse({ overallStatus: 'success' }));
      const completion = monitor();
      await clock.tickAsync(50000);
      expect(await completion).to.deep.equal({ overallStatus: 'success', timedOut: false });
      expect(fetchStub.callCount).to.equal(6);
      expectRestored();
    });

    it('aborts a stalled log request at the one-minute deadline', async () => {
      fetchStub.callsFake((_url, { signal }) => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      }));
      const completion = monitor();
      await clock.tickAsync(60000);
      expect(await completion).to.deep.equal({ overallStatus: 'pending', timedOut: true });
      expect(fetchStub.firstCall.args[1].signal.aborted).to.equal(true);
      expect(fetchStub.callCount).to.equal(1);
      expectRestored();
    });

    [
      { body: { overallStatus: 'failed' }, status: 200, message: 'Publish failed (failed)' },
      { body: { error: 'Not authorized', activationId: 'activation-123' }, status: 401, message: 'Not authorized. Activation ID: activation-123.' },
      { body: {}, status: 200, message: 'missing a valid overallStatus' },
      { body: null, status: 200, message: 'missing a valid overallStatus' },
      { body: { overallStatus: '' }, status: 200, message: 'missing a valid overallStatus' },
    ].forEach(({ body, status, message }) => {
      it(`restores the UI when monitoring fails: ${message}`, async () => {
        fetchStub.resolves(logResponse(body, status));
        const error = await monitor().catch((failure) => failure);
        expect(error).to.be.instanceOf(Error);
        expect(error.message).to.include(message);
        expect(error.message).to.include(requestId);
        expect(fetchStub.callCount).to.equal(1);
        expectRestored();
      });
    });

    it('restores the UI on a log network failure', async () => {
      fetchStub.rejects(new Error('Network failed'));
      const error = await monitor().catch((failure) => failure);
      expect(error.message).to.equal('Network failed');
      expectRestored();
    });

    it('restores the UI on invalid log JSON', async () => {
      fetchStub.resolves(new Response('not JSON'));
      const error = await monitor().catch((failure) => failure);
      expect(error.message).to.include('returned invalid JSON');
      expectRestored();
    });

    it('encodes the request ID in the log URL', async () => {
      fetchStub.resolves(logResponse({ overallStatus: 'success' }));
      await waitForPublishCompletion({ requestId: 'request&123', token: 'token' });
      expect(fetchStub.firstCall.args[0]).to.include('?requestId=request%26123');
      expectRestored();
    });
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
        onRequestAccepted: sinon.spy(),
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
      options.onRequestAccepted = sinon.spy((requestId) => {
        expect(requestId).to.equal(serviceResult.requestId);
        expect(fetchStub.callCount).to.equal(2);
      });
      const result = await publishSelection(options);
      sinon.assert.calledOnceWithExactly(options.onRequestAccepted, serviceResult.requestId);
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
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${options.token}`,
        },
        body: JSON.stringify({ daPayloadPath: filePath.slice(1) }),
      });
      expect(submission.headers.Authorization).to.equal(initialWrite.headers.Authorization);
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
      expect(options.onRequestAccepted.called).to.equal(false);
    });

    it('does not update the file when the service rejects the request', async () => {
      fetchStub.onCall(1).resolves(new Response(JSON.stringify(serviceResult), { status: 500 }));
      await expectFailure('Publish service failed (500');
      expect(fetchStub.callCount).to.equal(2);
      expect(options.onRequestAccepted.called).to.equal(false);
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
      sinon.assert.calledOnceWithExactly(options.onRequestAccepted, serviceResult.requestId);
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
