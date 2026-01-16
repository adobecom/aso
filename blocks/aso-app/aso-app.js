import { getValidations } from './aso-utils.js';

function buildSuccessRow(row, received, expected) {
  const div = document.createElement('div');
  div.className = 'note success';
  div.textContent = `The content is valid. ${received}/${expected} characters.`;

  row.append(div);
}

function convertTags(el) {
  const clone = el.cloneNode(true);

  const hasOtherTags = clone.querySelector('strong, em, b, i, h1, h2, h3, h4, h5, h6, span, div, a');
  
  clone.querySelectorAll('br').forEach((br) => {
    br.replaceWith('\n');
  });

  if (!hasOtherTags) {
    clone.querySelectorAll('p').forEach((p) => {
      p.replaceWith(...p.childNodes);
    });
    return (clone.textContent || clone.innerText).trim();
  }

  clone.querySelectorAll('strong').forEach((strong) => {
    const b = document.createElement('b');
    b.innerHTML = strong.innerHTML;
    strong.replaceWith(b);
  });

  clone.querySelectorAll('p').forEach((p) => {
    p.replaceWith(...p.childNodes);
  });

  clone.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((heading) => {
    Array.from(heading.attributes).forEach((attr) => {
      heading.removeAttribute(attr.name);
    });
  });

  return clone.innerHTML.trim();
}

function setupCopy(row, dataEl) {
  const btn = document.createElement('button');
  btn.textContent = 'Copy';
  btn.addEventListener('click', async () => {
    const content = convertTags(dataEl);
    
    try {
      await navigator.clipboard.writeText(content);
    } catch (err) {
      console.error('Failed to copy:', err);
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

  const content = convertTags(dataEl);
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

export default async function init(el) {
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
    el.append(note);
  }
}
