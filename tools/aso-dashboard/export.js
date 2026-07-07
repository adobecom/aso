import { authFetch, fetchProducts, fetchLanguages, getRelativeProductsPath } from './utils.js';
import { resolveFieldText } from '../../blocks/aso-app/aso-utils.js';
import { loadConstantsValuesForPage } from '../../blocks/aso-app/constants-runtime.js';
import {
  isReleaseNotesField,
  buildGooglePlayReleaseNotesBlob,
} from './google-play-release-notes.js';

let excelJSLoaded = false;
const EXCELJS_CDN = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';

async function loadExcelJS() {
  if (excelJSLoaded && window.ExcelJS) return window.ExcelJS;
  if (window.ExcelJS) {
    excelJSLoaded = true;
    return window.ExcelJS;
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = EXCELJS_CDN;
    script.onload = () => {
      excelJSLoaded = true;
      resolve(window.ExcelJS);
    };
    script.onerror = () => reject(new Error('Failed to load ExcelJS library'));
    document.head.appendChild(script);
  });
}

async function fetchBlockSchema(org, repo, token) {
  return authFetch(
    `https://admin.da.live/source/${org}/${repo}/.da/block-schema.json`,
    token,
    'block-schema',
  );
}

function extractBlockTypesFromSchema(schema) {
  if (!schema) return [];
  const blockTypes = new Set();
  Object.keys(schema).forEach((key) => {
    const match = key.match(/^aso-app \(([^,]+),\s*([^)]+)\)$/);
    if (match) blockTypes.add(match[2].trim());
  });
  return Array.from(blockTypes);
}

function getSelectedCheckboxes(selector) {
  return Array.from(document.querySelectorAll(`${selector}:checked`));
}

function getSelectedItems() {
  const products = getSelectedCheckboxes('.product-checkbox').map((cb) => cb.value);
  const languages = getSelectedCheckboxes('.language-checkbox').map((cb) => cb.value);
  const devices = [];
  if (document.getElementById('device-apple').checked) devices.push('apple');
  if (document.getElementById('device-google').checked) devices.push('google');
  return { products, languages, devices };
}

function buildPagePaths(products, languages, devices) {
  const productsPath = getRelativeProductsPath();
  const paths = [];
  products.forEach((product) => {
    languages.forEach((language) => {
      devices.forEach((device) => {
        paths.push({ product, language, device, path: `/${language.replace(/^\//, '')}/${productsPath}/${product}/${device}` });
      });
    });
  });
  return paths;
}

function isExportDebugEnabled() {
  if (new URLSearchParams(window.location.search).get('exportDebug') === '1') return true;
  const hashQuery = window.location.hash.includes('?')
    ? window.location.hash.slice(window.location.hash.indexOf('?') + 1)
    : window.location.hash.replace(/^#/, '');
  if (hashQuery && new URLSearchParams(hashQuery).get('exportDebug') === '1') return true;
  try {
    return window.localStorage?.getItem('asoExportDebug') === '1';
  } catch {
    return false;
  }
}

function parseHtmlDocument(html) {
  return new DOMParser().parseFromString(html, 'text/html');
}

function listListingFieldLabels(doc) {
  const labels = [];
  doc.querySelectorAll('.aso-app.listing.google, .aso-app.listing.apple').forEach((block) => {
    block.querySelectorAll(':scope > div').forEach((row) => {
      const children = Array.from(row.children);
      if (children.length >= 2 && children[0].textContent.trim()) {
        labels.push(children[0].textContent.trim());
      }
    });
  });
  return labels;
}

function analyzeParagraphGaps(html) {
  const gaps = [];
  const re = /<\/p>(\s*)<p\b/gi;
  let match = re.exec(html);
  while (match) {
    gaps.push(match[1]);
    match = re.exec(html);
  }
  const intentionalGaps = gaps.filter((gap) => gap && !/^\n[ \t]*$/.test(gap)).length;
  return {
    totalGaps: gaps.length,
    intentionalGaps,
    minifiedAdjacentGaps: gaps.filter((gap) => !gap).length,
    edsPrettyPrintGaps: gaps.filter((gap) => gap && /^\n[ \t]*$/.test(gap)).length,
    hasSpacedAdjacentP: html.includes('</p> <p>'),
    hasMinifiedAdjacentP: html.includes('</p><p>'),
    estimatedLineCount: gaps.length + 1 + intentionalGaps,
    gapPreview: gaps.slice(0, 12).map((gap) => JSON.stringify(gap)),
  };
}

function extractListingField(doc, fieldLabel) {
  const blocks = doc.querySelectorAll('.aso-app.listing.google, .aso-app.listing.apple');
  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i];
    const rows = block.querySelectorAll(':scope > div');
    for (let j = 0; j < rows.length; j += 1) {
      const row = rows[j];
      const children = Array.from(row.children);
      if (children.length >= 2 && children[0].textContent.trim() === fieldLabel) {
        const fieldEl = children[1];
        const fieldHtml = fieldEl.innerHTML;
        const exportText = resolveFieldText(fieldEl, {}, { addParagraphBreaks: true });
        return {
          fieldHtml,
          exportText,
          exportLineCount: exportText.split('\n').length,
          analysis: analyzeParagraphGaps(fieldHtml),
        };
      }
    }
  }
  return null;
}

const EXPORT_CAPTURE_STORAGE_KEY = '__asoExportCapturedHtml';
const EXPORT_CAPTURE_GLOBAL = '__asoExportCapturedHtml';
const EXPORT_DEBUG_GLOBAL = '__asoExportDebug';

function getExportCaptureGlobal() {
  return window[EXPORT_CAPTURE_GLOBAL];
}

function setExportCaptureGlobal(value) {
  window[EXPORT_CAPTURE_GLOBAL] = value;
}

function serializeCaptureEntry(entry) {
  if (!entry) return null;
  return {
    path: entry.path,
    fieldLabels: entry.fieldLabels,
    html: entry.html,
    fullDescriptionHtml: entry.fullDescriptionHtml,
    descriptionHtml: entry.descriptionHtml,
    fields: {
      fullDescription: entry.fields?.fullDescription
        ? {
          fieldHtml: entry.fields.fullDescription.fieldHtml,
          exportLineCount: entry.fields.fullDescription.exportLineCount,
          analysis: entry.fields.fullDescription.analysis,
        }
        : null,
      description: entry.fields?.description
        ? {
          fieldHtml: entry.fields.description.fieldHtml,
          exportLineCount: entry.fields.description.exportLineCount,
          analysis: entry.fields.description.analysis,
        }
        : null,
    },
    capturedAt: entry.capturedAt,
  };
}

function readStoredExportCapture() {
  try {
    const raw = sessionStorage.getItem(EXPORT_CAPTURE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function getExportCapture() {
  if (getExportCaptureGlobal()?.pages?.length) {
    return getExportCaptureGlobal();
  }
  return readStoredExportCapture();
}

function publishExportCapture() {
  const capture = getExportCaptureGlobal();
  if (!capture) return;
  const stored = {
    exportDebug: capture.exportDebug,
    startedAt: capture.startedAt,
    pages: capture.pages.map(serializeCaptureEntry),
    last: serializeCaptureEntry(capture.last),
  };
  try {
    sessionStorage.setItem(EXPORT_CAPTURE_STORAGE_KEY, JSON.stringify(stored));
  } catch (err) {
    console.warn('[aso export] Could not save to sessionStorage (quota?):', err.message);
  }
  try {
    if (window.parent && window.parent !== window) {
      window.parent[EXPORT_CAPTURE_GLOBAL] = stored;
      window.parent[EXPORT_DEBUG_GLOBAL] = window[EXPORT_DEBUG_GLOBAL];
    }
  } catch {
    // cross-origin parent
  }
}

function captureExportHtml(path, html, { verbose = false } = {}) {
  const doc = parseHtmlDocument(html);
  const fullDescription = extractListingField(doc, 'Full Description');
  const description = extractListingField(doc, 'Description');
  const fieldLabels = listListingFieldLabels(doc);
  const entry = {
    path,
    html,
    fieldLabels,
    fullDescriptionHtml: fullDescription?.fieldHtml ?? null,
    descriptionHtml: description?.fieldHtml ?? null,
    fields: {
      fullDescription,
      description,
    },
    analysis: { page: analyzeParagraphGaps(html) },
    capturedAt: new Date().toISOString(),
  };
  if (!getExportCaptureGlobal()) {
    setExportCaptureGlobal({ pages: [], exportDebug: isExportDebugEnabled() });
  }
  const capture = getExportCaptureGlobal();
  capture.pages.push(entry);
  capture.last = entry;
  publishExportCapture();

  if (verbose) {
    console.group(`[aso export] ${path}`);
    console.log('Listing field labels:', fieldLabels);
    if (fullDescription) {
      console.log('Full Description analysis:', fullDescription.analysis);
      console.log('Full Description export lines:', fullDescription.exportLineCount);
      console.log('Full Description HTML snippet:', fullDescription.fieldHtml.slice(0, 400));
    } else {
      console.warn('Full Description field not found in this page HTML');
    }
    if (description) {
      console.log('Description analysis:', description.analysis);
      console.log('Description export lines:', description.exportLineCount);
    }
    console.log('Full page HTML → window.__asoExportCapturedHtml.last.html');
    console.log('Full Description HTML → window.__asoExportCapturedHtml.last.fullDescriptionHtml');
    console.groupEnd();
  }
  return entry;
}

function logExportCaptureSummary() {
  const capture = getExportCapture();
  if (!capture?.pages?.length) {
    console.warn('[aso export] No HTML captured. Check network/auth or your product/language/device selection.');
    return;
  }
  publishExportCapture();
  console.log(`[aso export] Captured ${capture.pages.length} page(s).`);
  capture.pages.forEach((page) => {
    const fd = page.fields?.fullDescription;
    const desc = page.fields?.description;
    console.log(
      `[aso export] ${page.path}`,
      `Full Description: ${fd ? `${fd.exportLineCount} lines, ${fd.analysis.intentionalGaps} intentional gaps` : 'not found'}`,
      desc ? `Description: ${desc.exportLineCount} lines, ${desc.analysis.intentionalGaps} intentional gaps` : '',
    );
  });
  console.log('[aso export] Read capture from ANY console context:');
  console.log(`  JSON.parse(sessionStorage.getItem("${EXPORT_CAPTURE_STORAGE_KEY}"))`);
  console.log('  window.__asoExportDebug.getLast()  (after selecting the dashboard iframe in DevTools → Console context)');
  console.log('  window.__asoExportDebug.copyFullDescription("google")');
}

function registerExportDebugHelpers() {
  const api = {
    isEnabled: () => isExportDebugEnabled(),
    enable: () => {
      try {
        window.localStorage.setItem('asoExportDebug', '1');
      } catch {
        // ignore
      }
      console.log('[aso export] Debug enabled in localStorage. Reload the dashboard, then export again.');
    },
    disable: () => {
      try {
        window.localStorage.removeItem('asoExportDebug');
      } catch {
        // ignore
      }
      console.log('[aso export] Debug disabled in localStorage.');
    },
    help: () => {
      console.log(`
[aso export] Debug helpers (work from parent or iframe console)
  After export:
    JSON.parse(sessionStorage.getItem("${EXPORT_CAPTURE_STORAGE_KEY}"))
    window.__asoExportDebug.getLast()
    window.__asoExportDebug.getPage("google")
    window.__asoExportDebug.copyLastHtml()
    window.__asoExportDebug.copyFullDescription("google")
  Verbose per-page logs: ?exportDebug=1 on dashboard URL
  If helpers are undefined: DevTools Console → context dropdown → pick the aso-dashboard frame
`);
    },
    getCapture: () => getExportCapture(),
    getLast: () => {
      const capture = getExportCapture();
      return capture?.last ?? capture?.pages?.slice(-1)[0] ?? null;
    },
    getPage: (pathPart) => {
      const capture = getExportCapture();
      if (!capture?.pages) return null;
      return capture.pages.find((page) => page.path.includes(pathPart)) ?? null;
    },
    copyLastHtml: async () => {
      const page = api.getLast();
      const html = page?.html;
      if (!html) {
        console.warn('[aso export] No capture yet. Run Export first.');
        return undefined;
      }
      await navigator.clipboard.writeText(html);
      console.log(`[aso export] Copied full page HTML (${html.length} chars) for`, page.path);
      return html.length;
    },
    copyFullDescription: async (pathPart = '') => {
      const page = pathPart ? api.getPage(pathPart) : api.getLast();
      const fieldHtml = page?.fullDescriptionHtml ?? page?.fields?.fullDescription?.fieldHtml;
      if (!fieldHtml) {
        console.warn('[aso export] No Full Description HTML on', page?.path ?? 'last page', 'labels:', page?.fieldLabels);
        return undefined;
      }
      await navigator.clipboard.writeText(fieldHtml);
      console.log(`[aso export] Copied Full Description HTML (${fieldHtml.length} chars) for`, page.path);
      return fieldHtml.length;
    },
    downloadCaptureJson: () => {
      const capture = getExportCapture();
      if (!capture?.pages?.length) {
        console.warn('[aso export] No capture to download.');
        return;
      }
      const blob = new Blob([JSON.stringify(capture, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `aso-export-capture-${Date.now()}.json`;
      link.click();
      URL.revokeObjectURL(url);
      console.log('[aso export] Downloaded capture JSON');
    },
  };
  window[EXPORT_DEBUG_GLOBAL] = api;
  try {
    if (window.parent && window.parent !== window) {
      window.parent[EXPORT_DEBUG_GLOBAL] = api;
    }
  } catch {
    // cross-origin parent
  }
}

async function fetchPageContent(org, repo, path, token) {
  try {
    const response = await fetch(`https://admin.da.live/source/${org}/${repo}${path}.html`, { headers: { Authorization: `Bearer ${token}` } });
    if (response.ok) {
      const html = await response.text();
      captureExportHtml(path, html, { verbose: isExportDebugEnabled() });
      return html;
    }
    if (isExportDebugEnabled()) {
      console.warn(`[aso export] Fetch failed for ${path}: HTTP ${response.status}`);
    }
  } catch (err) {
    if (isExportDebugEnabled()) {
      console.warn(`[aso export] Fetch error for ${path}:`, err);
    }
  }
  return null;
}

function createAdminFetch(org, repo, token) {
  const adminOrigin = `https://admin.da.live/source/${org}/${repo}`;
  return async (input) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url === '/.da/translate.json') {
      return fetch(`${adminOrigin}/.da/translate.json`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    }
    if (url.startsWith('/')) {
      const sourcePath = url.endsWith('.html') ? url : `${url}.html`;
      return fetch(`${adminOrigin}${sourcePath}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    }
    return fetch(input);
  };
}

export function parseAsoBlocks(html, validBlockTypes, constantsValues = {}) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const blocks = {};
  doc.querySelectorAll('.aso-app').forEach((block) => {
    const classes = Array.from(block.classList);
    const device = classes.find((c) => c === 'apple' || c === 'google');
    const blockType = classes.find((c) => validBlockTypes.includes(c));
    if (!blockType || !device) return;
    const key = `${device}-${blockType}`;
    const fields = {};
    block.querySelectorAll(':scope > div').forEach((row) => {
      const children = Array.from(row.children);
      if (children.length >= 2) {
        const fieldName = children[0].textContent.trim();
        const fieldValue = resolveFieldText(children[1], constantsValues, { addParagraphBreaks: true });
        if (fieldName) fields[fieldName] = fieldValue;
      }
    });
    if (!blocks[key]) blocks[key] = [];
    blocks[key].push(fields);
  });
  return blocks;
}

export function createSheetData(sheetData, languages, blockType) {
  const includeAggregatedPlayColumn = blockType === 'listing';
  const rows = [];
  ['google', 'apple'].forEach((device) => {
    if (Object.keys(sheetData[device]).length === 0) return;
    const deviceHeader = [device.charAt(0).toUpperCase() + device.slice(1)];
    const deviceSpanCols = includeAggregatedPlayColumn ? languages.length + 1 : languages.length;
    for (let i = 0; i < deviceSpanCols; i += 1) deviceHeader.push('');
    rows.push(deviceHeader);
    Object.entries(sheetData[device]).forEach(([, langData]) => {
      rows.push(
        includeAggregatedPlayColumn
          ? ['Languages', 'Aggregated (Play paste)', ...languages]
          : ['Languages', ...languages],
      );
      const allFields = new Set();
      Object.values(langData).forEach((fields) => {
        Object.keys(fields).forEach((field) => allFields.add(field));
      });
      Array.from(allFields).forEach((fieldName) => {
        const fieldRow = includeAggregatedPlayColumn ? [fieldName, ''] : [fieldName];
        if (
          includeAggregatedPlayColumn
          && device === 'google'
          && isReleaseNotesField(fieldName)
        ) {
          fieldRow[1] = buildGooglePlayReleaseNotesBlob(languages, langData, fieldName);
        }
        languages.forEach((lang) => fieldRow.push(langData[lang]?.[fieldName] || ''));
        rows.push(fieldRow);
      });
      rows.push([]);
    });
    rows.push([]);
  });
  return rows;
}

async function generateExcel(data, products, languages, devices) {
  const ExcelJS = await loadExcelJS();
  const workbook = new ExcelJS.Workbook();
  const infoSheet = workbook.addWorksheet('Export Info');
  infoSheet.addRows([
    ['Export Date', new Date().toISOString()],
    ['Products', products.join(', ')],
    ['Languages', languages.join(', ')],
    ['Devices', devices.join(', ')],
    ['Total Pages', data.length],
  ]);
  infoSheet.getColumn(1).width = 15;
  infoSheet.getColumn(2).width = 50;
  infoSheet.eachRow((row) => {
    row.getCell(1).font = { bold: true };
    row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
  });
  const groupedData = {};
  data.forEach((pageData) => {
    const { product, language, blocks } = pageData;
    Object.entries(blocks).forEach(([blockKey, blockInstances]) => {
      const firstHyphen = blockKey.indexOf('-');
      const blockDevice = blockKey.substring(0, firstHyphen);
      const blockType = blockKey.substring(firstHyphen + 1);
      const sheetKey = `${blockType}-${product}`;
      if (!groupedData[sheetKey]) {
        groupedData[sheetKey] = { product, blockType, google: {}, apple: {} };
      }
      blockInstances.forEach((fields, index) => {
        const instanceKey = blockInstances.length > 1 ? `${blockType} ${index + 1}` : blockType;
        if (!groupedData[sheetKey][blockDevice][instanceKey]) {
          groupedData[sheetKey][blockDevice][instanceKey] = {};
        }
        groupedData[sheetKey][blockDevice][instanceKey][language] = fields;
      });
    });
  });
  Object.entries(groupedData).forEach(([sheetKey, sheetData]) => {
    const includeAggregatedPlayColumn = sheetData.blockType === 'listing';
    const lastCol = includeAggregatedPlayColumn ? languages.length + 2 : languages.length + 1;
    const sheetArray = createSheetData(sheetData, languages, sheetData.blockType);
    const worksheet = workbook.addWorksheet(sheetKey);
    worksheet.addRows(sheetArray);
    worksheet.getColumn(1).width = 30;
    if (includeAggregatedPlayColumn) {
      worksheet.getColumn(2).width = 65;
      for (let i = 3; i <= lastCol; i += 1) {
        worksheet.getColumn(i).width = 50;
      }
    } else {
      for (let i = 2; i <= lastCol; i += 1) {
        worksheet.getColumn(i).width = 50;
      }
    }
    worksheet.eachRow((row, rowNumber) => {
      const firstCellValue = row.getCell(1).value;
      const isDeviceHeader = firstCellValue === 'Google' || firstCellValue === 'Apple';
      const isLanguagesHeader = firstCellValue === 'Languages';
      if (isDeviceHeader) {
        worksheet.mergeCells(rowNumber, 1, rowNumber, lastCol);
      }
      row.eachCell((cell, colNumber) => {
        cell.alignment = { wrapText: true, vertical: 'top', horizontal: 'left' };
        if (isDeviceHeader) {
          cell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: firstCellValue === 'Google' ? 'FF4285F4' : 'FF555555' },
          };
          cell.alignment = { ...cell.alignment, horizontal: 'center' };
        }
        if (isLanguagesHeader) {
          cell.font = { bold: true, size: 11 };
          const localeHeaderFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD3D3D3' } };
          const aggregatedHeaderFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB3E5FC' } };
          if (includeAggregatedPlayColumn) {
            cell.fill = colNumber === 2 ? aggregatedHeaderFill : localeHeaderFill;
          } else {
            cell.fill = localeHeaderFill;
          }
        }
        if (colNumber === 1 && !isDeviceHeader && !isLanguagesHeader && firstCellValue) {
          cell.font = { bold: true };
        }
      });
    });
  });
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const filename = `ASO-Export-${new Date().toISOString().split('T')[0]}.xlsx`;
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  window.URL.revokeObjectURL(url);
}

function updateExportButtonState() {
  const hasProducts = getSelectedCheckboxes('.product-checkbox').length > 0;
  const hasLanguages = getSelectedCheckboxes('.language-checkbox').length > 0;
  const hasDevices = document.getElementById('device-apple').checked
    || document.getElementById('device-google').checked;
  document.getElementById('export-button').disabled = !(hasProducts && hasLanguages && hasDevices);
}

function showExportStatus(message, duration = 2000) {
  const exportButton = document.getElementById('export-button');
  exportButton.textContent = message;
  exportButton.classList.remove('loading');
  setTimeout(() => {
    exportButton.textContent = 'Export to Excel';
    updateExportButtonState();
  }, duration);
}

async function handleExport(org, repo, token) {
  const exportButton = document.getElementById('export-button');
  exportButton.classList.add('loading');
  exportButton.textContent = 'Exporting...';
  exportButton.disabled = true;
  try {
    const schema = await fetchBlockSchema(org, repo, token);
    const validBlockTypes = extractBlockTypesFromSchema(schema);
    if (validBlockTypes.length === 0) {
      showExportStatus('No block types found');
      return;
    }
    const { products, languages, devices } = getSelectedItems();
    const pagePaths = buildPagePaths(products, languages, devices);
    const adminFetch = createAdminFetch(org, repo, token);
    const allData = [];
    setExportCaptureGlobal({
      pages: [],
      exportDebug: isExportDebugEnabled(),
      startedAt: new Date().toISOString(),
    });
    // eslint-disable-next-line no-restricted-syntax
    for (const pageInfo of pagePaths) {
      // eslint-disable-next-line no-await-in-loop
      const html = await fetchPageContent(org, repo, pageInfo.path, token);
      if (html) {
        // eslint-disable-next-line no-await-in-loop
        const constantsValues = await loadConstantsValuesForPage({
          pathname: pageInfo.path,
          fetch: adminFetch,
        });
        const blocks = parseAsoBlocks(html, validBlockTypes, constantsValues);
        allData.push({ ...pageInfo, blocks });
      }
    }
    await generateExcel(allData, products, languages, devices);
    logExportCaptureSummary();
    showExportStatus('Export Complete!');
  } catch (error) {
    showExportStatus('Export Failed');
  }
}

function createCheckboxHTML(item, type) {
  const idPrefix = type === 'products' ? 'product' : 'lang';
  const value = item.value || item.code;
  const className = `${type.slice(0, -1)}-checkbox`;
  return `
    <div class="checkbox-item">
      <input type="checkbox" id="${idPrefix}-${value}" value="${value}" class="${className}">
      <label for="${idPrefix}-${value}">${item.label}</label>
    </div>
  `;
}

function updateSelectionCount(type) {
  const checkboxes = document.querySelectorAll(`.${type.slice(0, -1)}-checkbox`);
  const count = Array.from(checkboxes).filter((cb) => cb.checked).length;
  const countElement = document.getElementById(`${type}-count`);
  if (countElement) countElement.textContent = `(${count} selected)`;
}

function populateCheckboxes(containerId, items, type) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (items.length === 0) {
    container.innerHTML = `<p>No ${type} found</p>`;
    return;
  }
  container.innerHTML = items.map((item) => createCheckboxHTML(item, type)).join('');
  updateSelectionCount(type);
}

function handleCheckboxChange() {
  updateSelectionCount('products');
  updateSelectionCount('languages');
  updateExportButtonState();
}

function handleSelectAll(target) {
  const checkboxes = document.querySelectorAll(`.${target.slice(0, -1)}-checkbox`);
  const allChecked = Array.from(checkboxes).every((cb) => cb.checked);
  checkboxes.forEach((cb) => { cb.checked = !allChecked; });
  updateSelectionCount(target);
  updateExportButtonState();
}

function setupListeners(org, repo, token) {
  const allCheckboxes = '.product-checkbox, .language-checkbox, #device-apple, #device-google';
  document.querySelectorAll(allCheckboxes).forEach((checkbox) => {
    checkbox.addEventListener('change', handleCheckboxChange);
  });
  document.querySelectorAll('.select-all-link').forEach((button) => {
    button.addEventListener('click', () => handleSelectAll(button.dataset.target));
  });
  document.getElementById('export-button').addEventListener('click', () => handleExport(org, repo, token));
}

// eslint-disable-next-line import/prefer-default-export
export async function init({ context, token }) {
  const { org, repo } = context;
  registerExportDebugHelpers();
  if (isExportDebugEnabled()) {
    console.log('[aso export] Verbose debug enabled (?exportDebug=1). Run window.__asoExportDebug.help() for commands.');
  } else {
    console.log(`[aso export] Export capture → sessionStorage.getItem("${EXPORT_CAPTURE_STORAGE_KEY}") after each export`);
  }
  const products = await fetchProducts({ context, token });
  populateCheckboxes('products-checkboxes', products, 'products');
  const languages = await fetchLanguages({ context, token });
  populateCheckboxes('languages-checkboxes', languages, 'languages');
  setupListeners(org, repo, token);
}
