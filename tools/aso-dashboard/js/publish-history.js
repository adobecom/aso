import { getSourceText } from './lib/da-source-client.js';
import { fetchLanguages, getConfigFileOverride } from './lib/utils.js';

export const PUBLISH_LOGS_URL = 'https://14257-asopublisher-develop.adobeioruntime.net/api/v1/web/aso-publisher/list-publish-logs';
export const NO_ERROR_DETAILS = 'No error details recorded.';
export const SOURCE_DISCLAIMER = 'Current source JSON\u2014not an archived snapshot.';
export const MAX_VISIBLE_CHIPS = 3;

export const SECTION_COLUMNS = [
  { key: 'metadata', label: 'Metadata' },
  { key: 'promos', label: 'Promos/In-App Events' },
  { key: 'cpp', label: 'Custom Product Pages' },
];

const SECTION_TYPE_MAP = {
  metadata: 'metadata',
  localizations: 'metadata',
  promos: 'promos',
  cpp: 'cpp',
};

const STATUS_META = {
  success: { label: 'Success', hasErrors: false },
  partial: { label: 'Partial', hasErrors: true, title: 'Publish partially failed' },
  failed: { label: 'Failed', hasErrors: true, title: 'Publish failed' },
  queued: { label: 'Queued', hasErrors: false },
  in_progress: { label: 'In progress', hasErrors: false },
  invoke_failed: { label: 'Invoke failed', hasErrors: true, title: 'Publish could not be started' },
};

export const STATUS_OPTIONS = Object.keys(STATUS_META);

const SOURCE_PATH_PATTERN = /^\/?\.da\/storepublish\/request\/[A-Za-z0-9._-]+\.json$/;

// ---------- Pure data helpers ----------

export function normalizeStatus(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function getStatusMeta(value) {
  const key = normalizeStatus(value);
  if (STATUS_META[key]) return { key, ...STATUS_META[key], known: true };
  return { key, label: String(value ?? '').trim() || 'Unknown', hasErrors: false, known: false };
}

const cleanMessage = (message) => (typeof message === 'string' ? message.trim() : '');

export function collectOverallErrors(item) {
  const messages = [];
  const summary = item?.responseSummary?.errorMessage;
  (Array.isArray(summary) ? summary : [summary]).forEach((m) => messages.push(cleanMessage(m)));
  (item?.response?.sections ?? []).forEach((section) => {
    (Array.isArray(section?.failure) ? section.failure : [])
      .forEach((f) => messages.push(cleanMessage(f?.error)));
  });
  return [...new Set(messages.filter(Boolean))];
}

// Locales chosen at publish time, including those absent from the section results.
export function getSelectedLocales(item) {
  const list = item?.selectedLocales ?? item?.request?.selectedLocales;
  if (!Array.isArray(list)) return [];
  const names = list.map((l) => String(l ?? '').trim()).filter(Boolean);
  return [...new Set(names)];
}

// Order failures, successes, pending and unreported locales; absent sections stay undefined.
export function mapSections(item) {
  const columns = {};
  const sections = Array.isArray(item?.response?.sections) ? item.response.sections : [];
  sections.forEach((section) => {
    const column = SECTION_TYPE_MAP[String(section?.type ?? '').trim().toLowerCase()];
    if (!column) return;
    const chips = columns[column] || (columns[column] = []);
    const add = (locale, status, error) => {
      const name = String(locale ?? '').trim();
      if (!name || chips.some((c) => c.locale === name && c.status === status)) return;
      chips.push({ locale: name, status, error: cleanMessage(error), section: column });
    };
    (section.success ?? []).forEach((l) => add(l, 'success'));
    (section.failure ?? []).forEach((f) => add(f?.locale, 'failed', f?.error));
    (section.pending ?? []).forEach((l) => add(l, 'pending'));
  });
  const selected = getSelectedLocales(item);
  const statusOrder = ['failed', 'success', 'pending', 'missing'];
  Object.entries(columns).forEach(([column, chips]) => {
    const seen = new Set(chips.map((c) => c.locale.toLowerCase()));
    selected.filter((l) => !seen.has(l.toLowerCase())).forEach((locale) => {
      chips.push({ locale, status: 'missing', error: '', section: column });
    });
    chips.sort((a, b) => statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status));
  });
  return columns;
}

export function isValidSourcePath(path) {
  return typeof path === 'string' && SOURCE_PATH_PATTERN.test(path.trim())
    && !path.includes('..');
}

const DATE_FORMAT = { year: 'numeric', month: 'short', day: 'numeric' };
const TIME_FORMAT = { hour: 'numeric', minute: '2-digit', second: '2-digit' };

const TIMESTAMP_FORMAT = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
};

export function formatTimestampParts(value, locale) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return { date: String(value ?? '\u2014'), time: '' };
  return {
    date: new Intl.DateTimeFormat(locale, DATE_FORMAT).format(date),
    time: new Intl.DateTimeFormat(locale, TIME_FORMAT).format(date),
  };
}

export function formatTimestamp(value, locale) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return String(value ?? '\u2014');
  return new Intl.DateTimeFormat(locale, TIMESTAMP_FORMAT).format(date);
}

export function mergeItems(existing, incoming) {
  const seen = new Set(existing.map((i) => i.requestId));
  const merged = [...existing];
  incoming.forEach((item) => {
    if (!item?.requestId || seen.has(item.requestId)) return;
    seen.add(item.requestId);
    merged.push(item);
  });
  return merged;
}

export function applyFilters(items, filters = {}) {
  const { app, platform, status } = filters;
  return items.filter((item) => {
    if (app && item.app !== app) return false;
    if (platform && item.platform !== platform) return false;
    if (status && normalizeStatus(item.overallStatus) !== status) return false;
    return true;
  });
}

const CURSOR_KEYS = ['nextCursor', 'cursor', 'nextToken', 'nextPageToken', 'lastEvaluatedKey'];

// Cursor may be a string or a structured key (e.g. a DynamoDB key); objects go back as JSON.
export function extractNextCursor(data) {
  const body = data?.pagination || data?.meta || {};
  const value = [data, body]
    .flatMap((src) => CURSOR_KEYS.map((key) => src?.[key]))
    .find((v) => v !== undefined && v !== null && v !== '');
  if (value === undefined) return null;
  return typeof value === 'string' ? value : JSON.stringify(value);
}

export async function fetchPublishLogs({
  token, cursor, signal, byMe = true, app, platform, status,
} = {}) {
  const url = new URL(PUBLISH_LOGS_URL);
  url.searchParams.set('byMe', String(byMe));
  Object.entries({ app, platform, status }).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value);
  });
  if (cursor) url.searchParams.set('cursor', cursor);
  const resp = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });
  if (resp.status === 401) throw new Error('Authentication failed (401). Check your IMS token.');
  if (!resp.ok) throw new Error(`Failed to load publish results: HTTP ${resp.status}`);
  let data;
  try {
    data = await resp.json();
  } catch {
    throw new Error('Publish results response was not valid JSON.');
  }
  if (!Array.isArray(data?.items)) throw new Error('Publish results response is missing "items".');
  return { items: data.items, nextCursor: extractNextCursor(data) };
}

// Only paths under the publish request folder are fetched, always through the DA source client.
export async function fetchSourceJson({ org, repo, path, token }) {
  if (!isValidSourcePath(path)) throw new Error('Source path is not a valid publish request path.');
  const text = await getSourceText(org, repo, path.trim(), token);
  if (text === null) throw new Error('Source file was not found (it may have been deleted).');
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    throw new Error('Source file is not valid JSON.');
  }
}

async function loadSelectedLocales(items, context) {
  const results = [];
  for (let start = 0; start < items.length; start += 5) {
    // Bound DA reads when a history page omits the original language selections.
    // eslint-disable-next-line no-await-in-loop
    const batch = await Promise.allSettled(items.slice(start, start + 5).map(async (item) => {
      if (Array.isArray(item.selectedLocales) || Array.isArray(item.request?.selectedLocales)
        || !item.daPayloadPath) return item;
      const source = JSON.parse(await fetchSourceJson({ ...context, path: item.daPayloadPath }));
      // Older requests predate selectedLocales and cannot supply missing-language pills.
      if (source && typeof source === 'object' && !Object.hasOwn(source, 'selectedLocales')) {
        return item;
      }
      if (!Array.isArray(source?.selectedLocales)) {
        throw new Error('Source JSON does not record selectedLocales.');
      }
      return { ...item, selectedLocales: getSelectedLocales(source) };
    }));
    results.push(...batch);
  }
  return {
    items: results.map((result, index) => (result.status === 'fulfilled'
      ? result.value : items[index])),
    errors: results.flatMap((result, index) => (result.status === 'rejected'
      ? [`${items[index].requestId || items[index].daPayloadPath}: ${result.reason.message}`] : [])),
  };
}

// ---------- DOM helpers ----------

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

async function copyText(text, button) {
  const original = button.textContent;
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = 'Copied';
  } catch {
    button.textContent = 'Copy failed';
  }
  window.setTimeout(() => { button.textContent = original; }, 1500);
}

let popoverCounter = 0;
let activePopover = null;

export function closePopover() {
  if (!activePopover) return;
  const { node, anchor } = activePopover;
  activePopover = null;
  node.remove();
  anchor.setAttribute('aria-expanded', 'false');
  anchor.focus();
}

function positionPopover(node, anchor) {
  const rect = anchor.getBoundingClientRect();
  const width = Math.min(360, window.innerWidth - 16);
  node.style.width = `${width}px`;
  node.style.top = `${rect.bottom + window.scrollY + 6}px`;
  node.style.left = `${Math.max(8, Math.min(rect.left + window.scrollX, window.scrollX + window.innerWidth - width - 8))}px`;
}

// Opens a single shared popover; clicking the same anchor again closes it.
export function openPopover(anchor, title, lines) {
  const same = activePopover?.anchor === anchor;
  closePopover();
  if (same) return null;
  popoverCounter += 1;
  const node = el('div', 'ph-popover');
  node.id = `ph-popover-${popoverCounter}`;
  node.setAttribute('role', 'dialog');
  node.setAttribute('aria-label', title);
  node.tabIndex = -1;
  node.append(el('p', 'ph-popover-title', title));
  lines.forEach((line) => {
    if (typeof line === 'string') node.append(el('p', 'ph-popover-text', line));
    else node.append(el('p', 'ph-popover-meta', `${line.label}: ${line.value}`));
  });
  document.body.append(node);
  positionPopover(node, anchor);
  anchor.setAttribute('aria-expanded', 'true');
  anchor.setAttribute('aria-controls', node.id);
  activePopover = { node, anchor };
  node.focus();
  return node;
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && activePopover) closePopover();
});
document.addEventListener('click', (e) => {
  if (!activePopover) return;
  if (activePopover.node.contains(e.target) || activePopover.anchor.contains(e.target)) return;
  const { node, anchor } = activePopover;
  activePopover = null;
  node.remove();
  anchor.setAttribute('aria-expanded', 'false');
});

let tooltipNode = null;
function showTooltip(anchor, text) {
  if (!tooltipNode) {
    tooltipNode = el('div', 'ph-tooltip');
    tooltipNode.setAttribute('role', 'tooltip');
    tooltipNode.id = 'ph-tooltip';
  }
  tooltipNode.textContent = text;
  document.body.append(tooltipNode);
  positionPopover(tooltipNode, anchor);
  anchor.setAttribute('aria-describedby', tooltipNode.id);
}
function hideTooltip(anchor) {
  tooltipNode?.remove();
  anchor.removeAttribute('aria-describedby');
}
function attachTooltip(anchor, text) {
  anchor.addEventListener('mouseenter', () => showTooltip(anchor, text));
  anchor.addEventListener('focus', () => showTooltip(anchor, text));
  anchor.addEventListener('mouseleave', () => hideTooltip(anchor));
  anchor.addEventListener('blur', () => hideTooltip(anchor));
}

// ---------- Renderers ----------

const CHIP_ICONS = { success: '\u2713', failed: '\u2715', pending: '\u23F1', missing: '\u2212' };
const CHIP_LABELS = {
  success: 'Passed',
  failed: 'Failed',
  pending: 'Pending',
  missing: 'No result recorded',
};

export function renderChip(chip, sectionLabel, languageNames = new Map()) {
  const languageName = languageNames.get(chip.locale.toLowerCase()) || chip.locale;
  const localeLabel = languageName === chip.locale ? chip.locale : `${languageName} (${chip.locale})`;
  const label = `${sectionLabel} ${localeLabel}: ${CHIP_LABELS[chip.status]}`;
  const icon = el('span', 'ph-chip-icon', CHIP_ICONS[chip.status]);
  icon.setAttribute('aria-hidden', 'true');
  const text = el('span', 'ph-chip-locale', languageName);
  if (chip.status === 'failed') {
    const button = el('button', 'ph-chip ph-chip-failed');
    button.type = 'button';
    button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-label', `${label}. Show error`);
    button.title = `${CHIP_LABELS[chip.status]} (${chip.locale})`;
    button.append(icon, text);
    button.addEventListener('click', () => openPopover(button, `${sectionLabel} \u2013 ${localeLabel}`, [
      { label: 'Section', value: sectionLabel },
      { label: 'Locale', value: localeLabel },
      { label: 'Status', value: 'Failed' },
      chip.error || NO_ERROR_DETAILS,
    ]));
    return button;
  }
  const span = el('span', `ph-chip ph-chip-${chip.status}`);
  span.tabIndex = 0;
  span.setAttribute('role', 'img');
  span.setAttribute('aria-label', label);
  span.title = `${CHIP_LABELS[chip.status]} (${chip.locale})`;
  span.append(icon, text);
  return span;
}

export function renderSectionCell(item, column, languageNames) {
  const cell = el('div', 'ph-section-cell');
  const chips = mapSections(item)[column.key];
  if (!chips?.length) {
    const none = el('span', 'ph-none', '\u2014');
    none.setAttribute('aria-label', 'Not requested');
    none.title = 'Not requested';
    cell.append(none);
    return cell;
  }
  const list = el('div', 'ph-chips');
  chips.slice(0, MAX_VISIBLE_CHIPS)
    .forEach((c) => list.append(renderChip(c, column.label, languageNames)));
  const hidden = chips.slice(MAX_VISIBLE_CHIPS);
  if (hidden.length) {
    const more = el('button', 'ph-more', `+${hidden.length} more`);
    more.type = 'button';
    more.setAttribute('aria-expanded', 'false');
    more.addEventListener('click', () => {
      hidden.forEach((c) => list.append(renderChip(c, column.label, languageNames)));
      more.remove();
    });
    list.append(more);
  }
  cell.append(list);
  return cell;
}

export function renderStatusBadge(item) {
  const meta = getStatusMeta(item.overallStatus);
  const wrap = el('span', 'ph-status-wrap');
  const badge = el('span', `ph-badge ph-badge-${meta.known ? meta.key : 'unknown'}`, meta.label);
  wrap.append(badge);
  if (meta.hasErrors) {
    const errors = collectOverallErrors(item);
    const lines = errors.length ? errors : [NO_ERROR_DETAILS];
    const info = el('button', 'ph-info');
    info.type = 'button';
    info.textContent = '\u24D8';
    info.setAttribute('aria-label', `${meta.label}: show error details`);
    info.setAttribute('aria-haspopup', 'dialog');
    info.setAttribute('aria-expanded', 'false');
    const preview = lines[0].length > 120 ? `${lines[0].slice(0, 117)}...` : lines[0];
    attachTooltip(info, lines.length > 1 ? `${preview} (+${lines.length - 1} more)` : preview);
    info.addEventListener('click', () => {
      hideTooltip(info);
      openPopover(info, meta.title, lines);
    });
    wrap.append(info);
  }
  return wrap;
}

export function renderTime(value) {
  const parts = formatTimestampParts(value);
  const time = el('time', 'ph-time');
  time.append(el('span', 'ph-time-date', parts.date));
  if (parts.time) time.append(el('span', 'ph-time-clock', parts.time));
  time.dateTime = String(value ?? '');
  time.title = `Shown in your local time. Original: ${value ?? '\u2014'}`;
  return time;
}

export function renderRequestCell(item, { onViewJson } = {}) {
  const cell = el('div', 'ph-request-cell');
  const details = el('details', 'ph-details');
  const summary = el('summary', 'ph-request-toggle');
  summary.setAttribute('aria-label', `Request details for ${item.requestId ?? 'unknown request'}`);
  summary.title = 'Show request details';
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('width', '20');
  icon.setAttribute('height', '20');
  icon.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M14 3H5v18h14V8z M14 3v5h5 M8 12h8 M8 16h8');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.5');
  path.setAttribute('stroke-linejoin', 'round');
  icon.append(path);
  summary.append(icon, el('span', 'ph-sr-only', 'Request details'));
  details.append(summary);
  const content = el('div', 'ph-request-body');
  const body = el('dl', 'ph-detail-list');
  const addRow = (term, value) => {
    body.append(el('dt', '', term), el('dd', '', value ?? '\u2014'));
  };
  addRow('Request ID', item.requestId);
  addRow('Requestor', item.requestor);
  addRow('Started (original)', item.startedAt);
  addRow('Ended (original)', item.endedAt);
  content.append(body);
  const copy = el('button', 'ph-link', 'Copy request ID');
  copy.type = 'button';
  copy.addEventListener('click', () => copyText(item.requestId, copy));
  content.append(copy);

  if (item.daPayloadPath) {
    const view = el('button', 'ph-link', 'View JSON');
    view.type = 'button';
    view.addEventListener('click', () => onViewJson?.(item.daPayloadPath));
    content.append(view);
  } else {
    const none = el('span', 'ph-not-retained', 'Not retained');
    none.title = 'The source request path was not recorded for this publish, so the request file cannot be shown.';
    content.append(none, el('span', 'ph-help', 'Source reference unavailable for this record.'));
  }
  details.append(content);
  cell.append(details);
  return cell;
}

export function renderRow(item, handlers) {
  const rows = document.createDocumentFragment();
  const first = el('tr', 'ph-row');
  first.dataset.requestId = item.requestId;
  const th = el('th', 'ph-cell');
  th.scope = 'rowgroup';
  th.rowSpan = SECTION_COLUMNS.length;
  th.append(renderTime(item.startedAt));
  first.append(th);
  const cells = [
    el('span', 'ph-app', item.app ?? '\u2014'),
    el('span', 'ph-platform', item.platform ?? '\u2014'),
    renderStatusBadge(item),
    renderRequestCell(item, handlers),
  ];
  cells.forEach((c) => {
    const td = el('td', 'ph-cell');
    td.rowSpan = SECTION_COLUMNS.length;
    td.append(c);
    first.append(td);
  });
  SECTION_COLUMNS.forEach((column, index) => {
    const tr = index === 0 ? first : el('tr', 'ph-row');
    tr.dataset.requestId = item.requestId;
    const section = el('th', 'ph-section-label', column.label);
    section.scope = 'row';
    const languages = el('td', 'ph-cell');
    languages.append(renderSectionCell(item, column, handlers?.languageNames));
    tr.append(section, languages);
    rows.append(tr);
  });
  return rows;
}

export function renderCard(item, handlers) {
  const card = el('li', 'ph-card');
  card.dataset.requestId = item.requestId;
  const head = el('div', 'ph-card-head');
  head.append(el('strong', '', item.app ?? '\u2014'), el('span', 'ph-platform', item.platform ?? '\u2014'), renderStatusBadge(item));
  card.append(head, renderTime(item.startedAt));
  SECTION_COLUMNS.forEach((c) => {
    const group = el('div', 'ph-card-group');
    group.append(
      el('h4', 'ph-card-label', c.label),
      renderSectionCell(item, c, handlers?.languageNames),
    );
    card.append(group);
  });
  card.append(renderRequestCell(item, handlers));
  return card;
}

export function renderResults(items, handlers) {
  const root = el('div', 'ph-results-inner');
  const table = el('table', 'ph-table');
  const caption = el('caption', 'ph-sr-only', 'Publish requests');
  const thead = el('thead');
  const headRow = el('tr');
  ['Requested on', 'App', 'Platform', 'Overall', 'Request', 'Section', 'Languages'].forEach((h) => {
    const th = el('th');
    if (h === 'Request') th.append(el('span', 'ph-sr-only', h));
    else th.textContent = h;
    th.scope = 'col';
    headRow.append(th);
  });
  thead.append(headRow);
  table.append(caption, thead);
  items.forEach((item) => {
    const tbody = el('tbody', 'ph-request-group');
    tbody.dataset.requestId = item.requestId;
    tbody.append(renderRow(item, handlers));
    table.append(tbody);
  });
  const cards = el('ul', 'ph-cards');
  items.forEach((item) => cards.append(renderCard(item, handlers)));
  root.append(table, cards);
  return root;
}

export function openSourceModal({ org, repo, token, path }) {
  const modal = el('dialog', 'ph-modal');
  modal.setAttribute('aria-labelledby', 'ph-modal-title');
  const title = el('h2', '', 'Source request JSON');
  title.id = 'ph-modal-title';
  const pathRow = el('div', 'ph-modal-path');
  pathRow.append(el('code', '', path));
  const copy = el('button', 'ph-link', 'Copy path');
  copy.type = 'button';
  copy.addEventListener('click', () => copyText(path, copy));
  pathRow.append(copy);
  const disclaimer = el('p', 'ph-disclaimer', SOURCE_DISCLAIMER);
  const body = el('div', 'ph-modal-body');
  const close = el('button', 'ph-button', 'Close');
  close.type = 'button';
  close.addEventListener('click', () => modal.close());
  modal.addEventListener('close', () => modal.remove());
  modal.append(title, pathRow, disclaimer, body, close);
  document.body.append(modal);
  modal.showModal();

  body.setAttribute('role', 'status');
  body.textContent = 'Loading source JSON\u2026';
  const done = fetchSourceJson({ org, repo, path, token }).then((json) => {
    body.removeAttribute('role');
    body.replaceChildren(el('pre', 'ph-json', json));
  }).catch((error) => {
    body.setAttribute('role', 'alert');
    body.classList.add('ph-modal-error');
    body.textContent = `Could not load source JSON: ${error.message}`;
  });
  return { modal, done };
}

// ---------- Controller ----------

function fillSelect(select, label, values, format = (v) => v) {
  const current = select.value;
  select.replaceChildren(new Option(`All ${label}`, ''));
  values.forEach((v) => select.append(new Option(format(v), v)));
  select.value = values.includes(current) ? current : '';
}

export function init({ context, token }) {
  const root = document.querySelector('[data-tab-content="publish-history"]');
  if (!root) return null;
  const $ = (id) => root.querySelector(`#${id}`);
  const els = {
    refresh: $('ph-refresh'),
    error: $('ph-error'),
    status: $('ph-status'),
    results: $('ph-results'),
    more: $('ph-load-more'),
    app: $('ph-filter-app'),
    platform: $('ph-filter-platform'),
    statusFilter: $('ph-filter-status'),
    byMe: $('ph-filter-by-me'),
    all: $('ph-filter-all'),
  };
  const state = { items: [], nextCursor: null, loading: false, loaded: false, seq: 0 };
  const apps = new Set();
  const platforms = new Set();
  let abortController;
  const { org, repo } = context || {};
  const handlers = {
    languageNames: new Map(),
    onViewJson: (path) => openSourceModal({ org, repo, token, path }),
  };

  function renderFilters() {
    state.items.forEach((item) => {
      if (item.app) apps.add(item.app);
      if (item.platform) platforms.add(item.platform);
    });
    fillSelect(els.app, 'apps', [...apps].sort());
    fillSelect(els.platform, 'platforms', [...platforms].sort());
    const seen = state.items.map((i) => normalizeStatus(i.overallStatus)).filter(Boolean);
    fillSelect(els.statusFilter, 'statuses', [...new Set([...STATUS_OPTIONS, ...seen, els.statusFilter.value].filter(Boolean))], (v) => getStatusMeta(v).label);
  }

  function readFilters() {
    return {
      byMe: els.byMe.checked,
      app: els.app.value,
      platform: els.platform.value,
      status: els.statusFilter.value,
    };
  }

  function render() {
    closePopover();
    els.more.hidden = !state.nextCursor;
    els.more.disabled = state.loading;
    els.refresh.disabled = state.loading;
    els.refresh.setAttribute('aria-busy', String(state.loading));
    if (!state.loaded && state.loading) {
      els.status.textContent = 'Loading publish results\u2026';
      const bar = el('div', 'ph-loading-bar');
      bar.append(el('div', 'ph-loading-bar-fill'));
      bar.setAttribute('role', 'progressbar');
      bar.setAttribute('aria-label', 'Loading publish results');
      const panel = el('div', 'ph-results-inner ph-loading');
      panel.append(el('p', 'ph-loading-text', 'Loading publish results\u2026'), bar);
      els.results.replaceChildren(panel);
      return;
    }
    if (!state.items.length) {
      els.status.textContent = '';
      els.results.replaceChildren(state.loaded && !els.error.hidden ? '' : el('p', 'ph-empty', state.loaded ? 'No publish requests found.' : ''));
      return;
    }
    const more = state.nextCursor ? ' More records are available.' : ' End of loaded history.';
    els.status.textContent = `Showing ${state.items.length} loaded records matching the current filters.${more}${state.loading ? ' Loading\u2026' : ''}`;
    els.results.replaceChildren(renderResults(state.items, handlers));
  }

  async function load({ append = false } = {}) {
    if (append && state.loading) return;
    abortController?.abort();
    abortController = new AbortController();
    state.loading = true;
    state.seq += 1;
    const { seq } = state;
    els.error.hidden = true;
    render();
    try {
      const [page, languages] = await Promise.all([
        fetchPublishLogs({
          token,
          cursor: append ? state.nextCursor : undefined,
          signal: abortController.signal,
          ...readFilters(),
        }),
        fetchLanguages({ context, token, configFile: getConfigFileOverride() }),
      ]);
      if (seq !== state.seq) return;
      const selected = await loadSelectedLocales(page.items, { org, repo, token });
      if (seq !== state.seq) return;
      handlers.languageNames.clear();
      languages.forEach((language) => {
        if (language.code) {
          handlers.languageNames.set(language.code.toLowerCase(), language.label);
        }
      });
      state.items = append
        ? mergeItems(state.items, selected.items) : mergeItems([], selected.items);
      state.nextCursor = page.nextCursor;
      state.loaded = true;
      if (selected.errors.length) {
        els.error.textContent = `Some selected languages could not be loaded. Grey pills may be missing. ${selected.errors.join(' ')}`;
        els.error.hidden = false;
      }
      renderFilters();
    } catch (error) {
      if (seq !== state.seq) return;
      state.loaded = true;
      els.error.textContent = `${error.message}${state.items.length ? ' Showing previously loaded records.' : ''}`;
      els.error.hidden = false;
    } finally {
      if (seq === state.seq) {
        state.loading = false;
        render();
      }
    }
  }

  els.refresh.addEventListener('click', () => load());
  els.more.addEventListener('click', () => load({ append: true }));
  [els.app, els.platform, els.statusFilter, els.byMe, els.all]
    .forEach((control) => control.addEventListener('change', () => {
      state.items = [];
      state.nextCursor = null;
      state.loaded = false;
      load();
    }));
  renderFilters();

  const tabButton = document.querySelector('.tab-button[data-tab="publish-history"]');
  tabButton?.addEventListener('click', () => {
    if (!state.loaded && !state.loading) load();
  });
  return { load, state, render };
}
