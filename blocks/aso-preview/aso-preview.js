import { resolveFieldText } from '../aso-app/aso-utils.js';
import { loadConstantsValuesForPage } from '../aso-app/constants-runtime.js';

async function showPreview(meta, variant) {
  const resp = await fetch('/mocks/play-store.html');
  if (!resp.ok) {
    console.log('could not get html');
    return;
  }
  let html = await resp.text();

  Object.keys(meta).forEach((key) => {
    const placeholder = `{${key}}`;
    const value = meta[key]?.text || '';
    html = html.replaceAll(placeholder, value);
  });

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const styles = doc.head.querySelectorAll('link');
  document.head.append(...styles);
  document.body.innerHTML = doc.body.innerHTML;
}

const getMetadata = (el, constantsValues) => [...el.childNodes].reduce((rdx, row) => {
  if (row.children && row.children.length >= 2) {
    const key = row.children[0].textContent.trim().toLowerCase();
    const content = row.children[1];
    const text = resolveFieldText(content, constantsValues, { addParagraphBreaks: true });
    if (key && text) rdx[key] = { text };
  }
  return rdx;
}, {});

export default async function init(el) {
  const variant = [...el.classList].find((c) => c === 'apple' || c === 'google') || 'apple';

  const asoApps = document.querySelectorAll('.aso-app');
  if (asoApps.length === 0) {
    el.textContent = 'Error: aso-app block not found on this page';
    return;
  }

  const constantsValues = await loadConstantsValuesForPage();
  const meta = {};
  asoApps.forEach((asoApp) => {
    const appMeta = getMetadata(asoApp, constantsValues);
    Object.assign(meta, appMeta);
  });

  const btn = document.createElement('button');
  btn.textContent = `Preview ${variant === 'apple' ? 'App Store' : 'Play Store'}`;
  btn.addEventListener('click', () => {
    showPreview(meta, variant);
  });
  el.append(btn);
}
