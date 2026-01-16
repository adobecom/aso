async function showPreview(meta, variant) {
  const resp = await fetch('/mocks/play-store.html');
  if (!resp.ok) {
    console.log('could not get html');
    return;
  }
  let html = await resp.text();

  Object.keys(meta).forEach((key) => {
    const placeholder = `{${key}}`;
    const value = meta[key]?.text || '';
    html = html.replaceAll(placeholder, value);
  });

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const styles = doc.head.querySelectorAll('link');
  document.head.append(...styles);
  document.body.innerHTML = doc.body.innerHTML;
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

const getMetadata = (el) => [...el.childNodes].reduce((rdx, row) => {
  if (row.children && row.children.length >= 2) {
    const key = row.children[0].textContent.trim().toLowerCase();
    const content = row.children[1];
    const text = content.innerHTML.trim();
    if (key && text) rdx[key] = { text };
  }
  return rdx;
}, {});

export default async function init(el) {
  const variant = [...el.classList].find((c) => c === 'apple' || c === 'google') || 'apple';

  const asoApps = document.querySelectorAll('.aso-app');
  if (asoApps.length === 0) {
    el.textContent = 'Error: aso-app block not found on this page';
    return;
  }

  const meta = {};
  asoApps.forEach((asoApp) => {
    const appMeta = getMetadata(asoApp);
    Object.assign(meta, appMeta);
  });

  const btn = document.createElement('button');
  btn.textContent = `Preview ${variant === 'apple' ? 'App Store' : 'Play Store'}`;
  btn.addEventListener('click', () => {
    showPreview(meta, variant);
  });
  el.append(btn);
}

