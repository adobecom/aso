import { readFile } from '@web/test-runner-commands';
import sinon from 'sinon';

export async function setupMockSchema() {
  const mockSchema = await readFile({ path: './mocks/block-schema.json' });
  const fetchStub = sinon.stub(window, 'fetch');
  fetchStub.callsFake((url) => {
    if (url === '/.da/block-schema.json') {
      return Promise.resolve({
        ok: true,
        json: async () => JSON.parse(mockSchema),
      });
    }
    if (url === '/.da/translate.json') {
      return Promise.resolve({
        ok: true,
        json: async () => ({ languages: { data: [{ locales: 'en', name: 'English' }] } }),
      });
    }
    return Promise.resolve({ ok: false, status: 404 });
  });
  return fetchStub;
}

export function createBlockElement(classes, innerHTML = '') {
  const el = document.createElement('div');
  el.className = classes;
  if (innerHTML) {
    el.innerHTML = innerHTML;
  }
  return el;
}

export async function loadMockHTML(filename) {
  return readFile({ path: `./mocks/${filename}` });
}

export function setupBlockTest(htmlContent, initFn) {
  document.body.innerHTML = htmlContent;
  const block = document.querySelector('.aso-app');
  return initFn(block);
}

export function expectValidationNote(row, type) {
  const note = row.querySelector(`.note.${type}`);
  return note;
}

export function countButtons(text) {
  return Array.from(document.querySelectorAll('button')).filter(
    (btn) => btn.textContent === text,
  ).length;
}

export function createTestImageDataUrl(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').fillRect(0, 0, width, height);
  return canvas.toDataURL('image/png');
}
