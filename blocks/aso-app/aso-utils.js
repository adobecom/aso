const BLOCK_SCHEMA_PATH = '/.da/block-schema.json';

let allValidations;

function buildValidationsFromSchema(schemaData) {
  const validations = {};

  schemaData.data.forEach((field) => {
    const charCount = field['character count'];
    if (charCount && charCount !== '') {
      const fieldName = field['field name'].toLowerCase();
      validations[fieldName] = {
        length: parseInt(charCount, 10),
      };
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

