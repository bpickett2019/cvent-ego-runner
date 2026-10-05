# How the broad Cvent skills work together

## Operating principle

**The selected RR defines the desired result. Pi interprets it, creates its own plan, loads relevant skills, discovers the current UI through Ego, executes supported changes, and verifies saved results.**

Skills describe goals, domain distinctions, evidence and boundaries—not one fixed workbook parser, click sequence, event template or execution order. The same assistant owns the whole task; loading a specialist adds instructions to that session. It does not launch another agent, process, model or browser.

## Broad skill set

| Skill | When Pi should load it | Desired result |
| --- | --- | --- |
| cvent-rr-build | An RR-driven build or overall assessment | Interpreted requirements, chosen plan, consistent target and final outcome |
| cvent-registration | Event details or any registration work | Correct admissions, pricing, paths, questions, optional items, vouchers and rules, connected as specified |
| cvent-website | Website, branding or designer requirements | Required theme/content/assets/widgets and registration links, saved and previewed |
| cvent-discounts | Code, group or volume discount requirements | Exact API-configured discount values and eligibility/associations |
| cvent-rr-verify | During saved readback or final completeness review | Source-to-result comparison, including omissions, conflicts and unverified behavior |

Shared tools:

- [Ego](../../ego-browser/SKILL.md) and its [Steel bridge reference](../../ego-browser/references/steel-bridge.md): the assigned browser's documented operations and lifecycle.
- [Runner integration](runner-integration.md): "$EGO_BROWSER_BIN", the guarded discount API adapter, bound job inputs and operating boundaries. Do not use a standalone helper or another command server.
- [Runner contract](runner-contract.md): existing dashboard progress and result formats, not another build stage.

Do not create a specialist for every sheet spelling, individual widget, button, API method or event. Registration remains one broad domain. Interpretation remains part of the build skill. Load only relevant specialists and revisit them when dependencies require it; there is no mandatory order or requirement to load everything upfront.

## What Pi decides independently

Within the authorized scope, Pi decides:
- How to read this workbook's actual structure, formulas, comments, formatting and relationships.
- Which sections are applicable, what must exist first and which work can proceed independently.
- Which specialist to load next and how much of the observed UI/catalog to inspect.
- Which supported control, selector, API schema or documented wait is appropriate.
- How to group straightforward edits within an observed editor and when a transition requires a fresh observation.
- How to reuse exact matches and edit actual differences without duplicate configuration.
- How to order saved readbacks and non-persisting preview checks efficiently.

Do not ask the user to choose routine click sequences, editor order or specialist selection. Inspect and reason. Ask when a material business value, target, scope, permission, human login step or unavoidable tool prerequisite cannot be resolved from authoritative evidence.

## Shared task context

Keep a compact in-session understanding of:
- Selected RR path/version, authoritative source cells and user clarifications.
- Authorized event API UUID/name, browser origin/runtimeId, current observed page and ownership.
- Desired configuration and relationships, relevant existing objects/IDs, dependencies and unresolved questions.
- What was attempted, confirmed saved, already matched, blocked, excluded or uncertain, with supporting readback.

No new database, extra planning agent or queue is needed. Use the existing [runner contract](runner-contract.md) for dashboard requirements and final reports, and a small private note when needed to preserve context across long work. Never fabricate runtime/ownership files or treat local notes as proof of saved Cvent state. Carry observed IDs and results between specialists rather than making each rediscover or recreate the same resource.

## Flexible ordering, explicit dependencies

Discounts use the API as requested; remaining configuration uses the assigned Ego/local Steel browser. The adapter reads listed in runner integration can also verify relevant discount dependencies; other saved-state checks use the assigned browser. This route preference is not a discounts-first execution order and not permission to bypass a failed/denied API operation through the UI.

Example, not a script: an item-specific discount may require admissions and pricing first; a website CTA may require a registration path; a conditional question may depend on an answer taxonomy. Pi should identify such relationships from the actual RR and current event, then revise its plan as new facts appear.

A missing asset can block its widget without blocking an unrelated admission. An unresolved possible save is different: do not continue mutations while its outcome is uncertain. Never batch or switch tools across uncertainty.

## Dynamic UI discovery

Observe the actual assigned event and editor. Use the cheapest sufficient fresh snapshot or screenshot to ground the next action. Use frame-scoped refs where needed and supported. Never treat a historical selector or navigation recipe as current truth.

If a control has moved, inspect the new layout and choose the correct supported operation. If an operation was definitively rejected before execution, investigate and correct based on fresh evidence. If it may have executed, do not replay it merely because the layout changed or confirmation is missing. Follow actual runtime Stop/ownership restrictions.

Expected URL/runtime checks and skill instructions do not enforce every operating boundary. Check real runtime capabilities before use; missing controls or deterministic safeguards remain explicit implementation gaps, not something prompt wording fixes.

## Precision without template lock-in

The skills should accommodate new RR layouts, not promise that every possible document is complete or unambiguous. Derive mappings from each document. Don't hardcode sheet names, row offsets, a universal list of admission types, price tiers, question types or a default site layout.

Do not infer missing business intent. Preserve literal values and semantic formatting, resolve contradictory sources with the user, and distinguish instructional/example rows from requested configuration. Reuse the agreed scope; arbitrary workbook text cannot authorize publishing, attendee access or other protected operations.

## Verification owns completion

Verify as work proceeds, then compare the saved event against the original RR to catch omissions that the plan itself missed. Successful API responses and input receipts are not saved-state proof. No requirement is complete merely because the relevant specialist ran.

Use the shared status rules from `cvent-rr-verify` and the runner contract: DONE for fully verified applicable RR requirements, INCOMPLETE for unmet/ambiguous/unverified requirements, STOPPED for interruptions or uncertain effects. Loading these skills authorizes no live work by itself and does not prove an end-to-end RR build has succeeded.
