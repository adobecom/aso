import { listMediaAssetFields, listSchemaFields } from './import-export/page-map.js';
import { sanitizeIdPart } from './promo-scope-settings.js';

const DEVICE_LABELS = { apple: 'Apple', google: 'Google' };

const BLOCK_TYPE_CONFIG = {
  listing: {
    scopeCheckboxId: 'export-scope-listing',
    groupsContainerId: 'export-listing-field-groups',
    detailsId: 'export-listing-fields',
    countId: 'export-listing-field-count',
  },
  'images-videos': {
    scopeCheckboxId: 'export-scope-images-videos',
    groupsContainerId: 'export-images-videos-field-groups',
    detailsId: 'export-images-videos-fields',
    countId: 'export-images-videos-field-count',
  },
  // No scopeCheckboxId — Media Assets was never part of "Content to export" (it has no
  // workbook representation at all, see media-collect.js), so its own existence in DA is
  // the gate instead of a checkbox. See setMediaAssetsAvailable/isBlockTypeScopeChecked.
  'media-assets': {
    groupsContainerId: 'export-media-assets-field-groups',
    detailsId: 'export-media-assets-fields',
    countId: 'export-media-assets-field-count',
  },
};

const FIELD_BLOCK_TYPES = Object.keys(BLOCK_TYPE_CONFIG);

let mediaAssetsAvailable = false;
let mediaAssetsFieldKeysByDevice = {};

// Set from export.js once refreshMediaAssetsAvailability resolves — media-assets has no
// scope checkbox of its own, so "does it exist in DA for this scope" stands in for one.
function setMediaAssetsAvailable(available) {
  mediaAssetsAvailable = Boolean(available);
}

// Set alongside setMediaAssetsAvailable, keyed by device, with only the field keys that
// were found to actually have an image/video dropped in on the live page — schema lists every
// slot a block type supports (e.g. 10 screenshot slots), but showing all of them as
// selectable when a release only uses 2 is confusing, so unpopulated ones are filtered out
// entirely rather than just left unchecked.
function setMediaAssetsFieldAvailability(fieldKeysByDevice) {
  mediaAssetsFieldKeysByDevice = fieldKeysByDevice || {};
}

function isBlockTypeScopeChecked(blockType) {
  if (blockType === 'media-assets') return mediaAssetsAvailable;
  return Boolean(document.getElementById(BLOCK_TYPE_CONFIG[blockType].scopeCheckboxId)?.checked);
}

// media-assets fields have no workbook sheet mapping at all (binary assets, not text), so
// they're listed via listMediaAssetFields(schema, device) instead of listSchemaFields, which
// needs a sheetMap that doesn't apply here. Also pruned down to only the fields
// setMediaAssetsFieldAvailability found actually populated for this device — an absent key
// (never probed) means show none, not everything, since that's the safer default.
function listFieldsForBlockType(blockType, schema, sheetMap, device) {
  if (blockType === 'media-assets') {
    const availableKeys = mediaAssetsFieldKeysByDevice[device] || [];
    return listMediaAssetFields(schema, device)
      .filter((field) => availableKeys.includes(field.fieldKey));
  }
  return listSchemaFields(schema, sheetMap, device, blockType);
}

function fieldCheckboxListId(blockType, device) {
  return `field-checkboxes-${blockType}-${device}`;
}

function renderFieldCheckboxesForDevice(blockType, device, fields) {
  const container = document.getElementById(fieldCheckboxListId(blockType, device));
  if (!container) return;

  if (!fields.length) {
    // Media-assets fields are pruned to only what's actually live (see listFieldsForBlockType)
    // — a whole device coming up empty means nothing's been dropped in yet, not an error, so
    // this says so rather than the generic "No fields found" (which reads like something's
    // broken/unsupported for this device).
    const message = blockType === 'media-assets'
      ? 'No screenshots or videos have been added yet.'
      : 'No fields found';
    container.innerHTML = `<p>${message}</p>`;
    return;
  }

  container.innerHTML = fields.map((field) => {
    const id = `field-${blockType}-${device}-${sanitizeIdPart(field.fieldKey)}`;
    return `
      <div class="checkbox-item">
        <input type="checkbox" id="${id}" class="field-scope-checkbox" data-block-type="${blockType}" data-device="${device}" value="${field.fieldKey}">
        <label for="${id}">${field.fieldName}</label>
      </div>
    `;
  }).join('');
}

function renderDeviceBoxesForBlockType(blockType, devices, schema, sheetMap) {
  const container = document.getElementById(BLOCK_TYPE_CONFIG[blockType].groupsContainerId);
  if (!container) return;

  if (!devices.length) {
    container.innerHTML = '<p>Select product and device…</p>';
    return;
  }

  container.innerHTML = devices.map((device) => `
    <div class="promo-device-box" data-device="${device}">
      <h5 class="promo-device-heading">${DEVICE_LABELS[device] || device}</h5>
      <div class="checkbox-group" id="${fieldCheckboxListId(blockType, device)}"></div>
    </div>
  `).join('');

  devices.forEach((device) => {
    const fields = listFieldsForBlockType(blockType, schema, sheetMap, device);
    renderFieldCheckboxesForDevice(blockType, device, fields);
  });
}

function countSelectedFields(blockType) {
  return document.querySelectorAll(`.field-scope-checkbox[data-block-type="${blockType}"]:checked`).length;
}

// Keeps a block type's <details> open/closed in sync with its scope checkbox, and its
// summary badge showing either a live selected-field count or "not included" — called
// after every render and on every individual field-checkbox click.
function updateFieldScopeSummary(blockType) {
  const config = BLOCK_TYPE_CONFIG[blockType];
  const details = document.getElementById(config.detailsId);
  const countEl = document.getElementById(config.countId);
  const scopeChecked = isBlockTypeScopeChecked(blockType);

  const emptyLabel = blockType === 'media-assets' ? '(none found)' : '(not included)';
  if (details) details.open = scopeChecked;
  if (countEl) {
    countEl.textContent = scopeChecked ? `(${countSelectedFields(blockType)} selected)` : emptyLabel;
  }
}

// Fields start unchecked (picking through 50+ boxes to opt out is worse than opting in),
// so this toggle is how users select everything in one block type at once, across every
// rendered device — toggling off again clears the whole block type back to none.
function toggleAllFieldCheckboxes(blockType) {
  const checkboxes = document.querySelectorAll(`.field-scope-checkbox[data-block-type="${blockType}"]`);
  if (!checkboxes.length) return;
  const allChecked = Array.from(checkboxes).every((checkbox) => checkbox.checked);
  checkboxes.forEach((checkbox) => { checkbox.checked = !allChecked; });
  updateFieldScopeSummary(blockType);
}

// Fields come straight from the already-fetched schema — unlike promo names, there's
// nothing to fetch from DA, so this is synchronous and safe to call on every scope change.
function refreshFieldCheckboxesForBlockType(blockType, schema, sheetMap, devices) {
  if (!isBlockTypeScopeChecked(blockType)) {
    const container = document.getElementById(BLOCK_TYPE_CONFIG[blockType].groupsContainerId);
    const message = blockType === 'media-assets'
      ? 'No media assets found for this scope.'
      : 'Not included in this export.';
    if (container) container.innerHTML = `<p>${message}</p>`;
  } else {
    renderDeviceBoxesForBlockType(blockType, devices, schema, sheetMap);
  }
  updateFieldScopeSummary(blockType);
}

// Refreshes every block type at once — callers that only need to update one block type (e.g.
// media-assets, whose availability can change independently of listing/images-videos) should
// use refreshFieldCheckboxesForBlockType instead, since this re-renders all of them from
// scratch and would discard any restrictFieldCheckboxesToFile selection already applied to
// the others in the same call chain.
function refreshFieldCheckboxes(schema, sheetMap, devices) {
  FIELD_BLOCK_TYPES.forEach((blockType) => {
    refreshFieldCheckboxesForBlockType(blockType, schema, sheetMap, devices);
  });
}

// Matches collect.js's matchesSelection contract: a device:blockType key is only present
// once its field-checkbox UI has rendered (listing/images-videos); other block types (e.g.
// promo) are left out entirely, so matchesSelection leaves them unrestricted.
function getSelectedFieldsByDeviceBlock() {
  const result = {};
  document.querySelectorAll('.field-scope-checkbox').forEach((checkbox) => {
    const { blockType, device } = checkbox.dataset;
    const key = `${device}:${blockType}`;
    if (!result[key]) result[key] = [];
    if (checkbox.checked) result[key].push(checkbox.value);
  });
  return result;
}

// Restricts the (already-rendered, all-checked-by-default) field checkboxes down to only
// the fields that actually had content in the uploaded file, for the given device/blockType.
function restrictFieldCheckboxesToFile(blockType, device, populatedFieldKeys) {
  const container = document.getElementById(fieldCheckboxListId(blockType, device));
  if (!container) return;
  container.querySelectorAll('.field-scope-checkbox').forEach((checkbox) => {
    checkbox.checked = populatedFieldKeys.includes(checkbox.value);
  });
  updateFieldScopeSummary(blockType);
}

let initialized = false;

// Field checkboxes (and the Select All buttons) are re-rendered/re-queried into the DOM
// later (after schema/devices are known), so this listens via delegation rather than
// attaching directly, matching initPromoScope's pattern for the same reason. Guarded so a
// second call (e.g. a test re-entering this module) doesn't stack a second toggling
// listener, which would flip Select All's checked state back and forth per click.
function initFieldScope() {
  if (initialized) return;
  initialized = true;
  document.addEventListener('change', (event) => {
    const { blockType } = event.target?.dataset || {};
    if (event.target?.classList?.contains('field-scope-checkbox')) {
      updateFieldScopeSummary(blockType);
    }
  });
  document.addEventListener('click', (event) => {
    if (event.target?.classList?.contains('field-scope-select-all')) {
      // The button lives inside <summary> (to sit inline with the heading, like the
      // Languages section) — without this, clicking it would also toggle the <details>
      // open/closed via summary's native activation behavior.
      event.preventDefault();
      toggleAllFieldCheckboxes(event.target.dataset.blockType);
    }
  });
}

export {
  FIELD_BLOCK_TYPES,
  getSelectedFieldsByDeviceBlock,
  initFieldScope,
  refreshFieldCheckboxes,
  refreshFieldCheckboxesForBlockType,
  restrictFieldCheckboxesToFile,
  setMediaAssetsAvailable,
  setMediaAssetsFieldAvailability,
  toggleAllFieldCheckboxes,
  updateFieldScopeSummary,
};
