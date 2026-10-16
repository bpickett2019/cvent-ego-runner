# Client-approved configuration policy

This source change follows staging checkpoint `8d727a1`. Deployment is a separate
operation; Git HEAD alone is not deployment or live acceptance evidence. The exact
client-approved skill is `.pi/skills/cvent-event-build/SKILL.md`.

`deploy/client-policy-manifest.json` enumerates all 10 changed and eight deleted
source paths. No runtime guard or discount adapter changes are included. Required
source deletions were checked against all three staging hosts before preparation.

The skill controls included tabs, defaults, judgments, sequence and configuration-only
acceptance. The runtime still controls identity, ownership, uncertainty and cleanup.
DONE means saved configuration under approved rules; registration testing was not
performed. Historical result data is not rewritten. Only new-policy metadata permits
the explicit no-testing assertion; older DONE results refer to their retained report.

Footer separation remains unverified. Inspect the assigned event through an authorized
session before the next build; do not assume per-path footers or edit another event.
No Cvent login or browser access was used to prepare this source change.

## Every substantive rule removed or superseded

The Git diff against the preceding checkpoint is the full line-by-line record. The following is the business-rule inventory, not a claim that every
old paragraph was a distinct rule:

1. Old change-policy/reference precedence over the primary skill → client SKILL.md
   wins business disagreements; actual executable restrictions still win denials.
2. Universal/contextual workbook-layout scope → the client's explicit nine-tab profile
   and row/column filters; no broader category checklist creates requirements.
3. Optional Items and their fees → excluded. Fees now only Admission Item rows.
4. Volume Discounts → excluded; executable adapter capability remains unchanged.
5. Theme selection/search → excluded; no missing-theme blocker for this build.
6. Session/Optional Item discount columns → ignored as the client directs, not used
   to construct desired item eligibility.
7. Additional standalone asset/header/profile/voucher/advanced-rule checklist duties
   → only requirements requested inside the included tabs under the skill apply.
8. Old fourteen-stage order/skipped-stage scaffolding → client's nine-stage order;
   answers still immediately follow their questions.
9. Broad prohibition on generated/default values → approved Fee Name, NULL codes/text,
   zero numeric, No boolean and required-date defaults when creating only.
10. Blank Automatically apply always blocks creation → approved No when required on
    creation; blank existing values remain preserved.
11. Blank required capacity always blocks → approved unlimited/native option, discount
    -1 or 100000 fallback under the skill. Rejections remain unfinished.
12. Blank optional dates always clear existing bounds → preserve existing blanks;
    explicit None clears a supported existing date restriction.
13. Missing/duplicate answer codes and duplicate labels always require clarification
    → deduplicate using first code, and omit missing/duplicate codes as specified.
14. No generated code suffixes → approved uppercase/alphanumeric NULL- base, fitting
    field limits, numbered collisions and verified prior-object reuse.
15. Literal-only name matching/no spacing normalization → code first, then ignore
    spaces around pipes when matching names; shared definitions are not renamed.
16. Optional legacy mapping-guide lookup → removed; use current workbook/policy.
17. Semicolon-or-pipe compact-list convention with all duplicates as blockers →
    semicolon/newline lists with the client's explicit duplicate/code handling.
    The existing optional helper itself is not changed or claimed to implement this.
18. Same-property cross-tab conflicts always await a decision → explicit Registration
    Paths precedence and skill-approved judgments, with original values retained.
19. Reversed dates always block → approved following-year adjustment, disclosed.
20. Show-name placeholders always await supplied replacement text → substitute the
    workbook Event Title under the skill; actual Cvent title remains protected.
21. Final-total/item conflict always blocks → item-first approved choice within tool
    support; no invented capability to set both independently.
22. Path Not Given always awaits placement → approved best-fit judgment, disclosed.
23. Unknown type always awaits correction → unique clear match or skip whole fee/
    assignment; never widen it to everyone.
24. Theme-dependent palette-role clarification → numbered slots in source order,
    even when visually odd; no automatic redesign.
25. Footer audience ambiguity awaiting Sponsor/Internal instructions → explicit named
    path mappings and preserve unnamed paths. Actual footer separation remains a
    capability/discovery prerequisite, not something this policy implements.
26. General unresolved-business-conflict escalation → choose the closest reading and
    report the judgment under the client's policy. Runtime denial is not a judgment.
27. Preservation only for nonconflicting unspecified configuration with general
    two-way cleanup requirements → leave absent-from-doc leftovers alone. Supported
    changes to explicitly requested fields/relationships remain work to perform.
28. Capability-gated create-only shared contact-type exception → removed entirely;
    current policy never changes shared account definitions.
29. Standalone requirement that human asset upload precede all image work → removed
    with the old asset workflow. No upload tool, shared-library permission, arbitrary
    URL fetching or new asset-generation capability was added; actual control limits
    still apply and unavailable assets/operations remain unfinished.
30. Blocking designer work solely because of a concurrent-editor banner → approved
    save-and-disclose policy. This is an overwrite-risk decision, not a guarantee
    of preserving another editor's work or removal of any executable guard.
31. No repeat after any mismatch regardless of settled state → at most one retry
    only if the tool confirms it is safe and earlier effects are inspected. Existing
    uncertain-write no-replay restrictions remain unchanged.
32. Required registration previews, behavior/boundary tests and live registration
    validation before DONE → excluded from this build; saved configuration and
    relationships still require evidence, and human testing is explicitly requested.
33. Preview-only partial/blocker records for new builds → not created under this
    policy. Historical partial records remain unchanged and visibly unfinished.
34. All source coordinates/evidence exposed in the written report → exact sources
    and IDs retained in technical JSON; readable tab/row/column directions in prose.
35. Generic verified-complete DONE presentation → saved configuration, registration
    testing not performed for new-policy builds; no behavioral/commercial acceptance.
36. Separate domain report/checklist formats → exact client sections, with all
    defaults/judgments disclosed, $0/NULL first, every warning-save listed, and explicit
    exclusions/testing reminder.

