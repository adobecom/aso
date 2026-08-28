import {
  STORE_TYPE_CPP,
  STORE_TYPE_TESTS,
  STORE_TYPE_UPDATES,
  storeTypeRequiresInstanceName,
} from './lib/content-taxonomy.js';
import {
  clearListCache,
  fetchStoreTests,
  getRelativeProductsPath,
} from './lib/utils.js';
import {
  isReleasePeriodComplete,
  readReleasePeriod,
} from './release-period-settings.js';

function normalizeStoreType(value) {
  const key = String(value ?? '').trim().toLowerCase();
  if (key === STORE_TYPE_TESTS || key === 'store tests') return STORE_TYPE_TESTS;
  if (key === STORE_TYPE_CPP) return STORE_TYPE_CPP;
  return STORE_TYPE_UPDATES;
}

function readStoreType() {
  const selected = document.querySelector('input[name="store-type"]:checked');
  return normalizeStoreType(selected?.value || STORE_TYPE_UPDATES);
}

// Named "tests" for history's sake, but covers every store type that nests under a named
// instance (currently store-tests and cpp) — see storeTypeRequiresInstanceName.
function isStoreTestsScope() {
  return storeTypeRequiresInstanceName(readStoreType());
}

// The store-tests/cpp panel is shared (one set of checkboxes/labels for whichever named-instance
// store type is selected) rather than duplicated, so its copy has to switch with the store type.
function instanceScopeLabels(storeType) {
  if (storeType === STORE_TYPE_CPP) {
    return { heading: 'CPP campaigns', noun: 'CPP campaigns' };
  }
  return { heading: 'Experiments', noun: 'experiments' };
}

function updateInstanceScopeLabel() {
  const label = document.getElementById('store-tests-label');
  if (label) label.textContent = instanceScopeLabels(readStoreType()).heading;
}

function getSelectedTestNames() {
  return Array.from(document.querySelectorAll('.store-test-checkbox:checked'))
    .map((checkbox) => checkbox.value)
    .filter(Boolean);
}

function isStoreScopeComplete() {
  if (!isStoreTestsScope()) return true;
  return getSelectedTestNames().length > 0;
}

function toggleStoreTestsFields() {
  const fields = document.getElementById('store-tests-fields');
  if (fields) fields.classList.toggle('hidden', !isStoreTestsScope());
  updateInstanceScopeLabel();
}

function updateStoreTestsCount() {
  const countElement = document.getElementById('store-tests-count');
  if (!countElement) return;
  const count = getSelectedTestNames().length;
  countElement.textContent = `(${count} selected)`;
}

function renderStoreTestCheckboxes(tests) {
  const container = document.getElementById('store-tests-checkboxes');
  if (!container) return;

  if (!tests.length) {
    const { noun } = instanceScopeLabels(readStoreType());
    container.innerHTML = `<p>No ${noun} found for this product, device, and release period.</p>`;
    updateStoreTestsCount();
    return;
  }

  container.innerHTML = tests.map((test) => {
    const id = `store-test-${String(test.value).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    return `
      <div class="checkbox-item">
        <input type="checkbox" id="${id}" value="${test.value}" class="store-test-checkbox">
        <label for="${id}">${test.label}</label>
      </div>
    `;
  }).join('');
  updateStoreTestsCount();
}

async function refreshStoreTests(context, token, getListProbe) {
  const container = document.getElementById('store-tests-checkboxes');
  if (!container || !isStoreTestsScope()) return;

  const { noun } = instanceScopeLabels(readStoreType());
  const probe = typeof getListProbe === 'function' ? getListProbe() : null;
  if (!probe) {
    container.innerHTML = `<p>Select product, device, and release period to load ${noun}.</p>`;
    updateStoreTestsCount();
    return;
  }

  container.innerHTML = `<p>Loading ${noun}…</p>`;
  clearListCache();
  const tests = await fetchStoreTests({ context, token, selection: probe });
  renderStoreTestCheckboxes(tests);
}

function handleSelectAllStoreTests() {
  const checkboxes = document.querySelectorAll('.store-test-checkbox');
  if (!checkboxes.length) return;
  const allChecked = Array.from(checkboxes).every((checkbox) => checkbox.checked);
  checkboxes.forEach((checkbox) => {
    checkbox.checked = !allChecked;
  });
  updateStoreTestsCount();
}

function initStoreScope({
  context,
  token,
  getListProbe,
  onScopeChange,
}) {
  const notify = () => {
    toggleStoreTestsFields();
    updateStoreTestsCount();
    if (typeof onScopeChange === 'function') onScopeChange();
  };

  document.querySelectorAll('input[name="store-type"]').forEach((input) => {
    input.addEventListener('change', async () => {
      toggleStoreTestsFields();
      if (isStoreTestsScope()) {
        await refreshStoreTests(context, token, getListProbe);
      }
      notify();
    });
  });

  document.getElementById('store-tests-select-all')?.addEventListener('click', () => {
    handleSelectAllStoreTests();
    notify();
  });

  document.addEventListener('change', (event) => {
    if (event.target?.classList?.contains('store-test-checkbox')) {
      updateStoreTestsCount();
      notify();
    }
  });

  const refreshTriggers = [
    '#export-product',
    '#release-period-year',
    '#release-period-quarter',
    '#release-period-month',
    '#device-apple',
    '#device-google',
  ].join(', ');

  document.querySelectorAll(refreshTriggers).forEach((element) => {
    element.addEventListener('change', async () => {
      if (isStoreTestsScope()) {
        await refreshStoreTests(context, token, getListProbe);
      }
      notify();
    });
  });

  toggleStoreTestsFields();
  updateStoreTestsCount();
}

export {
  getSelectedTestNames,
  initStoreScope,
  isStoreScopeComplete,
  isStoreTestsScope,
  normalizeStoreType,
  readStoreType,
  refreshStoreTests,
  STORE_TYPE_CPP,
  STORE_TYPE_TESTS,
  STORE_TYPE_UPDATES,
  storeTypeRequiresInstanceName,
  toggleStoreTestsFields,
  updateStoreTestsCount,
};
