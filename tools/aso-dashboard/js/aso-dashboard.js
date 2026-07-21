import DA_SDK from 'https://da.live/nx/utils/sdk.js';
import { initReleasePeriodSettings } from './release-period-settings.js';
import { init as initPreview } from './preview.js';
import { init as initExport } from './export.js';
import { init as initImport } from './import.js';

function setupTabs() {
  const scopeSections = document.querySelector('.scope-sections');
  const tabs = document.querySelector('.tabs');

  function applyActiveTab(tabName) {
    if (tabName !== 'preview' && tabName !== 'export') return;
    const slot = document.querySelector(`[data-tab-content="${tabName}"] .scope-sections-slot`);
    if (slot) slot.appendChild(scopeSections);
  }

  tabs.addEventListener('click', (e) => {
    const button = e.target.closest('.tab-button');
    if (!button) return;
    document.querySelectorAll('.tab-button, .tab-content').forEach((el) => el.classList.remove('active'));
    button.classList.add('active');
    document.querySelector(`[data-tab-content="${button.dataset.tab}"]`).classList.add('active');
    applyActiveTab(button.dataset.tab);
  });

  const initialButton = tabs.querySelector('.tab-button.active');
  if (initialButton) applyActiveTab(initialButton.dataset.tab);
}

(async function init() {
  try {
    const { context, token } = await DA_SDK;
    setupTabs();
    initReleasePeriodSettings();
    await Promise.all([
      initPreview({ context, token }),
      initExport({ context, token }),
      initImport({ context, token }),
    ]);
  } catch (error) {
    console.error('Error initializing dashboard:', error);
  }
}());
