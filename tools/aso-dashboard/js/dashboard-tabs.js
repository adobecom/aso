// eslint-disable-next-line import/prefer-default-export
export function setupTabs({ publishHistory }) {
  const tabs = document.querySelector('.tabs');
  const scopeSections = document.querySelector('.scope-sections');
  const publishForm = document.querySelector('[data-tab-content="publish"]');
  const historyRoot = document.querySelector('[data-tab-content="publish-history"]');

  function showTab(tabName) {
    const menuTab = tabName === 'publish-history' ? 'publish' : tabName;
    tabs.querySelectorAll('.tab-button').forEach((button) => {
      button.classList.toggle('active', button.dataset.tab === menuTab);
    });
    document.querySelectorAll('.tab-content').forEach((panel) => {
      panel.classList.toggle('active', panel.dataset.tabContent === tabName);
    });
    if (['preview', 'export', 'publish'].includes(tabName)) {
      const slot = document.querySelector(`[data-tab-content="${tabName}"] .scope-sections-slot`);
      if (slot && scopeSections) slot.appendChild(scopeSections);
    }
    if (tabName === 'publish-history') publishHistory.ensureLoaded();
  }

  tabs.addEventListener('click', (event) => {
    const button = event.target.closest('.tab-button');
    if (!button) return;
    showTab(button.dataset.tab === 'publish' ? 'publish-history' : button.dataset.tab);
  });
  document.getElementById('publish-new')?.addEventListener('click', () => {
    showTab('publish');
    document.getElementById('publish-back')?.focus();
  });
  document.getElementById('publish-back')?.addEventListener('click', () => {
    showTab('publish-history');
    document.getElementById('publish-new')?.focus();
  });
  publishForm?.addEventListener('publish-request-submitted', (event) => {
    publishHistory.showRequest(event.detail.requestId);
    showTab('publish-history');
    historyRoot.querySelector('#ph-title')?.focus();
  });

  const initialButton = tabs.querySelector('.tab-button.active');
  if (initialButton) {
    showTab(initialButton.dataset.tab === 'publish' ? 'publish-history' : initialButton.dataset.tab);
  }
}
