import { fetchPromoNames, fetchPromoVariants } from './lib/utils.js';
import { runWithConcurrency } from './lib/concurrency.js';

const VARIANT_FETCH_CONCURRENCY = 5;
const DEVICE_LABELS = { apple: 'Apple', google: 'Google' };

function isPromosExportScope() {
  return document.getElementById('export-scope-promos')?.checked;
}

export function sanitizeIdPart(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '_');
}

function renderPromoVariants(device, promoName, variants) {
  const container = document.getElementById(`promo-variants-${device}-${sanitizeIdPart(promoName)}`);
  if (!container) return;

  const list = variants.length ? variants : [{ value: 'default', label: 'Default' }];
  container.innerHTML = list.map((variant) => {
    const id = `promo-variant-${device}-${sanitizeIdPart(promoName)}-${sanitizeIdPart(variant.value)}`;
    return `
      <div class="checkbox-item promo-variant-item">
        <input type="checkbox" id="${id}" class="promo-variant-checkbox" data-promo="${promoName}" data-device="${device}" value="${variant.value}" checked>
        <label for="${id}">${variant.label}</label>
      </div>
    `;
  }).join('');
}

function renderPromoGroupsForDevice(device, promos) {
  const container = document.getElementById(`promo-groups-${device}`);
  if (!container) return;

  if (!promos.length) {
    container.innerHTML = '<p>No promos found</p>';
    return;
  }

  container.innerHTML = promos.map((promo) => {
    const id = `promo-${device}-${sanitizeIdPart(promo.value)}`;
    return `
      <div class="promo-group">
        <div class="checkbox-item promo-group-header">
          <input type="checkbox" id="${id}" class="promo-name-checkbox" value="${promo.value}" data-device="${device}" checked>
          <label for="${id}">${promo.label}</label>
        </div>
        <div class="promo-variant-list" id="promo-variants-${device}-${sanitizeIdPart(promo.value)}">
          <p class="promo-variant-loading">Loading variants…</p>
        </div>
      </div>
    `;
  }).join('');
}

function renderDeviceBoxes(deviceResults) {
  const container = document.getElementById('export-promo-groups');
  if (!container) return;

  container.innerHTML = deviceResults.map(({ device }) => `
    <div class="promo-device-box" data-device="${device}">
      <h5 class="promo-device-heading">${DEVICE_LABELS[device] || device}</h5>
      <div class="promo-group-list" id="promo-groups-${device}">
        <p>Loading promos…</p>
      </div>
    </div>
  `).join('');

  deviceResults.forEach(({ device, promos }) => renderPromoGroupsForDevice(device, promos));
}

export function getSelectedPromoContexts() {
  if (!isPromosExportScope()) return [];
  const contexts = [];
  document.querySelectorAll('.promo-name-checkbox:checked').forEach((promoCheckbox) => {
    const promoName = promoCheckbox.value;
    const { device } = promoCheckbox.dataset;
    document.querySelectorAll(
      `.promo-variant-checkbox[data-promo="${promoName}"][data-device="${device}"]:checked`,
    ).forEach((variantCheckbox) => {
      contexts.push({ promoName, promoVariant: variantCheckbox.value, device });
    });
  });
  return contexts;
}

export function isPromoScopeComplete() {
  if (!isPromosExportScope()) return true;
  return getSelectedPromoContexts().length > 0;
}

export async function refreshPromoNames(context, token, getListProbes) {
  const container = document.getElementById('export-promo-groups');
  if (!container || !isPromosExportScope()) return;

  const probes = typeof getListProbes === 'function' ? getListProbes() : [];
  if (!probes.length) {
    container.innerHTML = '<p>Select product, device, and release period…</p>';
    return;
  }

  container.innerHTML = '<p>Loading promos…</p>';

  const deviceResults = await Promise.all(probes.map(async (probe) => ({
    device: probe.device,
    probe,
    promos: await fetchPromoNames({ context, token, selection: probe }),
  })));

  renderDeviceBoxes(deviceResults);

  const variantTasks = deviceResults.flatMap(
    ({ probe, promos }) => promos.map((promo) => ({ probe, promo })),
  );

  await runWithConcurrency(variantTasks, VARIANT_FETCH_CONCURRENCY, async ({ probe, promo }) => {
    const variants = await fetchPromoVariants({
      context,
      token,
      selection: probe,
      promoName: promo.value,
    });
    renderPromoVariants(probe.device, promo.value, variants);
  });
}

export function initPromoScope({
  context,
  token,
  getListProbes,
  onScopeChange,
}) {
  const notify = () => {
    if (typeof onScopeChange === 'function') onScopeChange();
  };

  document.addEventListener('change', (event) => {
    const { target } = event;
    if (!target?.classList) return;
    if (target.classList.contains('promo-name-checkbox')) {
      if (target.checked) {
        const { device } = target.dataset;
        document.querySelectorAll(
          `.promo-variant-checkbox[data-promo="${target.value}"][data-device="${device}"]`,
        ).forEach((checkbox) => { checkbox.checked = true; });
      }
      notify();
    } else if (target.classList.contains('promo-variant-checkbox')) {
      notify();
    } else if (target.classList.contains('store-test-checkbox') && isPromosExportScope()) {
      refreshPromoNames(context, token, getListProbes).then(notify);
    }
  });

  document.getElementById('export-scope-promos')?.addEventListener('change', async () => {
    if (isPromosExportScope()) {
      await refreshPromoNames(context, token, getListProbes);
    }
    notify();
  });

  const refreshTriggers = [
    '#export-product',
    '#release-period-year',
    '#release-period-quarter',
    '#release-period-month',
    '#device-apple',
    '#device-google',
    'input[name="store-type"]',
  ].join(', ');

  document.querySelectorAll(refreshTriggers).forEach((element) => {
    element.addEventListener('change', async () => {
      if (isPromosExportScope()) {
        await refreshPromoNames(context, token, getListProbes);
      }
      notify();
    });
  });
}
