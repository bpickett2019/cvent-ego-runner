# Independent compact-evidence / settlement review

Implementation follow-up: the user subsequently authorized simple system-wide fixes. Number-format grouping/previews and a bounded structural completion audit are now implemented offline, with local installation checks and configurable client roots. 205 tests pass; see the newest `MVP-HANDOFF.md` and `RR-EVIDENCE.md`. The user then rejected mandatory audit/schema ceremony: execution now uses a 296-word plain task and native Pi/RPC, with the automatic audit wrapper removed (203 offline tests). Number-format correctness and optional evidence/manual-review tools remain. No live acceptance followed. The review below is historical analysis, not a requirement to reinstall an audit workflow.

## Verdict

**Keep the compact helper, but do not claim reduced total model work or full-execution readiness yet.** It removes a demonstrated source of waste without replacing native Pi or weakening write gates. The latest run did not use it: its captured task was 474 words and contains no `rr-evidence` instruction. There is no live before/after comparison.

No new paid execution, network/API request, browser operation, ownership change, restart or Cvent mutation was performed for this review. Existing source changes, the dirty vendor submodule and historical job evidence were left untouched. Experiments used copied evidence and a synthetic workbook under ignored `logs/`.

## 1. Output reduction versus total work

Source run: `data/jobs/e746d74b-df9f-4b2d-a4ea-6927b62d6ba1/`.

Metadata-only aggregation of its native session shows:

- 44 assistant messages / 43 tool calls; 417,116 returned text characters.
- $6.065026 total: $1.648210 input, $0.500400 output, **$3.916416 cached input (64.6%)**.
- Final small actions reread roughly 153,000–155,000 cached tokens. Several workbook/catalog outputs were around 40,000–50,000 characters. Avoiding retained output matters even when cached.
- The old agent already grouped repeated discount terms in Python, but printed the member code lists. The improvement is bounded presentation and retained on-disk membership, not discovery of batching itself.
- All 33 question-choice requests ran inside one shell call, approximately 130 seconds without intervening assistant messages. More API batching would not remove model turns from that interval.

Independent replay reproduced the 1,392-character identity comparison, 649 existing / six missing rows, and 19 term patterns representing 655 rows. A fuller discovery path using defaults—help, both index pages, all four pages of discount header rows 1–5, comparison, both pattern pages—requires **10 CLI invocations and 23,731 output characters**. That is not ten required model turns: native Bash can group already-known independent reads. Conversely, these commands still do not establish saved-value agreement, purpose, omitted-column/comment semantics or all-sheet requirement dispositions. Comparing their output with the entire run's 417,116 characters would not be an equal-work benchmark.

Pagination can erase the benefit if used mechanically:

- At 12 cells/page, scanning all 18,230 retained cells would require about 1,520 pages; that is a warning, not a proposed workflow.
- The documentation's `patterns --limit 3` takes seven pages for these 19 patterns; the default 12 takes two and stayed below the output cap in replay.
- Every workbook-backed invocation reloads/scans the workbook and checks/writes the content-addressed artifact. Local replay calls took roughly 0.35–0.44 seconds, so this is currently smaller than model-turn overhead, not a reason to introduce a cache/framework.
- `catalog` presents identities, not full settings. `compare-codes` is deliberately not the run's semantic reconciliation (586 differing / 63 eligibility-untested rows). Python remains necessary for scoped saved-field joins; repeatedly opening individual cells/identities would increase work.

**Conclusion:** demonstrated output savings, plausible retained-token savings, unmeasured total model-call/cost savings. Test equivalence of evidence and dispositions, not just characters or helper execution time.

## 2. Concrete helper defect found offline

`app/rr-evidence.py:203–216` groups and previews values without `numberFormat`, although extraction retains it at line 88. Two numeric cells containing `0.1`, formatted respectively as `0%` and `$0.00`, become one pattern with no visible distinction. The ordinary `cells` preview also omits the format. A reader cannot safely treat that group as semantically identical financial terms without reopening the originals/full evidence.

Synthetic reproduction: one pattern / two rows for **10% versus $0.10**. No mixed number-format variants were found within the actual CED261 C:P groups, so this does **not** invalidate the recorded 19-pattern count for this RR.

Small corrective scope: include number format in the pattern key and compact numeric/formula views; add the two-format regression. Retain existing limits, source memberships, comments/links and explicit visual-format limitations. No schema-specific planner or new API is needed. This review records the defect; it does not modify implementation or the user-editable prompt.

## 3. Why the run ended with broad untested areas

### Legitimate preservation / input / authorization blockers

- Existing event details, branding, types, fees, discount fields/links and question definitions differ. They must stay unchanged; duplicate creations are not an escape hatch. Zero writes can be the correct result.
- Five missing discount rows (12, 19–22) have amounts/methods and some dates/eligibility descriptions, but not a complete supported creation contract. Their descriptions also involve speaker/session/type eligibility. Missing booleans/capacity cannot be inferred from neighboring existing codes. Row 11 explicitly says the speaker code is unnecessary.
- “Pick up from 2025,” donation “keep as last year,” unconfirmed guest mapping, approval placeholders and external allotment/integration dependencies are real blockers. Group discounts are explicitly No.
- Complete registration-behavior testing may require prohibited attendee/registration operations. Do not reclassify all untested behavior as safely executable.

The five missing rows share a generic “and/or” blocker in `discount-reconciliation.json`. That is conservative enough not to write, but insufficient as an actionable per-field clarification request. Resolve exact missing fields and unsupported dependencies before spending on another execution.

### Missing implementation / evidence

- Code and volume creation exist; absence of a write in this run is not proof those adapters are missing. Volume creation is irrelevant to this RR's explicit No.
- Arbitrary type/session eligibility is not implemented by item links. Additional code/volume APIs cannot make those requirements safe or fully specified.
- Browser authoring/preservation and full flow verification remain unaccepted. Missing adapter methods do not establish public API absence, and adding APIs without an eligible requirement would not address this run's result.
- The helper has no semantic coverage/completion checker. `settle()` in `app/rr-connection.mjs:562–574` saves the final assistant text, labels it REVIEW_REQUIRED and stops; it does not validate requirement coverage. This is honest settlement handling, not a full-RR acceptance gate.

### Premature settlement / incomplete accountability

The job records `stopReason: Execution settled; new runs use fresh sessions`, empty Stop failures and no uncertain writes—not budget exhaustion or a forced crash stop. Browser finish was followed by report writing and normal settlement. About $14.91 remained under the unchanged event AI allowance.

The report honestly leaves social/contact destinations, other paths/body pages, badge/reporting assignments, processing fee, ordering/requiredness and conditional behavior untested. But several have no specific inspection blocker. Existing-object immutability explains why a mismatch cannot be corrected; it does **not** by itself prevent read-only verification of a visible destination or configuration setting. The evidence does not establish that only blocked work remained.

Thus the run settled prematurely **relative to the all-requirements-accounted-for goal**, not necessarily before an authorized creation. No particular missing item has been proven safe to create by this review. The newer prompt requests specific blockers, but another sentence is not evidence that the next agent will comply.

### Browser limitations

All 13 recorded Ego executions in this run returned `ok`; the sole native tool error was the recovered workbook `EmptyCell.row` error. Saved Site Designer / Registration Process / Advanced Rules snapshots explicitly omit iframe contents. That limits what those snapshots prove, but no recorded frame failure establishes why every untested area was left untouched.

The earlier renderer crash remains a separate unresolved reliability risk; this run neither reproduced nor repaired it. USER ownership blocked the later inspection attempt, not the completed run's preceding read-only inspection. Do not bypass that gate or revive the settled job to fill gaps.

## 4. Smallest justified next step

Do **one offline acceptance-readiness slice**, not another run or capability expansion:

1. Fix/test the narrow number-format grouping defect before relying on this helper generically.
2. Using current saved evidence, make a bounded exception matrix for the five missing codes and the report's untested categories: RR source, exact known/missing field or dependency, whether safe read-only inspection remains possible, and evidence needed. Preserve unresolved cases; do not manufacture satisfaction. This is a review artifact, not an automatic executor or a new runtime gate.
3. Extend the existing replay only far enough to compare equivalent evidence/dispositions and total CLI/model-visible output for that slice. Do not mistake an identity-only comparison for full semantic work. No automatic continuation or paid benchmark is justified.

## 5. Prerequisite for a meaningful full-execution test

Before one fresh supervised run, the approved RR/target pairing must contain **at least one useful, genuinely missing, fully specified, permitted creation with resolved dependencies**, plus a source-referenced coverage/exception checklist for every applicable requirement. Current evidence identifies no such safe creation. Clarifications must be explicit approved input, not copied defaults, replacement objects, or the prohibited MOCK_ONLY workbook. API-only creation acceptance would not certify browser authoring or the whole RR.

Also required: explicit authorization for the one paid run and permanent creations; fresh upload/session and human login/Return handoff; current identity, unpublished status, uncertainty/lock and cumulative-cost checks; independent saved-state/preservation review. The roughly $14.91 remaining is not reset by a fresh session and does not establish affordability. Define 90-minute acceptance as all permitted work completed or specifically evidenced exceptions—not full compliance despite immutable differences. No 90-minute guarantee follows from the available evidence.

## Evidence / verification

- Latest job: `reports/final-report.md`, `reports/final-report.json`, `receipts/reconciliation-summary.json`, the three reconciliation files, saved browser baselines, `receipts/final-preservation-check.json`, job ending metadata and targeted native tool/usage metadata. Final event equality is not proof every object/path was verified.
- Prior offline replay: `logs/compact-evidence-replay-djxzb_tg/replay-receipt.json`.
- Independent copied-evidence and format experiment: `logs/compact-evidence-independent-review-ivkb9yxf/review-metrics.json` and its local fixtures/artifacts (ignored/private).
- Existing 195-pass evidence reused from `logs/compact-evidence-final-tests.log`; no implementation changes requiring a full-suite rerun. Focused experiments above are additional evidence, not live acceptance.
