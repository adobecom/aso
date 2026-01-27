const BLOCK_SCHEMA_PATH = '/.da/block-schema.json';

let allValidations;

function cleanEditorArtifacts(element) {
  element.querySelectorAll('#da-cursor-position').forEach((elem) => elem.remove());
  const pmElements = element.querySelectorAll('[class*="ProseMirror-"]');
  pmElements.forEach((elem) => {
    if (elem.getAttribute('contenteditable') === 'false' || elem.classList.contains('ProseMirror-widget')) {
      elem.remove();
    } else {
      const parent = elem.parentNode;
      if (parent) {
        while (elem.firstChild) {
          parent.insertBefore(elem.firstChild, elem);
        }
        elem.remove();
      }
    }
  });
}

function isDAPreview() {
  return window.location.search.includes('dapreview') || window.location.href.includes('da.live/edit');
}

function normalizeWhitespace(text) {
  return text
    .replace(/\s+\n/g, '\n') // Remove whitespace before newlines
    .replace(/\n\s+/g, '\n') // Remove whitespace after newlines
    .replace(/  +/g, ' '); // Collapse multiple spaces to one
}

export function convertTags(el, options = {}) {
  const { addParagraphBreaks = false } = options;
  const clone = el.cloneNode(true);
  if (isDAPreview()) {
    cleanEditorArtifacts(clone);
  }
  clone.querySelectorAll('*').forEach((elem) => {
    Array.from(elem.attributes).forEach((attr) => {
      elem.removeAttribute(attr.name);
    });
  });
  clone.querySelectorAll('span, div, a').forEach((tag) => {
    const parent = tag.parentNode;
    if (parent) {
      while (tag.firstChild) {
        parent.insertBefore(tag.firstChild, tag);
      }
      tag.remove();
    }
  });
  clone.querySelectorAll('strong').forEach((strong) => {
    const b = document.createElement('b');
    b.innerHTML = strong.innerHTML;
    strong.replaceWith(b);
  });
  clone.querySelectorAll('em').forEach((em) => {
    const i = document.createElement('i');
    i.innerHTML = em.innerHTML;
    em.replaceWith(i);
  });
  clone.querySelectorAll('br').forEach((br) => {
    if (br.parentElement && br.parentElement.childNodes.length === 1 && br.parentElement.textContent.trim() === '') {
      br.parentElement.remove();
    } else {
      br.replaceWith('\n');
    }
  });
  const hasOtherTags = clone.querySelector('b, i, u, h1, h2, h3, h4, h5, h6');
  if (!hasOtherTags) {
    clone.querySelectorAll('p').forEach((p, index, arr) => {
      const separator = addParagraphBreaks && index < arr.length - 1 ? '\n\n' : '';
      const textNode = document.createTextNode(p.textContent.trim() + separator);
      p.replaceWith(textNode);
    });
    return normalizeWhitespace(clone.textContent.trim());
  }
  clone.querySelectorAll('p').forEach((p, index, arr) => {
    const fragment = document.createDocumentFragment();
    fragment.append(...p.childNodes);
    if (addParagraphBreaks && index < arr.length - 1) {
      fragment.append(document.createTextNode('\n\n'));
    }
    p.replaceWith(fragment);
  });
  return normalizeWhitespace(clone.innerHTML.trim());
}

function buildValidationsFromSchema(schemaData) {
  const validations = {};

  schemaData.data.forEach((field) => {
    const charCount = field['character count'];
    if (charCount && charCount !== '') {
      const fieldName = field['field name'].toLowerCase();
      validations[fieldName] = { length: parseInt(charCount, 10) };
    }
  });

  return validations;
}

function buildSchemaKey(types) {
  return `aso-app (${types.join(', ')})`;
}

function normalizeSchemaKey(schemaKey) {
  const match = schemaKey.match(/^aso-app \((.*)\)$/);
  if (!match) return schemaKey;

  const types = match[1].split(',').map((t) => t.trim()).sort();
  return buildSchemaKey(types);
}

async function loadBlockValidations() {
  if (allValidations) return allValidations;

  const resp = await fetch(BLOCK_SCHEMA_PATH);
  if (!resp.ok) {
    return { error: `Could not load block schema from ${BLOCK_SCHEMA_PATH}` };
  }

  const schema = await resp.json();
  allValidations = {};

  Object.keys(schema).forEach((key) => {
    if (!key.startsWith(':') && schema[key].data) {
      const normalizedKey = normalizeSchemaKey(key);
      allValidations[normalizedKey] = buildValidationsFromSchema(schema[key]);
    }
  });

  return allValidations;
}

function findMatchingSchemaKey(sortedTypes, allValidations) {
  for (let i = sortedTypes.length; i > 0; i--) {
    const classesToTry = sortedTypes.slice(0, i);
    const schemaKey = buildSchemaKey(classesToTry);
    if (allValidations[schemaKey]) {
      return schemaKey;
    }
  }
  return null;
}

export async function getValidations(el) {
  const result = (message, validations = {}) => ({ message, validations });

  const loadResult = await loadBlockValidations();

  if (loadResult && loadResult.error) {
    return result(`${loadResult.error}. Validation is disabled.`);
  }

  const sortedTypes = [...el.classList].filter((c) => c !== 'aso-app').sort();

  if (sortedTypes.length === 0) {
    return result('No validation rules found. Add classes like "apple listing" or "google promo" to enable validation.');
  }

  const matchedSchemaKey = findMatchingSchemaKey(sortedTypes, allValidations);

  if (!matchedSchemaKey) {
    const attemptedKey = buildSchemaKey(sortedTypes);
    return result(`No validation rules found for: ${attemptedKey}`);
  }

  return result('', allValidations[matchedSchemaKey]);
}
