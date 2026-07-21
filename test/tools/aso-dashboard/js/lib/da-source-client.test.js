import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import {
  buildBeforeImportVersionLabel,
  putSpacingSidecar,
  putSourceText,
} from '../../../../../tools/aso-dashboard/js/lib/da-source-client.js';

describe('da-source-client', () => {
  afterEach(() => {
    sinon.restore();
  });

  describe('buildBeforeImportVersionLabel', () => {
    it('formats the agreed import version label', () => {
      const label = buildBeforeImportVersionLabel({
        pageLeaf: 'metadata/full-description',
        date: new Date('2026-05-31T12:00:00.000Z'),
      });
      expect(label).to.equal('Before ASO import — metadata/full-description — 2026-05-31');
    });
  });

  describe('putSourceText', () => {
    it('versions existing pages before overwrite and skips version on 404', async () => {
      const fetchStub = sinon.stub(window, 'fetch');
      fetchStub.onCall(0).resolves({ status: 404 });
      fetchStub.onCall(1).resolves({ ok: true, status: 200 });

      const result = await putSourceText(
        'org',
        'repo',
        '/de-de/products-redesign/firefly/google/2026/q1/may/store-updates/metadata/full-description.html',
        '<p>Hello</p>',
        'token',
        { versionLabel: 'Before ASO import — metadata/full-description — 2026-05-31' },
      );

      expect(result.ok).to.be.true;
      expect(result.version).to.deep.include({ versioned: false, reason: 'notFound' });
      expect(fetchStub.callCount).to.equal(2);
      expect(fetchStub.getCall(1).args[1].method).to.equal('POST');
    });

    it('posts versionsource before writing when the page already exists', async () => {
      const fetchStub = sinon.stub(window, 'fetch');
      fetchStub.onCall(0).resolves({ ok: true, status: 200 });
      fetchStub.onCall(1).resolves({ ok: true, status: 200 });
      fetchStub.onCall(2).resolves({ ok: true, status: 200 });

      const path = '/de-de/products-redesign/firefly/google/2026/q1/may/store-updates/metadata/full-description.html';
      const result = await putSourceText(
        'org',
        'repo',
        path,
        '<p>Updated</p>',
        'token',
        { versionLabel: 'Before ASO import — metadata/full-description — 2026-05-31' },
      );

      expect(result.ok).to.be.true;
      expect(result.version).to.deep.include({ versioned: true, ok: true });
      expect(fetchStub.callCount).to.equal(3);
      expect(fetchStub.getCall(1).args[0]).to.include('/versionsource');
      expect(fetchStub.getCall(1).args[1].method).to.equal('POST');
      expect(fetchStub.getCall(2).args[1].method).to.equal('POST');
    });

    it('skips the existence-check GET when the caller already knows the page exists', async () => {
      const fetchStub = sinon.stub(window, 'fetch');
      fetchStub.onCall(0).resolves({ ok: true, status: 200 });
      fetchStub.onCall(1).resolves({ ok: true, status: 200 });

      const path = '/de-de/products-redesign/firefly/google/2026/q1/may/store-updates/metadata/full-description.html';
      const result = await putSourceText(
        'org',
        'repo',
        path,
        '<p>Updated</p>',
        'token',
        {
          versionLabel: 'Before ASO import — metadata/full-description — 2026-05-31',
          knownExists: true,
        },
      );

      expect(result.ok).to.be.true;
      expect(result.version).to.deep.include({ versioned: true, ok: true });
      // Only 2 calls (versionsource POST + write), not 3 — no existence-check GET.
      expect(fetchStub.callCount).to.equal(2);
      expect(fetchStub.getCall(0).args[0]).to.include('/versionsource');
    });

    it('skips both the existence-check GET and versioning when the caller knows the page is new', async () => {
      const fetchStub = sinon.stub(window, 'fetch');
      fetchStub.onCall(0).resolves({ ok: true, status: 200 });

      const path = '/de-de/products-redesign/firefly/google/2026/q1/may/store-updates/metadata/full-description.html';
      const result = await putSourceText(
        'org',
        'repo',
        path,
        '<p>New</p>',
        'token',
        {
          versionLabel: 'Before ASO import — metadata/full-description — 2026-05-31',
          knownExists: false,
        },
      );

      expect(result.ok).to.be.true;
      expect(result.version).to.deep.include({ versioned: false, reason: 'notFound' });
      // Only 1 call (the write itself) — no existence-check GET, no versionsource POST.
      expect(fetchStub.callCount).to.equal(1);
    });
  });

  describe('putSpacingSidecar', () => {
    it('writes spacing sidecar without versioning when no label is provided', async () => {
      const fetchStub = sinon.stub(window, 'fetch').resolves({ ok: true, status: 200 });

      const result = await putSpacingSidecar(
        'org',
        'repo',
        '/de-de/products-redesign/firefly/google/2026/q1/may/store-updates/metadata/full-description',
        { version: 1, sectionBreakAfter: [true] },
        'token',
      );

      expect(result.ok).to.be.true;
      expect(result.path).to.equal(
        '/de-de/products-redesign/firefly/google/2026/q1/may/store-updates/metadata/.full-description-spacing.json',
      );
      expect(fetchStub.callCount).to.equal(1);
    });
  });
});
