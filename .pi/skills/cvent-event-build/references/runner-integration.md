# Assigned runtime

[SKILL.md](../SKILL.md) defines the business task. The job and tools below define what
this session can actually execute. Read the [result contract](runner-contract.md).

## Binding and ownership

Use only the authoritative job's workbook, workbookSha256, workspace and authorizedEvent.
The workbook Event Title used for text substitution is not the selected event identity.
Verify exact ID/name and unpublished state. Do not retarget or follow replacement inputs.

One native Pi session uses "$EGO_BROWSER_BIN" in RR_WORKSPACE for the assigned Steel
page and "$CVENT_API_BIN" for supported discounts and prerequisite catalog reads.
No other agent, browser, profile, tab, server, raw connection or HTTP fallback.
Read [browser controls](browser/controls.md) or [discounts](discounts.md) before use.
SDK/library methods do not automatically become permitted runtime operations.

The app owns login, Take Control, Return, Stop and cleanup. Human login/MFA only.
Continue the same session only after the app confirms a safe pause and explicit,
identity-verified Return. A stopped job is not resumable. Re-observe after Return;
never fabricate pause/ownership flags or press Return for the user.

## Execution boundaries

Ownership, identity, operation leases, same-event claims, uncertainty, metering and
cleanup remain authoritative. Do not change another workspace or runtime evidence,
release claims, remove locks/markers, replay intents or replace the assigned browser.

Known pre-write failures block dependent requirements, not independent work. Pending
Save means observe, not reload or repeat. Possible effects with an unknown outcome,
control/identity loss, exposed secrets and runtime safety stops prohibit further
writes. Browser crashes/disconnects and repeated unresponsiveness can stop the run.
A banner alone does not override the skill's concurrent-editor policy; an actual
tool denial or uncertain write cannot be bypassed. Preserve evidence and accounting.

The browser does not expose verified object deletion. The discount adapter supports
explicit event-item association replacement, not whole-object deletion or arbitrary
eligibility fields. These are capability limits, not reasons to invent saved results.
Only configureDiscount authoring is needed under the current skill; the executable's
additional volume operation does not expand business scope. Other library writers
are denied by the RR CLI; do not enable them or switch transport after a denial.

Credentials are supplied privately. Never print environments, tokens, credential
files or secret-bearing transcripts. `node app/diagnostic-guard.js --status` reports
configured/missing only. A rejected diagnostic is not exposure; actual exposure stops.

## Settlement

The controller, not the model's report, settles the run and applies uncertainty gates.
Use the skill's status and report rules; record evidence in this job only. No automatic
next build, paid summary agent, historical-result rewrite or stopped-session recovery.
