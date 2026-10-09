import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';
import sinon from 'sinon';
import { fetchLanguageIndex } from '../../../../tools/aso-dashboard/js/lib/translate-paths.js';
import {
  NO_ERROR_DETAILS,
  SOURCE_DISCLAIMER,
  applyFilters,
  closePopover,
  collectOverallErrors,
  fetchPublishLogs,
  fetchSourceJson,
  getStatusMeta,
  init,
  isValidSourcePath,
  mapSections,
  mergeItems,
  openSourceModal,
  renderResults,
  renderRequestCell,
  renderSectionCell,
  renderStatusBadge,
  renderTime,
} from '../../../../tools/aso-dashboard/js/publish-history.js';

const fixture = JSON.parse(await readFile({ path: '../mocks/publish-logs.json' }));
const translate = JSON.parse(await readFile({ path: '../mocks/translate.json' }));
const byId = (id) => fixture.items.find((i) => i.requestId.startsWith(id));
const SUCCESS = byId('2fee');
const PARTIAL = byId('0d1a');
const LEGACY = byId('16f6');
const FAILED = byId('7ac6');
const MANY = byId('38a4');
const TS_ERR = 'TerritorySchedule dates must be in order (publishStart <= eventStart < eventEnd)';

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), { status });
const tick = () => new Promise((r) => { setTimeout(r, 50); });

describe('publish-history data helpers', () => {
  it('maps sections independent of order, incl. legacy localizations', () => {
    const cols = mapSections(PARTIAL);
    expect(cols.metadata.map((c) => c.locale)).to.deep.equal(['en', 'fr-fr']);
    expect(cols.promos.every((c) => c.status === 'failed')).to.equal(true);
    expect(cols.cpp).to.have.length(1);
    expect(mapSections(LEGACY).metadata).to.have.length(2);
  });

  it('maps success, failed and pending outcomes', () => {
    const cols = mapSections({ response: { sections: [{ type: 'metadata', success: ['en'], failure: [{ locale: 'fr', error: 'x' }], pending: ['de'] }] } });
    expect(cols.metadata.map((c) => c.status)).to.deep.equal(['success', 'failed', 'pending']);
  });

  it('leaves missing sections undefined', () => {
    const cols = mapSections(SUCCESS);
    expect(cols.metadata).to.equal(undefined);
    expect(cols.cpp).to.equal(undefined);
  });

  it('keeps partial status even when responseSummary.success is true', () => {
    expect(PARTIAL.responseSummary.success).to.equal(true);
    expect(getStatusMeta(PARTIAL.overallStatus).key).to.equal('partial');
    expect(renderStatusBadge(PARTIAL).querySelector('.ph-badge').textContent).to.equal('Partial');
  });

  it('keeps unknown statuses visible', () => {
    const badge = renderStatusBadge({ overallStatus: 'weird' });
    expect(badge.querySelector('.ph-badge-unknown').textContent).to.equal('weird');
  });

  it('dedupes overall errors and falls back for older records', () => {
    expect(collectOverallErrors(PARTIAL)).to.deep.equal([TS_ERR]);
    expect(collectOverallErrors(LEGACY)).to.deep.equal(['Supplied date must be in the future']);
    expect(collectOverallErrors(SUCCESS)).to.deep.equal([]);
  });

  it('validates source paths', () => {
    expect(isValidSourcePath('.da/storepublish/request/a-b.json')).to.equal(true);
    expect(isValidSourcePath('/.da/storepublish/request/a.json')).to.equal(true);
    ['https://evil.com/x.json', '.da/storepublish/request/../x.json', '/etc/passwd', '', null]
      .forEach((p) => expect(isValidSourcePath(p)).to.equal(false));
  });

  it('merges pages without duplicate rows and filters loaded rows', () => {
    const merged = mergeItems(fixture.items.slice(0, 2), fixture.items.slice(1, 4));
    expect(merged).to.have.length(4);
    expect(applyFilters(fixture.items, { platform: 'google' })).to.deep.equal([FAILED]);
    expect(applyFilters(fixture.items, { app: 'firefly' })).to.deep.equal([SUCCESS]);
    expect(applyFilters(fixture.items, { status: 'partial' })).to.have.length(2);
    expect(applyFilters(fixture.items, { app: 'nope' })).to.have.length(0);
    const d = new Date(FAILED.startedAt);
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    expect(applyFilters(fixture.items, { from: day, to: day })).to.deep.equal([FAILED]);
  });
});

describe('publish-history rendering', () => {
  afterEach(() => {
    closePopover();
    document.body.innerHTML = '';
  });

  it('shows an em dash for missing sections', () => {
    const cell = renderSectionCell(SUCCESS, { key: 'cpp', label: 'Custom Pages' });
    expect(cell.textContent).to.equal('\u2014');
  });

  it('keeps failed chips red and the same compact size as successful chips', async () => {
    const style = document.createElement('style');
    style.textContent = await readFile({ path: '../../../../tools/aso-dashboard/css/aso-dashboard.css' });
    const section = { type: 'metadata', success: ['en'], failure: [{ locale: 'fr' }] };
    const cell = renderSectionCell(
      { response: { sections: [section] } },
      { key: 'metadata', label: 'Metadata' },
    );
    const status = renderStatusBadge(PARTIAL);
    document.body.append(style, cell, status);
    const successChip = cell.querySelector('.ph-chip-success');
    const failedChip = cell.querySelector('.ph-chip-failed');
    const success = getComputedStyle(successChip);
    const failed = getComputedStyle(failedChip);
    expect(failed.backgroundColor).to.equal('rgb(253, 220, 217)');
    expect(failed.color).to.equal('rgb(179, 38, 30)');
    const successHeight = successChip.getBoundingClientRect().height;
    expect(failedChip.getBoundingClientRect().height).to.equal(successHeight);
    ['padding', 'fontSize', 'fontWeight', 'lineHeight', 'display'].forEach((property) => {
      expect(failed[property], property).to.equal(success[property]);
    });
    const info = getComputedStyle(status.querySelector('.ph-info'));
    expect(info.backgroundColor).to.equal('rgba(0, 0, 0, 0)');
    expect(info.padding).to.equal('0px 4px');
  });

  it('shows overall error preview on focus and popover on click, closed by Escape / outside click', () => {
    const wrap = renderStatusBadge(PARTIAL);
    document.body.append(wrap);
    const info = wrap.querySelector('.ph-info');
    info.dispatchEvent(new Event('focus'));
    expect(document.querySelector('[role="tooltip"]').textContent).to.contain(TS_ERR);
    info.click();
    const pop = document.querySelector('.ph-popover');
    expect(pop.textContent).to.contain('Publish partially failed');
    expect(pop.textContent).to.contain(TS_ERR);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.querySelector('.ph-popover')).to.equal(null);
    info.click();
    document.body.click();
    expect(document.querySelector('.ph-popover')).to.equal(null);
  });

  it('shows no-details text when failed record has no errors; none for success', () => {
    const wrap = renderStatusBadge({ overallStatus: 'invoke_failed' });
    document.body.append(wrap);
    wrap.querySelector('.ph-info').click();
    expect(document.querySelector('.ph-popover').textContent).to.contain(NO_ERROR_DETAILS);
    expect(renderStatusBadge(SUCCESS).querySelector('.ph-info')).to.equal(null);
  });

  it('opens failed-locale popover with section, locale, status and plain-text error', () => {
    const cell = renderSectionCell(PARTIAL, { key: 'promos', label: 'Promos' });
    document.body.append(cell);
    cell.querySelector('.ph-chip-failed').click();
    const text = document.querySelector('.ph-popover').textContent;
    expect(text).to.contain('Section: Promos');
    expect(text).to.contain('Locale: en');
    expect(text).to.contain('Status: Failed');
    expect(text).to.contain(TS_ERR);
  });

  it('renders error HTML as text, and shows fallback when error missing', () => {
    const item = { response: { sections: [{ type: 'metadata', failure: [{ locale: 'en', error: '<img src=x onerror=alert(1)>\nline2' }, { locale: 'fr' }] }] } };
    const cell = renderSectionCell(item, { key: 'metadata', label: 'Metadata' });
    document.body.append(cell);
    const [a, b] = cell.querySelectorAll('.ph-chip-failed');
    a.click();
    const pop = document.querySelector('.ph-popover');
    expect(pop.querySelector('img')).to.equal(null);
    expect(pop.textContent).to.contain('<img src=x onerror=alert(1)>\nline2');
    b.click();
    expect(document.querySelector('.ph-popover').textContent).to.contain(NO_ERROR_DETAILS);
  });

  it('labels pending and success chips without relying on color', () => {
    const cell = renderSectionCell({ response: { sections: [{ type: 'cpp', success: ['en'], pending: ['fr'] }] } }, { key: 'cpp', label: 'Custom Pages' });
    const [ok, pending] = cell.querySelectorAll('.ph-chip');
    expect(ok.getAttribute('aria-label')).to.contain('Passed');
    expect(ok.title).to.equal('Passed (en)');
    expect(pending.getAttribute('aria-label')).to.contain('Pending');
    expect(pending.querySelector('[aria-hidden="true"]')).to.not.equal(null);
  });

  it('limits to three chips and expands in place', () => {
    const cell = renderSectionCell(MANY, { key: 'metadata', label: 'Metadata' });
    expect(cell.querySelectorAll('.ph-chip')).to.have.length(3);
    const more = cell.querySelector('.ph-more');
    expect(more.textContent).to.equal('+2 more');
    more.click();
    expect(cell.querySelectorAll('.ph-chip')).to.have.length(5);
    expect(cell.querySelector('.ph-more')).to.equal(null);
  });

  it('shows names in table and mobile chips, including expanded chips and error details', () => {
    const section = {
      type: 'metadata',
      success: ['en', 'en-GB'],
      failure: [{ locale: 'ja-JP', error: TS_ERR }],
      pending: ['fr', 'xx'],
    };
    const item = { ...SUCCESS, response: { sections: [section] } };
    const languageNames = new Map([
      ['en', 'English'],
      ['en-gb', 'English - British'],
      ['ja-jp', 'Japanese'],
      ['fr', 'French'],
    ]);
    const root = renderResults([item], { languageNames });
    document.body.append(root);
    [root.querySelector('.ph-table'), root.querySelector('.ph-card')].forEach((view) => {
      expect([...view.querySelectorAll('.ph-chip-locale')].map((chip) => chip.textContent))
        .to.deep.equal(['English', 'English - British', 'Japanese']);
      view.querySelector('.ph-more').click();
      expect([...view.querySelectorAll('.ph-chip-locale')].map((chip) => chip.textContent))
        .to.include.members(['French', 'xx']);
      const failed = view.querySelector('.ph-chip-failed');
      expect(failed.title).to.contain('ja-JP');
      expect(failed.getAttribute('aria-label')).to.contain('Japanese (ja-JP)');
      failed.click();
      expect(document.querySelector('.ph-popover').textContent).to.contain('Locale: Japanese (ja-JP)');
      expect(document.querySelector('.ph-popover').textContent).to.contain(TS_ERR);
      closePopover();
      expect(view.querySelector('.ph-chip-pending').getAttribute('aria-label'))
        .to.contain('French (fr): Pending');
    });
  });

  it('shows request details, and "Not retained" without a source path', () => {
    const cell = renderRequestCell(PARTIAL);
    expect(cell.textContent).to.contain(PARTIAL.requestId);
    expect(cell.textContent).to.contain(PARTIAL.requestor);
    expect(cell.textContent).to.contain('Not retained');
    expect(cell.textContent).to.not.contain('View JSON');
    expect(renderRequestCell(SUCCESS).textContent).to.contain('View JSON');
  });

  it('shows a request icon that expands details and retains the source JSON action', () => {
    const onViewJson = sinon.spy();
    const cell = renderRequestCell(SUCCESS, { onViewJson });
    document.body.append(cell);
    const details = cell.querySelector('details');
    const summary = cell.querySelector('summary');
    expect(details.open).to.equal(false);
    expect(summary.querySelector('svg').getAttribute('aria-hidden')).to.equal('true');
    expect(summary.getAttribute('aria-label')).to.contain(SUCCESS.requestId);
    expect(summary.textContent).to.equal('Request details');
    summary.click();
    expect(details.open).to.equal(true);
    expect(details.querySelector('dl').textContent).to.contain(SUCCESS.requestId);
    expect(details.querySelector('dl').textContent).to.contain(SUCCESS.requestor);
    [...details.querySelectorAll('button')].find((button) => button.textContent === 'View JSON').click();
    expect(onViewJson.calledOnceWithExactly(SUCCESS.daPayloadPath)).to.equal(true);
    summary.click();
    expect(details.open).to.equal(false);
  });

  it('formats Started in the viewer local time while preserving the original timestamp', () => {
    const value = '2026-10-09T09:35:40.000Z';
    const expected = new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short',
    }).format(new Date(value));
    const time = renderTime(value);
    expect(time.textContent).to.equal(expected);
    expect(time.dateTime).to.equal(value);
    expect(time.title).to.contain('your local time');
    expect(time.title).to.contain(value);
  });

  it('groups each request into three section rows with shared cells and matching mobile labels', () => {
    const root = renderResults(fixture.items, {});
    expect([...root.querySelectorAll('thead th')].map((t) => t.textContent))
      .to.deep.equal(['Started', 'App', 'Platform', 'Overall', 'Request', 'Section', 'Languages']);
    expect(root.querySelector('thead th:nth-child(5) .ph-sr-only').textContent).to.equal('Request');
    expect(root.querySelectorAll('tbody')).to.have.length(fixture.items.length);
    expect(root.querySelectorAll('tbody tr')).to.have.length(fixture.items.length * 3);
    const labels = ['Metadata', 'Promos/In-App Events', 'Custom Product Pages'];
    [...root.querySelectorAll('tbody')].forEach((group, index) => {
      expect(group.dataset.requestId).to.equal(fixture.items[index].requestId);
      expect([...group.querySelectorAll('.ph-section-label')].map((cell) => cell.textContent))
        .to.deep.equal(labels);
      expect(group.rows[0].cells).to.have.length(7);
      expect(group.rows[1].cells).to.have.length(2);
      expect(group.rows[2].cells).to.have.length(2);
      expect(group.querySelectorAll('[rowspan="3"]')).to.have.length(5);
      expect(group.rows[0].cells[0].scope).to.equal('rowgroup');
      expect(group.querySelectorAll('.ph-request-toggle')).to.have.length(1);
      expect(group.querySelectorAll('.ph-section-cell')).to.have.length(3);
    });
    expect(root.querySelectorAll('.ph-card')).to.have.length(fixture.items.length);
    [...root.querySelectorAll('.ph-card')].forEach((card) => {
      expect([...card.querySelectorAll('.ph-card-label')].map((label) => label.textContent))
        .to.deep.equal(labels);
    });
  });

  it('keeps each section languages in its own row, including missing sections', () => {
    const root = renderResults([{
      ...SUCCESS,
      response: {
        sections: [
          { type: 'cpp', pending: ['de'] },
          { type: 'metadata', success: ['en'] },
        ],
      },
    }], {});
    const rows = root.querySelectorAll('tbody tr');
    expect(rows[0].querySelector('.ph-chip').title).to.equal('Passed (en)');
    expect(rows[1].querySelector('.ph-none').getAttribute('aria-label')).to.equal('Not requested');
    expect(rows[2].querySelector('.ph-chip').title).to.equal('Pending (de)');
  });

  it('centers shared cells and only separates complete request groups', async () => {
    const style = document.createElement('style');
    style.textContent = await readFile({ path: '../../../../tools/aso-dashboard/css/aso-dashboard.css' });
    const root = renderResults([SUCCESS], {});
    document.body.append(style, root);
    const group = root.querySelector('tbody');
    expect(getComputedStyle(group.querySelector('[rowspan]')).verticalAlign).to.equal('middle');
    expect(getComputedStyle(group.rows[0].querySelector('.ph-section-label')).borderBottomWidth)
      .to.equal('0px');
    expect(getComputedStyle(group.rows[1].querySelector('td')).borderBottomWidth).to.equal('0px');
    expect(getComputedStyle(group.rows[2].querySelector('td')).borderBottomWidth).to.equal('1px');
    expect(getComputedStyle(root.querySelector('.ph-request-toggle')).display).to.equal('inline-flex');
  });
});

describe('publish-history source JSON', () => {
  afterEach(() => {
    sinon.restore();
    document.body.innerHTML = '';
  });

  it('fetches via DA source API with auth and pretty-prints', async () => {
    const stub = sinon.stub(window, 'fetch').resolves(new Response('{"a":1}'));
    const json = await fetchSourceJson({ org: 'o', repo: 'r', path: SUCCESS.daPayloadPath, token: 't' });
    expect(json).to.equal('{\n  "a": 1\n}');
    expect(stub.firstCall.args[0]).to.equal(`https://admin.da.live/source/o/r/${SUCCESS.daPayloadPath}`);
  });

  it('rejects invalid paths without fetching', async () => {
    const stub = sinon.stub(window, 'fetch');
    let err;
    try {
      await fetchSourceJson({ org: 'o', repo: 'r', path: 'https://evil.com/x.json', token: 't' });
    } catch (e) { err = e; }
    expect(err.message).to.contain('not a valid');
    expect(stub.called).to.equal(false);
  });

  it('modal shows loading, then JSON, with disclaimer and path', async () => {
    let resolve;
    sinon.stub(window, 'fetch').returns(new Promise((r) => { resolve = r; }));
    const { modal, done } = openSourceModal({ org: 'o', repo: 'r', token: 't', path: SUCCESS.daPayloadPath });
    expect(modal.textContent).to.contain('Loading');
    expect(modal.textContent).to.contain(SOURCE_DISCLAIMER);
    expect(modal.textContent).to.contain(SUCCESS.daPayloadPath);
    expect(modal.textContent).to.contain('Copy path');
    resolve(new Response('{"x":"<b>"}'));
    await done;
    expect(modal.querySelector('pre').textContent).to.contain('"<b>"');
    expect(modal.querySelector('pre b')).to.equal(null);
  });

  it('modal shows explicit fetch errors', async () => {
    sinon.stub(window, 'fetch').resolves(new Response('no', { status: 500 }));
    const { modal, done } = openSourceModal({ org: 'o', repo: 'r', token: 't', path: SUCCESS.daPayloadPath });
    await done;
    expect(modal.querySelector('[role="alert"]').textContent).to.contain('Could not load source JSON');
    expect(modal.textContent).to.contain(SOURCE_DISCLAIMER);
  });
});

describe('publish-history API and controller', () => {
  let originalUrl;

  before(async () => {
    await fetchLanguageIndex({
      context: { org: 'o', repo: 'r' },
      token: 't',
      fetchImpl: async () => translate,
    });
  });

  beforeEach(() => {
    originalUrl = window.location.href;
  });

  afterEach(() => {
    sinon.restore();
    window.history.replaceState(null, '', originalUrl);
    document.body.innerHTML = '';
  });

  it('sends bearer token and cursor; surfaces nextCursor', async () => {
    const stub = sinon.stub(window, 'fetch').resolves(jsonResponse({ items: [SUCCESS], nextCursor: 'abc' }));
    const page = await fetchPublishLogs({ token: 'tok', cursor: 'c1' });
    const [url, opts] = stub.firstCall.args;
    expect(url).to.contain('list-publish-logs');
    expect(url).to.contain('cursor=c1');
    expect(new URL(url).searchParams.get('byMe')).to.equal('true');
    expect(opts.headers.Authorization).to.equal('Bearer tok');
    expect(page.nextCursor).to.equal('abc');
  });

  it('sends selected filters and inclusive UTC date bounds as encoded query parameters', async () => {
    const stub = sinon.stub(window, 'fetch').resolves(jsonResponse({ items: [] }));
    await fetchPublishLogs({
      token: 'tok',
      byMe: false,
      app: 'firefly',
      platform: 'apple',
      status: 'failed',
      from: '2026-10-01',
      to: '2026-10-09',
      cursor: 'next&=page',
    });
    const url = stub.firstCall.args[0];
    expect(Object.fromEntries(new URL(url).searchParams)).to.deep.equal({
      byMe: 'false',
      app: 'firefly',
      platform: 'apple',
      status: 'failed',
      dateFrom: '2026-10-01T00:00:00.000Z',
      dateTo: '2026-10-09T23:59:59.999Z',
      cursor: 'next&=page',
    });
    expect(url).to.contain('dateFrom=2026-10-01T00%3A00%3A00.000Z');
  });

  it('omits unselected optional filters', async () => {
    const stub = sinon.stub(window, 'fetch').resolves(jsonResponse({ items: [] }));
    await fetchPublishLogs({
      token: 'tok', app: '', platform: '', status: '', from: '', to: '',
    });
    expect(Object.fromEntries(new URL(stub.firstCall.args[0]).searchParams))
      .to.deep.equal({ byMe: 'true' });
  });

  it('throws on HTTP and malformed responses', async () => {
    const stub = sinon.stub(window, 'fetch');
    stub.onCall(0).resolves(jsonResponse({}, 500));
    stub.onCall(1).resolves(jsonResponse({ nope: 1 }));
    let e1; let e2;
    try { await fetchPublishLogs({ token: 't' }); } catch (e) { e1 = e; }
    try { await fetchPublishLogs({ token: 't' }); } catch (e) { e2 = e; }
    expect(e1.message).to.contain('HTTP 500');
    expect(e2.message).to.contain('items');
  });

  async function mount() {
    document.body.innerHTML = `
      <button class="tab-button" data-tab="publish-history"></button>
      <div data-tab-content="publish-history">
        <button id="ph-refresh"></button>
        <select id="ph-filter-app"></select><select id="ph-filter-platform"></select>
        <select id="ph-filter-status"></select>
        <input id="ph-filter-from" type="date"><input id="ph-filter-to" type="date">
        <input id="ph-filter-by-me" type="radio" name="ph-requestor" checked>
        <input id="ph-filter-all" type="radio" name="ph-requestor">
        <div id="ph-error" hidden></div><div id="ph-status"></div>
        <div id="ph-results"></div><button id="ph-load-more" hidden></button>
      </div>`;
    return init({ context: { org: 'o', repo: 'r' }, token: 't' });
  }
  const q = (s) => document.querySelector(s);

  it('reuses the cached language mapping used by Export', async () => {
    const section = { type: 'metadata', success: ['en', 'DE-DE', 'uk', 'en-GB'] };
    const item = { ...SUCCESS, response: { sections: [section] } };
    const stub = sinon.stub(window, 'fetch').resolves(jsonResponse({ items: [item] }));
    const controller = await mount();
    await controller.load();
    expect(stub.calledOnce).to.equal(true);
    expect(stub.firstCall.args[0]).to.contain('list-publish-logs');
    q('.ph-table .ph-more').click();
    expect([...q('.ph-table').querySelectorAll('.ph-chip-locale')].map((chip) => chip.textContent))
      .to.deep.equal(['English', 'German', 'English - British', 'en-GB']);
  });

  it('uses the configured translation file and caches names across refreshes', async () => {
    const url = new URL(window.location.href);
    url.searchParams.set('configFile', 'translate-redesign.json');
    window.history.replaceState(null, '', url);
    const section = { type: 'metadata', success: ['ja-JP', 'uk', 'xx'] };
    const item = { ...SUCCESS, response: { sections: [section] } };
    const stub = sinon.stub(window, 'fetch');
    stub.withArgs(sinon.match('list-publish-logs')).resolves(jsonResponse({ items: [item] }));
    const configFetch = stub.withArgs(
      'https://admin.da.live/source/o/r/.da/translate-redesign.json',
    ).resolves(jsonResponse({
      ...translate,
      languages: {
        data: [
          ...translate.languages.data,
          { name: 'Japanese', code: 'ja', location: '/ja-jp', source: '/' },
          { name: 'Ukrainian', code: 'uk', location: '/uk-ua', source: '/' },
        ],
      },
    }));
    const controller = await mount();
    await controller.load();
    expect([...q('.ph-table').querySelectorAll('.ph-chip-locale')].map((chip) => chip.textContent))
      .to.deep.equal(['Japanese', 'English - British', 'xx']);
    expect(configFetch.firstCall.args[1].headers.Authorization).to.equal('Bearer t');
    await controller.load();
    expect(configFetch.calledOnce).to.equal(true);
    expect(q('.ph-chip-locale').textContent).to.equal('Japanese');
  });

  it('keeps locale codes visible when the language sheet cannot be loaded', async () => {
    const url = new URL(window.location.href);
    url.searchParams.set('configFile', 'missing-history-languages.json');
    window.history.replaceState(null, '', url);
    const stub = sinon.stub(window, 'fetch');
    stub.withArgs(sinon.match('list-publish-logs')).resolves(jsonResponse({ items: [SUCCESS] }));
    stub.withArgs(sinon.match('missing-history-languages.json')).resolves(jsonResponse({}, 503));
    const log = sinon.stub(console, 'error');
    const controller = await mount();
    await controller.load();
    expect(q('.ph-table')).to.not.equal(null);
    expect(q('.ph-chip-locale').textContent).to.equal('en');
    expect(log.calledWith('Failed to fetch missing-history-languages.json:', 503)).to.equal(true);
  });

  it('loads on tab click, paginates without duplicates, keeps rows on refresh failure', async () => {
    const stub = sinon.stub(window, 'fetch');
    stub.onCall(0).resolves(jsonResponse({ items: fixture.items.slice(0, 3), nextCursor: 'n1' }));
    stub.onCall(1).resolves(jsonResponse({ items: fixture.items.slice(2) }));
    stub.onCall(2).resolves(jsonResponse({}, 503));
    await mount();
    expect(q('#ph-results').textContent).to.equal('');
    q('.tab-button').click();
    expect(q('#ph-status').textContent).to.contain('Loading');
    await tick();
    expect(q('.ph-table').querySelectorAll('tbody')).to.have.length(3);
    expect(q('#ph-load-more').hidden).to.equal(false);
    expect(q('#ph-status').textContent).to.contain('loaded records');

    q('#ph-load-more').click();
    await tick();
    expect(stub.secondCall.args[0]).to.contain('cursor=n1');
    expect(q('.ph-table').querySelectorAll('tbody')).to.have.length(fixture.items.length);
    expect(q('#ph-load-more').hidden).to.equal(true);

    q('#ph-refresh').click();
    await tick();
    expect(q('#ph-error').hidden).to.equal(false);
    expect(q('#ph-error').textContent).to.contain('HTTP 503');
    expect(q('#ph-error').textContent).to.contain('previously loaded');
    expect(q('#ph-status').textContent).to.contain(`${fixture.items.length} loaded`);
  });

  it('reloads server-filtered history, retains selections, and passes filters to pagination and refresh', async () => {
    const stub = sinon.stub(window, 'fetch');
    stub.onCall(0).resolves(jsonResponse({ items: fixture.items, nextCursor: 'unfiltered' }));
    stub.onCall(1).resolves(jsonResponse({ items: [FAILED], nextCursor: 'filtered' }));
    stub.onCall(2).resolves(jsonResponse({ items: [FAILED] }));
    stub.onCall(3).resolves(jsonResponse({ items: [] }));
    stub.onCall(4).resolves(jsonResponse({ items: [SUCCESS] }));
    const controller = await mount();
    await controller.load();
    expect(q('#ph-filter-by-me').checked).to.equal(true);
    expect(new URL(stub.firstCall.args[0]).searchParams.get('byMe')).to.equal('true');

    q('#ph-filter-app').value = FAILED.app;
    q('#ph-filter-platform').value = FAILED.platform;
    q('#ph-filter-status').value = 'failed';
    q('#ph-filter-from').value = '2026-10-01';
    q('#ph-filter-to').value = '2026-10-09';
    q('#ph-filter-from').dispatchEvent(new Event('change'));
    expect(controller.state.nextCursor).to.equal(null);
    await tick();
    const filters = {
      byMe: 'true',
      app: FAILED.app,
      platform: FAILED.platform,
      status: 'failed',
      dateFrom: '2026-10-01T00:00:00.000Z',
      dateTo: '2026-10-09T23:59:59.999Z',
    };
    expect(Object.fromEntries(new URL(stub.secondCall.args[0]).searchParams))
      .to.deep.equal(filters);
    expect(q('.ph-table').querySelectorAll('tbody')).to.have.length(1);
    expect(q('#ph-filter-app').value).to.equal(FAILED.app);
    q('#ph-load-more').click();
    await tick();
    expect(Object.fromEntries(new URL(stub.thirdCall.args[0]).searchParams))
      .to.deep.equal({ ...filters, cursor: 'filtered' });
    expect(controller.state.items).to.have.length(1);
    q('#ph-refresh').click();
    await tick();
    expect(Object.fromEntries(new URL(stub.getCall(3).args[0]).searchParams))
      .to.deep.equal(filters);
    expect(q('#ph-results').textContent).to.contain('No publish requests found');
    expect(q('#ph-filter-app').value).to.equal(FAILED.app);
    expect(q('#ph-filter-platform').value).to.equal(FAILED.platform);
    expect(q('#ph-filter-status').value).to.equal('failed');

    q('#ph-filter-all').click();
    await tick();
    expect(Object.fromEntries(new URL(stub.getCall(4).args[0]).searchParams))
      .to.deep.equal({ ...filters, byMe: 'false' });
    expect(q('#ph-filter-by-me').checked).to.equal(false);
  });

  it('discards stale responses when filters change during a request', async () => {
    let finishInitial;
    const stub = sinon.stub(window, 'fetch');
    stub.onCall(0).returns(new Promise((resolve) => { finishInitial = resolve; }));
    stub.onCall(1).resolves(jsonResponse({ items: [FAILED] }));
    const controller = await mount();
    const initial = controller.load();
    q('#ph-filter-status').value = 'failed';
    q('#ph-filter-status').dispatchEvent(new Event('change'));
    await tick();
    expect(stub.firstCall.args[1].signal.aborted).to.equal(true);
    expect(controller.state.items).to.deep.equal([FAILED]);
    finishInitial(jsonResponse({ items: [SUCCESS], nextCursor: 'stale' }));
    await initial;
    expect(controller.state.items).to.deep.equal([FAILED]);
    expect(controller.state.nextCursor).to.equal(null);
    expect(q('#ph-error').hidden).to.equal(true);
    expect(controller.state.loading).to.equal(false);
  });

  it('shows empty state and initial API error', async () => {
    const stub = sinon.stub(window, 'fetch');
    stub.onCall(0).resolves(jsonResponse({ items: [] }));
    stub.onCall(1).rejects(new Error('network down'));
    await mount();
    q('#ph-refresh').click();
    await tick();
    expect(q('#ph-results').textContent).to.contain('No publish requests found');
    q('#ph-refresh').click();
    await tick();
    expect(q('#ph-error').textContent).to.contain('network down');
  });
});
