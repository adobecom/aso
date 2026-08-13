import { isFileTooLarge, loadExcelJS, MAX_WORKBOOK_FILE_BYTES } from './lib/excel-loader.js';
import { runWithConcurrency } from './lib/concurrency.js';
import {
  normalizeStoreType,
  STORE_TYPE_TESTS,
} from './store-scope-settings.js';
import {
  buildBeforeImportVersionLabel,
  getKeywordsSidecar,
  getSourceText,
  putKeywordsSidecar,
  putSourceText,
  putSpacingSidecar,
} from './lib/da-source-client.js';
import { applyKeywordUpdates } from './import-export/keywords.js';
import {
  buildPageHtml,
  buildSpacingSidecarForField,
} from './import-export/html.js';
import { listMediaAssetFields, listSchemaFields } from './import-export/page-map.js';
import {
  buildDaEditUrl,
  buildHtmlSourcePath,
  keywordsSidecarPath,
  ROW_ROLE_ENGLISH_SOURCE,
  resolvePagePath,
} from './import-export/paths.js';
import {
  parseWorkbook,
  propagateEnglishSource,
  shouldImportKeywords,
} from './import-export/template.js';
import { fetchLanguageIndex } from './lib/translate-paths.js';
import {
  fetchBlockSchema,
  fetchSheetBlockMap,
  getConfigFileOverride,
  getRelativeProductsPath,
} from './lib/utils.js';

// Slightly below da-nx's own MAX_CONCURRENT_WRITES cap on admin.da.live.
const IMPORT_WRITE_CONCURRENCY = 5;

function findSchemaField(schema, sheetMap, device, blockType, fieldName, promoContext = {}) {
  return listSchemaFields(schema, sheetMap, device, blockType, promoContext)
    .find((field) => field.fieldName === fieldName) || null;
}

function collectWorkbookFieldBlocks(parsed) {
  const entries = [];

  ['google', 'apple'].forEach((device) => {
    (parsed.metadata?.[device] || []).forEach((field) => {
      entries.push({
        device,
        blockType: 'listing',
        field,
        promoContext: {},
      });
    });
    (parsed.imagesVideos?.[device] || []).forEach((field) => {
      entries.push({
        device,
        blockType: 'images-videos',
        field,
        promoContext: {},
      });
    });
  });

  (parsed.promos || []).forEach((promo) => {
    ['google', 'apple'].forEach((device) => {
      const variants = Object.values(promo.devices?.[device]?.variants || {});
      variants.forEach((variant) => {
        (variant.fields || []).forEach((field) => {
          entries.push({
            device,
            blockType: 'promo',
            field,
            promoContext: {
              promoName: promo.promoName,
              promoVariant: variant.variantLabel || 'default',
            },
          });
        });
      });
    });
  });

  return entries;
}

function resolveImportScope(settings) {
  const product = settings?.product?.trim();
  const year = settings?.year?.trim();
  const quarter = settings?.quarter?.trim();
  const month = settings?.month?.trim();
  if (!product || !year || !quarter || !month) {
    throw new Error('Settings sheet must include Product, Year, Quarter, and Month.');
  }

  const storeType = normalizeStoreType(settings?.storeType);
  const testName = settings?.testName?.trim() || '';
  if (storeType === STORE_TYPE_TESTS && !testName) {
    throw new Error('Settings sheet must include Test name for store-tests workbooks.');
  }

  return {
    product,
    year,
    quarter,
    month,
    storeType,
    testName: storeType === STORE_TYPE_TESTS ? testName : undefined,
  };
}

function buildImportWriteRequests({
  parsed,
  schema,
  sheetMap,
  languageIndex,
  productsPath,
}) {
  const { languageNames = [] } = parsed;
  const {
    product,
    year,
    quarter,
    month,
    storeType,
    testName,
  } = resolveImportScope(parsed.settings);

  const entries = collectWorkbookFieldBlocks(parsed);
  const englishLanguage = languageIndex.find((language) => language.name === 'English')
    || languageIndex[0];
  const workbookLanguages = languageIndex.filter(
    (language) => languageNames.includes(language.name),
  );
  propagateEnglishSource(
    entries.map((entry) => entry.field),
    workbookLanguages,
    { englishLanguageName: englishLanguage?.name },
  );

  const requests = [];
  entries.forEach(({ device, blockType, field, promoContext }) => {
    const schemaField = findSchemaField(
      schema,
      sheetMap,
      device,
      blockType,
      field.fieldName,
      promoContext,
    );
    if (!schemaField) return;

    languageIndex.forEach((language) => {
      if (!languageNames.includes(language.name)) return;

      const englishSourceText = field.englishSource?.[language.name]?.trim();
      if (englishSourceText) {
        const pagePath = resolvePagePath({
          language,
          rowRole: ROW_ROLE_ENGLISH_SOURCE,
          pageLeaf: schemaField.pageLeaf,
          productsPath,
          product,
          device,
          year,
          quarter,
          month,
          storeType,
          testName,
        });
        if (pagePath) {
          requests.push({
            product,
            device,
            language,
            rowRole: ROW_ROLE_ENGLISH_SOURCE,
            fieldKey: schemaField.fieldKey,
            fieldName: schemaField.fieldName,
            blockType,
            pageLeaf: schemaField.pageLeaf,
            pagePath,
            text: englishSourceText,
            charLimit: schemaField.charLimit,
            promoName: promoContext.promoName,
            promoVariant: promoContext.promoVariant,
          });
        }
      }

      // Localized copy is never written by import — that comes from DA's own loc pipeline.
    });
  });

  return requests;
}

function buildKeywordImportWrites({
  parsed,
  schema,
  sheetMap,
  languageIndex,
  productsPath,
}) {
  const { languageNames = [] } = parsed;
  const {
    product,
    year,
    quarter,
    month,
    storeType,
    testName,
  } = resolveImportScope(parsed.settings);
  const sidecars = new Map();
  const entries = collectWorkbookFieldBlocks(parsed);

  entries.forEach(({ device, blockType, field, promoContext }) => {
    const schemaField = findSchemaField(
      schema,
      sheetMap,
      device,
      blockType,
      field.fieldName,
      promoContext,
    );
    if (!schemaField?.acceptsKeywords) return;

    languageIndex.forEach((language) => {
      if (!languageNames.includes(language.name)) return;
      if (!shouldImportKeywords(language, schemaField)) return;

      const keywordText = field.keywords?.[language.name]?.trim();
      if (!keywordText) return;

      const pagePath = resolvePagePath({
        language,
        rowRole: ROW_ROLE_ENGLISH_SOURCE,
        pageLeaf: schemaField.pageLeaf,
        productsPath,
        product,
        device,
        year,
        quarter,
        month,
        storeType,
        testName,
      });
      if (!pagePath) return;

      const sidecarPath = keywordsSidecarPath(pagePath);
      if (!sidecars.has(sidecarPath)) {
        sidecars.set(sidecarPath, {
          pagePath,
          blockKey: schemaField.blockKey,
          updates: [],
        });
      }

      sidecars.get(sidecarPath).updates.push({
        fieldName: schemaField.fieldName,
        languageName: language.name,
        value: keywordText,
      });
    });
  });

  return [...sidecars.values()];
}

// Media assets have no workbook representation (see media-collect.js), so there's nothing
// to write from the uploaded file — but authors still need a page to drop screenshots/videos
// into once a release exists, per language, exactly like text: one source page per device per
// distinct page leaf (typically images/assets and videos/assets) per language present in the
// workbook — English's own "source" page is the plain root path; every other language gets
// its own market-review page (e.g. /source/en-de/...), same as buildImportWriteRequests. What
// authors put in each is still manual (see buildImportSummaryHtml's note) — this only makes
// sure there's a page for each language to open.
function buildMediaAssetsPageRequests({
  devices,
  schema,
  languageIndex,
  languageNames,
  productsPath,
  product,
  year,
  quarter,
  month,
  storeType,
  testName,
}) {
  const requests = [];
  const seen = new Set();

  devices.forEach((device) => {
    listMediaAssetFields(schema, device).forEach((field) => {
      if (!field.pageLeaf) return;

      languageIndex.forEach((language) => {
        if (!languageNames.includes(language.name)) return;

        const pagePath = resolvePagePath({
          language,
          rowRole: ROW_ROLE_ENGLISH_SOURCE,
          pageLeaf: field.pageLeaf,
          productsPath,
          product,
          device,
          year,
          quarter,
          month,
          storeType,
          testName,
        });
        if (!pagePath) return;

        const key = `${device}::${pagePath}`;
        if (seen.has(key)) return;
        seen.add(key);
        requests.push({ device, pageLeaf: field.pageLeaf, pagePath, language });
      });
    });
  });

  return requests;
}

// Never touches a page that already exists: buildPageHtml overwrites every field key it's
// given, including ones with an empty value, so running this against an already-authored
// page would wipe out real images. Only ever fills in the blank scaffold for a brand new page.
async function createMissingMediaAssetsPages(org, repo, token, schema, requests) {
  return runWithConcurrency(requests, IMPORT_WRITE_CONCURRENCY, async (request) => {
    const htmlPath = buildHtmlSourcePath(request.pagePath);
    const existingHtml = await getSourceText(org, repo, htmlPath, token);
    if (existingHtml !== null) return { ...request, created: false, ok: true };

    const fields = {};
    listMediaAssetFields(schema, request.device)
      .filter((field) => field.pageLeaf === request.pageLeaf)
      .forEach((field) => { fields[field.fieldKey] = ''; });

    const html = buildPageHtml(fields, schema, request.device, 'media-assets', undefined);
    const versionLabel = buildBeforeImportVersionLabel({ pageLeaf: request.pageLeaf });
    const putResult = await putSourceText(org, repo, htmlPath, html, token, {
      versionLabel,
      knownExists: false,
    });
    return { ...request, created: putResult.ok, ok: putResult.ok };
  });
}

function dedupeImportWrites(requests) {
  const byKey = new Map();
  requests.forEach((request) => {
    const path = String(request.pagePath ?? '').trim();
    if (!path || !request.text?.trim()) return;
    const key = `${path}::${request.fieldKey ?? ''}`;
    if (!byKey.has(key)) byKey.set(key, request);
  });
  return [...byKey.values()];
}

// Content still gets written — this only surfaces schema character-count overages
// (e.g. a market-review row's own English text) in the summary, it never blocks the import.
function findOverCharLimitWrites(writes) {
  return writes
    .filter((write) => write.charLimit && write.text.length > write.charLimit)
    .map((write) => ({
      fieldName: write.fieldName,
      language: write.language?.name,
      pagePath: write.pagePath,
      length: write.text.length,
      charLimit: write.charLimit,
    }));
}

function textNeedsSpacingSidecar(text) {
  return /\n\n/.test(String(text ?? ''));
}

// Writes sharing one page must stay sequential (each merges into the same fetched
// content), so group by page and run only the groups concurrently.
function groupWritesByPagePath(writes) {
  const chains = new Map();
  writes.forEach((write) => {
    const key = write.pagePath;
    if (!chains.has(key)) chains.set(key, []);
    chains.get(key).push(write);
  });
  return [...chains.values()];
}

async function executeImportWriteChain(org, repo, token, schema, chain) {
  const chainResults = [];

  // eslint-disable-next-line no-restricted-syntax
  for (const write of chain) {
    const htmlPath = buildHtmlSourcePath(write.pagePath);
    const pageLeaf = write.pageLeaf || write.pagePath;
    const versionLabel = buildBeforeImportVersionLabel({ pageLeaf });

    // eslint-disable-next-line no-await-in-loop
    const existingHtml = await getSourceText(org, repo, htmlPath, token);
    const html = buildPageHtml(
      { [write.fieldKey]: write.text },
      schema,
      write.device,
      write.blockType,
      existingHtml || undefined,
    );

    // eslint-disable-next-line no-await-in-loop
    const putResult = await putSourceText(org, repo, htmlPath, html, token, {
      versionLabel,
      knownExists: existingHtml !== null,
    });
    chainResults.push({ ...write, ok: putResult.ok, method: putResult.method });

    if (textNeedsSpacingSidecar(write.text)) {
      const sidecar = buildSpacingSidecarForField(write.text, write.fieldName, write.fieldKey);
      const opts = { versionLabel };
      const path = write.pagePath;
      // eslint-disable-next-line no-await-in-loop
      const spacingRes = await putSpacingSidecar(org, repo, path, sidecar, token, opts);
      chainResults.push({
        ...write,
        rowRole: 'spacing-sidecar',
        ok: spacingRes.ok,
        method: spacingRes.method,
      });
    }
  }

  return chainResults;
}

async function executeImportWrites(org, repo, token, writes, schema) {
  const chains = groupWritesByPagePath(writes);
  const chainResults = await runWithConcurrency(
    chains,
    IMPORT_WRITE_CONCURRENCY,
    (chain) => executeImportWriteChain(org, repo, token, schema, chain),
  );
  return chainResults.flat();
}

async function executeKeywordWrite(org, repo, token, languageIndex, write) {
  const versionLabel = buildBeforeImportVersionLabel({ pageLeaf: `${write.pagePath}-keywords` });

  const existingJson = await getKeywordsSidecar(org, repo, write.pagePath, token);
  const merged = applyKeywordUpdates(existingJson, {
    blockKey: write.blockKey,
    updates: write.updates,
    languages: languageIndex,
  });

  const putResult = await putKeywordsSidecar(
    org,
    repo,
    write.pagePath,
    merged,
    token,
    { versionLabel, knownExists: existingJson !== null },
  );
  return { ...write, ok: putResult.ok, method: putResult.method };
}

async function executeKeywordWrites(org, repo, token, writes, languageIndex) {
  // Each write already targets its own distinct sidecar path, so no chaining needed.
  return runWithConcurrency(
    writes,
    IMPORT_WRITE_CONCURRENCY,
    (write) => executeKeywordWrite(org, repo, token, languageIndex, write),
  );
}

const BLOCK_TYPE_LABELS = {
  listing: 'Metadata',
  promo: 'Promo',
  'images-videos': 'Images/Videos',
  'media-assets': 'Media Assets',
};

// Matches DA's own Preview action, which always targets "main".
const PREVIEW_REF = 'main';

function buildAemPreviewUrl(repo, org, pagePath) {
  return `https://${PREVIEW_REF}--${repo}--${org}.aem.page${pagePath}`;
}

function extractMarketSourceLabel(language) {
  const source = String(language?.sourcePath ?? '').trim();
  const segment = source.split('/').filter(Boolean).pop();
  return segment || language?.code || language?.name || '';
}

function groupImportResultsByPage(results) {
  const groups = new Map();

  (results || []).forEach((result) => {
    if (!result.ok || !result.pagePath) return;
    if (result.rowRole !== ROW_ROLE_ENGLISH_SOURCE) return;

    // Grouped by page, not field, so fields sharing one page collapse into one row.
    const key = [
      result.device, result.pageLeaf, result.promoName || '', result.promoVariant || '',
    ].join('::');
    if (!groups.has(key)) {
      groups.set(key, {
        device: result.device,
        blockType: result.blockType,
        fieldNames: [],
        promoName: result.promoName,
        promoVariant: result.promoVariant,
        englishPath: null,
        sourcePages: [],
      });
    }

    const group = groups.get(key);
    if (!group.fieldNames.includes(result.fieldName)) {
      group.fieldNames.push(result.fieldName);
    }

    if (String(result.language?.sourcePath ?? '').trim() === '/') {
      group.englishPath = result.pagePath;
    } else {
      const label = extractMarketSourceLabel(result.language);
      if (!group.sourcePages.some((page) => page.label === label)) {
        group.sourcePages.push({ label, pagePath: result.pagePath });
      }
    }
  });

  return [...groups.values()];
}

function markKeywordPages(groups, keywordResults) {
  const successPaths = new Set();
  (keywordResults || []).forEach((result) => {
    if (!result.ok) return;
    (result.updates || []).forEach((update) => {
      successPaths.add(`${update.fieldName}::${result.pagePath}`);
    });
  });

  groups.forEach((group) => {
    const keywordLabels = new Set();
    group.fieldNames.forEach((fieldName) => {
      if (group.englishPath && successPaths.has(`${fieldName}::${group.englishPath}`)) {
        keywordLabels.add('English');
      }
      group.sourcePages.forEach((page) => {
        if (successPaths.has(`${fieldName}::${page.pagePath}`)) {
          keywordLabels.add(page.label);
        }
      });
    });
    group.keywordLabels = [...keywordLabels];
  });

  return groups;
}

// Matches over-limit writes back to the page they landed on (English root or a specific
// market-review source page) so the table can link straight to the page that needs editing.
function markOverLimitPages(groups, overLimit) {
  groups.forEach((group) => {
    group.overLimitEntries = (overLimit || [])
      .filter((entry) => group.fieldNames.includes(entry.fieldName))
      .map((entry) => {
        if (group.englishPath === entry.pagePath) return { ...entry, label: 'English' };
        const page = group.sourcePages.find((p) => p.pagePath === entry.pagePath);
        return page ? { ...entry, label: page.label } : null;
      })
      .filter(Boolean);
  });

  return groups;
}

// Shaped like groupImportResultsByPage's output (one group per device+page leaf, English
// plus each market-review page collapsed into sourcePages) so renderImportPageList (and
// markKeywordPages/markOverLimitPages, which are no-ops here since neither applies to media
// assets) can render these alongside the text-content rows with no changes of their own —
// same table, so authors have one clickable list instead of a link buried in a paragraph.
function buildMediaAssetsPageGroups(mediaAssetsPages) {
  const groups = new Map();

  (mediaAssetsPages || []).forEach((page) => {
    const key = `${page.device}::${page.pageLeaf}`;
    if (!groups.has(key)) {
      groups.set(key, {
        device: page.device,
        blockType: 'media-assets',
        fieldNames: [page.pageLeaf],
        promoName: undefined,
        promoVariant: undefined,
        englishPath: null,
        sourcePages: [],
      });
    }

    const group = groups.get(key);
    if (String(page.language?.sourcePath ?? '').trim() === '/') {
      group.englishPath = page.pagePath;
    } else {
      const label = extractMarketSourceLabel(page.language);
      if (!group.sourcePages.some((sourcePage) => sourcePage.label === label)) {
        group.sourcePages.push({ label, pagePath: page.pagePath });
      }
    }
  });

  return [...groups.values()];
}

// da.live's Loc Project app (unlike Bulk) has no query-param way to pre-fill URLs, so this
// copies the paths and opens a blank Loc Project for the org/repo, same pattern as the
// Bulk Preview fallback: click once, paste into the tab that opens.
// Temporary: ?nx=aso-redesign pins the nx build carrying the per-language-source GLaaS
// changes, since they aren't in the default da.live build yet — drop this query param once
// that work lands generally.
function buildLocProjectUrl(org, repo) {
  return `https://da.live/apps/loc?nx=aso-redesign#/basics/${org}/${repo}`;
}

// Shared by the Loc Project button and the Bulk Preview fallback: copies the given
// URLs to the clipboard and, once copied, opens a companion app in a blank tab to
// paste into (see setupImportCopyListener's data-open-after-copy handling).
function renderCopyPathsButton(urls, label, openAfterCopyUrl) {
  return `<button type="button" class="import-copy-button" data-copy-paths="${encodeURIComponent(urls.join('\n'))}" data-open-after-copy="${openAfterCopyUrl}">${label}</button>`;
}

// extraEnglishPaths carries the media-assets English-source pages (see
// buildMediaAssetsPageRequests) into this same Loc Project list — they need to go through
// the same localization pipeline as text, so authors get one consistent set of paths rather
// than a separate flow just for images.
function renderCopyEnglishButton(groups, repo, org, extraEnglishPaths = []) {
  const paths = [...new Set([
    ...groups.map((group) => group.englishPath).filter(Boolean),
    ...extraEnglishPaths,
  ])];
  if (!paths.length) return '';

  const urls = paths.map((path) => buildAemPreviewUrl(repo, org, path));
  const label = `Copy paths & open Loc Project (${urls.length})`;
  return renderCopyPathsButton(urls, label, buildLocProjectUrl(org, repo));
}

// One URL per distinct page written (English root + each market-review source page)
// plus each keywords sidecar that got updated — de-duped, for a single bulk-preview link.
// Keyword sidecars only preview successfully once they're flat single-sheet JSON (see
// applyKeywordUpdates/flattenSingleBlockSheet); a multi-sheet-with-one-block wrapper 400s.
function collectBulkPreviewPaths(groups) {
  const paths = new Set();

  groups.forEach((group) => {
    if (group.englishPath) paths.add(group.englishPath);
    group.sourcePages.forEach((page) => {
      if (page.pagePath) paths.add(page.pagePath);
    });

    (group.keywordLabels || []).forEach((label) => {
      const pagePath = label === 'English'
        ? group.englishPath
        : group.sourcePages.find((page) => page.label === label)?.pagePath;
      if (pagePath) paths.add(keywordsSidecarPath(pagePath));
    });
  });

  return [...paths];
}

function buildBulkPreviewUrl(urls) {
  return `https://da.live/apps/bulk?urls=${encodeURIComponent(urls.join('\n'))}`;
}

const BULK_APP_URL = 'https://da.live/apps/bulk';

// da.live sits behind infra that 414s well before the browser's own URL limit
// (~200+ chars per encoded AEM preview URL adds up fast), so past this length
// there's no working direct link — fall back to copying the paths for manual paste.
const BULK_PREVIEW_URL_SAFE_LENGTH = 6000;

function renderBulkPreviewButton(groups, repo, org) {
  const paths = collectBulkPreviewPaths(groups);
  if (!paths.length) return '';

  const urls = paths.map((path) => buildAemPreviewUrl(repo, org, path));
  const bulkUrl = buildBulkPreviewUrl(urls);

  if (bulkUrl.length <= BULK_PREVIEW_URL_SAFE_LENGTH) {
    return `<a class="import-copy-button open-new-tab" href="${bulkUrl}" target="_blank" rel="noopener">Bulk Preview in DA (${urls.length})</a>`;
  }

  const label = `Copy paths & open Bulk Preview (${urls.length})`;
  return renderCopyPathsButton(urls, label, BULK_APP_URL);
}

function renderPageLinks(pages, org, repo) {
  return pages
    .filter((page) => page.pagePath)
    .map((page) => (
      `<a href="${buildDaEditUrl(org, repo, page.pagePath)}" target="_blank" rel="noopener">${page.label}</a>`
    ))
    .join(', ');
}

function renderImportPageList(groups, org, repo) {
  if (!groups.length) return '';

  const rows = groups.map((group) => {
    const scopeLabel = group.promoName
      ? `Promo (${group.promoName}${group.promoVariant && group.promoVariant !== 'default' ? `/${group.promoVariant}` : ''})`
      : (BLOCK_TYPE_LABELS[group.blockType] || group.blockType);
    const deviceLabel = group.device === 'apple' ? 'Apple' : 'Google';

    const englishLink = group.englishPath
      ? `<a href="${buildDaEditUrl(org, repo, group.englishPath)}" target="_blank" rel="noopener">English</a>`
      : '<span class="import-page-missing">not created</span>';

    const keywordsCell = group.keywordLabels?.length
      ? group.keywordLabels.join(', ')
      : '<span class="import-page-missing">—</span>';

    const overLimitCell = group.overLimitEntries?.length
      ? group.overLimitEntries.map((entry) => (
        `<div><a href="${buildDaEditUrl(org, repo, entry.pagePath)}" target="_blank" rel="noopener">`
          + `${entry.fieldName} (${entry.label}): ${entry.length}/${entry.charLimit}</a></div>`
      )).join('')
      : '<span class="import-page-missing">—</span>';

    const otherPagesLines = group.sourcePages.length
      ? `<div>Also: ${renderPageLinks(group.sourcePages, org, repo)}</div>`
      : '';

    return `
      <li>
        <div class="inner">
          <p>${deviceLabel}</p>
          <p>${scopeLabel}</p>
          <p>${group.fieldNames.join(', ')}</p>
          <p class="import-page-link">${englishLink}</p>
          <p class="import-page-keywords">${keywordsCell}</p>
          <div class="import-page-over-limit">${overLimitCell}</div>
          <div class="import-page-secondary">${otherPagesLines}</div>
        </div>
      </li>
    `;
  }).join('');

  return `
    <div class="import-page-header">
      <p>Device</p>
      <p>Block</p>
      <p>Field</p>
      <p>English</p>
      <p>Keywords</p>
      <p>Over Limit</p>
      <p>Other pages</p>
    </div>
    <ul class="import-page-list">${rows}</ul>
  `;
}

// Kept as its own table rather than folded into renderImportPageList's rows — media assets
// are a fundamentally different kind of entry (a page created for manual authoring, not a
// workbook write), Keywords/Over Limit never apply to it, and mixing the two read as noise
// once seen in practice. Reuses buildMediaAssetsPageGroups for the English/Also grouping.
function renderMediaAssetsPageTable(mediaAssetsPages, org, repo) {
  const groups = buildMediaAssetsPageGroups(mediaAssetsPages);
  if (!groups.length) return '';

  const rows = groups.map((group) => {
    const deviceLabel = group.device === 'apple' ? 'Apple' : 'Google';
    const englishLink = group.englishPath
      ? `<a href="${buildDaEditUrl(org, repo, group.englishPath)}" target="_blank" rel="noopener">English</a>`
      : '<span class="import-page-missing">not created</span>';
    // Wrapped in a nested <span> rather than sitting directly under .import-page-secondary
    // (a flex column) — otherwise each <a> and each bare ", " text node between them becomes
    // its own flex item and stacks on its own line instead of reading as one comma list.
    const otherPagesLines = group.sourcePages.length
      ? `<span>${renderPageLinks(group.sourcePages, org, repo)}</span>`
      : '<span class="import-page-missing">—</span>';

    return `
      <li>
        <div class="inner">
          <p>${deviceLabel}</p>
          <p>${group.fieldNames.join(', ')}</p>
          <p class="import-page-link">${englishLink}</p>
          <p class="import-page-secondary">${otherPagesLines}</p>
        </div>
      </li>
    `;
  }).join('');

  return `
    <div class="import-media-assets-section">
      <h3 class="import-media-assets-heading">Media Assets — pages are ready below; drag &amp; drop screenshots and videos directly into each one</h3>
      <div class="import-page-header import-media-assets-header">
        <p>Device</p>
        <p>Page</p>
        <p>English</p>
        <p>Also</p>
      </div>
      <ul class="import-page-list import-media-assets-list">${rows}</ul>
    </div>
  `;
}

function buildImportSummaryHtml(summary, org, repo) {
  const scopeParts = [
    summary.product,
    summary.year,
    summary.quarter,
    summary.month,
    summary.testName ? `${summary.storeType} (${summary.testName})` : summary.storeType,
  ].filter(Boolean);
  const lines = [
    `<strong>${scopeParts.join(' / ')}</strong> — ${summary.writeCount} page write(s)`,
    `${summary.skippedEmpty} empty cell(s) skipped`,
  ];
  if (summary.propagatedManaged?.length) {
    lines.push(`Propagated English source (market-review pages created): ${summary.propagatedManaged.join(', ')}`);
  }
  if (summary.propagatedUnmanaged?.length) {
    lines.push(`Propagated English source (unmanaged, no separate page): ${summary.propagatedUnmanaged.join(', ')}`);
  }
  if (summary.keywordWriteCount) {
    lines.push(`Keyword files updated: ${summary.keywordWriteCount} (see Keywords column below)`);
  }
  if (summary.overLimit?.length) {
    lines.push(`<span class="export-summary-warn">Over character limit: ${summary.overLimit.length} (see Over Limit column below)</span>`);
  }
  if (summary.failures?.length) {
    lines.push(`<span class="export-summary-warn">Failed: ${summary.failures.length} write(s)</span>`);
  }
  if (summary.mediaAssetsPages?.length) {
    lines.push('Media assets pages have been created — drag &amp; drop your screenshots and videos directly into each page below (see the Media Assets table).');
  }

  const groups = groupImportResultsByPage(summary.results);
  markKeywordPages(groups, summary.keywordResults);
  markOverLimitPages(groups, summary.overLimit);
  // Only the English root — Loc Project produces the market-review pages itself.
  const mediaAssetsPaths = (summary.mediaAssetsPages || [])
    .filter((page) => String(page.language?.sourcePath ?? '').trim() === '/')
    .map((page) => page.pagePath);
  return `
    <p>${lines.join('<br>')}</p>
    <div class="import-copy-row">
      ${renderCopyEnglishButton(groups, repo, org, mediaAssetsPaths)}
      ${renderBulkPreviewButton(groups, repo, org)}
    </div>
    ${renderImportPageList(groups, org, repo)}
    ${renderMediaAssetsPageTable(summary.mediaAssetsPages, org, repo)}
  `;
}

function renderImportSummary(container, summary, org, repo) {
  if (!container) return;
  container.innerHTML = buildImportSummaryHtml(summary, org, repo);
}

function setImportStatus(message, loading = false) {
  const button = document.getElementById('import-button');
  if (!button) return;
  button.textContent = message;
  button.classList.toggle('loading', loading);
  button.disabled = loading;
}

// The whole import pipeline, with no DOM/window access — org/repo/token/buffer plus the
// two values that'd otherwise come from the URL (productsPath, configFile) are explicit
// params, and ExcelJS is injectable, so this same function can run from a Node/CLI context
// (e.g. a future skill) exactly as it runs from the browser. `handleImportFile` below is
// the browser adapter: it resolves those DOM/URL-derived inputs and renders the result.
async function runImport({
  org,
  repo,
  token,
  buffer,
  productsPath,
  configFile,
  ExcelJS: injectedExcelJS,
}) {
  const [schema, sheetMap, languageIndex] = await Promise.all([
    fetchBlockSchema({ context: { org, repo }, token }),
    fetchSheetBlockMap({ context: { org, repo }, token }),
    fetchLanguageIndex({ context: { org, repo }, token, configFile }),
  ]);
  if (!schema || !sheetMap || !languageIndex.length) {
    const missing = [
      !schema && 'block-schema.json',
      !sheetMap && 'sheet-to-block-map.json',
      !languageIndex.length && `languages (${configFile || 'translate.json'})`,
    ].filter(Boolean).join(', ');
    const hint = !languageIndex.length
      ? ' Add ?configFile=translate-redesign.json to the URL.'
      : '';
    throw new Error(`Could not load: ${missing}.${hint}`);
  }

  const ExcelJS = injectedExcelJS || await loadExcelJS();
  const parsed = await parseWorkbook(buffer, ExcelJS);

  const requests = buildImportWriteRequests({
    parsed,
    schema,
    sheetMap,
    languageIndex,
    productsPath,
  });
  const writes = dedupeImportWrites(requests);
  const overLimit = findOverCharLimitWrites(writes);
  const keywordWrites = buildKeywordImportWrites({
    parsed,
    schema,
    sheetMap,
    languageIndex,
    productsPath,
  });
  const workbookBlocks = collectWorkbookFieldBlocks(parsed);
  const propagated = workbookBlocks.flatMap((entry) => entry.field.propagatedFromEnglish || []);
  const uniquePropagated = [...new Set(propagated)];
  const propagatedManaged = uniquePropagated.filter(
    (name) => languageIndex.find((language) => language.name === name)?.isManagedLocale,
  );
  const propagatedUnmanaged = uniquePropagated.filter(
    (name) => !propagatedManaged.includes(name),
  );

  const devices = [...new Set(workbookBlocks.map((entry) => entry.device))];
  const scope = resolveImportScope(parsed.settings);
  const mediaAssetsRequests = buildMediaAssetsPageRequests({
    devices,
    schema,
    languageIndex,
    languageNames: parsed.languageNames || [],
    productsPath,
    ...scope,
  });

  const [results, keywordResults, mediaAssetsPages] = await Promise.all([
    executeImportWrites(org, repo, token, writes, schema),
    executeKeywordWrites(org, repo, token, keywordWrites, languageIndex),
    createMissingMediaAssetsPages(org, repo, token, schema, mediaAssetsRequests),
  ]);
  const failures = [...results, ...keywordResults].filter((result) => !result.ok);

  return {
    product: parsed.settings?.product?.trim() || 'unknown',
    year: parsed.settings?.year?.trim(),
    quarter: parsed.settings?.quarter?.trim(),
    month: parsed.settings?.month?.trim(),
    storeType: normalizeStoreType(parsed.settings?.storeType),
    testName: normalizeStoreType(parsed.settings?.storeType) === STORE_TYPE_TESTS
      ? parsed.settings?.testName?.trim() : undefined,
    writeCount: writes.length,
    keywordWriteCount: keywordWrites.length,
    skippedEmpty: requests.length - writes.length,
    propagatedManaged,
    propagatedUnmanaged,
    overLimit,
    failures,
    results,
    keywordResults,
    mediaAssetsPages,
  };
}

async function handleImportFile(org, repo, token, file) {
  const summaryContainer = document.getElementById('import-summary');
  if (summaryContainer) summaryContainer.innerHTML = '';

  if (isFileTooLarge(file)) {
    const maxMb = Math.round(MAX_WORKBOOK_FILE_BYTES / (1024 * 1024));
    if (summaryContainer) {
      summaryContainer.innerHTML = `<p class="export-summary-warn">File is too large to import (max ${maxMb}MB).</p>`;
    }
    return;
  }

  setImportStatus('Importing...', true);

  try {
    const buffer = await file.arrayBuffer();
    const summary = await runImport({
      org,
      repo,
      token,
      buffer,
      productsPath: getRelativeProductsPath(),
      configFile: getConfigFileOverride(),
    });

    renderImportSummary(summaryContainer, summary, org, repo);
    setImportStatus(summary.failures.length ? 'Import finished with errors' : 'Import complete');
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[aso import]', error);
    if (summaryContainer) {
      summaryContainer.innerHTML = `<p class="export-summary-warn">${error.message}</p>`;
    }
    setImportStatus('Import failed');
  } finally {
    window.setTimeout(() => {
      setImportStatus('Import to DA', false);
    }, 2500);
  }
}

function setupImportCopyListener() {
  const summaryContainer = document.getElementById('import-summary');
  if (!summaryContainer) return;

  summaryContainer.addEventListener('click', async (event) => {
    const button = event.target.closest('.import-copy-button');
    if (!button || !button.dataset.copyPaths) return;

    const paths = decodeURIComponent(button.dataset.copyPaths);
    const originalText = button.textContent;
    try {
      await navigator.clipboard.writeText(paths);
      const { openAfterCopy } = button.dataset;
      if (openAfterCopy) {
        window.open(openAfterCopy, '_blank', 'noopener');
        button.textContent = 'Copied! Paste with ⌘V / Ctrl+V';
      } else {
        button.textContent = 'Copied!';
      }
    } catch {
      button.textContent = 'Copy failed';
    }
    window.setTimeout(() => { button.textContent = originalText; }, 2000);
  });
}

function setupImportListeners(org, repo, token) {
  const fileInput = document.getElementById('import-file');
  const importButton = document.getElementById('import-button');
  if (!fileInput || !importButton) return;

  setupImportCopyListener();
  importButton.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) handleImportFile(org, repo, token, file);
    fileInput.value = '';
  });
}

export async function init({ context, token }) {
  const { org, repo } = context;
  setupImportListeners(org, repo, token);
}

export {
  buildAemPreviewUrl,
  buildBulkPreviewUrl,
  buildDaEditUrl,
  buildImportSummaryHtml,
  buildImportWriteRequests,
  buildKeywordImportWrites,
  buildLocProjectUrl,
  buildMediaAssetsPageGroups,
  buildMediaAssetsPageRequests,
  collectBulkPreviewPaths,
  createMissingMediaAssetsPages,
  dedupeImportWrites,
  extractMarketSourceLabel,
  findOverCharLimitWrites,
  groupImportResultsByPage,
  groupWritesByPagePath,
  markKeywordPages,
  markOverLimitPages,
  renderBulkPreviewButton,
  renderCopyEnglishButton,
  renderImportPageList,
  renderMediaAssetsPageTable,
  runImport,
};
