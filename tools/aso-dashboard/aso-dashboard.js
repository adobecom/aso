import DA_SDK from 'https://da.live/nx/utils/sdk.js';
import { init as initPreview } from './preview.js';
import { init as initExport } from './export.js';

function setupTabs() {
  document.querySelector('.tabs').addEventListener('click', (e) => {
    const button = e.target.closest('.tab-button');
    if (!button) return;
    document.querySelectorAll('.tab-button, .tab-content').forEach((el) => el.classList.remove('active'));
    button.classList.add('active');
    document.querySelector(`[data-tab-content="${button.dataset.tab}"]`).classList.add('active');
  });
}

(async function init() {
  try {
    const { context, token } = await DA_SDK;
    setupTabs();
    await initPreview({ context, token });
    await initExport({ context, token });
  } catch (error) {
    console.error('Error initializing dashboard:', error);
  }
}());
