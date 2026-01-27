import DA_SDK from 'https://da.live/nx/utils/sdk.js';
import { authFetch, fetchLanguages } from '../utils.js';
import { fetchHTML, parseHTML } from './utils.js';

const displayMessage = (type, message) => {
  document.getElementById(`${type}-message`).innerHTML = message;
  document.getElementById(`${type}-section`).classList.remove('hidden');
};
const hideMessages = () => {
  document.getElementById('status-section').classList.add('hidden');
  document.getElementById('error-section').classList.add('hidden');
};

async function fetchBlockSchema(org, repo, token) {
  return authFetch(
    `https://admin.da.live/source/${org}/${repo}/.da/block-schema.json`,
    token,
    'block-schema',
  );
}
async function fetchPageHTML(org, repo, path, token) {
  const htmlPath = path.endsWith('.html') ? path : `${path}.html`;
  const url = `https://admin.da.live/source/${org}/${repo}${htmlPath}`;
  return fetchHTML(url, token, 'page HTML', true);
}
async function fetchExistingKeywords(org, repo, keywordsPath, token) {
  return authFetch(
    `https://admin.da.live/source/${org}/${repo}${keywordsPath}`,
    token,
    'existing keywords',
    'json',
    true
  );
}

function formatBlockKey(blockKey) {
  const match = blockKey.match(/^([^(]+)\s*\(([^)]+)\)$/);
  if (!match) {
    const trimmed = blockKey.trim();
    return { formattedKey: trimmed, classes: [trimmed] };
  }
  const [, blockName, variants] = match;
  const sortedVariants = variants.split(',').map((v) => v.trim()).sort();
  const formattedKey = `${blockName.trim()} (${sortedVariants.join(', ')})`;
  const classes = [blockName.trim(), ...sortedVariants];
  return { formattedKey, classes };
}

function getKeywordEnabledBlocks(schema) {
  if (!schema) return {};
  const keywordBlocks = {};
  Object.keys(schema).forEach((blockKey) => {
    if (blockKey.startsWith(':')) return;
    const blockData = schema[blockKey]?.data;
    if (!Array.isArray(blockData)) return;
    const fields = blockData
      .filter((field) => field['keywords injection']?.toString().toLowerCase() === 'yes')
      .map((field) => field['field name']);
    if (fields.length > 0) {
      const formatted = formatBlockKey(blockKey);
      if (!formatted) return;
      const { formattedKey, classes } = formatted;
      const selector = classes.map((cls) => `.${cls}`).join('');
      keywordBlocks[formattedKey] = { fields, selector };
    }
  });
  return keywordBlocks;
}
function findBlocksOnPage(doc, keywordBlocks) {
  const blocksFound = [];
  Object.entries(keywordBlocks).forEach(([blockKey, { fields, selector }]) => {
    const elements = doc.querySelectorAll(selector);
    elements.forEach((el, index) => {
      blocksFound.push({ blockIdentifier: `${blockKey} (${index + 1})`, fields });
    });
  });
  return blocksFound;
}

function buildKeywordsJSON(blocksFound, languages) {
  const json = {};
  const names = [];
  blocksFound.forEach(({ blockIdentifier, fields }) => {
    names.push(blockIdentifier);
    const data = languages.map((lang) => {
      const entry = { language: lang.label };
      fields.forEach((fieldName) => {
        entry[fieldName] = '';
      });
      return entry;
    });
    const total = languages.length;
    json[blockIdentifier] = {
      total,
      offset: 0,
      limit: total,
      data,
    };
  });
  json[':names'] = names;
  json[':type'] = 'multi-sheet';
  return json;
}
function mergeKeywordsJSON(newJSON, existingJSON) {
  if (!existingJSON) return { json: newJSON, orphanedBlocks: [] };
  const merged = { ...existingJSON };
  const allNames = new Set(existingJSON[':names'] || []);
  const newBlockKeys = new Set(Object.keys(newJSON).filter((k) => !k.startsWith(':')));
  const orphanedBlocks = [];
  Object.keys(merged).forEach((key) => {
    if (key.startsWith(':')) return;
    if (!newBlockKeys.has(key)) {
      orphanedBlocks.push(key);
    }
  });
  Object.keys(newJSON).forEach((key) => {
    if (key.startsWith(':')) return;
    if (!merged[key]) {
      merged[key] = newJSON[key];
      allNames.add(key);
    } else {
      const newFields = newJSON[key].data[0];
      const existingData = merged[key].data;
      existingData.forEach((row) => {
        Object.keys(newFields).forEach((fieldName) => {
          if (!(fieldName in row)) {
            row[fieldName] = '';
          }
        });
      });
      merged[key].total = existingData.length;
      merged[key].offset = 0;
      merged[key].limit = existingData.length;
    }
  });
  merged[':names'] = Array.from(allNames);
  merged[':type'] = 'multi-sheet';
  return { json: merged, orphanedBlocks };
}

async function saveKeywordsJSON(org, repo, keywordsPath, json, token) {
  try {
    const jsonString = JSON.stringify(json);
    const formData = new FormData();
    const blob = new Blob([jsonString], { type: 'application/json' });
    formData.append('data', blob);
    const resp = await fetch(`https://admin.da.live/source/${org}/${repo}${keywordsPath}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    if (!resp.ok) {
      const errorText = await resp.text();
      console.error('Failed to save keywords:', resp.status, errorText);
      return false;
    }
    return true;
  } catch (error) {
    console.error('Error saving keywords:', error);
    return false;
  }
}

async function handleGenerate() {
  const button = document.getElementById('generate-button');
  button.disabled = true;
  hideMessages();
  displayMessage('status', 'Fetching keywords...');
  try {
    const { context, token } = await DA_SDK;
    const { org, repo, path } = context;
    const schema = await fetchBlockSchema(org, repo, token);
    if (!schema) {
      displayMessage('error', 'Failed to load block schema.');
      button.disabled = false;
      return;
    }
    const keywordBlocks = getKeywordEnabledBlocks(schema);
    if (Object.keys(keywordBlocks).length === 0) {
      displayMessage('error', 'No blocks require keywords.');
      button.disabled = false;
      return;
    }
    const html = await fetchPageHTML(org, repo, path, token);
    if (!html) {
      displayMessage('error', 'Failed to load page content.');
      button.disabled = false;
      return;
    }
    const doc = parseHTML(html);
    const blocksFound = findBlocksOnPage(doc, keywordBlocks);
    if (blocksFound.length === 0) {
      displayMessage('error', 'No keyword blocks found on page.');
      button.disabled = false;
      return;
    }
    const languages = await fetchLanguages({ context, token });
    if (languages.length === 0) {
      displayMessage('error', 'Failed to load languages.');
      button.disabled = false;
      return;
    }
    const newJSON = buildKeywordsJSON(blocksFound, languages);
    const keywordsPath = `${path.replace(/\.[^.]+$/, '')}-keywords.json`;
    const existingJSON = await fetchExistingKeywords(org, repo, keywordsPath, token);
    const { json: finalJSON, orphanedBlocks } = mergeKeywordsJSON(newJSON, existingJSON);
    const saved = await saveKeywordsJSON(org, repo, keywordsPath, finalJSON, token);
    if (!saved) {
      displayMessage('error', 'Failed to save keywords file.');
      button.disabled = false;
      return;
    }
    const sheetPath = keywordsPath.replace(/\.json$/, '');
    window.open(`https://da.live/sheet#/${org}/${repo}${sheetPath}`, '_blank');
    hideMessages();
    let statusMsg = 'Opened keyword file in new tab';
    if (orphanedBlocks.length > 0) {
      const blockList = orphanedBlocks.join('<br/>');
      statusMsg = `Opened keyword file in new tab.<br/> Blocks in keyword file but not on page:<br/>${blockList}`;
    }
    displayMessage('status', statusMsg);
    button.disabled = false;
  } catch (error) {
    console.error('Error generating keywords:', error);
    displayMessage('error', 'Unexpected error. Contact admin.');
    button.disabled = false;
  }
}

(function init() {
  document.getElementById('generate-button').addEventListener('click', handleGenerate);
}());
