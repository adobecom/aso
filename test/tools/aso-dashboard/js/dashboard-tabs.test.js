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

  it('places Refresh with the filters and keeps a compact New publish action in the heading', () => {
    expect($('#ph-filters').contains($('#ph-refresh'))).to.equal(true);
    expect($('#ph-refresh').type).to.equal('button');
    expect($('#ph-refresh').classList.contains('ph-button')).to.equal(true);
    expect($('.ph-heading-actions').contains($('#ph-refresh'))).to.equal(false);
    expect($('.ph-heading-actions').contains($('#publish-new'))).to.equal(true);
    expect($('#publish-new').classList.contains('ph-button')).to.equal(true);
  });

  it('renders New publish smaller than Refresh and keeps Refresh inside narrow filter layouts', async () => {
    const stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = '/tools/aso-dashboard/css/aso-dashboard.css';
    await new Promise((resolve, reject) => {
      stylesheet.onload = resolve;
      stylesheet.onerror = reject;
      root.append(stylesheet);
    });
    $('.tab-button[data-tab="publish"]').click();
    const newPublish = $('#publish-new');
    const refresh = $('#ph-refresh');
    expect(Number.parseFloat(getComputedStyle(newPublish).fontSize))
      .to.be.lessThan(Number.parseFloat(getComputedStyle(refresh).fontSize));
    expect(newPublish.getBoundingClientRect().height)
      .to.be.lessThan(refresh.getBoundingClientRect().height);
    root.style.width = '360px';
    const filtersBounds = $('#ph-filters').getBoundingClientRect();
    const refreshBounds = refresh.getBoundingClientRect();
    expect(refreshBounds.left).to.be.at.least(filtersBounds.left);
    expect(refreshBounds.right).to.be.at.most(filtersBounds.right);
    expect(refreshBounds.bottom).to.be.at.most(filtersBounds.bottom);
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
