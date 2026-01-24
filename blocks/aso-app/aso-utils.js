const BLOCK_SCHEMA_PATH = '/.da/block-schema.json';

let allValidations;

export function convertTags(el, options = {}) {
  const { addParagraphBreaks = false } = options;
  const clone = el.cloneNode(true);
  const hasOtherTags = clone.querySelector('strong, em, b, i, h1, h2, h3, h4, h5, h6, span, div, a');
  clone.querySelectorAll('br').forEach((br) => {
    br.replaceWith('\n');
  });
  if (!hasOtherTags) {
    clone.querySelectorAll('p').forEach((p) => {
      const separator = addParagraphBreaks ? '\n\n' : '';
      const textNode = document.createTextNode(p.textContent + separator);
      p.replaceWith(textNode);
    });
    return clone.textContent.trim();
  }
  clone.querySelectorAll('strong').forEach((strong) => {
    const b = document.createElement('b');
    b.innerHTML = strong.innerHTML;
    strong.replaceWith(b);
  });
  clone.querySelectorAll('p').forEach((p, index, arr) => {
    const fragment = document.createDocumentFragment();
    fragment.append(...p.childNodes);
    if (addParagraphBreaks && index < arr.length - 1) {
      fragment.append(document.createTextNode('\n\n'));
    }
    p.replaceWith(fragment);
  });
  clone.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((heading) => {
    Array.from(heading.attributes).forEach((attr) => {
      heading.removeAttribute(attr.name);
    });
  });
  return clone.innerHTML.trim();
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
