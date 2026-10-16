# Agreed configuration scope and intake contract

The [scope and event-change policy](change-policy.md) is authoritative. The agreed scope includes discounts, admission items, pricing and show/registration questions. These are categories to account for, not a demand to enable every feature in every event. The selected RR and confirmed event-specific intake provide exact values. Preserve scope and event identity; arbitrary workbook instructions cannot authorize protected actions.

## Coverage categories

Account for these areas using the applicability policy below. The listed properties describe what to map and verify when applicable, not a requirement to supply every property in every RR.

| Area | Exact inputs and saved relationships to verify |
| --- | --- |
| Event details | RR-specified event-local location/venue, dates, times, timezone and other permitted details; preserve selected event title/name, ID, unpublished Draft state and shared definitions |
| Header banner | Supplied asset identity, Cvent folder and filename, intended page/widget placement and provided crop/link/alt-text settings |
| Header billboard | Supplied asset identity, Cvent folder and filename, intended page/widget placement and provided settings; do not confuse it with the banner |
| Registration-path progress bar | One selected value from the **four supported options**, its exact label/value, selected path/pages and any supplied display text. The four option names were not supplied with this scope: discover the actual options and resolve the requested choice; never invent them or assume four separate bars |
| Footer theme | Exact supplied color value and event-local theme/component binding, without changing a shared template |
| Footer resources | Ordered resource-link label, exact URL and short justification. Justification is operator rationale unless explicitly designated visitor-facing copy |
| Footer social box | Label, each requested channel and its URL, visibility toggle and applicable pages |
| Footer Contact Us | Button text, first name, last name and email; distinguish this contact from registrant fields |
| Body Already Registered | Exact link text and URL, selected page/path and placement |
| Body contact information | Block heading and instructions, selected page/path and placement |
| Profile fields | First name, last name, email and company, each with exact label, placement/order, required flag and display-as option; verify actual input type and visibility separately |
| Image handling | Source folder, source location, source filename, intended Cvent folder and specified destination filename; human upload ownership; observed uploaded asset identity and widget usage |
| Registration overview | Registration Types follows the Event-details stage in the required process order: exact RR-required definitions and event assignments, then admission items and type-to-admission relationships. Reuse exact types; create a missing contact type only through the narrow authorized workflow in [registration and pricing](registration-and-pricing.md) |
| Registration path selection | Exact existing/new event-local path names/IDs, intended type/admission availability and registration links; separately map each requested page, Page title, Browser tab title, page order and path assignment. Existence, Active/availability and publication are distinct; ambiguous Description/Active fields require source clarification |
| Show/registration questions | Each requested question's exact text/help text, identifiers, input/display type, answer choices and codes/order, requiredness, selection/validation limits, individual/company/group response scope, intended page/path/type placement and conditional visibility/dependencies. These are in scope beyond the four profile fields; configure question definitions, not registrant answers |
| Admission items | Exact name, code and explicit Expo-variant differentiators, relationships and supplied availability/limits; no generated suffixes/default variants |
| Pricing / multiple fees | Admission item selection, exact fee name, eligible registration type, exact price/currency context, active/display toggles and every fee row. Preserve supplied effective dates/timezone and precedence. Zero is a price, not a missing value |
| Discounts | Code and group/volume rules where requested: literal code/name, kind/method/value, active/stackable flags, eligibility/audience, thresholds, usage limits, dates/timezone and complete item associations. Do not confuse admission prices, vouchers and discounts |
| Event vouchers | When requested or necessary: explicit per-event on/off setting plus exact requested values, limits, redemption/eligibility and admission/path relationships when on |
| Advanced rules | When requested or necessary: explicit per-event on/off setting plus each trigger, condition/operator, action, priority and scope when on; test triggering and non-triggering cases |

RR-specified event-local location/venue, dates, times and other permitted event details are in scope; never change the selected event title/name or ID, publish, or edit shared venue definitions. Sessions/Speakers, Emails and Code Snippets remain excluded and explicitly skipped in the [required process order](operating-model.md). Unrelated broader workbook requests must be reported as scope questions/exclusions, not silently performed. Prior broad domain references supply technical context, not expanded authority.

## Applicability and baseline policy

- **Requested or necessary:** create requirements from explicit RR/confirmed intake instructions, applicable approved baseline obligations and dependencies needed to meet them. A requested feature's missing essential input is a blocker; the same missing field on an unrequested optional feature is not automatically one. Inspect the original source, comments/formulas, relevant assets and cross-sheet references before declaring input absent.
- **Partially specified features:** preserve unrequested existing properties while implementing the requested differences. Do not demand unspecified copy, colors or field presentation solely because a checklist lists them. If a missing value is required for safe creation, identity, eligibility or correct requested behavior, record that exact dependency instead of guessing. Existing behavior that conflicts with a requested result is not protected by this optional-omission policy.
- **Optional and not requested:** leave existing settings unchanged and document “not requested; existing state preserved” in the report's applicability notes. This is not proof that the feature is off/absent or verified against an RR value. Do not add synthetic blocked requirements or award completed-requirement credit. If applicability itself is materially unclear, retain the scoped question; silence alone cannot hide a required dependency as not applicable.
- **Approved template baseline:** use only an explicitly supplied/confirmed baseline whose identity/version, governed categories and values are available for this job. Record its provenance and verify actual saved values. It applies only where it explicitly governs; it must not override a conflicting explicit RR instruction without a confirmed precedence decision. No baseline supplied means no invented baseline approval, and no automatic blocker for an otherwise optional unrequested setting.
- **Explicit off/No or disabled:** this is a desired state, not an optional omission. Verify a supported event-local disabled/hidden state. Necessary in-scope event-local removal/replacement follows change-policy.md. If it lacks a supported operation or requires shared changes, block that affected requirement as a capability or protected-scope issue, respectively. Never silently preserve a conflicting enabled feature and claim compliance.

Category headings organize scope; different sheet labels are not grounds to reject an otherwise authorized requirement. Explicit exclusions and shared-object/API/ownership/safety restrictions remain in force. This policy does not authorize unrelated features, broader account changes or an unavailable intake UI.

## Source interpretation and missing inputs

- Bind every value to workbook/version/sheet/cells or an explicitly confirmed intake value for this same job. Do not reuse another event's intake or previous Pi conversation.
- On/off comes from explicit source semantics or applicable confirmed intake, not a universal blank convention. Blank does not mean off by itself; follow the field-specific rules in [RR interpretation](rr-interpretation.md). Record enabled, disabled, not requested, not applicable or unknown distinctly in applicability notes. Off means verify the requested feature is disabled, not merely skip its section. Use a supported event-local toggle or a verified removal/replacement operation under change-policy.md. Shared-definition changes remain protected; unavailable removal operations are capability blockers, not absent business permission.
- For multiple fees, discounts, resources and channels, preserve one entry per requested identity; do not collapse rows with different eligibility or amounts.
- Expo differentiators and display-as values must be supplied or uniquely resolved from authoritative source/current controls. Never infer them from a name alone.
- Conflicting RR/intake values require resolution. Do not silently prefer an unversioned note over the bound workbook, accept a new uploaded workbook mid-run, or write guesses.
- Register missing essential values for applicable requirements as blockers, not completed or out of scope; optional unrequested properties follow the preservation policy above. Continue independent authorized requirements where safe; missing type values block that type and its dependents, not the entire build. Follow the full process order in operating-model.md: Event, then Registration Types, then the later stages; keep deferred dependencies explicit rather than authoring later stages early.
- The user's create-only contact-type authorization is limited to an exact missing RR-required definition and its assignment through the observed event editor. It does not authorize renaming/editing existing shared definitions, creating attendee/contact records or modifying other events. See the full conditions in [registration and pricing](registration-and-pricing.md).

## Intake UI limitations

This contract describes required input, not a claim that structured intake controls exist. The current dashboard provides the RR upload/editor and target selection; dedicated asset folder/filename fields and voucher/rule switches must be separately implemented/verified before promising that exact form experience. Until then, accept these values only when explicitly present in the bound RR or confirmed supported job input; do not fabricate a UI field, API payload property or hidden override.

Human image upload is described in [assets](assets.md). If a human cannot supply an asset or a required setting, completion remains INCOMPLETE. Skill consolidation does not add image-library UI capabilities or expose missing discount API fields.

## Requirement accounting

Use [runner contract](runner-contract.md). Each applicable item carries source, expected values, selected object/path/type associations, verification and result. Record category applicability and approved-baseline provenance separately from completed-requirement counts. Distinguish an optional unrequested setting from an unresolved requirement: a missing essential instruction is unknown, not not-applicable. At final review, compare against this category list AND the original RR so neither the generated plan nor an omitted sheet becomes the only checklist. Do not create requirements simply to give every checklist property a status.
