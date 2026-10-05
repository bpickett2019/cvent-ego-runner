---
name: cvent-rr-build
description: Coordinate an RR-driven Cvent website and registration build. Pi interprets each workbook, creates its own dependency-aware plan, chooses broad specialist skills on demand, discovers the current UI through Ego, and verifies saved results against the RR. Use for a complete build, scope assessment or planning—not a fixed template or click sequence.
---

# RR → Cvent configuration

The RR defines the desired result; Pi determines how to achieve it within the authorized scope. Interpret each workbook and inspect the live event rather than following a hardcoded template or menu sequence. Choose specialist instructions when useful and adapt the plan as dependencies and current UI behavior become known.

One Pi session owns the work. Skills are instructions for that assistant, not separate agents. This skill starts no agent, provisions no services, grants no account access and implements no runtime guardrails.

Read [operating model](references/operating-model.md), [runner integration](references/runner-integration.md) and [RR interpretation](references/rr-interpretation.md) before planning. These are local references; the runner integration supplies tool bindings and operating boundaries without a SOW dependency.

## Required inputs and access

- The job's explicitly selected RR workbook/version and checksum, not a folder of example workbooks.
- The explicitly selected target Cvent event and its observed API UUID/browser identity. Never infer a destination from workbook text alone.
- User authorization for the configuration task and its boundaries. Installing/loading skills or reading an RR does not authorize live changes.
- Valid API credentials and necessary grants for discounts; human browser login and approved control of the assigned Ego + local Steel session for the rest.
- Supplied assets, template/reference-event choice and any necessary missing-value decisions. Do not clone or reset an event without separate authorization.

Use the immutable workbook path/checksum and authorizedEvent from this runner's job message. Read the unchanged original for full interpretation; the UI preview does not capture all workbook semantics. Never follow a replacement selection or choose an event from workbook text.

## Use the verified handoff

The runner handles browser preparation, human login and exact API/browser event verification before launching this Pi session after Return to Agent. Do not rerun a different application's upload/lookup workflow. Confirm the assigned browser still shows the bound event and unpublished state before authoring. Lost identity/control, expired login or a changed target stops work rather than silently retargeting.

Keep API login separate from browser login. Use the guarded discount adapter and assigned Ego executable described in [runner integration](references/runner-integration.md), without searching for credentials or starting another browser/agent. Loading these skills alone authorizes no live work.

## Plan and adapt

There is no prescribed editor order or stage-by-stage script. Maintain these responsibilities while choosing the order that this RR and event require:

- **Understand the source:** inspect authoritative sheets, comments, formulas, merged cells, formatting and cross-sheet relationships. Map applicable requirements to source cells and exact desired values. Don't turn template guidance into configuration or assume another workbook's column layout.
- **Bind the target:** before authoring, verify the event ID, displayed name and unpublished state. If it is already published or its identity is ambiguous, stop for a decision rather than unpublishing or selecting another event.
- **Inspect what exists:** discover the current Cvent UI through Ego and use complete API catalogs where relevant. Reuse exact matches, edit authorized differences and create only confirmed missing configuration. Treat historical selectors as hints, not authority.
- **Choose skills and dependencies:** load the relevant specialist for the next meaningful piece of work. Use the API for discounts and assigned Ego/local Steel for the remaining configuration as requested. Item-specific discounts may require admissions first; linked site content may require a registration path. Reorder or revisit domains accordingly.
- **Check real capabilities:** distinguish SDK documentation, installed callable actions and live-proven behavior. Check the assigned Ego/Steel bridge reference and guarded API operation map from runner integration. Offline/fixture tests are not Cvent acceptance; don't restart an active human session or bypass missing support.
- **Verify continuously:** establish saved values and relationships after changes and before dependent work. Use `cvent-rr-verify` to compare against the original RR before declaring completion, including requirements the initial plan might have missed.

Keep the RR/version, target event UUID/name, assigned runtimeId, observed resource IDs, source requirements and saved verification in the same task context. No agent-per-skill, mandatory external ledger, new runner or automatic paid audit is needed. Inspect and decide routine tool/editor choices yourself; ask only for unresolved intent, authority, human-only steps or actual prerequisites.

Specialists available on demand (project-local siblings; load only those needed):
- [cvent-discounts](../cvent-discounts/SKILL.md) — RR discount mapping and guarded API execution.
- [cvent-registration](../cvent-registration/SKILL.md) — admissions, pricing, registration paths, questions and rules through the browser.
- [cvent-website](../cvent-website/SKILL.md) — event website, theme, branding and widgets through the browser.
- [cvent-rr-verify](../cvent-rr-verify/SKILL.md) — requirement-by-requirement saved-state and preview verification.
- [runner integration](references/runner-integration.md) — the existing API/browser connections and dashboard result contract.

## Exactness and safety

- Preserve intended display text, literal names/codes, amounts, dates, ordering, eligibility, limits, and relationships. Semantic spreadsheet interpretation is necessary; don't blindly copy stored numeric values.
- Never invent missing dates, prices, codes, defaults, suffixes, eligibility or assets. Ask about ambiguities affecting a dependent operation; independent authorized work may continue if safe.
- This build excludes Sessions/Speakers and prohibits publishing and attendee access. Do not configure those because they appear in the workbook. Preserve existing unrelated and shared configuration; unknown cross-event effects block the proposed change.
- No deletion/archive, account administration, payment-account provisioning, credential changes, event renaming, publishing or sending communications under this configuration skill. If exact compliance appears to require removal or broader scope, report the conflict for an explicit scope decision.
- Wrong event, operator takeover/Stop, login expiry, secret exposure or uncertain write outcome stops further mutations. Do not replay a save, switch to API/browser to bypass a denial, clear ownership locks, or fabricate runner state.
- A known unsupported feature before execution blocks its dependents. A potentially executed write with an unknown outcome is a different condition: reconcile before continuing.

## Report

Return: target event identity; workbook/version; verified configuration; blockers with source references; explicitly out-of-scope requirements; and final publication status. Use **DONE**, **INCOMPLETE**, or **STOPPED** for the RR website/registration work, following the existing [runner contract](references/runner-contract.md) for dashboard progress and final Markdown/JSON. Keep evidence local and minimal; never include credentials or attendee information.

These Markdown instructions are not deterministic access controls, a cost ceiling, automated acceptance tests, or a guarantee of full Cvent capability. No live build is authorized or proven by their installation.
