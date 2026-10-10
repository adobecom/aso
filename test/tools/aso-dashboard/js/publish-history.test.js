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
    expect(cols.metadata.map((c) => c.status)).to.deep.equal(['failed', 'success', 'pending']);
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
    expect(isValidSourcePath('.da/store-publish/request/a-b.json')).to.equal(true);
    expect(isValidSourcePath('/.da/store-publish/request/a.json')).to.equal(true);
    ['https://evil.com/x.json', '.da/store-publish/request/../x.json', '/etc/passwd', '', null]
      .forEach((p) => expect(isValidSourcePath(p)).to.equal(false));
  });

  it('merges pages without duplicate rows and filters loaded rows', () => {
    const merged = mergeItems(fixture.items.slice(0, 2), fixture.items.slice(1, 4));
    expect(merged).to.have.length(4);
    expect(applyFilters(fixture.items, { platform: 'google' })).to.deep.equal([FAILED]);
    expect(applyFilters(fixture.items, { app: 'firefly' })).to.deep.equal([SUCCESS]);
    expect(applyFilters(fixture.items, { status: 'partial' })).to.have.length(2);
    expect(applyFilters(fixture.items, { app: 'nope' })).to.have.length(0);
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

  it('limits to three chips and repeatedly expands and collapses in place', () => {
    const cell = renderSectionCell(MANY, { key: 'metadata', label: 'Metadata' });
    expect(cell.querySelectorAll('.ph-chip')).to.have.length(3);
    const more = cell.querySelector('.ph-more');
    expect(more.textContent).to.equal('+2 more');
    expect(more.getAttribute('aria-expanded')).to.equal('false');
    more.click();
    expect(cell.querySelectorAll('.ph-chip')).to.have.length(5);
    expect(more.textContent).to.equal('Less');
    expect(more.getAttribute('aria-expanded')).to.equal('true');
    more.click();
    expect(cell.querySelectorAll('.ph-chip')).to.have.length(3);
    expect(more.textContent).to.equal('+2 more');
    expect(more.getAttribute('aria-expanded')).to.equal('false');
    more.click();
    expect(cell.querySelectorAll('.ph-chip')).to.have.length(5);
    expect(cell.querySelectorAll('.ph-more')).to.have.length(1);
  });

  it('supports Less for large language lists independently in desktop and mobile views', () => {
    const locales = Array.from({ length: 54 }, (_, index) => `locale-${index}`);
    const item = { response: { sections: [{ type: 'metadata', success: locales }] } };
    const root = renderResults([item], {});
    document.body.append(root);
    const table = root.querySelector('.ph-table');
    const card = root.querySelector('.ph-card');
    const tableToggle = table.querySelector('.ph-more');
    const cardToggle = card.querySelector('.ph-more');
    expect(tableToggle.textContent).to.equal('+51 more');
    tableToggle.focus();
    tableToggle.click();
    expect(table.querySelectorAll('.ph-chip')).to.have.length(54);
    expect(card.querySelectorAll('.ph-chip')).to.have.length(3);
    expect(tableToggle.textContent).to.equal('Less');
    expect(document.activeElement).to.equal(tableToggle);
    cardToggle.click();
    tableToggle.click();
    expect(table.querySelectorAll('.ph-chip')).to.have.length(3);
    expect(card.querySelectorAll('.ph-chip')).to.have.length(54);
    expect(tableToggle.textContent).to.equal('+51 more');
    cardToggle.click();
    expect(card.querySelectorAll('.ph-chip')).to.have.length(3);
    expect(cardToggle.getAttribute('aria-expanded')).to.equal('false');
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
        .to.deep.equal(['Japanese', 'English', 'English - British']);
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
    expect(details.querySelector('dl').textContent).to.contain(
      `${SUCCESS.requestorName} (${SUCCESS.requestor})`,
    );
    [...details.querySelectorAll('button')].find((button) => button.textContent === 'View JSON').click();
    expect(onViewJson.calledOnceWithExactly(SUCCESS.daPayloadPath)).to.equal(true);
    summary.click();
    expect(details.open).to.equal(false);
    summary.click();
    const close = details.querySelector('.ph-request-close');
    expect(close.getAttribute('aria-label')).to.equal('Close request details');
    close.focus();
    close.click();
    expect(details.open).to.equal(false);
    expect(document.activeElement).to.equal(summary);
    summary.click();
    expect(details.open).to.equal(true);
  });

  it('keeps legacy requestors email-only and renders names as text', () => {
    const legacy = renderRequestCell(LEGACY);
    const requestor = [...legacy.querySelectorAll('dt')]
      .find((term) => term.textContent === 'Requestor').nextElementSibling;
    expect(requestor.textContent).to.equal(LEGACY.requestor);
    const named = renderRequestCell({
      ...SUCCESS,
      requestorName: undefined,
      request: { requestorName: '<img src=x>' },
    });
    expect(named.querySelector('dl').textContent).to.contain(`<img src=x> (${SUCCESS.requestor})`);
    expect(named.querySelector('img')).to.equal(null);
  });

  it('places the request close button at the top right in desktop and mobile overlays', async () => {
    const style = document.createElement('style');
    style.textContent = await readFile({ path: '../../../../tools/aso-dashboard/css/aso-dashboard.css' });
    const root = renderResults([SUCCESS], {});
    document.body.append(style, root);
    [root.querySelector('.ph-table'), root.querySelector('.ph-cards')].forEach((view) => {
      view.style.display = view.classList.contains('ph-table') ? 'table' : 'grid';
      const details = view.querySelector('details');
      details.open = true;
      const content = details.querySelector('.ph-request-body');
      const close = details.querySelector('.ph-request-close');
      expect(content.firstElementChild).to.equal(close);
      expect(getComputedStyle(close).alignSelf).to.equal('flex-end');
      expect(close.getBoundingClientRect().right)
        .to.be.at.most(content.getBoundingClientRect().right);
      expect(close.getBoundingClientRect().bottom)
        .to.be.at.most(content.querySelector('dl').getBoundingClientRect().top);
      close.click();
      expect(details.open).to.equal(false);
    });
  });

  it('formats Started in the viewer local time while preserving the original timestamp', () => {
    const value = '2026-10-09T09:35:40.000Z';
    const date = new Date(value);
    const time = renderTime(value);
    expect(time.querySelector('.ph-time-date').textContent).to.equal(
      new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).format(date),
    );
    expect(time.querySelector('.ph-time-clock').textContent).to.equal(
      new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(date),
    );
    expect(time.textContent).to.not.match(/GMT|UTC/);
    expect(time.dateTime).to.equal(value);
    expect(time.title).to.contain('your local time');
    expect(time.title).to.contain(value);
  });

  it('styles the loading state as a tall panel with a full-width gradient bar', async () => {
    const style = document.createElement('style');
    style.textContent = await readFile({ path: '../../../../tools/aso-dashboard/css/aso-dashboard.css' });
    const panel = document.createElement('div');
    panel.className = 'ph-results-inner ph-loading';
    panel.innerHTML = '<p class="ph-loading-text">x</p><div class="ph-loading-bar"><div class="ph-loading-bar-fill"></div></div>';
    document.body.append(style, panel);
    expect(panel.getBoundingClientRect().height).to.be.at.least(320);
    const bar = panel.querySelector('.ph-loading-bar');
    expect(bar.getBoundingClientRect().width).to.be.above(panel.clientWidth - 80);
    expect(getComputedStyle(bar).backgroundColor).to.equal('rgb(224, 224, 224)');
    expect(getComputedStyle(panel.querySelector('.ph-loading-bar-fill')).backgroundImage)
      .to.contain('linear-gradient');
  });

  it('separates request groups with inset delimiters and highlights the active group with a border', async () => {
    const style = document.createElement('style');
    style.textContent = await readFile({ path: '../../../../tools/aso-dashboard/css/aso-dashboard.css' });
    const root = renderResults([SUCCESS, PARTIAL, FAILED], {});
    document.body.append(style, root);
    const [first, , last] = root.querySelectorAll('tbody');
    const line = (cell) => getComputedStyle(cell).backgroundImage;
    const firstCell = (group) => group.querySelector('th[scope="rowgroup"]');
    const lastLanguages = (group) => group.rows[2].cells[1];

    expect(line(firstCell(first))).to.contain('linear-gradient');
    expect(getComputedStyle(firstCell(first)).backgroundPosition).to.equal('100% 100%');
    expect(line(lastLanguages(first))).to.contain('linear-gradient');
    expect(getComputedStyle(lastLanguages(first)).backgroundPosition).to.equal('0% 100%');
    expect(line(firstCell(last))).to.equal('none');
    expect(getComputedStyle(firstCell(first)).backgroundColor).to.equal('rgba(0, 0, 0, 0)');

    const css = style.textContent;
    expect(css).to.match(/\.ph-request-group:hover[^{]*\{[^}]*--ph-hover-bg: #e6f0fd/);
    expect(css).to.match(/\.ph-request-group:hover[^{]*\{[^}]*--ph-edge: #2b4fd8/);
  });

  it('keeps the table inside its panel and chips unbroken at narrow desktop widths', async () => {
    const style = document.createElement('style');
    style.textContent = await readFile({ path: '../../../../tools/aso-dashboard/css/aso-dashboard.css' });
    const root = renderResults(fixture.items, {});
    const host = document.createElement('div');
    host.style.width = '1000px';
    host.append(root);
    document.body.append(style, host);
    const table = root.querySelector('table');
    expect(table.getBoundingClientRect().right).to.be.at.most(root.getBoundingClientRect().right);
    root.querySelectorAll('.ph-chip').forEach((chip) => {
      expect(chip.getBoundingClientRect().height).to.be.below(32);
    });
  });

  it('wraps section labels at delimiters without splitting Metadata', async () => {
    const style = document.createElement('style');
    style.textContent = await readFile({ path: '../../../../tools/aso-dashboard/css/aso-dashboard.css' });
    const table = document.createElement('table');
    table.className = 'ph-table';
    table.style.display = 'table';
    table.style.width = '110px';
    table.style.tableLayout = 'fixed';
    table.innerHTML = '<tbody><tr><th class="ph-section-label">Metadata</th></tr>'
      + '<tr><th class="ph-section-label">Custom Product Pages</th></tr></tbody>';
    document.body.append(style, table);
    const [metadata, custom] = table.querySelectorAll('th');
    const range = document.createRange();
    range.selectNodeContents(metadata);
    expect(range.getClientRects()).to.have.length(1);
    expect(getComputedStyle(metadata).overflowWrap).to.equal('normal');
    range.selectNodeContents(custom);
    expect(range.getClientRects().length).to.be.above(1);
    ['Custom', 'Product', 'Pages'].forEach((word) => {
      const start = custom.textContent.indexOf(word);
      range.setStart(custom.firstChild, start);
      range.setEnd(custom.firstChild, start + word.length);
      expect(range.getClientRects()).to.have.length(1);
    });
  });

  it('orders failed, successful and grey selected locales, including empty result sections', () => {
    const item = {
      selectedLocales: ['en-US', 'ja-jp', 'ko-kr', 'de-de'],
      response: {
        sections: [
          { type: 'metadata', success: ['en-US'], failure: [{ locale: 'JA-JP', error: 'bad' }] },
          { type: 'promos', success: [] },
        ],
      },
    };
    const sections = mapSections(item);
    expect(sections.metadata.map((c) => [c.locale, c.status])).to.deep.equal([
      ['JA-JP', 'failed'], ['en-US', 'success'], ['ko-kr', 'missing'], ['de-de', 'missing'],
    ]);
    expect(sections.promos.map((c) => [c.locale, c.status])).to.deep.equal(
      item.selectedLocales.map((locale) => [locale, 'missing']),
    );
    const cell = renderSectionCell(item, { key: 'metadata', label: 'Metadata' });
    expect(cell.querySelectorAll('.ph-chip-missing')).to.have.length(1);
    expect(cell.querySelector('.ph-chip-missing').title).to.equal('No result recorded (ko-kr)');
    cell.querySelector('.ph-more').click();
    expect(cell.querySelectorAll('.ph-chip-missing')).to.have.length(2);
    const promos = renderSectionCell(item, { key: 'promos', label: 'Promos' });
    expect(promos.querySelectorAll('.ph-chip-missing')).to.have.length(3);
    promos.querySelector('.ph-more').click();
    expect(promos.querySelectorAll('.ph-chip-missing')).to.have.length(4);
    expect(renderSectionCell(item, { key: 'cpp', label: 'CPP' }).textContent).to.equal('\u2014');
    expect(mapSections({ response: item.response }).metadata).to.have.length(2);
  });

  it('uses request-selected locales and sorts merged section results before unreported locales', () => {
    const item = {
      request: { selectedLocales: ['en', 'fr', 'de', 'ja', 'ko'] },
      response: {
        sections: [
          { type: 'metadata', success: ['en'], pending: ['de'] },
          { type: 'localizations', success: ['ja'], failure: [{ locale: 'fr', error: 'bad' }] },
        ],
      },
    };
    expect(mapSections(item).metadata.map((c) => [c.locale, c.status])).to.deep.equal([
      ['fr', 'failed'], ['en', 'success'], ['ja', 'success'], ['de', 'pending'], ['ko', 'missing'],
    ]);
    const root = renderResults([item], {});
    [root.querySelector('.ph-table'), root.querySelector('.ph-card')].forEach((view) => {
      expect([...view.querySelectorAll('.ph-chip')].map((chip) => chip.title))
        .to.deep.equal(['Failed (fr)', 'Passed (en)', 'Passed (ja)']);
      view.querySelector('.ph-more').click();
      expect([...view.querySelectorAll('.ph-chip')].map((chip) => chip.title))
        .to.deep.equal(['Failed (fr)', 'Passed (en)', 'Passed (ja)', 'Pending (de)', 'No result recorded (ko)']);
    });
  });

  it('renders unreported selected languages grey with an accessible status', async () => {
    const style = document.createElement('style');
    style.textContent = await readFile({ path: '../../../../tools/aso-dashboard/css/aso-dashboard.css' });
    const cell = renderSectionCell({
      selectedLocales: ['fr'],
      response: { sections: [{ type: 'metadata' }] },
    }, { key: 'metadata', label: 'Metadata' }, new Map([['fr', 'French']]));
    document.body.append(style, cell);
    const chip = cell.querySelector('.ph-chip-missing');
    expect(chip.textContent).to.contain('French');
    expect(chip.getAttribute('aria-label')).to.equal('Metadata French (fr): No result recorded');
    expect(getComputedStyle(chip).backgroundColor).to.equal('rgb(236, 236, 236)');
  });

  it('groups each request into three section rows with shared cells and matching mobile labels', () => {
    const root = renderResults(fixture.items, {});
    expect([...root.querySelectorAll('thead th')].map((t) => t.textContent))
      .to.deep.equal(['Requested on', 'App', 'Platform', 'Release Period', 'Overall', 'Request', 'Section', 'Languages']);
    expect(root.querySelector('thead th:nth-child(6) .ph-sr-only').textContent).to.equal('Request');
    expect(root.querySelectorAll('tbody')).to.have.length(fixture.items.length);
    expect(root.querySelectorAll('tbody tr')).to.have.length(fixture.items.length * 3);
    const labels = ['Metadata', 'Promos/In-App Events', 'Custom Product Pages'];
    [...root.querySelectorAll('tbody')].forEach((group, index) => {
      expect(group.dataset.requestId).to.equal(fixture.items[index].requestId);
      expect([...group.querySelectorAll('.ph-section-label')].map((cell) => cell.textContent))
        .to.deep.equal(labels);
      expect(group.rows[0].cells).to.have.length(8);
      expect(group.rows[1].cells).to.have.length(2);
      expect(group.rows[2].cells).to.have.length(2);
      expect(group.querySelectorAll('[rowspan="3"]')).to.have.length(6);
      expect(group.rows[0].cells[0].scope).to.equal('rowgroup');
      expect(group.querySelectorAll('.ph-request-toggle')).to.have.length(1);
      expect(group.querySelectorAll('.ph-section-cell')).to.have.length(3);
    });
    expect(root.querySelectorAll('.ph-card')).to.have.length(fixture.items.length);
    [...root.querySelectorAll('.ph-card')].forEach((card) => {
      expect([...card.querySelectorAll('.ph-card-label')].map((label) => label.textContent))
        .to.deep.equal(['Release Period', ...labels]);
    });
  });

  it('shows release periods in desktop and mobile history, with a dash for old records', () => {
    const root = renderResults([
      SUCCESS,
      { ...PARTIAL, request: { releasePeriod: { year: '2025', quarter: 'q1', month: 'january' } } },
      LEGACY,
    ], {});
    [root.querySelector('.ph-table'), root.querySelector('.ph-cards')].forEach((view) => {
      expect([...view.querySelectorAll('.ph-release-period')].map((period) => period.textContent))
        .to.deep.equal(['2026 / Q4 / October', '2025 / Q1 / January', '\u2014']);
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

  it('styles the list as a rounded gray panel with spacious grouped rows', async () => {
    const style = document.createElement('style');
    style.textContent = await readFile({ path: '../../../../tools/aso-dashboard/css/aso-dashboard.css' });
    const root = renderResults([SUCCESS], {});
    document.body.append(style, root);
    const group = root.querySelector('tbody');
    const panel = getComputedStyle(root);
    expect(panel.backgroundColor).to.equal('rgb(247, 247, 247)');
    expect(panel.borderRadius).to.equal('12px');
    expect(panel.borderTopWidth).to.equal('1px');
    expect(panel.overflow).to.equal('visible');
    expect(getComputedStyle(root.querySelector('thead th')).backgroundColor)
      .to.equal('rgb(243, 243, 243)');
    expect(getComputedStyle(root.querySelector('.ph-app')).fontWeight).to.equal('600');
    expect(getComputedStyle(root.querySelector('.ph-app')).whiteSpace).to.equal('nowrap');
    expect(getComputedStyle(root.querySelector('.ph-time-clock')).display).to.equal('block');
    expect(getComputedStyle(group.querySelector('[rowspan]')).verticalAlign).to.equal('middle');
    expect(getComputedStyle(group.querySelector('[rowspan]')).paddingTop).to.equal('24px');
    expect(getComputedStyle(group.rows[0].querySelector('.ph-section-label')).paddingTop)
      .to.equal('24px');
    expect(getComputedStyle(group.rows[2].querySelector('.ph-section-label')).paddingBottom)
      .to.equal('24px');
    expect(getComputedStyle(group.querySelector('.ph-section-label')).textTransform)
      .to.equal('uppercase');
    expect(getComputedStyle(group.querySelector('.ph-section-label')).color)
      .to.equal('rgb(119, 119, 119)');
    expect(getComputedStyle(group.rows[0].querySelector('.ph-section-label')).borderBottomWidth)
      .to.equal('1px');
    expect(getComputedStyle(group.rows[0].querySelector('.ph-section-label')).borderBottomColor)
      .to.equal('rgba(0, 0, 0, 0)');
    expect(getComputedStyle(root.querySelector('.ph-request-toggle')).display).to.equal('inline-flex');
    expect(getComputedStyle(root.querySelector('.ph-request-toggle')).minWidth).to.equal('40px');
    expect(getComputedStyle(root.querySelector('.ph-card')).borderBottomWidth).to.equal('0px');
    expect(getComputedStyle(root.querySelector('.ph-card-label')).textTransform).to.equal('uppercase');
  });

  it('fits the desktop panel and switches to matching cards on mobile', async () => {
    const css = await readFile({ path: '../../../../tools/aso-dashboard/css/aso-dashboard.css' });
    const frame = document.createElement('iframe');
    frame.style.width = '900px';
    document.body.append(frame);
    const style = frame.contentDocument.createElement('style');
    style.textContent = css;
    frame.contentDocument.head.append(style);
    const root = renderResults([PARTIAL, MANY], {});
    frame.contentDocument.body.append(root);
    const table = root.querySelector('.ph-table');
    const cards = root.querySelector('.ph-cards');
    const styles = (node) => frame.contentWindow.getComputedStyle(node);
    expect(styles(table).display).to.equal('table');
    expect(styles(cards).display).to.equal('none');
    expect(table.getBoundingClientRect().width).to.be.at.most(root.clientWidth);
    frame.style.width = '650px';
    expect(styles(table).display).to.equal('none');
    expect(styles(cards).display).to.equal('grid');
    expect(cards.getBoundingClientRect().width).to.be.at.most(root.clientWidth);
    const details = cards.querySelector('details');
    details.querySelector('summary').click();
    expect(details.open).to.equal(true);
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

  it('reads alternate cursor fields and sends structured cursors back as JSON', async () => {
    const stub = sinon.stub(window, 'fetch');
    stub.onCall(0).resolves(jsonResponse({ items: [], nextToken: 'tok2' }));
    stub.onCall(1).resolves(jsonResponse({ items: [], lastEvaluatedKey: { pk: 'a', sk: 'b' } }));
    stub.onCall(2).resolves(jsonResponse({ items: [], nextCursor: null }));
    expect((await fetchPublishLogs({ token: 't' })).nextCursor).to.equal('tok2');
    const { nextCursor } = await fetchPublishLogs({ token: 't' });
    expect(JSON.parse(nextCursor)).to.deep.equal({ pk: 'a', sk: 'b' });
    expect((await fetchPublishLogs({ token: 't' })).nextCursor).to.equal(null);
    stub.resolves(jsonResponse({ items: [] }));
    await fetchPublishLogs({ token: 't', cursor: nextCursor });
    expect(new URL(stub.lastCall.args[0]).searchParams.get('cursor')).to.equal(nextCursor);
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

  it('sends selected filters as encoded query parameters', async () => {
    const stub = sinon.stub(window, 'fetch').resolves(jsonResponse({ items: [] }));
    await fetchPublishLogs({
      token: 'tok',
      byMe: false,
      app: 'firefly',
      platform: 'apple',
      status: 'failed',
      cursor: 'next&=page',
    });
    const url = stub.firstCall.args[0];
    expect(Object.fromEntries(new URL(url).searchParams)).to.deep.equal({
      byMe: 'false',
      app: 'firefly',
      platform: 'apple',
      status: 'failed',
      cursor: 'next&=page',
    });
    expect(url).to.contain('cursor=next%26%3Dpage');
  });

  it('omits unselected optional filters and ignores date arguments', async () => {
    const stub = sinon.stub(window, 'fetch').resolves(jsonResponse({ items: [] }));
    await fetchPublishLogs({
      token: 'tok', app: '', platform: '', status: '', from: '2026-10-01', to: '2026-10-09',
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
        <input id="ph-filter-by-me" type="radio" name="ph-requestor" checked>
        <input id="ph-filter-all" type="radio" name="ph-requestor">
        <div id="ph-error" hidden></div><div id="ph-status"></div>
        <div id="ph-results"></div><button id="ph-load-more" hidden></button>
      </div>`;
    return init({ context: { org: 'o', repo: 'r' }, token: 't' });
  }
  const q = (s) => document.querySelector(s);

  it('loads the full requestor name from the saved request and shows it with the email', async () => {
    const item = { ...SUCCESS };
    delete item.requestorName;
    const stub = sinon.stub(window, 'fetch');
    stub.withArgs(sinon.match('list-publish-logs')).resolves(jsonResponse({ items: [item] }));
    const source = stub.withArgs(sinon.match('admin.da.live/source'))
      .resolves(jsonResponse({ requestorName: 'Test Publisher' }));
    const controller = await mount();
    await controller.load();
    expect(source.calledOnce).to.equal(true);
    expect(controller.state.items[0].requestorName).to.equal('Test Publisher');
    [q('.ph-table'), q('.ph-card')].forEach((view) => {
      expect(view.querySelector('.ph-detail-list').textContent)
        .to.contain(`Test Publisher (${item.requestor})`);
    });
    expect(q('#ph-error').hidden).to.equal(true);
  });

  it('loads a release period from the saved request even when locales are already recorded', async () => {
    const item = { ...SUCCESS };
    delete item.releasePeriod;
    const releasePeriod = { year: '2026', quarter: 'q4', month: 'october' };
    const stub = sinon.stub(window, 'fetch');
    stub.withArgs(sinon.match('list-publish-logs')).resolves(jsonResponse({ items: [item] }));
    const source = stub.withArgs(sinon.match('admin.da.live/source'))
      .resolves(jsonResponse({ selectedLocales: ['fr'], releasePeriod }));
    const controller = await mount();
    await controller.load();
    expect(source.calledOnce).to.equal(true);
    expect(controller.state.items[0].releasePeriod).to.deep.equal(releasePeriod);
    expect(controller.state.items[0].selectedLocales).to.deep.equal(SUCCESS.selectedLocales);
    expect([...document.querySelectorAll('.ph-release-period')].map((period) => period.textContent))
      .to.deep.equal(['2026 / Q4 / October', '2026 / Q4 / October']);
    expect(q('#ph-error').hidden).to.equal(true);
  });

  it('loads selected locales from the saved request when the history API omits them', async () => {
    const item = {
      ...SUCCESS,
      response: {
        sections: [
          { type: 'metadata', success: ['en'], failure: [{ locale: 'ja-jp', error: 'bad' }] },
          { type: 'promos', success: ['ko-kr'] },
        ],
      },
    };
    delete item.selectedLocales;
    const stub = sinon.stub(window, 'fetch');
    stub.withArgs(sinon.match('list-publish-logs')).resolves(jsonResponse({ items: [item] }));
    const source = stub.withArgs(
      `https://admin.da.live/source/o/r/${item.daPayloadPath}`,
    ).resolves(jsonResponse({ selectedLocales: ['en', 'ja-jp', 'ko-kr', 'fr-fr'] }));
    const controller = await mount();
    await controller.load();
    expect(source.calledOnce).to.equal(true);
    expect(controller.state.items[0].selectedLocales)
      .to.deep.equal(['en', 'ja-jp', 'ko-kr', 'fr-fr']);
    [q('.ph-table'), q('.ph-card')].forEach((view) => {
      view.querySelectorAll('.ph-more').forEach((more) => more.click());
      expect([...view.querySelectorAll('.ph-chip')].map((chip) => chip.title)).to.deep.equal([
        'Failed (ja-jp)', 'Passed (en)', 'No result recorded (ko-kr)', 'No result recorded (fr-fr)',
        'Passed (ko-kr)', 'No result recorded (en)', 'No result recorded (ja-jp)', 'No result recorded (fr-fr)',
      ]);
    });
    expect(q('#ph-error').hidden).to.equal(true);
  });

  it('does not fetch source when the request already includes selected locales', async () => {
    const item = { ...SUCCESS, request: { selectedLocales: ['en', 'fr-fr'] } };
    delete item.selectedLocales;
    const stub = sinon.stub(window, 'fetch').resolves(jsonResponse({ items: [item] }));
    const controller = await mount();
    await controller.load();
    expect(stub.calledOnce).to.equal(true);
    q('.ph-table .ph-more').click();
    expect(q('.ph-chip-missing').title).to.equal('No result recorded (fr-fr)');
  });

  it('keeps history visible and reports retained-request failures without inventing languages', async () => {
    const item = { ...SUCCESS };
    delete item.selectedLocales;
    const stub = sinon.stub(window, 'fetch');
    stub.withArgs(sinon.match('list-publish-logs')).resolves(jsonResponse({ items: [item] }));
    stub.withArgs(sinon.match('admin.da.live/source')).resolves(jsonResponse({}, 404));
    const controller = await mount();
    await controller.load();
    expect(q('.ph-table')).to.not.equal(null);
    expect(q('.ph-chip-missing')).to.equal(null);
    expect(q('#ph-error').hidden).to.equal(false);
    expect(q('#ph-error').textContent).to.contain('Grey pills may be missing');
    expect(q('#ph-error').textContent).to.contain('Source file was not found');
  });

  it('silently skips legacy requests without selectedLocales', async () => {
    const item = { ...SUCCESS };
    delete item.selectedLocales;
    const stub = sinon.stub(window, 'fetch');
    stub.withArgs(sinon.match('list-publish-logs')).resolves(jsonResponse({ items: [item] }));
    stub.withArgs(sinon.match('admin.da.live/source')).resolves(jsonResponse({ app: 'firefly' }));
    const controller = await mount();
    await controller.load();
    expect(controller.state.items).to.deep.equal([item]);
    expect(q('.ph-table')).to.not.equal(null);
    expect(q('.ph-chip-missing')).to.equal(null);
    expect(q('#ph-error').hidden).to.equal(true);
  });

  it('skips legacy requests while still blocking invalid source paths', async () => {
    const items = [
      { ...SUCCESS, selectedLocales: undefined },
      { ...SUCCESS, selectedLocales: undefined, requestId: 'invalid', daPayloadPath: 'https://evil.com/source.json' },
    ];
    const stub = sinon.stub(window, 'fetch');
    stub.withArgs(sinon.match('list-publish-logs')).resolves(jsonResponse({ items }));
    stub.withArgs(sinon.match('admin.da.live/source')).resolves(jsonResponse({ app: 'firefly' }));
    const controller = await mount();
    await controller.load();
    expect(stub.callCount).to.equal(2);
    expect(q('#ph-error').textContent).to.not.contain('Source JSON does not record selectedLocales');
    expect(q('#ph-error').textContent).to.contain('Source path is not a valid publish request path');
    expect(q('.ph-table').querySelectorAll('tbody')).to.have.length(2);
  });

  it('still reports malformed selectedLocales in saved requests', async () => {
    const item = { ...SUCCESS, selectedLocales: undefined };
    const stub = sinon.stub(window, 'fetch');
    stub.withArgs(sinon.match('list-publish-logs')).resolves(jsonResponse({ items: [item] }));
    stub.withArgs(sinon.match('admin.da.live/source'))
      .resolves(jsonResponse({ selectedLocales: 'en' }));
    const controller = await mount();
    await controller.load();
    expect(q('#ph-error').hidden).to.equal(false);
    expect(q('#ph-error').textContent).to.contain('Source JSON does not record selectedLocales');
  });

  it('discards stale selected locales if history refreshes during a source read', async () => {
    const item = { ...SUCCESS, selectedLocales: undefined };
    let finishSource;
    const stub = sinon.stub(window, 'fetch');
    const logs = stub.withArgs(sinon.match('list-publish-logs'));
    logs.onCall(0).resolves(jsonResponse({ items: [item] }));
    logs.onCall(1).resolves(jsonResponse({ items: [FAILED] }));
    stub.withArgs(sinon.match('admin.da.live/source')).returns(new Promise((resolve) => {
      finishSource = resolve;
    }));
    const controller = await mount();
    const initial = controller.load();
    await tick();
    await controller.load();
    finishSource(jsonResponse({ selectedLocales: ['en', 'fr-fr'] }));
    await initial;
    expect(controller.state.items).to.deep.equal([FAILED]);
    expect(q('#ph-error').hidden).to.equal(true);
    expect(controller.state.loading).to.equal(false);
  });

  it('reuses the cached language mapping used by Export', async () => {
    const section = { type: 'metadata', success: ['en', 'DE-DE', 'uk', 'en-GB'] };
    const item = {
      ...SUCCESS,
      selectedLocales: section.success,
      response: { sections: [section] },
    };
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
    const loading = q('#ph-results .ph-loading');
    expect(loading.querySelector('[role="progressbar"]')).to.not.equal(null);
    expect(loading.textContent).to.contain('Loading publish results');
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
    q('#ph-filter-status').dispatchEvent(new Event('change'));
    expect(controller.state.nextCursor).to.equal(null);
    await tick();
    const filters = {
      byMe: 'true',
      app: FAILED.app,
      platform: FAILED.platform,
      status: 'failed',
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
