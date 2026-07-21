export const SHEET_METADATA = 'Metadata';
export const SHEET_PROMOS = 'Promos';
export const SHEET_IMAGES_VIDEOS = 'Images-Videos';

function normalizeDevice(device) {
  const key = String(device ?? '').trim().toLowerCase();
  return key === 'apple' || key === 'google' ? key : '';
}

function normalizeWorkbookSheet(workbookSheet) {
  return String(workbookSheet ?? '').trim();
}

function normalizeBlockKey(blockKey) {
  return String(blockKey ?? '').trim();
}

function sheetDeviceKey(workbookSheet, device) {
  return `${normalizeWorkbookSheet(workbookSheet)}:${normalizeDevice(device)}`;
}

export function buildSheetBlockIndex(sheetMap) {
  const blockKeyBySheetDevice = new Map();
  const workbookSheetByBlock = new Map();
  const blocksBySheet = new Map();

  (sheetMap?.data || []).forEach((row) => {
    const workbookSheet = normalizeWorkbookSheet(row?.['workbook sheet']);
    const device = normalizeDevice(row?.device);
    const blockKey = normalizeBlockKey(row?.['block key']);
    if (!workbookSheet || !device || !blockKey) return;

    blockKeyBySheetDevice.set(sheetDeviceKey(workbookSheet, device), blockKey);
    workbookSheetByBlock.set(blockKey, workbookSheet);

    const sheetBlocks = blocksBySheet.get(workbookSheet) || [];
    sheetBlocks.push(blockKey);
    blocksBySheet.set(workbookSheet, sheetBlocks);
  });

  return { blockKeyBySheetDevice, workbookSheetByBlock, blocksBySheet };
}

export function getBlockKeyForSheet(sheetMap, workbookSheet, device) {
  const index = buildSheetBlockIndex(sheetMap);
  return index.blockKeyBySheetDevice.get(sheetDeviceKey(workbookSheet, device)) || null;
}

export function listBlockKeysForSheet(sheetMap, workbookSheet) {
  const index = buildSheetBlockIndex(sheetMap);
  return [...(index.blocksBySheet.get(normalizeWorkbookSheet(workbookSheet)) || [])];
}

export function getWorkbookSheetForBlock(sheetMap, blockKey) {
  const index = buildSheetBlockIndex(sheetMap);
  return index.workbookSheetByBlock.get(normalizeBlockKey(blockKey)) || '';
}
