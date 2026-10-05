---
name: cvent-rr-verify
description: Verify that saved Cvent website and registration configuration matches an Emerald RR workbook exactly within the build's operating boundaries. Use after API/browser changes or for an authorized read-only audit. Compare requirements, relationships and preview behavior, identify omissions or conflicts, and report DONE, INCOMPLETE or STOPPED without publishing or creating attendee records.
---

# Verify RR against saved Cvent configuration

Read [runner integration](../cvent-rr-build/references/runner-integration.md) and [RR interpretation](../cvent-rr-build/references/rr-interpretation.md). This is verification within the current task—not another agent, an automatic paid audit or the entire contractual UAT program.

## Work as a broad specialist

Read [operating model](../cvent-rr-build/references/operating-model.md). Pi can load this skill during incremental readback or at final review; it is not a separate agent or rigid last-only phase. Adapt the checks to the actual RR, selected event and distinct behavior being configured. Don't require irrelevant features simply because they appear in the coverage list.

Choose the cheapest sufficient independent evidence from supported API reads, saved editor settings and non-persisting previews. Reuse valid observations while checking for changes that invalidate them. Revisit the original RR to identify omissions instead of treating the generated plan as the source of truth. Pass specific discrepancies back to the appropriate broad skill within the same session; do not automatically dispatch a new run or replay an uncertain operation.

## Inputs

Require the exact selected workbook/version, authorized event identity, source-mapped requirement list, explicit scope decisions and observed results of any changes. If the requirement list was produced by the same build, revisit the original workbook to detect omitted requirements; don't merely approve the builder's checklist.

Verification is read-only unless the user has authorized the overall build and corrections remain within that scope. Do not repair an uncertain write by repeating it. Do not launch new sessions or collect attendee data just to make verification easier.

## Establish what is being verified

1. Reconfirm event UUID, displayed name and unpublished status. Verify the API and browser refer to the same event when both are used.
2. Confirm the workbook version and authoritative sheets; include applicable comments, formulas and cross-sheet references. Don't use an earlier workbook snapshot after source changes.
3. Separate included configuration, explicit exclusions, unresolved scope questions and missing prerequisites. Out-of-scope Sessions/Speakers are not completed work. An unsupported in-scope widget/question is blocked, not excluded.
4. Use fresh saved-state observations, not just prior tool output or a local intended payload. Reads may be through documented API endpoints or the supported assigned browser; respect ownership and tool limits.

## Compare values and relationships

For each applicable requirement verify:

- **Details:** exact supplied descriptions, dates/timezone, location, deadlines, capacity and relevant visibility.
- **Types/admissions:** correct code/name pairs, intended item identity, descriptions, availability, limits, type-to-admission mappings and path exposure.
- **Pricing:** values/currency context, effective windows, boundaries, tier ordering, and which types/items receive each price. Distinguish zero, missing and unlimited values.
- **Discounts:** code/name/type, active/stackable settings, method and amount/percent units, dates, usage/audience rules, volume thresholds/intervals and complete eligible-item relationships. Verify existing unrelated properties were preserved.
- **Paths/questions:** page order, exact display text and answer codes/order, individual/group response scope, requiredness, selection limits, conditional visibility and validation.
- **Optional items/vouchers/rules:** correct values, limits, eligibility, redemption semantics and connections, not merely object existence.
- **Website:** correct event-local theme, supplied assets, header/footer, required widget types/content/order, link destinations, registration connection and relevant responsive rendering.
- **Preservation:** no unauthorized changes to event identity, unrelated values, shared objects, other events or protected settings.

Compare in both directions: missing requested configuration, and extra/conflicting existing behavior that prevents the RR from being satisfied. Duplicate names, unintended eligible items and stale references are not an exact match. Report removal conflicts instead of silently deleting or overlooking them.

## Verify behavior safely

Use the Cvent preview/test surface, without submitting a live registration, making payments, sending emails or exposing attendee/registrant records.

Cover each distinct applicable registration path/type and every distinct pricing/eligibility/conditional-rule combination. Group genuinely equivalent cases to avoid redundant work, but record which requirements each case establishes. Include boundary conditions for price dates, quantity/group thresholds, required fields and discount applicability where a non-persisting test surface supports them.

Do not manipulate the system clock or production settings to force a test. If the UI cannot preview a future tier or a rule's behavior without a prohibited side effect, use saved-state verification and mark behavioral validation untested. Do not call it behaviorally verified from a screenshot of the default path.

Discount field readback and preview math should agree. If the rule exists but doesn't apply to the intended admission/path, it is not complete. A working button leading to the wrong event is a failure, even if its label matches.

## Completion rules

**DONE — RR website/registration requirements** only if:
- Every applicable in-scope requirement has resolved source values and verified saved configuration/relationships.
- Required preview/behavior checks passed, with no material unresolved or untested requirement hidden in notes.
- No duplicate/conflicting configuration prevents the desired result.
- The selected event remains unpublished, and no current write uncertainty or identity/control issue remains.

**INCOMPLETE** when any applicable requirement is blocked, missing, ambiguous, unsupported or unverified. List the precise source, unmet desired state, observed state and decision/tool needed. Do not describe a partial build as 'complete except for…'.

**STOPPED** on operator Stop, identity/control loss, expired login, secret exposure, crash/disconnect or unresolved possible write effects. Preserve evidence and IDs without replay or deletion. State which verification was not performed.

## Final report format

Write dashboard progress and final Markdown/JSON using the [runner contract](../cvent-rr-build/references/runner-contract.md). Its DONE status is the runner's spelling of complete, not a weaker verification standard. Use only the discount adapter reads and assigned browser allowed by runner integration.

- Target event identity and workbook/version.
- Overall status and observed publication state.
- Verified matches and changes, grouped by configuration area.
- Blockers/unverified items with source cell/range and concrete reason.
- Explicit exclusions and scope questions, separately from blockers.
- Small evidence references and preview checks performed; no credentials, attendee records or bulk dumps.

This report proves only the observations actually made. It does not certify Azure/M365 deployment, audit controls, budget enforcement, all 21 workbook variants, arbitrary future Cvent UI behavior, or unrelated software-delivery acceptance criteria.
