const VALIDATIONS = {
  title: { length: 100 },
  description: { length: 250 },
}

function buildSuccessRow(row) {
  const div = document.createElement('div');
  div.className = 'note success';
  div.textContent = `The content is valid.`;

  row.append(div);
}


function buildErrorRow(row, key, type, expected, received) {
  const div = document.createElement('div');
  div.className = 'note error';
  div.textContent = `Error validating ${key}. Expected: ${expected} ${type}. Received: ${received} ${type}.`;

  row.append(div);
}

function validateRow(row, key, dataEl) {
  const rules = VALIDATIONS[key];
  const text = dataEl.innerHTML;
  if (text.length > rules.length) {
    console.log('error');
    buildErrorRow(row, key, 'characters', rules.length, text.length);
  } else {
    buildSuccessRow(row);
  }
}

function decorateRow(row) {
  const { children: cols } = row;
  const [labelEl, dataEl] = cols;
  labelEl.classList.add('label');
  dataEl.classList.add('data');

  const key = labelEl.textContent.trim().toLowerCase();
  if (VALIDATIONS[key]) {
    validateRow(row, key, dataEl);
  }
}

export default function init(el) {
  const rows = el.querySelectorAll(':scope > div');
  if (rows.length === 0) return;
  rows.forEach((row) => {
    row.classList.add('data-row');
    if (row.children) decorateRow(row);
  });
}
