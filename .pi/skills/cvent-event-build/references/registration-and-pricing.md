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

Read this reference before the Event stage and follow the full required order and deferred-dependency rules in [operating model](operating-model.md). Registration Types follows Event details, then Admission Items, skipped Sessions, Optional Items, Fees, Discount Codes and Volume Discounts before Website, Footer Links, Registration Paths and Questions; Emails and Code Snippets stay skipped. The later coverage describes possible requirements, not a demand to enable every feature. Keep admissions, pricing, paths, questions, optional items and rules together here rather than creating a skill per sheet or control.

## Registration Types stage (after Event details)

1. From the bound event, inspect the current navigation. The user-supplied route is **Details → dropdown → Registration Types → Edit**. Confirm the visible controls and exact event identity; if the layout differs, investigate the current supported UI rather than guessing a selector or declaring the feature absent.
2. Map every RR-required registration type to its exact source name/code and event settings. Inspect existing event assignments and available contact-type definitions, including relevant pages/search results, before claiming an exact type is absent. Contact-type definitions, event assignments, admissions and attendee/contact records are distinct.
3. Reuse an exact existing definition and configure its event assignment. Do not rename a shared definition, invent an alternate spelling/code or create a duplicate just to avoid configuring the existing type.
4. **Concurrent-mode capability check:** if JOB.executionCapabilities.sharedContactTypeCreation is false, do not attempt shared contact-type creation or open its creation dialog. Reuse existing exact definitions; record a genuinely missing type and its dependents for operator provisioning outside overlapping builds, then continue independent work. No peer workspace may be stopped or its claim edited to gain this capability.

   **User-authorized create-only exception (only when the capability above is not disabled):** if an exact RR-required contact type is genuinely absent, the observed event Registration Types editor may be used to create that new definition and assign it to the selected event. Contact-type definitions can be account-wide even when reached inside an event: this exception permits only the necessary new RR-backed definition and this event's assignment, not changing existing definitions, other events, shared defaults, templates, permissions or contact/attendee records. Required creation values must come from the RR/confirmed intake. If the UI needs unspecified values or broader effects, block that type and its dependents; do not guess. No contact-type API authoring or raw-HTTP fallback is authorized.
5. Save once, independently re-read the created/reused type and event assignment, and record their exact IDs/name/code and configured availability/settings. A successful create dialog alone does not verify event assignment. If a name collision appears, re-read and resolve the exact existing match; no duplicate/suffix or replay after an uncertain create.
6. Complete or specifically block each required type before moving on. Then continue through the required process order using the verified type mappings; do not move Registration Paths ahead of discounts or website work. A blocked type prevents only its dependents, not independent executable work. Do not report the event complete with an unresolved type or assignment.

Use the selected RR's actual structure and current event configuration to decide the implementation. Apply [contextual RR interpretation](rr-interpretation.md): distinguish internal names, display text, admission/registration codes and observed UUIDs; map their relationships across the actual tables. Formula-generated names/codes are not inherently unreliable, and a local comment does not invalidate unrelated rows. A clear authorized request for a missing admission/fee is work to implement; differing current assignments alone do not make the request ambiguous. Unresolved same-property conflicts and unknown scope still block affected work, without invented aliases or duplicate workarounds.

Discover the current UI through Ego; do not hardcode menu paths, selectors, column positions or an assumed number of registration types. Choose supported operations from observed controls. A different layout calls for investigation, not guessing or immediately asking the user to supply clicks.

Keep the coordinator's event identity, source mappings, observed object IDs and verification current. Revisit another reference when a dependency requires it—for example, pass verified admission IDs to the discount work. Continue independent authorized work around a pre-execution blocker, but never around an uncertain save. Do not perform every area below if the RR does not require it.

## Show/registration questions are explicitly in scope

Account for every RR-required show/registration question, not just the four standard profile fields. Discover question tables, groups and continuation-row choices from the actual bound workbook and approved current-job inputs; do not depend on a sheet literally named “Show Questions” or copy a sample/template questionnaire. Follow the applicability policy and ignore editorial color-status cues without skipping highlighted question rows.

- Record each requested question's exact displayed text/help text, internal identifier, input/display type, requiredness, answer text/codes/order, selection limits and supplied validation constraints. Preserve individual versus company/group response scope and exact consent wording; do not invent answers, consent defaults or missing question content.
- Map its requested group/page/path placement, applicable registration types/admissions, visibility and conditional parent/answer dependencies. Keep every choice with its source question; account for dependent questions without treating an independent question as blocked by an unrelated issue.
- Inspect existing definitions and assignments. Reuse exact matches, configure authorized event-only differences and create genuinely missing event-specific questions/choices through the assigned browser when supported. Verify event-only scope before authoring: no creation or modification of account-wide contact-field libraries, shared question definitions, taxonomies, templates or other events is authorized here. A shared-field dependency requires an operator decision, not a duplicate workaround or new API permission.
- Confirm Save completion and independently reopen/read the saved text, choices, settings and actual page/path placement. An available question in a catalog is not proof that it appears on the intended registration path. Verify requested conditional logic using supported non-persisting checks; retain untested behavior accurately in technical reporting.
- Configure question definitions, not registrant answers. Do not submit registrations, create attendee/contact records, send messages or enter sample responses that persist. Known unsupported question controls or unavailable required source content block only affected requirements and dependents; continue independent work. An uncertain save still stops mutations.

Use the bound RR or explicitly approved current-job input for exact question content. A scope statement that questions are included is not their wording or choices. If the referenced source is unavailable, identify that missing source rather than inventing content, silently excluding all show questions or claiming they were configured. No separate agent, new browser or discount-API authoring route is introduced.

## Tool readiness is a prerequisite

Load [Ego](browser/controls.md) and its [Steel bridge reference](browser/references/steel-bridge.md). Use this runner's assigned executable/session, not another command server. Fixture evidence does not prove live editor support. Before attempting configuration, verify the assigned integration exposes the needed documented Ego Page operations and can inspect the actual editor—including any required frames. Do not call nonexistent UI APIs, invent Playwright-style Ego methods, import a different browser engine, or use direct CDP/evaluation as a way around a tool denial. Report a missing editing capability before promising execution.

Even an upstream `page.click`/`page.fill` method is not proof that the assigned host permits it. Follow the specific integration's skill and ownership gates. Do not fabricate RR jobs or runtime metadata to unlock the runner's controls.

## Discover the existing event

Verify the event UUID and exact displayed name before authoring and after any context-changing navigation. Observe the existing editor, catalogs and relationships. Reuse exact matches; create missing objects and update authorized event-only differences without duplicates or invented suffixes.

Use current snapshots to ground selectors. Inspect dialogs before acting; scope iframe observations to the real frame when supported. If frame coverage is unavailable, don't interpret missing snapshot text as missing configuration or use coordinates blindly.

## Configuration coverage

### Event details

Follow change-policy.md. In the Event stage, verify the selected event's exact ID/title and unpublished state, then configure RR-specified event-local location/venue, dates, times, timezone and other permitted details through supported observed controls. Never change the event title/name or ID. Check cross-sheet dates/timezone before dependent fee or discount writes; required/nonblank/unknown event dates are not covered by the blank optional-date default. Preserve shared venue definitions and integration/payment/account settings; unknown shared effects block the affected edit. Save once and independently read back the requested values, unchanged title/ID and Draft state.

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

Map exact path names, type/admission availability, page order, group/guest behavior, profile and question placement, required fields, conditional pages and supplied display text. Resolve name-or-code relationships through the source-backed workbook glossary in rr-interpretation.md, then independently bind actual Cvent IDs. Verify the path is actually connected to the intended registration experience; a created object alone is insufficient.

Keep these separate: registration path identity/name; pages belonging to that path; each page's Page title; and its Browser tab title. Match a page within the intended path, not another path merely sharing the same title. Configure each supplied title independently through the observed Page settings controls; do not copy one into the other or treat an ambiguous Description column as a title without source evidence. Preserve an unrequested existing title; missing values required for safe creation block only the affected page/dependents. Create genuinely missing requested event-local pages only through supported controls and verify their order, path assignment, titles and saved Draft state.

“Active” must be mapped to the actual documented/observed setting and source intent. Page existence or a matching name does not prove active/available, and active does not mean published. Never publish, activate an unrelated feature or infer active=true merely because the page exists. Ambiguous Active/Description fields need a specific source-cell decision, not guessed semantics.

### Questions, choices and conditional logic

- Map internal identifiers separately from displayed question text, answer codes/text and source ordering.
- Configure individual versus company/group response scope, input type, requiredness, allowed selection counts, visibility and dependent logic.
- Configure answer choices immediately after their questions within the Questions stage, before dependent logic; these are choice definitions, not attendee answers. Keep continuation-row choices attached to the right question. Compact semicolon/pipe lists follow rr-interpretation.md: require an explicit delimiter, preserve slashes and ordering, validate any parallel answer codes, and retain the question/list cell provenance. Preserve exact consent wording; do not infer opt-in defaults.
- Follow referenced taxonomy where explicitly supplied. Resolve missing taxonomy IDs rather than creating near-duplicate shared fields.
- Show/hide/requiredness logic must be tested for both triggering and non-triggering conditions. A screenshot of the default path is not sufficient.

### Optional items, vouchers, approvals and advanced rules

Configure specified non-session optional items, donations/quantity items, eligibility, availability, limits, prices and attachments to relevant paths/admissions. Map vouchers separately from discounts; verify their actual redemption/value rules rather than assuming they are interchangeable.

Configure event registration approval/preapproval flags and on-page messages when requested and supported. Email notification subjects, senders, recipients and activation settings remain excluded; this is not email configuration. This is distinct from the software project's Outlook review/approval pipeline. Apply group, guest, capacity, allotment and other advanced rules only within the supported event scope. External Personify/Sessionboard computations remain identified dependencies, not something to approximate inside Cvent.

## Save and verify

For each meaningful configuration change:
1. Know the exact intended fields, relationships and unrelated baseline to preserve.
2. Make observed edits and Save once. Don't batch unrelated editors across uncertainty.
3. Wait for a positive completion or explicit rejection; 'Saving…' is still pending. Neither an existing Save button nor disappearance of a spinner alone proves persistence.
4. After confirmed completion, independently reopen/read the saved configuration. Use only the guarded API reads authorized in runner integration for relevant discount dependencies; otherwise use the assigned browser, not an invented API route.
5. Verify connected behavior in registration preview without submitting attendee records, making payments, or sending emails.

If execution/save may have occurred but cannot be verified, stop mutations. Don't reload/navigate/retry while a save is unresolved, replace the browser, or clear uncertainty to continue. Only a confirmed rejection without persistence supports correcting and resubmitting the values.

## Exclusions and output

Do not configure Sessions/Speakers, Emails, Code Snippets, badges/onsite equipment, external integrations, attendee records, marketing communications, account administration or publishing under this reference. Preserve all unrelated configuration. Report source-referenced verified items, unresolved dependencies and precise tool limitations to the [verification reference](verification.md); never call catalog existence alone a finished registration build.
