# Authoritative scope and event-change policy

This file is the single business-policy authority for the cvent-event-build skill. Other references describe techniques and installed capabilities; they do not expand scope. The confirmed RR/approved corrections define values, not execution permissions. Follow actual ownership, identity, uncertainty and supported-operation gates.

## Included and excluded

- In scope: RR-specified event-local details, including location/venue, dates, times and timezone; agreed event-local website/footer/profile configuration; registration types and paths; questions and choices; admissions, fees/pricing; discount codes and group/volume discounts; non-session optional items, vouchers and advanced rules. Event-detail permission does not authorize editing shared venue definitions, integration identifiers or payment/account settings; use only supported event-local operations.
- Out of scope: Sessions/Speakers, Emails (email settings and communications delivery), and Code Snippets. Keep these stages explicitly SKIPPED in the required process order; they receive no completion credit. Registration approval flags, on-page messages and website contact-email text are distinct from email notification configuration.
- Never change the selected event title/name or ID; keep it unpublished Draft. No event deletion/reset/cloning, attendee records, payments, account administration or other-event changes.
- Existing shared definitions/templates remain protected. The existing create-only missing-contact-type exception remains separately governed by registration-and-pricing and authoritative JOB.executionCapabilities.sharedContactTypeCreation; event-local deletion permission never overrides a disabled capability or authorizes shared removal.

## Event-local deletion and replacement: authorized, capability-dependent

The operator authorizes necessary deletion/replacement of in-scope objects belonging exclusively to the selected event. This is not a blanket no-delete policy, nor authority to remove unrelated objects, shared definitions, the event itself, evidence, profiles, locks, uncertainty markers or accounting.

Before an eligible removal/replacement, establish the RR requirement or confirmed correction, exact object identity and event-exclusive ownership, baseline properties, references/dependents and intended resulting state. Preserve evidence, dispatch only a supported scoped operation once, and independently verify both removal and replacement relationships. Unknown scope or possible effects on other events blocks the affected operation. Blank cells, absent rows, editorial colors and a vaguely matching name are not standalone removal instructions.

**Current capability boundary:** the installed browser transport does not yet expose a verified event-owned-object delete operation. The discount API supports explicit event-only AdmissionItem/QuantityItem association removal through `removeAgendaItems` with an observed discount ID and a nonempty desired full item set; follow the discount reference's baseline, active-state, single-dispatch and readback restrictions. This removes links, not questions, choices, discounts or agenda-item objects. Whole-object deletion/replacement remains a capability blocker until a reviewed browser implementation is enabled. Do not describe it as excluded from business scope. Do not remove words from deny-lists, use raw HTTP, forge runtime state or switch transports to bypass a denial. Reuse a supported edit/disable only when it genuinely meets the requested result. Otherwise keep the exact unmet requirement visible and continue independent safe work.

## Source conflicts and completion

Use decoded Excel values plus formats, original source cells, comments and approved correction provenance. Date strings/serial values and cross-sheet mappings must be checked for contradictions before dependent writes. Do not silently swap month/day, select a competing path, or invent a priority rule. This policy does not itself approve a correction to any existing workbook.

Every in-scope requirement stays represented through Stop or completion. Keep clear requirement labels and use existing status, verification, reason and status-bound presentation fields; no new execution schema is required. Unverified does not mean untouched; saved fields without all required checks are still unfinished. Excluded work is separate and receives no completion credit.

Stop and preserve evidence immediately on uncertain external effects or lost control/identity. Do not keep executing to write a final report. If Stop prevents a report, the retained ledger is the available evidence; a final report may be absent. Do not imply that a report exists, claim the UI has been changed, or start a summarization agent. Dashboard visibility/report-fallback changes are separate implementation work, not a prompt capability.
