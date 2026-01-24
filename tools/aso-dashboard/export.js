import { authFetch, fetchProducts, fetchLanguages } from './utils.js';
import { convertTags } from '../../blocks/aso-app/aso-utils.js';

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
  const paths = [];
  products.forEach((product) => {
    languages.forEach((language) => {
      devices.forEach((device) => {
        paths.push({ product, language, device, path: `/${language}/products/${product}/${device}` });
      });
    });
  });
  return paths;
}

async function fetchPageContent(org, repo, path, token) {
  const extensions = ['.html', ''];
  for (const ext of extensions) {
    try {
      const response = await fetch(`https://admin.da.live/source/${org}/${repo}${path}${ext}`, { headers: { Authorization: `Bearer ${token}` } });
      if (response.ok) return await response.text();
    } catch (err) {
      continue;
    }
  }
  return null;
}

function parseAsoBlocks(html, validBlockTypes) {
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
        const fieldValue = convertTags(children[1], { addParagraphBreaks: true });
        if (fieldName) fields[fieldName] = fieldValue;
      }
    });
    if (!blocks[key]) blocks[key] = [];
    blocks[key].push(fields);
  });
  return blocks;
}

function createSheetData(sheetData, languages) {
  const rows = [];
  ['google', 'apple'].forEach((device) => {
    if (Object.keys(sheetData[device]).length === 0) return;
    const deviceHeader = [device.charAt(0).toUpperCase() + device.slice(1)];
    for (let i = 0; i < languages.length; i++) deviceHeader.push('');
    rows.push(deviceHeader);
    Object.entries(sheetData[device]).forEach(([instanceKey, langData]) => {
      rows.push(['Languages', ...languages]);
      const allFields = new Set();
      Object.values(langData).forEach((fields) => {
        Object.keys(fields).forEach((field) => allFields.add(field));
      });
      Array.from(allFields).forEach((fieldName) => {
        const fieldRow = [fieldName];
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
    const sheetArray = createSheetData(sheetData, languages);
    const worksheet = workbook.addWorksheet(sheetKey);
    worksheet.addRows(sheetArray);
    worksheet.getColumn(1).width = 30;
    for (let i = 2; i <= languages.length + 1; i++) {
      worksheet.getColumn(i).width = 50;
    }
    worksheet.eachRow((row, rowNumber) => {
      const firstCellValue = row.getCell(1).value;
      const isDeviceHeader = firstCellValue === 'Google' || firstCellValue === 'Apple';
      const isLanguagesHeader = firstCellValue === 'Languages';
      if (isDeviceHeader) {
        worksheet.mergeCells(rowNumber, 1, rowNumber, languages.length + 1);
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
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD3D3D3' } };
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

async function handleExport(org, repo, token) {
  const exportButton = document.getElementById('export-button');
  exportButton.classList.add('loading');
  exportButton.textContent = 'Exporting...';
  exportButton.disabled = true;
  try {
    const schema = await fetchBlockSchema(org, repo, token);
    const validBlockTypes = extractBlockTypesFromSchema(schema);
    if (validBlockTypes.length === 0) throw new Error('No block types found');
    const { products, languages, devices } = getSelectedItems();
    const pagePaths = buildPagePaths(products, languages, devices);
    const allData = [];
    for (const pageInfo of pagePaths) {
      const html = await fetchPageContent(org, repo, pageInfo.path, token);
      if (html) {
        const blocks = parseAsoBlocks(html, validBlockTypes);
        allData.push({ ...pageInfo, blocks });
      }
    }
    await generateExcel(allData, products, languages, devices);
    exportButton.textContent = 'Export Complete!';
    setTimeout(() => {
      exportButton.textContent = 'Export to Excel';
      exportButton.classList.remove('loading');
      updateExportButtonState();
    }, 2000);
  } catch (error) {
    console.error('Export failed:', error);
    exportButton.textContent = 'Export Failed';
    exportButton.classList.remove('loading');
    setTimeout(() => {
      exportButton.textContent = 'Export to Excel';
      updateExportButtonState();
    }, 2000);
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

function updateExportButtonState() {
  const hasProducts = getSelectedCheckboxes('.product-checkbox').length > 0;
  const hasLanguages = getSelectedCheckboxes('.language-checkbox').length > 0;
  const hasDevices = document.getElementById('device-apple').checked
    || document.getElementById('device-google').checked;
  document.getElementById('export-button').disabled = !(hasProducts && hasLanguages && hasDevices);
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

export async function init({ context, token }) {
  const { org, repo } = context;
  const products = await fetchProducts({ context, token });
  populateCheckboxes('products-checkboxes', products, 'products');
  const languages = await fetchLanguages({ context, token });
  populateCheckboxes('languages-checkboxes', languages, 'languages');
  setupListeners(org, repo, token);
}
