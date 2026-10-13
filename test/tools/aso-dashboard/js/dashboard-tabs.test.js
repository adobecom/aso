import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setupTabs } from '../../../../tools/aso-dashboard/js/dashboard-tabs.js';

describe('history-first Publish workspace', () => {
  let root;
  let publishHistory;
  const $ = (selector) => root.querySelector(selector);

  beforeEach(async () => {
    const html = await (await fetch('/tools/aso-dashboard/aso-dashboard.html')).text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    root = doc.querySelector('main');
    document.body.append(root);
    publishHistory = { ensureLoaded: sinon.spy(), showRequest: sinon.spy() };
    setupTabs({ publishHistory });
  });

  afterEach(() => {
    root.remove();
    sinon.restore();
  });

  it('has one Publish menu and opens History without changing the dashboard default', () => {
    expect($('[data-tab-content="import"]').classList.contains('active')).to.equal(true);
    expect($('.tab-button[data-tab="publish-history"]')).to.equal(null);
    expect(publishHistory.ensureLoaded.called).to.equal(false);
    $('.tab-button[data-tab="publish"]').click();
    expect($('[data-tab-content="publish-history"]').classList.contains('active')).to.equal(true);
    expect($('[data-tab-content="publish"]').classList.contains('active')).to.equal(false);
    expect($('.tab-button[data-tab="publish"]').classList.contains('active')).to.equal(true);
    expect(publishHistory.ensureLoaded.calledOnce).to.equal(true);
  });

  it('places an icon-only Refresh next to the title and keeps a compact New publish action', () => {
    const group = $('.ph-title-group');
    expect(group.contains($('#ph-title'))).to.equal(true);
    expect(group.contains($('#ph-refresh'))).to.equal(true);
    expect(group.contains($('#ph-updated'))).to.equal(true);
    expect($('#ph-filters').contains($('#ph-refresh'))).to.equal(false);
    expect($('#ph-refresh').type).to.equal('button');
    expect($('#ph-refresh').textContent.trim()).to.equal('');
    expect($('#ph-refresh').getAttribute('aria-label')).to.equal('Refresh publish results');
    expect($('.ph-heading-actions').contains($('#publish-new'))).to.equal(true);
    expect($('#publish-new').classList.contains('ph-button')).to.equal(true);
  });

  it('orders placeholder-only filters with Platform first and Everyone last', () => {
    const filters = $('#ph-filters');
    expect([...filters.querySelectorAll('select, button, input')].map((control) => control.id))
      .to.deep.equal([
        'ph-filter-platform', 'ph-filter-app', 'ph-filter-status', 'ph-filter-all',
      ]);
    expect(filters.querySelector('legend')).to.equal(null);
    ['platform', 'app', 'status'].forEach((name) => {
      const select = $(`#ph-filter-${name}`);
      expect(select.getAttribute('aria-label')).to.equal(name.charAt(0).toUpperCase() + name.slice(1));
      expect(select.options[0].textContent).to.equal(`All ${name === 'status' ? 'statuses' : `${name}s`}`);
      expect(filters.querySelector(`label[for="${select.id}"]`)).to.equal(null);
    });
    expect($('#ph-filter-all').type).to.equal('checkbox');
    expect($('#ph-filter-all').getAttribute('role')).to.equal('switch');
    expect($('#ph-filter-all').checked).to.equal(false);
    expect($('#ph-filter-all').closest('label').textContent.trim()).to.equal('Everyone');
    expect($('#ph-requestor-help').textContent).to.contain('Unchecked shows only your publish requests');
  });

  it('renders New publish compactly and keeps the Everyone switch styled', async () => {
    const stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = '/tools/aso-dashboard/css/aso-dashboard.css';
    await new Promise((resolve, reject) => {
      stylesheet.onload = resolve;
      stylesheet.onerror = reject;
      root.append(stylesheet);
    });
    $('.tab-button[data-tab="publish"]').click();
    const loadMore = $('#ph-load-more');
    expect(loadMore.hidden).to.equal(true);
    expect(getComputedStyle(loadMore).display).to.equal('none');
    loadMore.hidden = false;
    expect(getComputedStyle(loadMore).display).to.not.equal('none');
    loadMore.hidden = true;
    expect(loadMore.getBoundingClientRect().height).to.equal(0);
    const newPublish = $('#publish-new');
    const refresh = $('#ph-refresh');
    expect(refresh.getBoundingClientRect().width).to.equal(32);
    expect(refresh.getBoundingClientRect().height).to.equal(32);
    expect(newPublish.getBoundingClientRect().height).to.be.lessThan(40);
    const everyone = $('#ph-filter-all');
    expect(everyone.getBoundingClientRect().width).to.equal(44);
    expect(everyone.getBoundingClientRect().height).to.equal(24);
    const offColor = getComputedStyle(everyone).backgroundColor;
    everyone.click();
    expect(everyone.checked).to.equal(true);
    expect(getComputedStyle(everyone).backgroundColor).to.not.equal(offColor);
    expect(getComputedStyle(everyone, '::before').transform).to.not.equal('none');
    everyone.click();
    expect(everyone.checked).to.equal(false);
    expect(getComputedStyle(everyone, '::before').transform).to.equal('none');
    root.style.width = '360px';
    const groupBounds = $('.ph-title-group').getBoundingClientRect();
    const refreshBounds = refresh.getBoundingClientRect();
    expect(refreshBounds.left).to.be.at.least(groupBounds.left);
    expect(refreshBounds.right).to.be.at.most(groupBounds.right + 1);
  });

  it('preserves form selections and shared scope while navigating between views', () => {
    $('.tab-button[data-tab="publish"]').click();
    $('#publish-new').click();
    expect($('[data-tab-content="publish"]').classList.contains('active')).to.equal(true);
    expect(document.activeElement).to.equal($('#publish-back'));
    $('#publish-product').append(new Option('Test app', 'test-app'));
    $('#publish-product').value = 'test-app';
    $('#publish-platform-apple').checked = true;
    $('#publish-scope-promos').checked = false;
    const scope = $('.scope-sections');
    expect($('[data-tab-content="publish"] .scope-sections-slot').contains(scope)).to.equal(true);

    $('#publish-back').click();
    expect($('[data-tab-content="publish-history"]').classList.contains('active')).to.equal(true);
    expect(document.activeElement).to.equal($('#publish-new'));
    $('#publish-new').click();
    expect($('#publish-product').value).to.equal('test-app');
    expect($('#publish-platform-apple').checked).to.equal(true);
    expect($('#publish-scope-promos').checked).to.equal(false);
    expect($('.scope-sections')).to.equal(scope);
  });

  it('moves shared scope between Preview, Export and the publish form only', () => {
    const scope = $('.scope-sections');
    ['preview', 'export'].forEach((name) => {
      $(`.tab-button[data-tab="${name}"]`).click();
      expect($(`[data-tab-content="${name}"] .scope-sections-slot`).contains(scope)).to.equal(true);
    });
    $('.tab-button[data-tab="publish"]').click();
    expect($('[data-tab-content="export"] .scope-sections-slot').contains(scope)).to.equal(true);
    $('#publish-new').click();
    expect($('[data-tab-content="publish"] .scope-sections-slot').contains(scope)).to.equal(true);
  });

  it('returns to History after submission and focuses the new request view', () => {
    $('.tab-button[data-tab="publish"]').click();
    $('#publish-new').click();
    $('#publish-button').dispatchEvent(new CustomEvent('publish-request-submitted', {
      bubbles: true,
      detail: { requestId: 'request-123' },
    }));
    expect(publishHistory.showRequest.calledOnceWithExactly('request-123')).to.equal(true);
    expect($('[data-tab-content="publish-history"]').classList.contains('active')).to.equal(true);
    expect($('.tab-button[data-tab="publish"]').classList.contains('active')).to.equal(true);
    expect(document.activeElement).to.equal($('#ph-title'));
  });

  it('reopening Publish from another menu always returns to History', () => {
    $('.tab-button[data-tab="publish"]').click();
    $('#publish-new').click();
    $('.tab-button[data-tab="preview"]').click();
    $('.tab-button[data-tab="publish"]').click();
    expect($('[data-tab-content="publish-history"]').classList.contains('active')).to.equal(true);
  });
});
