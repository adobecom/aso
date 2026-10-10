Used to host the ASO project, which might not see production traffic directly, but is still used.

Publishing lives in its own **Publish** tab (one product and one platform per request). It reuses
Export's content pipeline (`collectExportData` and the shared `lib/da-page-fetch.js`), so text,
spacing, keywords and constants resolve the same way. The Export tab is unchanged from upstream.

Publish, Publish History and the progress poll read the publish service URL from
`.da/store-publish.json` (sheet `config`, key `store-publish.api`; endpoints
`/publish-to-appstore`, `/get-publish-log` and `/list-publish-logs` are appended). Pass `?env=stage`
or `?env=dev` to use `store-publish.api.stage` / `store-publish.api.dev` (the value is lower-cased
with spaces removed). The `app-languages` sheet (`app`, `platform`, comma-separated translate.json
language codes) limits the Publish languages for the chosen app and platform; apps or platforms not
listed there are not filtered. The file is loaded once per session by `tools/utils.js`.

Publish supports Store updates and CPP (Store tests are hidden). CPP requires exactly one
campaign and is sent as `cpp: [{ referenceName, localizations }]` instead of `metadata`
(`storeType` is UI-only). Store updates requests are unchanged.

Publish requests include the selected release period as
`releasePeriod: { year, quarter, month }`, using the Release period controls'
values (for example, `"2026"`, `"q4"`, `"october"`). Publish History displays it
as `2026 / Q4 / October` in the Release Period column and mobile cards. When the
history API omits the period, the dashboard reads it from the saved request.
Older requests without a recorded release period display a dash.

Publish History initially shows three language pills per section. Use `+N more`
to expand the list and `Less` to collapse it again, on desktop or mobile.

New publish requests also store `requestorName`, fetched from the signed-in
Adobe user profile. The request-details overlay shows the full name alongside
the requestor email. Older requests without a recorded name remain email-only.
