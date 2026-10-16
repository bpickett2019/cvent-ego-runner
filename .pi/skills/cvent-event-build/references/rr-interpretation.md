# Workbook source handling

Use [SKILL.md](../SKILL.md) for business decisions. This guide covers provenance and
file interpretation, not additional defaults, scope or completion conditions.

## Layout is not execution order

Discover the included business sections from their names, headers and contents.
Sheet position, numeric prefixes and column positions can change between workbooks;
those differences alone are not blockers or requests for approval. The skill's tab
names identify the included business sections, not fixed worksheet indexes. Preserve
its scope and execution order regardless of the source layout. Never include an
excluded section just because its number matches an included example.

Create a logical source-to-stage map only when needed. Do not physically reorder,
rename or resave the bound original just to process it in the skill's order. Keep
original sheet names and cell addresses in evidence. If a separate working view is
useful, it is derived evidence, not a replacement workbook or a new job binding.

Discover question blocks and answer rows from actual headers and content; do not
assume one fixed table shape. Keep parent questions, choices, codes, Notes and logic
associated with their original sources. Never fill down across unrelated objects.
Real ambiguous identities or meanings need the skill's judgment rules and a recorded
decision; rearranged tabs alone do not. This is contextual interpretation by the
existing agent, not a template-specific parser or a new scheduler.

## Source and identity

- Read the bound original workbook/version/checksum, not only the dashboard preview.
  Do not edit it. Retain exact sheet/cell/range references in technical records.
- Resolve merged and continuation cells within their logical block. Preserve formulas
  and established results; openpyxl does not recalculate formulas. Missing/unread data
  is not a confirmed blank. Never execute arbitrary workbook code.
- Preserve meaningful formatting: zero differs from blank, Excel dates from strings,
  and a fraction displayed as a percentage from a plain amount. Use the observed event
  timezone for tool conversion. Record the date used for today-based defaults once
  so it does not drift during a build; never change the system clock.
- Keep originalExpected separate from expected and record each policyDecisions entry
  as described in the [result contract](runner-contract.md). A chosen value is not a
  literal workbook value. Editorial highlighting does not independently grant scope.
- Apply the skill's list and matching rules to the actual field: narrative text and
  punctuation inside names are not automatically lists. Keep answer order, parallel
  Notes codes and dependent logic together.
- Internal names, display text, codes and resource UUIDs are distinct properties;
  different values in those roles are not automatically conflicts. Workbook names/codes
  are not API UUIDs. Resolve actual event resources before writes.
  Inspect the catalog before generating/reusing an identity; confirm that a matching
  code belongs to the intended item and retain the mapping for later stages.
- Read-only prerequisite discovery can happen before its authoring stage. Keep deferred
  connections unfinished until their dependencies are saved and verified. A fill-in
  rule is not a substitute for an unresolved resource, asset or tool capability.

The optional installed rr-field-values helper is read-only. Its exact matching and
semicolon/pipe parsing do not implement the skill's full normalization, newline,
deduplication or judgment rules. Interpret original source under the skill rather
than treating helper NEEDS_ATTENTION as a new policy veto.

For footers, establish whether components are shared across this event's paths or
across the account. An event URL or newly created template alone proves neither
isolation nor independent assignment. Discover a supported event-local separation
and saved readback route before editing; otherwise record the affected requirements.
Do not inspect another event to fill this knowledge gap without authorization.
