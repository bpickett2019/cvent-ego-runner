# Read the bound workbook under the approved rules

[SKILL.md](../SKILL.md) supplies all business decisions. This reference explains
source handling and technical provenance; it does not impose additional required
values, preview gates, old scope or a different source-precedence policy.

## Source fidelity

Use only this job's immutable workbook/version/checksum. Configure only the listed
tabs and row filters in the skill; do not create requirements from excluded tabs or
old scope checklists. Map the actual included headers, notes and question blocks.
Preserve exact cell/range references internally, while the written report names the
tab, business row and column. Missing/unread data is not a confirmed blank.

Resolve merged/continuation cells within their logical block. Read formulas and
available cached values without executing arbitrary workbook code; openpyxl does
not recalculate formulas. Retain the source formula and established result. A
missing cache alone is not a reason to reject a resolvable value. If interpretation
requires a judgment, use the skill's rule and record it rather than silently claiming
it was the workbook's literal value. Do not alter the original workbook.

Editorial highlights do not change the skill's included scope or override written
values. Retain meaningful numeric/date formatting: distinguish zero from blank,
Excel date values from strings, and 0.20 displayed as 20% from a plain 0.20 amount.
Convert established dates to the tool's required representation; use the event's
observed timezone. Record the date/time used for any today-based default so it does
not drift during this build. Do not change the system clock.

## Apply the skill, not old blockers

Existing object + blank field means preserve. Required blank on creation uses the
skill's exact fill-in rule; apply capacity and question-answer-code exceptions
before generic numeric/code defaults. Optional blank creation fields stay omitted.
Explicit date "None" clears the existing bound through supported operations, or
omits it on creation. Blank dates no longer automatically clear existing bounds.
For discount patches, omission preserves and explicit null clears a date; see
[discounts](discounts.md). Tool validation failures are Not done, not guessed success.

Record original source, policy-derived expected value, applied rule and saved result
separately. Include placeholders, resolved conflicts, missing/duplicate answer-code
omissions and duplicate-answer decisions in the final disclosure. An approved policy
exception can satisfy configuration without claiming the original workbook supplied
that value. A supplied unique answer code that cannot be set is still unfinished.

## Identities, lists and dependencies

Resolve registration types/admissions by code first, then names ignoring spaces
around the pipe as the skill permits. Preserve actual shared names; matching is not
renaming. Confirm an unambiguous event resource before authoring. Codes/names are not
API UUIDs. A missing ambiguous type skips the whole affected fee/assignment rather
than expanding it to everyone. Follow Registration Paths precedence in the skill.

Treat semicolons/newlines as list delimiters in actual list columns, not narrative
copy or names. Slashes and pipes inside names/answer labels remain literal. Keep
choice order, parallel Notes codes and dependent logic together. Apply the skill's
duplicate and missing-code rules before deciding the resulting list. Reuse one
question across its listed paths without collapsing distinct questions merely
because their labels resemble one another. Backend-only questions get no placement.

For generated codes, inspect the existing event catalog and relevant identity before
creation. Use the skill's uppercase alphanumeric base and numbered collisions;
reserve suffix space inside the observed field limit. An existing matching code
must be confirmed as the same item before reuse. Save the chosen mapping so later
operations do not generate another identity. Do not generate shared contact types.

The installed rr-field-values helper is optional and read-only. It uses stricter
exact matching and semicolon/pipe parsing, not this entire updated policy. It does
not discover the workbook, apply defaults or establish Cvent identity. A helper
NEEDS_ATTENTION is not a new business-policy veto: interpret original source under
the skill and record the result. Do not falsely claim the helper implements name
normalization, newline lists, deduplication or approved judgment rules.

## Placement and footer discovery

Use the skill's named footer/path assignments; paths not named retain their current
footer. Observe whether the current event has independent footers or shared components.
Do not assume last year's arrangement or inspect another event without authorization.
A shared component across this event's paths is not necessarily an account-wide
template, but separation and effects must be established before changing it. Use
supported event-local separation if available; otherwise record the missing operation
and affected links. The historical banner is not proof another editor is active now.

Apply the approved Path Not Given judgment and palette-slot mapping, recording the
choice. No preview is required for acceptance. Independently read back saved fields
and associations through supported tools. Later-stage dependencies may be discovered
read-only beforehand; leave connections unfinished until their scheduled prerequisite
is available, then finish the deferred connection without fabricating placeholders
for an unresolved tool dependency. Follow [runner contract](runner-contract.md).
