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

async function showPreview(meta) {
  const resp = await fetch('/mocks/play-store.html');
  if (!resp.ok) {
    console.log('could not get html');
    return;
  }
  let html = await resp.text();
  html = html
    .replaceAll('{TITLE}', meta.title.text)
    .replaceAll('{DEVELOPER}', meta.developer.text)
    .replaceAll('{DESCRIPTION}', meta.description.text);


  const doc = new DOMParser().parseFromString(html, 'text/html');
  const styles = doc.head.querySelectorAll('link');
  document.head.append(...styles);
  document.body.innerHTML = doc.body.innerHTML;
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

const getMetadata = (el) => [...el.childNodes].reduce((rdx, row) => {
  if (row.children) {
    const key = row.children[0].textContent.trim().toLowerCase();
    const content = row.children[1];
    const text = content.textContent.trim();
    if (key && text) rdx[key] = { text };
  }
  return rdx;
}, {});

export default function init(el) {
  const meta = getMetadata(el);

  const rows = el.querySelectorAll(':scope > div');
  if (rows.length === 0) return;
  rows.forEach((row) => {
    row.classList.add('data-row');
    if (row.children) decorateRow(row);
  });

  const btn = document.createElement('button');
  btn.textContent = 'Preview Play Store';
  btn.addEventListener('click', () => {
    showPreview(meta);
  });
  el.append(btn);
}
