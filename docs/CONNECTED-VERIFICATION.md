# Step 4 connected verification checkpoint — local only

Step 3 remains open for current-event capability evidence. This checkpoint continues
independent offline verification; it does not authorize deployment or a paid build.

## Confirmed fixture problems corrected

- The UI VM fixture stripped only four imports from app.js. It could not execute the
  deployed result-language, file-input and progress-evidence imports, so 71 tests
  failed before exercising their scenarios. It now loads those real modules and
  supplies child insertion/removal, attributes, event listeners and text semantics.
- The fixture now treats report HEAD as a read and explicitly models report existence.
  Normal empty progress responses have the real valid shape. Tests for unavailable
  progress remain explicit rather than silently treating malformed input as success.
- Its legacy filename-only test objects represent nonempty synthetic files. The test
  convenience method dispatches the real file-input listener and awaits the actual
  upload callback. Explicit zero/oversized files still fail before reset/upload.
- RPC mocks now register the already-required diagnostic extension command before
  freshSession. New negative cases verify that missing/wrong registration prevents
  all session setup and prompts; production readiness checks were not weakened.
- Prompt and result-language assertions now match the approved skill/configuration-only
  policy while preserving identity, no-replay, raw-status and incomplete-work checks.
- Clear/New tests now exercise the already-deployed immutable acknowledgement of
  settled own-workspace holds. They assert retained raw uncertainty/evidence/costs,
  non-resumability of the stopped session, a separate fresh mocked session, unchanged
  other-workspace holds and reactivation when acknowledged evidence changes.

No production controller, browser, adapter, guard, UI or accounting code changed in
this step. These fixes update tests to actual deployed contracts; they do not grant
new permissions or change previously saved Cvent configuration.

## New connected assertions

- A saved partial item remains under Saved with its remaining work visible, while the
  raw requirement stays partially_verified and the run stays INCOMPLETE.
- A failed progress refresh retains and labels the last successful snapshot rather
  than asserting new verification.
- Missing final reports remain hidden; retained progress is not presented as a report.
- Empty/oversized workbook selections dispatch no reset/upload or paid execution.
- Diagnostic guard registration fails before native session reset/prompt if absent.
- Reset acknowledgement retains evidence, does not resume a stopped job, does not
  clear another workspace and becomes invalid when protected evidence changes.

The VM fixture is not a rendered browser. Its timers are controlled stubs, and its
network/model/browser dependencies remain isolated fixtures. Existing real-workbook
layout tests and the private source-map checks provide separate evidence for those
surfaces. No test counts here establish live Cvent behavior or human acceptance.

## Results — prerequisites resolved

**Full configured offline suite: 799 passed, 0 failed, 0 skipped.**

The earlier 783-test run (778 passed, four missing-prerequisite failures and one skip)
is retained as historical evidence. Provisioning the actual SDK lets the previously
unloadable suites execute their constituent tests, hence the increased total. The
formerly blocked SDK/benchmark/save-observer subset separately passed all 77 checks.
The earlier connected UI/controller groups passed all 280 checks.

### Pinned SDK

An independent clone was created in the previously empty isolated-worktree vendor
directory from local Git objects, checked out at the exact pinned commit
`dca7003349c5f7132189ba00547cbbd7ff8e597e`, and given only the existing reviewed
`ego-bridge/patches/steel-session-ledger.patch`. Dependencies were installed with
`npm ci --ignore-scripts --no-audit --no-fund`, then the reviewed build script ran.
No real-browser E2E runner or Cvent session was launched.

Original vendor HEAD, diff, selected source and build hashes were checked before and
after and remain unchanged. The isolated vendor's dirty status is the expected local
application of the already-reviewed patch, not a new submodule pin or runtime change.
Do not reset, clean, overwrite or reuse the original dirty vendor to reproduce this.

### Genuine private benchmark

The exact workbook expected by the historical test was located locally by its existing
SHA-256 assertion. The retained parser regenerated the benchmark from those original
bytes into private storage outside the public worktree. It has the expected 21 sheets,
17 registration types, 43 questions and source identities; none of those assertions
were weakened. Both the benchmark source workbook and selected acceptance workbook
remain byte-for-byte unchanged.

This is a historical parser regression fixture, NOT the selected event-build workbook
or permission to use its scope in a new run. No customer fixture was fabricated, copied
into public source, committed or published. The test now accepts CVENT_PRIVATE_RR_PLAN
to locate the private JSON while retaining all original identity/hash/count assertions.
Without that variable it still uses the historical default path and fails if absent.

Reproduce after provisioning the pinned isolated SDK and the genuine private fixture:

```sh
CVENT_PRIVATE_RR_PLAN=/path/to/private/rr-plan.json npm test
```

This is a configured local test pass, not a claim that a clean public clone includes
private fixtures or has every dependency installed automatically.

## Next gates

Step 4's offline gate is complete. Review the entire candidate diff before release.
Step 3's unresolved live capabilities still need the assigned tester's evidence.
Passing offline tests does not establish real rendered-browser behavior, saved Cvent
configuration or human acceptance. Deployment and any paid fresh run require separate
approval and fresh source/ownership/preservation checks. No deployment, Cvent call,
browser takeover, upload to staging, commit or push occurred in this checkpoint.
