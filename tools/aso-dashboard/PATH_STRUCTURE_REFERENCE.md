# ASO Dashboard Path Structure Reference

This document captures the agreed folder/path model for the ASO Dashboard.

## Code layout

```
tools/aso-dashboard/
├── aso-dashboard.html          # Entry (URL: /tools/aso-dashboard/aso-dashboard)
├── css/aso-dashboard.css
├── js/
│   ├── aso-dashboard.js        # Orchestrator (tabs → preview / export / import)
│   ├── release-period-settings.js  # Shared release period (year / quarter / month) UI
│   ├── preview.js
│   ├── export.js
│   ├── import.js
│   ├── google-play-release-notes.js
│   ├── export-legacy-sheet.js  # Legacy Loc Copy sheet helpers (tests)
│   ├── lib/                    # Shared dashboard modules
│   │   ├── content-taxonomy.js # Path builder (use everywhere)
│   │   ├── da-source-client.js
│   │   ├── translate-paths.js
│   │   ├── utils.js
│   │   ├── excel-loader.js
│   │   ├── sheet-to-block-map.js
│   │   └── section-break-template.js
│   └── import-export/          # Round-trip pipeline
│       ├── collect.js
│       ├── template.js
│       ├── paths.js
│       ├── html.js
│       └── page-map.js
```

Tests mirror under `test/tools/aso-dashboard/js/` with shared `mocks/` and `helpers/` at the test root.

## Scope

- This is the target structure going forward.
- Backward compatibility with the old structure is not required.
- `productsPath` is still supported and defaults to `products`.

## Path segments

- `lang`: locale segment (example: `en-us`)
- `productsPath`: folder segment (default: `products`)
- `product`: product key (examples: `adobe-express`, `firefly`)
- `device`: `apple` or `google`
- `year`: four-digit year folder (examples: `2023`, `2024`, `2025`) — **store-tests only**
- `quarter`: `q1`, `q2`, `q3`, or `q4` (lowercase; DA folder names) — **store-tests only**
- `month`: lowercase full English month name (examples: `january`, `may`) — **store-tests only**

## Final page paths

### Publish requests

Google publishing currently supports metadata only: `title`, `shortDescription`,
and `fullDescription` in `metadata.localizations`, alongside the `app` and
`platform` identifiers. Release notes, release tracks, promos, and media assets
are not included in the Google payload. Apple publishing is unchanged.

Publish mode in the Export section saves the selected product/platform payload to
`/.da/store-publish/request/YYYY-MM-DD-t-HH-MI-SS-SSS.json` (UTC), then sends a JSON
`POST` to
`<store-publish.api>/publish-to-appstore` (from `.da/store-publish.json`)
with `{"daPayloadPath": ".da/store-publish/request/YYYY-MM-DD-t-HH-MI-SS-SSS.json"}`.
The service path does not include a leading slash. The service request includes
the current DA token in the `Authorization: Bearer <token>` header; the token is
not included in the JSON body or saved request file.

On a successful HTTP response with non-empty string `requestId` and `status`
fields, those fields are added to the original payload in the same DA file.
The dashboard displays the submitted request ID and status; `queued` does not
mean publication is complete. Failed saves, service requests, or invalid
responses are reported as failures. Service failures display the returned
`error` message and `activationId` when present, along with the HTTP status
and request file path. If the service accepts the request but
writing its response fails, the error includes the request ID and status;
the service request is not automatically retried.

After saving the service response, the dashboard immediately calls
`GET <store-publish.api>/get-publish-log?requestId=<requestId>`
with the same bearer token. It polls at 10-second intervals for up to one minute.
The modal displays `Starting to Publish...` immediately when Publish to Store is
clicked, before configuration, content, or the service response has loaded.
The title changes to `Publishing in progress` and the request ID is added as soon
as the service accepts the request, even if saving its response later fails.
The modal backdrop masks the dashboard without hiding the publish button.
The button stays disabled while submission or monitoring is active.

The top-right X button (accessible label: Close) stays hidden and disabled during submission and polling, and
Escape cannot dismiss the modal while either is active. Close and Escape become
available after success or an error. Errors, success, and timeout messages are
shown in both the modal and the dashboard summary.

Only `overallStatus: "success"` displays `Published`. Terminal failure
statuses and service errors stop monitoring and display an error. A timeout
reports that publishing may still finish, includes the last status and request
ID, and advises against resubmitting. This monitoring error allows dismissal
without claiming the publish succeeded or failed. An in-flight log request is aborted at the
one-minute deadline. The publish button is restored on success, error, or timeout.
The modal remains open with the result until the user closes it; polling does
not resubmit the publish request.

### Store updates (single versioned page)

`/{lang}/{productsPath}/{product}/{device}/store-updates`

- One page per lang/product/device; time is handled by **versioning**, not folder hierarchy.
- Dashboard does **not** show year/quarter/month for this store type.

### Store tests (multiple test detail pages)

`/{lang}/{productsPath}/{product}/{device}/{year}/{quarter}/{month}/store-tests/{testName}`

- `store-tests` contains folders for each test.
- Each `testName` folder contains its own detail page.
- Dashboard shows year/quarter/month and test picker for this store type.

## `productsPath` Behavior

- Keep `productsPath` in the code.
- Use it only as the configurable segment between `lang` and `product`.
- Do not use `productsPath` for legacy path switching.

## Dashboard Behavior Requirements

- Add/select: `product`, `language`, `device`, `storeType` (always).
- Show `year`, `quarter`, `month` only when `storeType = store-tests`.
- Show `testName` selector only when `storeType = store-tests`.
- Load test folders only after `year`, `quarter`, and `month` are all selected (via DA list on `.../store-tests`).
- Preview and export must both use the same centralized path builder.

## Suggested Path Builder Contract

Use `js/lib/content-taxonomy.js` everywhere (`preview` + `export`), for example:

`buildContentPath({ language, productsPath, product, device, year, quarter, month, storeType, testName })`

Rules:

- If `storeType = store-updates`, path is `/{lang}/{productsPath}/{product}/{device}/store-updates`.
- If `storeType = store-tests`, path is `/{lang}/{productsPath}/{product}/{device}/{year}/{quarter}/{month}/store-tests/{testName}`.

## Export Semantics

- `store-updates`: export one page per selected tuple.
- `store-tests`: export one page per selected test folder.
- Export metadata includes `year`, `quarter`, `month` only for `store-tests`.

### Selection model (keep it simple)

| Dimension | UI | Notes |
|-----------|-----|-------|
| Product | Multi-select | Same as today |
| Language | Multi-select | Same as today |
| Device | Multi-select | Same as today |
| Year | Single-select | Store-tests only |
| Quarter | Single-select | Store-tests only |
| Month | Single-select | Store-tests only |
| Store type | Single-select | `store-updates` or `store-tests` |
| Test name | Multi-select | Only when store type is `store-tests`; supports Select All |

Export builds paths from the Cartesian product of multi-select dimensions only (product × language × device × test name). Year, quarter, month, and store type apply once to the whole export run.

## Migrating legacy content

A Node script copies device-level pages into this structure via the DA Source API:

- `tools/migrate-aso-paths/README.md`
- Dry-run first: `node tools/migrate-aso-paths/migrate.js --org ... --repo ... --dry-run`
