# Registration, admission items and pricing

## Project-specific coverage

Read [scope and intake](scope-and-intake.md). Verify registration overview/types/admissions and intended registration-path selection. For every admission preserve exact name/code and explicitly supplied Expo-variant differentiators; never invent variant suffixes or assume similar names represent the same item.

For every fee row map the selected admission item, exact fee name, eligible registration type, exact price/currency context, active flag and display flag independently. Support multiple fees per admission/type with their distinct identities, eligibility, effective windows and precedence. Do not overwrite one tier with another, collapse equal amounts across different types, or treat zero as blank. Verify saved mappings and applicable preview amounts, not just fee count.

[Vouchers and advanced rules](vouchers-and-rules.md) have explicit per-event on/off decisions. [Discounts](discounts.md) include code and group/volume rules through the guarded API; they do not replace admission pricing. The broader technical notes below apply only to agreed requirements and their necessary event-local dependencies.

Before acting, read:
- [Runner integration](runner-integration.md)
- [RR interpretation](rr-interpretation.md)

Use the explicitly assigned Ego + local Steel session, not an unrelated desktop/profile or another project's job. Discounts belong to the [discount reference](discounts.md); use the browser for the remaining configuration as requested.

## Use this reference within the single build

Read this reference before the first configuration pass and use [operating model](operating-model.md) for later dependencies. Registration types come first after verified event selection, before admissions, fees, discounts or website authoring. The later coverage describes possible requirements, not a demand to enable every feature. Keep admissions, pricing, paths, questions, optional items and rules together here rather than creating a skill per sheet or control.

## First configuration pass: registration types

1. From the bound event, inspect the current navigation. The user-supplied route is **Details → dropdown → Registration Types → Edit**. Confirm the visible controls and exact event identity; if the layout differs, investigate the current supported UI rather than guessing a selector or declaring the feature absent.
2. Map every RR-required registration type to its exact source name/code and event settings. Inspect existing event assignments and available contact-type definitions, including relevant pages/search results, before claiming an exact type is absent. Contact-type definitions, event assignments, admissions and attendee/contact records are distinct.
3. Reuse an exact existing definition and configure its event assignment. Do not rename a shared definition, invent an alternate spelling/code or create a duplicate just to avoid configuring the existing type.
4. **Concurrent-mode capability check:** if JOB.executionCapabilities.sharedContactTypeCreation is false, do not attempt shared contact-type creation or open its creation dialog. Reuse existing exact definitions; record a genuinely missing type and its dependents for operator provisioning outside overlapping builds, then continue independent work. No peer workspace may be stopped or its claim edited to gain this capability.

   **User-authorized create-only exception (only when the capability above is not disabled):** if an exact RR-required contact type is genuinely absent, the observed event Registration Types editor may be used to create that new definition and assign it to the selected event. Contact-type definitions can be account-wide even when reached inside an event: this exception permits only the necessary new RR-backed definition and this event's assignment, not changing existing definitions, other events, shared defaults, templates, permissions or contact/attendee records. Required creation values must come from the RR/confirmed intake. If the UI needs unspecified values or broader effects, block that type and its dependents; do not guess. No contact-type API authoring or raw-HTTP fallback is authorized.
5. Save once, independently re-read the created/reused type and event assignment, and record their exact IDs/name/code and configured availability/settings. A successful create dialog alone does not verify event assignment. If a name collision appears, re-read and resolve the exact existing match; no duplicate/suffix or replay after an uncertain create.
6. Complete or specifically block each required type before moving on. Then configure admissions, fees, paths, discounts and other requirements using the verified type mappings. A blocked type prevents only its dependents, not independent executable work. Do not report the event complete with an unresolved type or assignment.

Use the selected RR's actual structure and current event configuration to decide the implementation. Apply [contextual RR interpretation](rr-interpretation.md): distinguish internal names, display text, admission/registration codes and observed UUIDs; map their relationships across the actual tables. Formula-generated names/codes are not inherently unreliable, and a local comment does not invalidate unrelated rows. A clear authorized request for a missing admission/fee is work to implement; differing current assignments alone do not make the request ambiguous. Unresolved same-property conflicts and unknown scope still block affected work, without invented aliases or duplicate workarounds.

Discover the current UI through Ego; do not hardcode menu paths, selectors, column positions or an assumed number of registration types. Choose supported operations from observed controls. A different layout calls for investigation, not guessing or immediately asking the user to supply clicks.

Keep the coordinator's event identity, source mappings, observed object IDs and verification current. Revisit another reference when a dependency requires it—for example, pass verified admission IDs to the discount work. Continue independent authorized work around a pre-execution blocker, but never around an uncertain save. Do not perform every area below if the RR does not require it.

## Tool readiness is a prerequisite

Load [Ego](browser/controls.md) and its [Steel bridge reference](browser/references/steel-bridge.md). Use this runner's assigned executable/session, not another command server. Fixture evidence does not prove live editor support. Before attempting configuration, verify the assigned integration exposes the needed documented Ego Page operations and can inspect the actual editor—including any required frames. Do not call nonexistent UI APIs, invent Playwright-style Ego methods, import a different browser engine, or use direct CDP/evaluation as a way around a tool denial. Report a missing editing capability before promising execution.

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

Do not configure Sessions/Speakers, badges/onsite equipment, external integrations, attendee records, marketing communications, account administration or publishing under this reference. Preserve all unrelated configuration. Report source-referenced verified items, unresolved dependencies and precise tool limitations to the [verification reference](verification.md); never call catalog existence alone a finished registration build.
