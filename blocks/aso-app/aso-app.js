import { getValidations, convertTags } from './aso-utils.js';

function buildSuccessRow(row, received, expected) {
  const div = document.createElement('div');
  div.className = 'note success';
  div.textContent = `The content is valid. ${received}/${expected} characters.`;
  row.append(div);
}

function setupCopy(row, dataEl) {
  const btn = document.createElement('button');
  btn.textContent = 'Copy';
  btn.addEventListener('click', async () => {
    const content = convertTags(dataEl, { addParagraphBreaks: true });

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

function validateRow(row, key, dataEl, validations) {
  const rules = validations[key];
  if (!rules) return;

  const content = convertTags(dataEl, { addParagraphBreaks: true });
  if (content.length > rules.length) {
    buildErrorRow(row, key, 'characters', rules.length, content.length);
  } else {
    buildSuccessRow(row, content.length, rules.length);
  }
}

function decorateRow(row, validations) {
  const { children: cols } = row;
  if (!cols || cols.length < 2) return;

  const [labelEl, dataEl] = cols;
  labelEl.classList.add('label');
  dataEl.classList.add('data');

  setupCopy(row, dataEl);

  const key = labelEl.textContent.trim().toLowerCase();
  if (validations[key]) {
    validateRow(row, key, dataEl, validations);
  }
}

function getBlockTitle(el) {
  const blockTypes = ['listing', 'promo', 'images-videos'];
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

  const { message, validations } = await getValidations(el);

  const rows = el.querySelectorAll(':scope > div');
  if (rows.length === 0) return;
  rows.forEach((row) => {
    row.classList.add('data-row');
    if (row.children) decorateRow(row, validations);
  });

  if (message) {
    const note = document.createElement('div');
    note.className = 'note info';
    note.textContent = message;
    header.insertAdjacentElement('afterend', note);
  }
}
