const BLOCK_SCHEMA_PATH = '/.da/block-schema.json';

let allValidations;

function cleanupDATags(element) {
  if (window.location.search.includes('dapreview') || window.location.href.includes('da.live/edit')) {
    element.querySelectorAll('#da-cursor-position').forEach((elem) => elem.remove());
  }
}

const LIST_INDENT = 4;

function normalizeWhitespace(text) {
  return text
    .replace(/\s+\n/g, '\n') // Remove whitespace before newlines
    .replace(/\n\s+/g, '\n') // Remove whitespace after newlines
    .replace(/  +/g, ' '); // Collapse multiple spaces to one
}

function collapseMultipleNewlines(text) {
  return text.replace(/\n{2,}/g, '\n');
}

function removeWhitespaceOnlyTextNodes(root) {
  Array.from(root.childNodes).forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE && /^\s*$/.test(node.data) && /\n/.test(node.data)) {
      const replacement = document.createTextNode('\n');
      node.parentNode.replaceChild(replacement, node);
    }
  });
}

/** One walk: collect every ul/ol with its nesting depth; process innermost first. */
function convertListsToText(root) {
  const entries = [];
  function walk(node, depth) {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    Array.from(node.children).forEach((child) => {
      if (child.tagName === 'UL' || child.tagName === 'OL') {
        entries.push({ list: child, depth });
        walk(child, depth + 1);
      } else {
        walk(child, depth);
      }
    });
  }
  walk(root, 0);
  entries.sort((a, b) => b.depth - a.depth); // innermost first
  entries.forEach(({ list, depth }) => {
    const indent = ' '.repeat(LIST_INDENT * depth);
    const items = Array.from(list.children)
      .filter((el) => el.tagName === 'LI')
      .map((li) => li.textContent.trim().replace(/\n\s*\n/g, '\n'));
    const lines = list.tagName === 'UL'
      ? items.map((t) => `- ${t}`)
      : items.map((t, i) => `${i + 1}. ${t}`);
    const indented = indent ? lines.map((line) => indent + line) : lines;
    const next = list.nextElementSibling;
    const nextIsList = next && (next.tagName === 'UL' || next.tagName === 'OL');
    const trailing = nextIsList ? '' : '\n';
    const formatted = lines.length ? `\n${indented.join('\n')}${trailing}` : '\n';
    list.replaceWith(document.createTextNode(formatted));
  });
}

export function convertTags(el, { addParagraphBreaks = false } = {}) {
  const clone = el.cloneNode(true);
  cleanupDATags(clone);
  convertListsToText(clone);

  const all = clone.querySelectorAll('*');
  const byTag = (names) => Array.from(all).filter((e) => names.includes(e.tagName));
  const hasOtherTags = Array.from(all).some((e) => ['B', 'I', 'U', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'STRONG', 'EM'].includes(e.tagName));

  all.forEach((elem) => {
    Array.from(elem.attributes).forEach((attr) => elem.removeAttribute(attr.name));
  });
  byTag(['SPAN', 'DIV', 'A']).reverse().forEach((tag) => {
    const parent = tag.parentNode;
    if (parent) {
      while (tag.firstChild) parent.insertBefore(tag.firstChild, tag);
      tag.remove();
    }
  });
  const tagReplacements = { STRONG: 'b', EM: 'i' };
  byTag(['STRONG', 'EM']).forEach((elem) => {
    const newEl = document.createElement(tagReplacements[elem.tagName]);
    newEl.innerHTML = elem.innerHTML;
    elem.replaceWith(newEl);
  });
  byTag(['BR']).forEach((br) => {
    if (br.parentElement?.childNodes.length === 1 && br.parentElement.textContent.trim() === '') {
      br.parentElement.remove();
    } else {
      br.replaceWith('\n');
    }
  });

  const pList = byTag(['P']);
  if (!hasOtherTags) {
    pList.forEach((p, index, arr) => {
      const separator = addParagraphBreaks && index < arr.length - 1 ? '\n\n' : '';
      p.replaceWith(document.createTextNode(p.textContent.trim() + separator));
    });
    removeWhitespaceOnlyTextNodes(clone);
    const text = collapseMultipleNewlines(clone.textContent.trim());
    // Collapse 2+ spaces to one per line, but preserve leading spaces (list indent)
    return text.split('\n').map((line) => line.replace(/^(\s*)(.*)$/, (_, lead, rest) => lead + rest.replace(/  +/g, ' '))).join('\n');
  }
  pList.forEach((p, index, arr) => {
    const fragment = document.createDocumentFragment();
    fragment.append(...p.childNodes);
    if (addParagraphBreaks && index < arr.length - 1) {
      fragment.append(document.createTextNode('\n\n'));
    }
    p.replaceWith(fragment);
  });
  const html = collapseMultipleNewlines(normalizeWhitespace(clone.innerHTML.trim()));
  return html.replace(/&amp;/g, '&');
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

function findMatchingSchemaKey(sortedTypes, validationsMap) {
  for (let i = sortedTypes.length; i > 0; i -= 1) {
    const classesToTry = sortedTypes.slice(0, i);
    const schemaKey = buildSchemaKey(classesToTry);
    if (validationsMap[schemaKey]) {
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
