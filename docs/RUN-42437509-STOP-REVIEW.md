# Why the BDNY run stopped, and the durable repair

Run: `42437509-fce2-4b0a-8ea9-4bfd97da0e76`.
Review scope: saved logs/receipts, current source and offline reproduction only.
No browser/Cvent API requests, writes to Cvent, replay, marker clearance, runtime restart,
paid executor or Azure change. Existing job artifacts remain untouched.

## Finding

**This was an immediate save-observation failure after one fee Save, not a
60-second save timeout, budget stop, or a Site Designer failure.**

The save safeguard added before this run stopped further configuration before
registration dependencies and website work could finish. Its catch block erased
the originating exception. Consequently the exact low-level reason for this
particular failed observation is not recoverable from the retained logs.
A normal page/navigation transition is a hypothesis, NOT an established cause.
Other possibilities include an observation/selector error or a control check.

Separately, the controller's advertised immediate browser-failure stop did not
trigger: a subsequent successful read in the same shell command masked the
browser command's nonzero exit. Mutation guards and the agent's stop behavior
still prevented further configuration, and the completion gate refused DONE.

## Evidence and timeline (UTC)

Job directory: `data/jobs/42437509-fce2-4b0a-8ea9-4bfd97da0e76/`.

| Time | Evidence |
| --- | --- |
| 08:10:10.410 | Job started. |
| Before fee save | Six admission descriptions recorded as saved/read back. Five retained completion-observer receipts show 4–5 polls over 3.1–4.2 seconds; the helper was not universally broken. |
| 08:24:10.999 | Invalid `loc=role:dialog` locator failed. Agent corrected it to `loc=css:[role="dialog"]`; subsequent steps succeeded. This earlier recoverable error was not the terminal failure. |
| 08:24:52.720 | `receipts/full-fee-intent.json` recorded FULL admission fee intent. |
| 08:24:59.928 | Progress event 12202 issued one `p.click('#Save')`, then `observeSave(p,{completionSelector:'#Edit',timeoutMs:60000})`. |
| 08:25:03.629 | `browser-save-uncertain.json`: **polls 0, elapsed 33 ms, lastObservation null**. This is observation time, not total Save latency; the whole browser invocation lasted 3.618 seconds. |
| 08:25:03.715 | The next shell line invoked supported read-only `listFees`, despite the failed browser command. |
| 08:25:06.689 | Progress event 12209 includes `BrowserSaveUncertainError`, followed by a successful API receipt/count 278, but **isError=false**. |
| Afterward | Local analysis/reporting, no further recorded browser execution. Full fee comparison: one added, zero removed, zero changed existing fees. |
| 08:29:25.770 | Job settled INCOMPLETE; Steel cleanup receipt STOPPED. Recorded native PID no longer exists. |

Runtime: **19m15.360s**. Native recorded charge: **$12.549894**. Cleanup errors
empty; spending is not flagged unreconciled. No cost limit caused this stop.

Observed new fee `24d8a88e-ca41-41d4-96de-0d121e293114`:
Full Conference Pass, USD 530, early prices 255 through August 31 and 330 through
October 14, ATT registration type, existing FULL admission. Readback also showed
platform-populated default/display/active and maximum-refund fields. This is
strong evidence that creation persisted, **not** complete acceptance of the
transaction, all defaults/relationships, or final unpublished Draft.
**Do not create it again or clear the historical uncertainty marker.**

## Confirmed implementation gaps

### 1. Observer errors collapse into an undiagnosable global stop

`ego-bridge/save-observer.mjs:29–46` wraps control checks and DOM evaluation in
one catch. A failed first check/evaluation immediately creates an uncertainty
marker and replaces the original error; its type/cause/stage are not retained.
There is no classification for a transient read-only document transition.
The 60-second budget applies only while those checks/evaluations succeed.

At polls=0, this happened before the first evaluation completed. It was not a
successful poll followed by a rejected validation result. With the original
exception discarded, increasing the timeout cannot reliably repair this path.

Offline diagnostic reproduction in
`logs/run-42437509-review/offline-reproduction.json` demonstrates that three
*different synthetic* exceptions produce the same zero-poll/33-ms marker and
new error with no cause. This proves the diagnostic collapse, not which original
exception occurred in Cvent.

### 2. Shell exit status masks the immediate controller stop

The command had this structure, without fail-fast sequencing:

```sh
"$EGO_BROWSER_BIN" nodejs <<'JS'
// click Save once, observe
JS
"$CVENT_API_BIN" listFees </dev/null
```

The second, read-only command succeeded, so native bash reported isError=false.
`app/browser-failure-guard.mjs:5–6` ignores such events entirely. Refeeding actual
saved event 12209 into `classifyBrowserFailure()` returns null; the job has no
browserFailureGuard record. It ended through normal agent settlement as
INCOMPLETE, not the intended immediate controller stop.

Do not fix this by scanning every successful stdout for error words: quoted
reference documentation must not trigger a false stop. Use the authoritative
current-job marker/structured operation result independent of outer shell status.

### 3. Tests did not establish the real fee-save workflow

Existing observer tests use mocked evaluate results/errors and static DOM
fixtures. They test fail-closed behavior but not actual Save navigation/context
replacement or mixed-command exit masking. Passing offline tests was not live
acceptance of this path. This gap is in our integration/testing, not evidence
that a second agent, larger prompt, more model budget or Azure duplication fixes it.

## Why the remaining list is long

Most items were **not reached after the shared safety stop**, not independently
attempted and failed. Site Designer was correctly left until last and never
opened. Final Draft verification and full cross-requirement verification were
therefore not completed. Inventory, catalogs and reports are useful preparation
and evidence, but must not be presented as equivalent to configured RR outcomes.

There are also independent input/coverage problems:

- Old/new pricing precedence, legacy object mapping, differing shared labels,
  extra existing tiers and fee platform defaults require reconciliation under
  exact-value/no-delete/shared-definition protection rules.
- The run reports 1,095 absent discount codes, with blank stackability on 1,080
  rows and blank include-guests/active fields on 1,084 rows each. These are
  reported input gaps, not proof that every row requires independent manual
  decisions: first resolve workbook-wide instructions/authorized defaults.
- `#FF8F2` is not a valid supplied hex color; do not silently invent a replacement.
- Independently inspecting the original XLSX ZIP confirms **13 PNGs and two
  drawing parts**. The earlier openpyxl zero-image observation was incomplete.
  Raw OOXML inventory and drawing-to-sheet/anchor mapping must accompany library
  parsing. Not every embedded PNG is necessarily a branding asset; interpret it
  before choosing how it should affect the build.

## Durable repair, in priority order

1. **Repair the save transaction tools, not prompt length.** Validate observation
   options and grounded selectors before submitting. Capture intent/baseline,
   register observation on the assigned page before Save where feasible, dispatch
   Save exactly once, and enter a bounded **read-only** observation/readback phase.
   Preserve sanitized error category, failing phase, document/target continuity,
   attempt counts and elapsed time. Never capture credentials/raw auth traffic.
2. **Distinguish document transition from actual loss of control.** Only known
   read-only context-unavailable transitions on the same independently confirmed
   event/target/session may be re-observed within the deadline. Do not click,
   reload, replay or switch tabs. Ownership loss, authentication expiry,
   foreign event, crash/disconnection or unresolved deadline still stop. Do not
   generalize all exceptions into recoverable errors.
3. **Use independent saved readback as the success gate within that transaction.**
   For supported fee reads, compare baseline and saved catalog, require exactly
   the intended new/updated object, verify amount/tiers/applicability and unchanged
   existing objects, and resolve authorized defaults. Verify other affected
   relationships/event state as needed. Toasts, #Edit visibility or a lone
   matching fee are not full completion. If verification cannot establish the
   entire intended outcome, retain uncertainty and stop. Historical stopped
   writes remain a separate human reconciliation task; no automatic clearance.
4. **Make stop handling independent of shell composition.** Inspect the
   provenance-bound current-run uncertainty state at controller boundaries and
   before writes; use structured child results. Shell fail-fast is useful but
   insufficient alone. Produce an accurate safety-stop status/reason, not a
   generic success-looking tool result or unexplained INCOMPLETE list.
5. **Move source completeness checks before mutations.** Inventory OOXML assets,
   render/interpret embedded instructions, resolve pricing precedence/code links,
   and surface only genuinely unresolved decisions to the human. Retain the
   single fresh Pi executor and concise prompt; no second reviewer or mandatory
   model-generated checklist is required. Do not invent defaults or silently
   normalize shared definitions.
6. **Require workflow-level regressions and live acceptance.** Test same-target
   full navigation, delayed DOM creation, pending/rejected/successful saves,
   duplicate/invalid selectors, saved-state lag, identity loss, crash/disconnect,
   and save-failure-followed-by-successful-shell-read. Assert one mutation max,
   no early DONE, bounded observation and correct hard stops. Test embedded image
   detection/mapping too. Then run one explicitly authorized live trial and a
   complete RR with saved relationships and final unpublished Draft verification.

Keep the already-staged Azure apps disabled until repaired source and relevant
checks are propagated. They contain the same observer/guard implementation.

## Scope of this review

Diagnosis and offline reproduction only; **no production fix implemented or
activated**. A repeat of the same run is not the repair. We can eliminate tested
software failure modes and make unknown outcomes diagnosable and safe; we cannot
promise that Cvent, credentials, networks or ambiguous workbooks will never
require a stop.
