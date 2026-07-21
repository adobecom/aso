import { getDirectChildParagraphs, resolveFieldText } from '../../../../blocks/aso-app/aso-utils.js';
import { buildSpacingSidecarFromText } from '../lib/section-break-template.js';

const SPACING_SIDECAR_VERSION = 1;

function normalizeDevice(device) {
  const key = String(device ?? '').trim().toLowerCase();
  return key === 'apple' || key === 'google' ? key : '';
}

function normalizeBlockType(blockType) {
  return String(blockType ?? '').trim().toLowerCase();
}

function buildBlockSchemaKey(device, blockType) {
  const normalizedDevice = normalizeDevice(device);
  const normalizedBlockType = normalizeBlockType(blockType);
  if (!normalizedDevice || !normalizedBlockType) return '';
  return `aso-app (${normalizedDevice}, ${normalizedBlockType})`;
}

function getSchemaBlockData(schema, device, blockType) {
  const blockKey = buildBlockSchemaKey(device, blockType);
  if (!blockKey || !schema?.[blockKey]?.data) return [];
  return schema[blockKey].data;
}

function getFieldNameFromSchemaField(field) {
  return String(field?.['field name'] ?? '').trim();
}

function getFieldKeyFromSchemaField(field) {
  return String(field?.['field key'] ?? field?.fieldKey ?? '').trim();
}

function parseHtmlDocument(html) {
  return new DOMParser().parseFromString(html, 'text/html');
}

function findAsoAppBlock(doc, device, blockType) {
  const normalizedDevice = normalizeDevice(device);
  const normalizedBlockType = normalizeBlockType(blockType);
  if (!normalizedDevice || !normalizedBlockType) return null;

  return Array.from(doc.querySelectorAll('.aso-app')).find((block) => (
    block.classList.contains(normalizedDevice)
    && block.classList.contains(normalizedBlockType)
  )) || null;
}

function getFieldLabel(row) {
  const children = Array.from(row?.children || []);
  if (children.length < 1) return '';
  return children[0].textContent.trim();
}

function getFieldDataElement(row) {
  const children = Array.from(row?.children || []);
  if (children.length < 2) return null;
  return children[1];
}

function findFieldRow(block, fieldName) {
  const target = String(fieldName ?? '').trim();
  if (!target || !block) return null;

  return Array.from(block.querySelectorAll(':scope > div')).find((row) => (
    getFieldLabel(row) === target
  )) || null;
}

function ensureFieldRow(block, fieldName) {
  const existing = findFieldRow(block, fieldName);
  if (existing) return existing;

  const row = block.ownerDocument.createElement('div');
  const labelEl = block.ownerDocument.createElement('div');
  labelEl.innerHTML = `<p>${fieldName}</p>`;
  const dataEl = block.ownerDocument.createElement('div');
  row.append(labelEl, dataEl);
  block.append(row);
  return row;
}

function plainTextToFieldHtml(doc, plainText) {
  const text = String(plainText ?? '');
  if (!text) return '';

  const lines = text.replace(/\r\n/g, '\n').split('\n');
  return lines
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const p = doc.createElement('p');
      p.textContent = line;
      return p.outerHTML;
    })
    .join('');
}

function createBlockShell(doc, device, blockType) {
  const block = doc.createElement('div');
  block.className = `aso-app ${normalizeBlockType(blockType)} ${normalizeDevice(device)}`;
  return block;
}

function ensureMainSection(doc) {
  if (!doc.querySelector('header')) doc.body.append(doc.createElement('header'));

  let main = doc.querySelector('main');
  if (!main) {
    main = doc.createElement('main');
    doc.body.append(main);
  }

  let section = main.querySelector(':scope > div');
  if (!section) {
    section = doc.createElement('div');
    main.append(section);
  }

  if (!doc.querySelector('footer')) doc.body.append(doc.createElement('footer'));

  return section;
}

function parsePageFields(html, schema, device, blockType, constantsValues = {}) {
  const normalizedDevice = normalizeDevice(device);
  const normalizedBlockType = normalizeBlockType(blockType);
  if (!html || !schema || !normalizedDevice || !normalizedBlockType) return {};

  const doc = parseHtmlDocument(html);
  const block = findAsoAppBlock(doc, normalizedDevice, normalizedBlockType);
  if (!block) return {};

  const fields = {};
  getSchemaBlockData(schema, normalizedDevice, normalizedBlockType).forEach((schemaField) => {
    const fieldName = getFieldNameFromSchemaField(schemaField);
    const fieldKey = getFieldKeyFromSchemaField(schemaField);
    if (!fieldName || !fieldKey) return;

    const row = findFieldRow(block, fieldName);
    const dataEl = row && getFieldDataElement(row);
    fields[fieldKey] = dataEl
      ? resolveFieldText(dataEl, constantsValues, { addParagraphBreaks: true })
      : '';
  });

  return fields;
}

function buildPageHtml(fields, schema, device, blockType, existingHtml) {
  const normalizedDevice = normalizeDevice(device);
  const normalizedBlockType = normalizeBlockType(blockType);
  if (!fields || !schema || !normalizedDevice || !normalizedBlockType) return '';

  const doc = existingHtml
    ? parseHtmlDocument(existingHtml)
    : parseHtmlDocument('<!DOCTYPE html><html><body></body></html>');

  let block = findAsoAppBlock(doc, normalizedDevice, normalizedBlockType);
  if (!block) {
    block = createBlockShell(doc, normalizedDevice, normalizedBlockType);
    ensureMainSection(doc).append(block);
  }

  getSchemaBlockData(schema, normalizedDevice, normalizedBlockType).forEach((schemaField) => {
    const fieldName = getFieldNameFromSchemaField(schemaField);
    const fieldKey = getFieldKeyFromSchemaField(schemaField);
    if (!fieldName || !fieldKey || !Object.prototype.hasOwnProperty.call(fields, fieldKey)) return;

    const row = ensureFieldRow(block, fieldName);
    const dataEl = getFieldDataElement(row);
    if (!dataEl) return;
    dataEl.innerHTML = plainTextToFieldHtml(doc, fields[fieldKey]);
  });

  return doc.body.innerHTML.trim();
}

function readSpacingSidecar(json) {
  if (!json || typeof json !== 'object') return null;
  if (json.version !== SPACING_SIDECAR_VERSION) return null;
  if (!Array.isArray(json.sectionBreakAfter)) return null;

  return {
    version: SPACING_SIDECAR_VERSION,
    fieldName: String(json.fieldName ?? '').trim(),
    fieldKey: String(json.fieldKey ?? '').trim(),
    paragraphCount: Number.isInteger(json.paragraphCount) ? json.paragraphCount : null,
    sectionBreakAfter: json.sectionBreakAfter.map(Boolean),
    exportLineCount: Number.isInteger(json.exportLineCount) ? json.exportLineCount : null,
  };
}

function parseFieldFromPage({
  html,
  schema,
  device,
  blockType,
  fieldKey,
  fieldName,
  constantsValues = {},
  spacingSidecar = null,
}) {
  if (!html || !schema || !fieldKey) return '';

  const doc = parseHtmlDocument(html);
  const block = findAsoAppBlock(doc, device, blockType);
  if (!block) return '';

  const schemaField = getSchemaBlockData(schema, device, blockType)
    .find((field) => getFieldKeyFromSchemaField(field) === fieldKey);
  const label = fieldName || getFieldNameFromSchemaField(schemaField);
  const row = label ? findFieldRow(block, label) : null;
  const dataEl = row && getFieldDataElement(row);
  if (!dataEl) return '';

  const sidecar = readSpacingSidecar(spacingSidecar);
  const sidecarMatchesField = sidecar
    && sidecar.fieldKey === fieldKey
    && (!sidecar.fieldName || !label || sidecar.fieldName === label);
  // A sidecar built from an earlier version of this field applies its section-break array
  // positionally against whatever paragraphs exist now — if an author has since added,
  // removed, or reordered paragraphs directly in DA, that produces wrong breaks with no
  // warning. Only trust it when the live paragraph count still matches what it was built
  // from; otherwise fall back to plain \n-per-line behavior.
  const sectionBreakAfter = sidecarMatchesField
    && sidecar.paragraphCount === getDirectChildParagraphs(dataEl).length
    ? sidecar.sectionBreakAfter
    : null;

  return resolveFieldText(dataEl, constantsValues, {
    addParagraphBreaks: true,
    sectionBreakAfter,
  });
}

function parseImageFieldFromPage({ html, device, blockType, fieldName }) {
  if (!html || !fieldName) return '';

  const doc = parseHtmlDocument(html);
  const block = findAsoAppBlock(doc, device, blockType);
  if (!block) return '';

  const row = findFieldRow(block, fieldName);
  const dataEl = row && getFieldDataElement(row);
  return dataEl?.querySelector('img')?.src || '';
}

function buildSpacingSidecarForField(text, fieldName, fieldKey) {
  return buildSpacingSidecarFromText({ text, fieldName, fieldKey });
}

function writeSpacingSidecar(meta) {
  const sidecar = readSpacingSidecar(meta);
  if (!sidecar) {
    throw new Error('Invalid spacing sidecar metadata');
  }

  return `${JSON.stringify(sidecar, null, 2)}\n`;
}

export {
  buildPageHtml,
  buildSpacingSidecarForField,
  parseFieldFromPage,
  parseImageFieldFromPage,
  parsePageFields,
  readSpacingSidecar,
  writeSpacingSidecar,
};
