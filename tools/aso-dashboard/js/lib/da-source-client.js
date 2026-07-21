/**
 * DA Source API client for ASO dashboard import/export.
 *
 * Import writes follow DA rollout/translate behavior: parent folders are created
 * implicitly when a leaf file (.html / .json) is POST/PUT. Authors scaffold the
 * Authors create the dated folder tree in DA; import/export only read and write leaf pages.
 */
const ADMIN_BASE = 'https://admin.da.live';

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

function buildListUrl(org, repo, listPath) {
  const normalized = String(listPath ?? '').trim().replace(/^\/+/, '');
  return `${ADMIN_BASE}/list/${org}/${repo}/${normalized}`;
}

function buildSourceUrl(org, repo, sourcePath) {
  const path = String(sourcePath ?? '').trim();
  const withSlash = path.startsWith('/') ? path : `/${path}`;
  return `${ADMIN_BASE}/source/${org}/${repo}${withSlash}`;
}

function buildBeforeImportVersionLabel({ pageLeaf, date = new Date() } = {}) {
  const leaf = String(pageLeaf ?? '').trim() || 'page';
  const iso = date.toISOString().slice(0, 10);
  return `Before ASO import — ${leaf} — ${iso}`;
}

// DA's browse UI only hides a filename that starts with a literal dot.
function buildHiddenSidecarPath(basePath, suffix) {
  const base = String(basePath).replace(/\.html$/i, '');
  const lastSlash = base.lastIndexOf('/');
  const folder = base.slice(0, lastSlash + 1);
  const filename = base.slice(lastSlash + 1);
  return `${folder}.${filename}${suffix}`;
}

async function listDirectory(org, repo, listPath, token) {
  const url = buildListUrl(org, repo, listPath);
  const resp = await fetch(url, { headers: authHeaders(token) });
  if (resp.status === 401) {
    throw new Error('Authentication failed (401). Check your IMS token.');
  }
  if (!resp.ok) {
    throw new Error(`List failed for ${listPath}: HTTP ${resp.status}`);
  }
  const data = await resp.json();
  return Array.isArray(data) ? data : [];
}

async function getSourceText(org, repo, sourcePath, token) {
  const url = buildSourceUrl(org, repo, sourcePath);
  const resp = await fetch(url, { headers: authHeaders(token) });
  if (resp.status === 404) return null;
  if (!resp.ok) {
    throw new Error(`GET failed for ${sourcePath}: HTTP ${resp.status}`);
  }
  return resp.text();
}

async function getSpacingSidecar(org, repo, basePath, token) {
  const path = buildHiddenSidecarPath(basePath, '-spacing.json');
  const text = await getSourceText(org, repo, path, token);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function getKeywordsSidecar(org, repo, basePath, token) {
  const path = `${String(basePath).replace(/\.html$/i, '')}-keywords.json`;
  const text = await getSourceText(org, repo, path, token);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function sourceExists(org, repo, sourcePath, token) {
  const url = buildSourceUrl(org, repo, sourcePath);
  const resp = await fetch(url, { headers: authHeaders(token) });
  if (resp.status === 404) return false;
  if (!resp.ok) {
    throw new Error(`HEAD/GET check failed for ${sourcePath}: HTTP ${resp.status}`);
  }
  return true;
}

async function versionBeforeOverwrite(org, repo, sourcePath, label, token) {
  const url = `${buildSourceUrl(org, repo, sourcePath)}/versionsource`;
  const formData = new FormData();
  formData.append('label', String(label ?? '').trim());
  const resp = await fetch(url, {
    method: 'POST',
    headers: authHeaders(token),
    body: formData,
  });
  return {
    ok: resp.ok,
    status: resp.status,
    statusText: resp.statusText,
  };
}

// `knownExists` skips a redundant existence GET when the caller already fetched this path.
async function versionIfExists(org, repo, sourcePath, versionLabel, token, knownExists) {
  const label = String(versionLabel ?? '').trim();
  if (!label) return { versioned: false, skipped: true };

  const exists = knownExists ?? await sourceExists(org, repo, sourcePath, token);
  if (!exists) return { versioned: false, skipped: true, reason: 'notFound' };

  const result = await versionBeforeOverwrite(org, repo, sourcePath, label, token);
  return { versioned: true, ...result };
}

async function postOrPutSource(org, repo, sourcePath, token, {
  postBody,
  putBody,
  putContentType,
}) {
  const url = buildSourceUrl(org, repo, sourcePath);
  const postResp = await fetch(url, {
    method: 'POST',
    headers: authHeaders(token),
    body: postBody,
  });
  if (postResp.ok) {
    return { ok: true, method: 'POST', status: postResp.status };
  }

  const putResp = await fetch(url, {
    method: 'PUT',
    headers: {
      ...authHeaders(token),
      'Content-Type': putContentType,
    },
    body: putBody,
  });
  return {
    ok: putResp.ok,
    method: 'PUT',
    status: putResp.status,
    statusText: putResp.statusText,
  };
}

async function putSourceText(org, repo, sourcePath, html, token, options = {}) {
  const { versionLabel, knownExists } = options;
  const versionResult = versionLabel
    ? await versionIfExists(org, repo, sourcePath, versionLabel, token, knownExists)
    : null;

  const formData = new FormData();
  formData.append('data', new Blob([html], { type: 'text/html' }));
  const writeResult = await postOrPutSource(org, repo, sourcePath, token, {
    postBody: formData,
    putBody: html,
    putContentType: 'text/html',
  });

  return {
    ...writeResult,
    version: versionResult,
  };
}

async function putSpacingSidecar(org, repo, basePath, obj, token, options = {}) {
  const path = buildHiddenSidecarPath(basePath, '-spacing.json');
  const { versionLabel } = options;
  const versionResult = versionLabel
    ? await versionIfExists(org, repo, path, versionLabel, token)
    : null;

  const body = `${JSON.stringify(obj, null, 2)}\n`;
  const writeResult = await postOrPutSource(org, repo, path, token, {
    postBody: new Blob([body], { type: 'application/json' }),
    putBody: body,
    putContentType: 'application/json',
  });

  return {
    ...writeResult,
    path,
    version: versionResult,
  };
}

async function putKeywordsSidecar(org, repo, basePath, obj, token, options = {}) {
  const path = `${String(basePath).replace(/\.html$/i, '')}-keywords.json`;
  const { versionLabel, knownExists } = options;
  const versionResult = versionLabel
    ? await versionIfExists(org, repo, path, versionLabel, token, knownExists)
    : null;

  const body = `${JSON.stringify(obj, null, 2)}\n`;
  const writeResult = await postOrPutSource(org, repo, path, token, {
    postBody: new Blob([body], { type: 'application/json' }),
    putBody: body,
    putContentType: 'application/json',
  });

  return {
    ...writeResult,
    path,
    version: versionResult,
  };
}

export {
  buildBeforeImportVersionLabel,
  getKeywordsSidecar,
  getSourceText,
  getSpacingSidecar,
  listDirectory,
  putKeywordsSidecar,
  putSourceText,
  putSpacingSidecar,
};
