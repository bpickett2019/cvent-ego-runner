# Saved partial configuration — presentation update

A partially verified requirement now appears under **Saved** when it has a valid,
status-bound `saved` or `unchanged` action and recorded verification/evidence. The
same item is not duplicated in Needs attention. Existing checked settings are not
represented as writes made by the run.

Remaining fields/checks, next steps, source and original evidence remain visible on
the saved item. Unknown outcomes, missing/stale action metadata, absent evidence,
blocked/unverified requirements and generic legacy notes remain outside Saved.
Blocked discounts remain first inside the existing Needs attention section.

This changes display grouping, not completion. Original requirement statuses,
reports, job outcomes, costs and uncertainty are unchanged. A historical INCOMPLETE
run is not promoted to DONE. Original partial statuses remain in technical evidence.
No skill, runtime guard, discount adapter or gateway changes are included.

The deployment payload contains only `public/result-language.js`, `public/app.js`
and `public/index.html`; hashes are in `deploy/saved-results-ui-manifest.json`.
The policy hash test follows this explicit three-file overlay without rewriting
historical manifests. Added public fixtures are synthetic, not customer run data.

Checks include conservative classification, all-row preservation, raw-status and
outcome preservation, exact policy/hash overlay and local DOM regression tests.
Source publication or fixture success alone is not deployment or rendered-browser
acceptance. New builds and live Cvent testing require separate authorization.
