# One skill, one session, ordered configuration

The bound RR and confirmed intake define exact desired configuration within [agreed scope](scope-and-intake.md). Use technical references within the operator-required order below, without changing agents, tasks or browsers. This instruction is not a hardcoded UI script, new workflow engine or guarantee of tool support.

## Required full-process order

1. Event
2. Registration Types
3. Admission Items
4. Sessions — SKIPPED: out of scope
5. Optional Items
6. Fees
7. Discount Codes
8. Volume Discounts
9. Website
10. Footer Links
11. Registration Paths
12. Questions — configure answer choices immediately after their questions
13. Emails — SKIPPED: out of scope
14. Code Snippets — SKIPPED: out of scope

Event begins with exact selected-event identity and unpublished-state verification, then RR-specified event-local location/venue, dates, times, timezone and other permitted details. Never change the event title/name or ID. Shared venue definitions and other protected settings remain unchanged. Skip excluded stages without configuring them or crediting them as completed. Optional unrequested stages preserve existing settings and receive no synthetic completion credit; the order does not make every category mandatory.

## Shared context

Carry the same event UUID/name, workbook/checksum, source mappings, observed object IDs, selected path/type/admission associations and saved evidence throughout. A reference read does not create a new Pi session or authorize another event. Stop/Clear are app controls, not skill commands; never alter ownership files to continue.

## Planning responsibilities

Inspect original sheets, comments, merged values, formatting and relationships using [contextual interpretation](rr-interpretation.md). Build source-backed requirements before Cvent inspection and add omitted requirements when discovered. Distinguish applicability from input completeness: missing essential values for applicable work are blockers, not exclusions; optional unrequested settings follow the preservation/approved-baseline policy in [scope/intake](scope-and-intake.md). The checklist is a coverage aid, not a source of synthetic requirements. A clear authorized RR mismatch with live Cvent is work to perform, not itself a conflict requiring confirmation. Preserve separate names/codes/display text and source-backed type/admission/fee/path/eligibility relationships.

Read [registration and pricing](registration-and-pricing.md) before the Event stage. At each stage, configure and independently verify every executable applicable requirement; record specific blockers and affected dependents before advancing to the next stage. Registration Types follows Event and precedes admissions, optional items, fees and discounts. Discount Codes precedes Volume Discounts; Website precedes Footer Links and Registration Paths. Read each domain reference before writing and reuse verified IDs/evidence. Do not reorder whole stages for convenience.

Read-only prerequisite discovery may occur early, but missing later-stage dependencies do not authorize early authoring of that stage. Keep the affected relationship explicitly unfinished, continue independent work in the required order, and complete only the deferred connection when its prerequisite has been verified in its scheduled stage. Recheck the saved connected result; if the prerequisite remains blocked, its dependents remain blocked too. Do not create placeholders or duplicate substitutes, invent values, broaden eligibility or claim completion from object existence. For example:
- Verified registration types, admissions and optional-item relationships are required before dependent fee or discount writes.
- A Website/Footer Link needing a not-yet-created registration path stays unfinished until Registration Paths provides the verified intended URL; then complete and verify that deferred link, not an early path build.
- Header images need the exact human-uploaded assets.
- Questions include answer choices immediately after their questions, before dependent logic; never enter persistent attendee answers.
- Vouchers, approvals and advanced rules remain applicable only where requested or necessary within scope. Handle them with their owning stage/relationship once its dependencies are verified; do not add or reorder stages.

A missing asset blocks that widget, not unrelated pricing. A missing discount eligibility capability blocks that discount before authoring, not permission to broaden it. Record source, missing value/capability, affected dependency and next decision, then select another independent executable requirement in the required stage order. An ordinary pre-write selector/navigation failure calls for a fresh observation and supported navigation—not immediate terminal INCOMPLETE or STOPPED. If the action might already have written, classify it as uncertainty instead. Before normal settlement, account for every remaining requirement as verified, specifically blocked or genuinely excluded; do not abandon executable work because another item failed.

For an ordinary pre-write blocker, record the named item, exact field/header, worksheet/cell, why it cannot be completed, affected dependents and the specific operator action in the existing requirement record. Mark it blocked (or partially_verified only when saved evidence supports partial progress); keep it in Needs attention and continue independent requirements in the required order. Missing required data for one discount blocks that discount, not the other complete discounts. Do not retry the same missing value or failed navigation without new evidence. A supported Cancel may leave a known unsaved editor only when no write/save is pending or possibly executed; never cancel/navigate as recovery from uncertainty. There is no five-attempt rule, automatic skip timer or authorization to continue a hung/uncertain tool call.

Known post-Save rejection with confirmed non-persistence permits a source-backed correction or requirement-local blocker; pending Save, unknown persistence, identity/control loss or a runner safety hold does not. Any possible unverified external write stops further mutations; do not switch editors/tools around uncertainty. Current runtime safety stops terminate Pi/browser and cannot be turned into continuation by skill wording.

## Current UI and transport

Discover controls through current assigned Ego snapshots; use screenshots where semantics are insufficient. Do not infer object absence from missing iframe content or treat historical selectors as current truth. Use only documented installed callable controls, with host ownership/identity restrictions authoritative.

[Runner integration](runner-integration.md) binds existing browser and guarded API tools. Discounts use the supported API; remaining authoring uses the assigned browser. No new agent, direct HTTP bypass, extra browser, automatic paid audit or old-run continuation. Follow [change-policy.md](change-policy.md) for permitted event-exclusive changes and protected shared objects; unsupported removal remains blocked. Preserve no-publish/no-attendee boundaries and all runtime guards.

## Completion

Verify each change after Save and compare saved values AND relationships with the requirement. Use supported non-persisting preview for behavior. Return to the original RR and [verification](verification.md) before claiming DONE so the generated plan cannot certify its own omissions. A source/fixture test, loaded skill, HTTP200 or successful click is not a live saved-result or commercial acceptance.
