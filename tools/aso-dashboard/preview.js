import { fetchProducts, fetchLanguages } from './utils.js';

function getDropdownValues() {
  return {
    product: document.getElementById('product').value,
    language: document.getElementById('language').value,
    device: document.getElementById('device').value,
  };
}

function buildPreviewURL() {
  const { product, language, device } = getDropdownValues();
  if (!product || !language || !device) return null;
  return `https://main--aso--adobecom.aem.page/${language}/products/${product}/${device}`;
}

function updatePreview() {
  const url = buildPreviewURL();
  const container = document.getElementById('preview-frame-container');
  if (!url) {
    container.innerHTML = '<p class="preview-placeholder">Select a product, language, and device to view preview</p>';
    return;
  }
  container.innerHTML = `
    <div class="preview-header">
      <span class="preview-url">Preview: <a href="${url}" target="_blank">${url}</a></span>
      <button class="open-new-tab" onclick="window.open('${url}', '_blank')">Open in New Tab</button>
    </div>
    <p class="preview-note">If you see an authentication error below, click "Open in New Tab" above to log in, then reload this page.</p>
    <iframe src="${url}" class="preview-iframe" title="ASO Preview"></iframe>
  `;
}

function populateDropdown(type, items) {
  const select = document.getElementById(type);
  if (!select?.options[0]) return;
  select.options[0].textContent = items.length === 0 ? `No ${type} found` : `Select a ${type}...`;
  if (items.length === 0) return;
  items.forEach((item) => {
    const option = document.createElement('option');
    option.value = item.value || item.code;
    option.textContent = item.label;
    select.appendChild(option);
  });
}

function setupListeners() {
  ['product', 'language', 'device'].forEach((id) => {
    const element = document.getElementById(id);
    if (element) element.addEventListener('change', updatePreview);
  });
}

export async function init({ context, token }) {
  const products = await fetchProducts({ context, token });
  populateDropdown('product', products);
  const languages = await fetchLanguages({ context, token });
  populateDropdown('language', languages);
  setupListeners();
}
