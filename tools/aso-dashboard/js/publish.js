import { STORE_TYPE_UPDATES } from './store-scope-settings.js';
import { collectExportData } from './import-export/collect.js';
import { putJsonSource } from './lib/da-source-client.js';
import { getRelativeProductsPath } from './lib/utils.js';

export const PUBLISH_REQUEST_PATH = '/.da/storepublish/request';

const PUBLISH_SERVICE_URL = 'https://14257-asopublisher-develop.adobeioruntime.net/api/v1/web/aso-publisher/publish-to-appstore';
const PUBLISH_LOG_URL = 'https://14257-asopublisher-develop.adobeioruntime.net/api/v1/web/aso-publisher/get-publish-log';
const PUBLISH_POLL_INTERVAL_MS = 10000;
const PUBLISH_POLL_TIMEOUT_MS = 60000;

const PUBLISH_BLOCK_TYPES = ['listing', 'promo'];

const pad = (value, length = 2) => String(value).padStart(length, '0');

// Publish request filename: YYYY-MM-DD-t-HH-MI-SS-SSS (24-hour clock, UTC).
export function formatPublishTimestamp(date = new Date()) {
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    't',
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
    pad(date.getUTCMilliseconds(), 3),
  ].join('-');
}

function fieldValue(cellIndex, langCode, device, blockType, fieldKey, promoName) {
  return cellIndex.get(`${langCode}|${device}|${blockType}|${fieldKey}|${promoName ?? ''}`) ?? '';
}

function buildLocalization(cellIndex, langCode, device, blockType, fieldKeys, promoName) {
  const loc = { locale: langCode };
  fieldKeys.forEach((key) => {
    const val = fieldValue(cellIndex, langCode, device, blockType, key, promoName);
    if (val) loc[key] = val;
  });
  return Object.keys(loc).length > 1 ? loc : null;
}

function omitEmptyContainers(value) {
  if (Array.isArray(value)) {
    const items = value.map(omitEmptyContainers).filter((item) => item !== undefined);
    return items.length ? items : undefined;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value)
      .map(([key, entry]) => [key, omitEmptyContainers(entry)])
      .filter(([, entry]) => entry !== undefined);
    return entries.length ? Object.fromEntries(entries) : undefined;
  }
  return value;
}

export function buildPublishPayload(cells, options) {
  const {
    product,
    platform,
    languages,
    promoNames = [],
    blockTypes = PUBLISH_BLOCK_TYPES,
  } = options;
  const cellIndex = new Map();
  cells.forEach((cell) => {
    const key = `${cell.language.code}|${cell.device}|${cell.blockType}|${cell.fieldKey}|${cell.promoName ?? ''}`;
    if (!cellIndex.has(key) || cell.hasHtml) cellIndex.set(key, cell.text);
  });

  const langCodes = languages.map((l) => l.code);

  if (platform === 'apple') {
    const listingFields = ['name', 'subtitle', 'description', 'keywords', 'marketingUrl', 'promotionalText', 'supportUrl'];
    const payload = { app: product, selectedLocales: langCodes };
    if (blockTypes.includes('listing')) {
      payload.metadata = { localizations: langCodes.map((code) => buildLocalization(cellIndex, code, 'apple', 'listing', listingFields)).filter(Boolean) };
    }

    if (blockTypes.includes('promo') && promoNames.length) {
      const promoFields = ['eventName', 'shortDescription', 'longDescription'];
      payload.promos = promoNames.map((promoName) => ({
        referenceName: promoName,
        localizations: langCodes.map((code) => buildLocalization(cellIndex, code, 'apple', 'promo', promoFields, promoName)).filter(Boolean),
      }));
    }

    return omitEmptyContainers(payload);
  }

  // Google
  const googleFields = ['title', 'shortDescription', 'fullDescription'];
  const payload = {
    app: product,
    platform: 'google',
    selectedLocales: langCodes,
  };
  if (blockTypes.includes('listing')) {
    payload.metadata = { localizations: langCodes.map((code) => buildLocalization(cellIndex, code, 'google', 'listing', googleFields)).filter(Boolean) };
  }
  return omitEmptyContainers(payload);
}

async function readPublishServiceResponse(response, reference) {
  const responseBody = await response.text();
  let serviceResult;
  try {
    serviceResult = JSON.parse(responseBody);
  } catch (error) {
    const reason = response.ok ? 'returned invalid JSON' : 'failed';
    throw new Error(`Publish service ${reason} (${response.status} ${response.statusText}): ${responseBody || error.message}. ${reference}`);
  }

  const serviceError = typeof serviceResult?.error === 'string' ? serviceResult.error.trim() : '';
  if (!response.ok || serviceError) {
    const activationId = typeof serviceResult?.activationId === 'string'
      ? serviceResult.activationId.trim() : '';
    const activation = activationId ? ` Activation ID: ${activationId}.` : '';
    throw new Error(`Publish service failed (${response.status} ${response.statusText}): ${serviceError || responseBody}.${activation} ${reference}`);
  }
  return serviceResult;
}

export function createPublishProgressModal(button) {
  const modal = document.createElement('dialog');
  modal.className = 'publish-progress-modal';
  modal.setAttribute('aria-labelledby', 'publish-progress-title');
  modal.setAttribute('aria-describedby', 'publish-progress-message publish-progress-reference');
  const title = document.createElement('h2');
  title.id = 'publish-progress-title';
  title.textContent = 'Starting to Publish...';
  const reference = document.createElement('p');
  reference.id = 'publish-progress-reference';
  reference.className = 'publish-progress-reference';
  reference.hidden = true;
  const message = document.createElement('p');
  message.id = 'publish-progress-message';
  message.className = 'publish-progress-message';
  message.setAttribute('role', 'status');
  message.textContent = 'Preparing publish request...';
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'publish-progress-close';
  closeButton.textContent = '\u00d7';
  closeButton.setAttribute('aria-label', 'Close');
  closeButton.hidden = true;
  closeButton.disabled = true;
  let finished = false;
  modal.append(title, message, reference, closeButton);
  const close = () => {
    if (modal.open) modal.close();
    modal.remove();
  };
  closeButton.addEventListener('click', () => {
    if (finished) close();
  });
  modal.addEventListener('cancel', (event) => {
    event.preventDefault();
    if (finished) close();
  });
  modal.addEventListener('close', () => modal.remove());

  const wasDisabled = button.disabled;
  document.body.append(modal);
  try {
    modal.showModal();
  } catch (error) {
    modal.remove();
    throw error;
  }
  button.disabled = true;

  return {
    close,
    setRequestId(requestId) {
      title.textContent = 'Publishing in progress';
      reference.textContent = `Request ID: ${requestId}`;
      reference.hidden = false;
      message.textContent = 'Waiting for publish completion...';
    },
    finish(titleText, messageText, isError = false) {
      finished = true;
      title.textContent = titleText;
      message.setAttribute('role', isError ? 'alert' : 'status');
      message.textContent = messageText;
      closeButton.hidden = false;
      closeButton.disabled = false;
      button.disabled = wasDisabled;
    },
  };
}

export async function waitForPublishCompletion({ requestId, token }) {
  const controller = new AbortController();
  const deadline = Date.now() + PUBLISH_POLL_TIMEOUT_MS;
  const timeout = window.setTimeout(() => controller.abort(), PUBLISH_POLL_TIMEOUT_MS);
  let overallStatus = 'pending';
  try {
    while (Date.now() < deadline) {
      // eslint-disable-next-line no-await-in-loop
      const response = await fetch(`${PUBLISH_LOG_URL}?requestId=${encodeURIComponent(requestId)}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      // eslint-disable-next-line no-await-in-loop
      const log = await readPublishServiceResponse(response, `Request ID: ${requestId}`);
      if (controller.signal.aborted) break;
      if (typeof log?.overallStatus !== 'string' || !log.overallStatus.trim()) {
        throw new Error(`Publish log response is missing a valid overallStatus. Request ID: ${requestId}`);
      }
      overallStatus = log.overallStatus.trim().toLowerCase();
      if (overallStatus === 'success') return { overallStatus, timedOut: false };
      if (['failed', 'failure', 'error'].includes(overallStatus)) {
        throw new Error(`Publish failed (${overallStatus}). Request ID: ${requestId}`);
      }
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => {
        window.setTimeout(resolve, Math.min(PUBLISH_POLL_INTERVAL_MS, deadline - Date.now()));
      });
    }
    return { overallStatus, timedOut: true };
  } catch (error) {
    if (controller.signal.aborted && error.name === 'AbortError') {
      return { overallStatus, timedOut: true };
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

// Saves and submits a publish payload for a single product/platform, then records the
// service request ID and status. Shares the Export tab's product/language/device/release-period
// "Content to publish" filters (block types, selected promos/variants, per-field selection),
// plus the DA fetch plumbing — callers (export.js) pass in an already-authenticated fetchPage.
export async function publishSelection({
  org,
  repo,
  token,
  schema,
  sheetMap,
  product,
  platform,
  languages,
  releasePeriod,
  fetchPage,
  blockTypes = PUBLISH_BLOCK_TYPES,
  promoContexts = [],
  selection = {},
  now = new Date(),
  onRequestAccepted,
}) {
  const platformPromoContexts = promoContexts.filter(
    (context) => !context.device || context.device === platform,
  );
  const effectiveBlockTypes = blockTypes.filter(
    (blockType) => PUBLISH_BLOCK_TYPES.includes(blockType)
      && (blockType !== 'promo' || platformPromoContexts.length),
  );
  const promoNames = effectiveBlockTypes.includes('promo')
    ? [...new Set(platformPromoContexts.map((context) => context.promoName))]
    : [];

  const { cells } = await collectExportData({
    org,
    repo,
    token,
    schema,
    sheetMap,
    products: [product],
    languages,
    devices: [platform],
    year: releasePeriod.year,
    quarter: releasePeriod.quarter,
    month: releasePeriod.month,
    productsPath: getRelativeProductsPath(),
    storeType: STORE_TYPE_UPDATES,
    blockTypes: effectiveBlockTypes,
    promoContexts: platformPromoContexts,
    selection: {
      ...selection,
      blockTypes: effectiveBlockTypes,
      promoContexts: platformPromoContexts,
    },
    rowRoles: ['localized'],
    fetchPage,
  });

  const payload = buildPublishPayload(cells, {
    product,
    platform,
    languages,
    promoNames,
    blockTypes: effectiveBlockTypes,
  });

  const filePath = `${PUBLISH_REQUEST_PATH}/${formatPublishTimestamp(now)}.json`;
  const result = await putJsonSource(org, repo, filePath, payload, token);
  if (!result.ok) {
    return { ok: false, status: result.status, statusText: result.statusText, filePath };
  }

  const response = await fetch(PUBLISH_SERVICE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ daPayloadPath: filePath.slice(1) }),
  });
  const serviceResult = await readPublishServiceResponse(response, `Request file: ${filePath}`);
  const requestId = serviceResult?.requestId;
  const status = serviceResult?.status;
  if (typeof requestId !== 'string' || !requestId.trim()
    || typeof status !== 'string' || !status.trim()) {
    throw new Error(`Publish service response is missing a valid requestId or status. Request file: ${filePath}`);
  }
  onRequestAccepted?.(requestId);

  const updatedPayload = { ...payload, requestId, status };
  let updateResult;
  try {
    updateResult = await putJsonSource(org, repo, filePath, updatedPayload, token);
  } catch (error) {
    throw new Error(`Publish request ${requestId} was accepted (${status}), but updating ${filePath} failed: ${error.message}`);
  }
  if (!updateResult.ok) {
    throw new Error(`Publish request ${requestId} was accepted (${status}), but updating ${filePath} failed (${updateResult.status} ${updateResult.statusText || 'write failed'}).`);
  }

  return {
    ok: true,
    status: updateResult.status,
    filePath,
    requestId,
    publishStatus: status,
  };
}
