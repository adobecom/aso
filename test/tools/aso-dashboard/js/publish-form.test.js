import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';
import sinon from 'sinon';
import { init } from '../../../../tools/aso-dashboard/js/publish-form.js';
import { initReleasePeriodSettings } from '../../../../tools/aso-dashboard/js/release-period-settings.js';
import { clearListCache } from '../../../../tools/aso-dashboard/js/lib/utils.js';

const json = (body) => new Response(JSON.stringify(body), { status: 200 });
const folder = (name) => ({ name, path: `/x/${name}` });
const page = (name) => ({ name, path: `/x/${name}.html`, ext: 'html' });

describe('publish form', () => {
  let root;
  let fetchStub;
  let promoFolders;

  const $ = (selector) => root.querySelector(selector);
  const change = (element) => element.dispatchEvent(new Event('change', { bubbles: true }));
  const flush = () => new Promise((resolve) => { setTimeout(resolve, 30); });

  async function selectEverything({ promos = true, listing = true } = {}) {
    $('#publish-product').value = 'adobe-express';
    change($('#publish-product'));
    const german = [...root.querySelectorAll('.publish-language-checkbox')]
      .find((checkbox) => checkbox.value === 'German');
    german.checked = true;
    change(german);
    $('#publish-platform-apple').checked = true;
    change($('#publish-platform-apple'));
    $('#publish-scope-listing').checked = listing;
    change($('#publish-scope-listing'));
    $('#publish-scope-promos').checked = promos;
    change($('#publish-scope-promos'));
    await flush();
  }

  beforeEach(async () => {
    clearListCache();
    promoFolders = [folder('launch')];
    const html = await (await fetch('/tools/aso-dashboard/aso-dashboard.html')).text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    root = document.createElement('div');
    root.append(doc.querySelector('[data-tab-content="publish"]'));
    // The dashboard moves the shared release-period/store panel into the active tab's slot.
    root.querySelector('.scope-sections-slot').append(doc.querySelector('.scope-sections'));
    document.body.append(root);
    initReleasePeriodSettings();
    ['year', 'quarter', 'month'].forEach((key) => {
      const select = $(`#release-period-${key}`);
      select.value = select.options[select.options.length - 1]?.value || '';
    });

    const schema = JSON.parse(await readFile({ path: '../mocks/block-schema.json' }));
    const sheetMap = JSON.parse(await readFile({ path: '../mocks/sheet-to-block-map.json' }));
    const translate = JSON.parse(await readFile({ path: '../mocks/translate.json' }));
    fetchStub = sinon.stub(window, 'fetch').callsFake(async (url) => {
      const target = String(url);
      if (target.includes('store-publish.json')) {
        return json({
          config: { data: [{ key: 'store-publish.api', value: 'https://api.example.test/aso-publisher' }] },
          'app-languages': { data: [{ app: 'adobe-express', platform: 'apple', languages: 'de,en' }] },
        });
      }
      if (target.includes('block-schema.json')) return json(schema);
      if (target.includes('sheet-to-block-map.json')) return json(sheetMap);
      if (target.includes('translate')) return json(translate);
      if (target.includes('/cpp')) return json([folder('spring'), folder('summer')]);
      if (target.includes('/promos/') && target.includes('launch')) return json([page('default')]);
      if (target.includes('/promos')) return json(promoFolders);
      if (target.includes('/list/')) return json([folder('adobe-express')]);
      return new Response('', { status: 404 });
    });
    await init({ context: { org: 'o', repo: 'r' }, token: 't' });
    await flush();
  });

  afterEach(() => {
    sinon.restore();
    document.querySelectorAll('dialog').forEach((dialog) => dialog.remove());
    root.remove();
  });

  it('renders products and languages and starts with Publish disabled', () => {
    expect($('#publish-product').options.length).to.be.greaterThan(1);
    expect(root.querySelectorAll('.publish-language-checkbox').length).to.be.greaterThan(0);
    expect($('#publish-button').disabled).to.equal(true);
    expect(fetchStub.called).to.equal(true);
  });

  it('enables Publish once product, language, platform and content are chosen', async () => {
    await selectEverything();
    expect($('#publish-button').disabled).to.equal(false);
    expect($('#publish-languages-count').textContent).to.equal('(1 selected)');
  });

  it('lists metadata fields for the chosen platform and requires at least one', async () => {
    await selectEverything({ promos: false });
    const fields = [...root.querySelectorAll('.publish-field-checkbox')];
    expect(fields.length).to.be.greaterThan(0);
    expect(fields.every((field) => field.checked)).to.equal(true);

    fields.forEach((field) => { field.checked = false; });
    change(fields[0]);
    expect($('#publish-button').disabled).to.equal(true);
  });

  it('discovers promos and variants and requires a selected promo variant', async () => {
    await selectEverything({ listing: false });
    expect($('.publish-promo-checkbox').value).to.equal('launch');
    const variant = $('.publish-promo-variant-checkbox');
    expect(variant.value).to.equal('default');
    expect($('#publish-button').disabled).to.equal(false);

    variant.checked = false;
    change(variant);
    expect($('#publish-button').disabled).to.equal(true);
  });

  it('requires some content to be included', async () => {
    await selectEverything({ promos: false, listing: false });
    expect($('#publish-button').disabled).to.equal(true);
    expect($('#publish-listing-field-count').textContent).to.equal('(not included)');
  });

  it('limits languages to the app-languages list for the chosen app and platform', async () => {
    const names = () => [...root.querySelectorAll('.publish-language-checkbox')]
      .map((checkbox) => checkbox.value);
    const all = names();
    $('#publish-product').value = 'adobe-express';
    change($('#publish-product'));
    expect(names()).to.deep.equal(all);

    $('#publish-platform-apple').checked = true;
    change($('#publish-platform-apple'));
    await flush();
    expect(names()).to.deep.equal(['English', 'German']);

    $('#publish-platform-google').checked = true;
    change($('#publish-platform-google'));
    await flush();
    expect(names()).to.deep.equal(all);
  });

  it('requires exactly one CPP campaign when CPP is selected', async () => {
    await selectEverything({ promos: false });
    const cpp = $('#store-type-cpp');
    cpp.checked = true;
    change(cpp);
    await flush();
    expect($('#publish-button').disabled).to.equal(true);

    const campaigns = [...root.querySelectorAll('.store-test-checkbox')];
    expect(campaigns.length).to.be.greaterThan(1);
    campaigns[0].checked = true;
    change(campaigns[0]);
    campaigns[1].checked = true;
    change(campaigns[1]);
    expect(campaigns[0].checked).to.equal(false);
    expect($('#publish-button').disabled).to.equal(false);
  });

  it('only allows a single platform', () => {
    const radios = root.querySelectorAll('input[name="publish-platform"]');
    expect(radios).to.have.lengthOf(2);
    radios.forEach((radio) => expect(radio.type).to.equal('radio'));
  });

  ['success', 'failed'].forEach((overallStatus) => {
    it(`hands accepted requests to History after a ${overallStatus} completion`, async () => {
      await selectEverything({ promos: false });
      fetchStub.withArgs(sinon.match('admin.da.live/source')).callsFake(async (url, options) => {
        if (options?.method === 'PUT') return json({});
        return new Response('<main><div class="aso-app"><div><div>promotionalText</div><div>Test content</div></div></div></main>');
      });
      fetchStub.withArgs(sinon.match('ims/profile')).resolves(json({ displayName: 'Test Publisher' }));
      fetchStub.withArgs(sinon.match('publish-to-appstore'))
        .resolves(json({ requestId: 'request-123', status: 'accepted' }));
      fetchStub.withArgs(sinon.match('get-publish-log')).resolves(json({ overallStatus }));
      const log = sinon.stub(console, 'error');
      const submitted = new Promise((resolve) => {
        root.addEventListener('publish-request-submitted', resolve, { once: true });
      });
      $('#publish-button').click();
      const event = await submitted;
      expect(event.detail).to.deep.equal({ requestId: 'request-123' });
      expect($('#publish-summary').textContent).to.contain('request-123');
      expect($('#publish-summary').textContent)
        .to.contain(overallStatus === 'failed' ? 'Publish failed (failed)' : 'Published Request ID:');
      expect(log.calledWith('[aso publish]')).to.equal(overallStatus === 'failed');
    });
  });

  it('does not navigate to History when the request was not accepted', async () => {
    await selectEverything({ promos: false });
    const submitted = sinon.spy();
    root.addEventListener('publish-request-submitted', submitted);
    sinon.stub(console, 'error');
    $('#publish-button').click();
    await flush();
    expect(submitted.called).to.equal(false);
    expect($('#publish-summary').textContent).to.not.equal('');
  });
});
