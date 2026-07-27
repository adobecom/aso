import { getValidations, resolveFieldText } from './aso-utils.js';
import {
  applyConstantsToDisplay,
  isDaEditMode,
  loadConstantsValuesForPage,
  shouldResolveConstantsForDisplay,
} from './constants-runtime.js';
import { hasConstantTokens } from '../../utils/aso-constants.js';

function buildSuccessRow(row, received, expected, type = 'characters') {
  const div = document.createElement('div');
  div.className = 'note success';
  div.textContent = `The content is valid. ${received}/${expected} ${type}.`;
  row.append(div);
}

function setupCopy(row, dataEl, constantsValues) {
  const btn = document.createElement('button');
  btn.textContent = 'Copy';
  btn.addEventListener('click', async () => {
    const content = isDaEditMode()
      ? resolveFieldText(dataEl, {}, { addParagraphBreaks: true })
      : resolveFieldText(dataEl, constantsValues, { addParagraphBreaks: true });

    try {
      await navigator.clipboard.writeText(content);
    } catch (err) {
      const textarea = document.createElement('textarea');
      textarea.value = content;
      textarea.setAttribute('readonly', '');
      textarea.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;';
      document.body.appendChild(textarea);
      textarea.select();
      textarea.setSelectionRange(0, content.length);
      try {
        document.execCommand('copy');
      } finally {
        document.body.removeChild(textarea);
      }
    }
  });
  row.append(btn);
}

function buildErrorRow(row, key, type, expected, received) {
  const div = document.createElement('div');
  div.className = 'note error';
  div.textContent = `Error validating ${key}. Expected: ${expected} ${type}. Received: ${received} ${type}.`;

  row.append(div);
}

function waitForImageLoad(img) {
  if (img.complete && img.naturalWidth) return Promise.resolve();
  return new Promise((resolve) => {
    img.addEventListener('load', resolve, { once: true });
    img.addEventListener('error', resolve, { once: true });
  });
}

async function validateImageSizeRow(row, key, dataEl, rules) {
  const img = dataEl.querySelector('img');
  if (!img) return;

  await waitForImageLoad(img);
  const { naturalWidth, naturalHeight } = img;
  if (!naturalWidth || !naturalHeight) return;

  const longestSide = Math.max(naturalWidth, naturalHeight);
  const expected = `${rules.minPx}-${rules.maxPx}`;
  const type = 'px (longest side)';
  if (longestSide < rules.minPx || longestSide > rules.maxPx) {
    buildErrorRow(row, key, type, expected, longestSide);
  } else {
    buildSuccessRow(row, longestSide, expected, type);
  }
}

function validateTextRow(row, key, dataEl, rules, constantsValues) {
  const content = resolveFieldText(dataEl, constantsValues, { addParagraphBreaks: true });
  if (content.length > rules.length) {
    buildErrorRow(row, key, 'characters', rules.length, content.length);
  } else {
    buildSuccessRow(row, content.length, rules.length);
  }
}

async function validateRow(row, key, dataEl, validations, constantsValues) {
  const rules = validations[key];
  if (!rules) return;

  if (rules.length !== undefined) {
    validateTextRow(row, key, dataEl, rules, constantsValues);
  } else if (rules.minPx !== undefined) {
    await validateImageSizeRow(row, key, dataEl, rules);
  }
}

async function decorateRow(row, validations, constantsValues) {
  const { children: cols } = row;
  if (!cols || cols.length < 2) return;

  const [labelEl, dataEl] = cols;
  labelEl.classList.add('label');
  dataEl.classList.add('data');

  if (hasConstantTokens(dataEl.innerHTML)) {
    const displayOptions = { resolveForDisplay: shouldResolveConstantsForDisplay() };
    applyConstantsToDisplay(dataEl, constantsValues, displayOptions);
  }

  setupCopy(row, dataEl, constantsValues);

  const key = labelEl.textContent.trim().toLowerCase();
  if (validations[key]) {
    await validateRow(row, key, dataEl, validations, constantsValues);
  }
}

function getBlockTitle(el) {
  const blockTypes = ['listing', 'promo', 'images-videos', 'media-assets'];
  const classes = Array.from(el.classList);
  const blockType = classes.find((cls) => blockTypes.includes(cls));
  if (!blockType) return 'ASO Block';
  return blockType
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export default async function init(el) {
  const blockTitle = getBlockTitle(el);
  const header = document.createElement('h2');
  header.className = 'block-header';
  header.textContent = blockTitle;
  el.prepend(header);

  const [{ message, validations }, constantsValues] = await Promise.all([
    getValidations(el),
    loadConstantsValuesForPage(),
  ]);

  const rows = el.querySelectorAll(':scope > div');
  if (rows.length === 0) return;
  await Promise.all(Array.from(rows).map((row) => {
    row.classList.add('data-row');
    return row.children ? decorateRow(row, validations, constantsValues) : null;
  }));

  if (message) {
    const note = document.createElement('div');
    note.className = 'note info';
    note.textContent = message;
    header.insertAdjacentElement('afterend', note);
  }
}
