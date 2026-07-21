# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm test              # Run full test suite (web-test-runner, port 2000, with coverage)
npm run test:watch    # Run tests in watch mode
npm run lint          # Run JS + CSS linting
npm run lint:js       # ESLint only
npm run lint:css      # Stylelint on blocks/**/*.css and styles/*.css
npm run commit        # Interactive commit message wizard (semantic commits)
```

To run a single test file, pass it directly to the web-test-runner:
```bash
npx wtr test/blocks/aso-app/aso-app.test.js --port 2000
```

## Architecture

This is an **App Store Optimization (ASO)** web project built on Adobe's [Project Helix](https://www.hlx.live/) and the [Milo](https://github.com/adobecom/milo) library. It manages mobile app metadata (titles, descriptions, keywords) for iOS App Store and Google Play listings.

### How the pieces fit together

**Content editing → Preview → Export pipeline:**

1. `/blocks/aso-app/` — Core block. Decorates editable metadata rows, validates character counts against a schema loaded from `/.da/block-schema.json`, and provides copy-to-clipboard per field.
2. `/blocks/aso-preview/` — Renders a live app store mockup by interpolating metadata into a template fetched from `/mocks/play-store.html`.
3. `/tools/aso-dashboard/` — Dashboard UI built with the DA SDK (`da.live`). Wires together preview (`preview.js`), export (`export.js`), and Google Play release notes (`google-play-release-notes.js`).
4. `/tools/aso-html-cleaner/` — Sanitizes HTML content before export; used as a plugin in the dashboard.

**HTML processing:** `convertTags()` in `aso-utils.js` is the central utility for converting rich DOM content (lists, bold, paragraphs) into plain text suitable for app store submission. All export and copy paths go through this function.

**Library loading (`scripts/scripts.js`):** Dynamically resolves the Milo lib path — `/libs` in production, AEM/HLX branch paths in dev/stage, or a custom branch via `?milolibs=<branch>` query param.

### Import/export scope semantics

- **One product at a time, everywhere — Import, Export, and Preview.** An import workbook's Settings sheet has a single `Product` value (`SETTINGS_ROWS` in `import-export/template.js`), applied uniformly to every field/promo/keyword row it contains — there's no per-row product column. Export's "Product" control (`#export-product` in `aso-dashboard.html`) is a single-select dropdown for the same reason, not a checkbox group — `product` is a scalar throughout `export.js` (`getSelectedItems().product`, `getBaseListProbeFields()`, `handleExport`'s single call to `exportProductWorkbook`). **Don't reintroduce multi-product selection without solving the live-discovery problem first:** it was tried, and it broke Promos — `getBaseListProbeFields` had to pick exactly one product to probe DA for promo names, so with 2+ products checked it silently discovered promos for only the first (alphabetically-first) one, sometimes even blocking export entirely for every product if that first one happened to have none. Metadata/Images & Videos never hit this because their field lists come from the static schema, not from a live per-product DA lookup — Promos, and any future feature needing live per-product state (e.g. publish), doesn't have that luxury. Product is a different *app* per value, not a sub-facet like language or device, so multi-select here doesn't generalize the way it does for those.
- **"Load Fields From File" replaces the current scope, it never merges.** Every function in that flow (`applyProduct`, `applyLanguages`, `applyDevices`, `applyScope`, `restrictFieldScopeToFile`, `restrictPromoCheckboxesToFile`, etc., all in `export.js`/`field-scope-settings.js`) unconditionally sets checkbox/select state from only the just-uploaded file's parsed content. Uploading a second file after a first **discards** the first file's selections entirely — there's no accumulation toward "both products" or a union of languages/fields across two uploads.

### Key conventions

- **ES modules only** (`"type": "module"` in package.json). Always use `.js` extensions on imports.
- **Tests must not make external network calls.** The web-test-runner config enforces a ban on external fetch/XHR/script tags. Use mocks in `/mocks/` or Sinon stubs.
- **Linting:** ESLint extends `airbnb-base`. Param reassignment is allowed for properties. Stylelint uses `stylelint-config-standard` + prettier-compatible config.
- **Deployment:** `.hlxignore` controls what Helix publishes — `*.md`, `*.json`, and `test/*` are excluded from the published site (except `tools/sidekick/config.json`).
