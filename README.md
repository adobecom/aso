Used to host the ASO project, which might not see production traffic directly, but is still used.

Publish requests include the selected release period as
`releasePeriod: { year, quarter, month }`, using the Release period controls'
values (for example, `"2026"`, `"q4"`, `"october"`). Publish History displays it
as `2026 / Q4 / October` in the Release Period column and mobile cards. When the
history API omits the period, the dashboard reads it from the saved request.
Older requests without a recorded release period display a dash.
