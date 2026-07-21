const JSZIP_CDN = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
// Pinned to the exact file above (verified against jsdelivr's own published hash) — see
// excel-loader.js for why this third-party CDN load gets SRI when DA's own first-party
// script loads don't.
const JSZIP_INTEGRITY = 'sha384-+mbV2IY1Zk/X1p/nWllGySJSUN8uMs+gUAN10Or95UBH0fpj6GfKgPmgC5EXieXG';

async function loadJSZip() {
  if (window.JSZip) return window.JSZip;
  return new Promise((resolve, reject) => {
    let script = document.querySelector(`head > script[src="${JSZIP_CDN}"]`);
    if (!script) {
      script = document.createElement('script');
      script.src = JSZIP_CDN;
      script.integrity = JSZIP_INTEGRITY;
      script.crossOrigin = 'anonymous';
      document.head.append(script);
    }
    script.addEventListener('load', () => resolve(window.JSZip), { once: true });
    script.addEventListener('error', () => reject(new Error('Failed to load JSZip library')), { once: true });
  });
}

export { loadJSZip }; // eslint-disable-line import/prefer-default-export
