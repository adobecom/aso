let excelJSLoaded = false;
const EXCELJS_CDN = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
// Pinned to the exact file above (verified against jsdelivr's own published hash) — unlike
// DA's own script loads, which stay on Adobe's first-party domains, this is a public npm
// package on a third-party CDN neither Adobe nor DA controls, so the browser should refuse
// to run it if that CDN ever serves something else for this URL.
const EXCELJS_INTEGRITY = 'sha384-Pqp51FUN2/qzfxZxBCtF0stpc9ONI6MYZpVqmo8m20SoaQCzf+arZvACkLkirlPz';

// No legitimate import/export template gets anywhere close to this — guards against an
// oversized or adversarially-crafted upload (e.g. a zip bomb) hanging or crashing the tab
// before it ever reaches ExcelJS.
const MAX_WORKBOOK_FILE_BYTES = 20 * 1024 * 1024;

function isFileTooLarge(file) {
  return file.size > MAX_WORKBOOK_FILE_BYTES;
}

async function loadExcelJS() {
  if (excelJSLoaded && window.ExcelJS) return window.ExcelJS;
  if (window.ExcelJS) {
    excelJSLoaded = true;
    return window.ExcelJS;
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = EXCELJS_CDN;
    script.integrity = EXCELJS_INTEGRITY;
    script.crossOrigin = 'anonymous';
    script.onload = () => {
      excelJSLoaded = true;
      resolve(window.ExcelJS);
    };
    script.onerror = () => reject(new Error('Failed to load ExcelJS library'));
    document.head.appendChild(script);
  });
}

export { isFileTooLarge, loadExcelJS, MAX_WORKBOOK_FILE_BYTES };
