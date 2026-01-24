import { readFile } from '@web/test-runner-commands';
import sinon from 'sinon';

export async function setupMockSchema() {
  const mockSchema = await readFile({ path: './mocks/block-schema.json' });
  const fetchStub = sinon.stub(window, 'fetch');
  fetchStub.withArgs('/.da/block-schema.json').resolves({
    ok: true,
    json: async () => JSON.parse(mockSchema),
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
