const VALIDATIONS = {
  title: { length: 100 },
  description: { length: 250 },
}

function buildErrorRow(row, key, type, expected, received) {
  const div = document.createElement('div');
  div.className = 'error';
  div.textContent = `There was an error validating ${key}. Expected: ${expected} ${type}. Received: ${received} ${type}.`;

  row.insertAdjacentElement('afterend', div);
}


function validateRow(row, key, dataEl) {
  const rules = VALIDATIONS[key];
  const text = dataEl.innerHTML;
  if (text.length > rules.length) {
    console.log('error');
    buildErrorRow(row, key, 'length', rules.length, text.length)
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
  rows.forEach((row) => {
    row.classList.add('data-row');
    if (row.children) decorateRow(row);
  });
}
