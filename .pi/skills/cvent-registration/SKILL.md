---
name: cvent-registration
description: Configure Cvent event details and registration from an Emerald RR using the assigned Ego and local Steel browser. Covers admissions, registration-type assignments, price tiers, paths, questions and choices, optional items, vouchers, approvals and advanced rules, with exact source mapping and saved verification. Excludes attendee records, Sessions/Speakers and publishing.
---

# Cvent registration configuration

Before acting, read:
- [Runner integration](../cvent-rr-build/references/runner-integration.md)
- [RR interpretation](../cvent-rr-build/references/rr-interpretation.md)

Use the explicitly assigned Ego + local Steel session, not an unrelated desktop/profile or another project's job. Discounts belong to `cvent-discounts`; use the browser for the remaining configuration as requested.

## Work as a broad specialist

Read [operating model](../cvent-rr-build/references/operating-model.md) for the shared approach. Pi chooses when to load this skill and which registration area to work on next. The coverage below describes possible requirements, not a mandatory checklist or editing order. Keep admissions, pricing, paths, questions, optional items and rules together here rather than creating a skill per sheet or control.

Use the selected RR's actual structure and current event configuration to decide the implementation. Discover the current UI through Ego; do not hardcode menu paths, selectors, column positions or an assumed number of registration types. Choose supported operations from observed controls. A different layout calls for investigation, not guessing or immediately asking the user to supply clicks.

Keep the coordinator's event identity, source mappings, observed object IDs and verification current. Revisit another broad skill when a dependency requires it—for example, pass verified admission IDs to the discount work. Continue independent authorized work around a pre-execution blocker, but never around an uncertain save. Do not perform every area below if the RR does not require it.

## Tool readiness is a prerequisite

Load [Ego](../ego-browser/SKILL.md) and its [Steel bridge reference](../ego-browser/references/steel-bridge.md). Use this runner's assigned executable/session, not another command server. Fixture evidence does not prove live editor support. Before attempting configuration, verify the assigned integration exposes the needed documented Ego Page operations and can inspect the actual editor—including any required frames. Do not call nonexistent UI APIs, invent Playwright-style Ego methods, import a different browser engine, or use direct CDP/evaluation as a way around a tool denial. Report a missing editing capability before promising execution.

Even an upstream `page.click`/`page.fill` method is not proof that the assigned host permits it. Follow the specific integration's skill and ownership gates. Do not fabricate RR jobs or runtime metadata to unlock the runner's controls.

## Discover the existing event

Verify the event UUID and exact displayed name before authoring and after any context-changing navigation. Observe the existing editor, catalogs and relationships. Reuse exact matches; create missing objects and update authorized event-only differences without duplicates or invented suffixes.

Use current snapshots to ground selectors. Inspect dialogs before acting; scope iframe observations to the real frame when supported. If frame coverage is unavailable, don't interpret missing snapshot text as missing configuration or use coordinates blindly.

## Configuration coverage

### Event details

Configure supplied event description, dates, timezone, location, capacity, deadlines and applicable visibility. Preserve target event identity/name. Check cross-sheet references to opening/closing dates. Do not configure credential/integration identifiers, merchant accounts or account-wide defaults as incidental prerequisites.

### Registration types and admissions

- Distinguish shared contact-type definitions, event registration-type assignments, admission items and registration paths. Similar labels or coinciding IDs do not make them the same object.
- Apply authoritative old-to-new mappings; preserve exact names/codes, descriptions, availability, limits and group-registration settings.
- Configure which admissions each type can see and which paths expose the type. Check code/name pairs, not just item counts.
- Don't rename a shared definition or alter another event through a shared template. Unknown scope blocks the change. 'NOT NEEDED' is not standalone deletion authority.

### Pricing

- Configure each RR price tier with its exact amount, currency context, effective dates/times and eligibility.
- Verify registration-open, advance, onsite and other named tiers against authoritative dates and timezone; preserve explicit zero-price tiers.
- Configure event-only over-allotment fees or surcharges only when scope and semantics are known. Do not change shared tax/payment/currency settings to force a result.
- Check boundaries, precedence, overlapping intervals, capacity and price visibility per type/path. Don't invent missing price windows or round amounts arbitrarily.

### Registration paths

Map exact path names, type/admission availability, page order, group/guest behavior, profile and question placement, required fields, conditional pages and supplied display text. Verify the path is actually connected to the intended registration experience; a created object alone is insufficient.

### Questions, choices and conditional logic

- Map internal identifiers separately from displayed question text, answer codes/text and source ordering.
- Configure individual versus company/group response scope, input type, requiredness, allowed selection counts, visibility and dependent logic.
- Keep continuation-row choices attached to the right question. Preserve exact consent wording; do not infer opt-in defaults.
- Follow referenced taxonomy where explicitly supplied. Resolve missing taxonomy IDs rather than creating near-duplicate shared fields.
- Show/hide/requiredness logic must be tested for both triggering and non-triggering conditions. A screenshot of the default path is not sufficient.

### Optional items, vouchers, approvals and advanced rules

Configure specified non-session optional items, donations/quantity items, eligibility, availability, limits, prices and attachments to relevant paths/admissions. Map vouchers separately from discounts; verify their actual redemption/value rules rather than assuming they are interchangeable.

Configure event registration approval/preapproval rules and messages when requested and supported. This is distinct from the software project's Outlook review/approval pipeline. Apply group, guest, capacity, allotment and other advanced rules only within the supported event scope. External Personify/Sessionboard computations remain identified dependencies, not something to approximate inside Cvent.

## Save and verify

For each meaningful configuration change:
1. Know the exact intended fields, relationships and unrelated baseline to preserve.
2. Make observed edits and Save once. Don't batch unrelated editors across uncertainty.
3. Wait for a positive completion or explicit rejection; 'Saving…' is still pending. Neither an existing Save button nor disappearance of a spinner alone proves persistence.
4. After confirmed completion, independently reopen/read the saved configuration. Use only the guarded API reads authorized in runner integration for relevant discount dependencies; otherwise use the assigned browser, not an invented API route.
5. Verify connected behavior in registration preview without submitting attendee records, making payments, or sending emails.

If execution/save may have occurred but cannot be verified, stop mutations. Don't reload/navigate/retry while a save is unresolved, replace the browser, or clear uncertainty to continue. Only a confirmed rejection without persistence supports correcting and resubmitting the values.

## Exclusions and output

Do not configure Sessions/Speakers, badges/onsite equipment, external integrations, attendee records, marketing communications, account administration or publishing under this skill. Preserve all unrelated configuration. Report source-referenced verified items, unresolved dependencies and precise tool limitations to `cvent-rr-verify`; never call catalog existence alone a finished registration build.
