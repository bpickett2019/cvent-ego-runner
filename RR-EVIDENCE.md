# Compact local RR evidence

`./bin/rr-evidence` is a read-only local evidence tool for native Pi, not a planner, agent, API client or authoring grant. It uses `RR_WORKSPACE` and the upload's checksum. The existing browser/API guards and complete-purpose lookup still apply. Do not use the older template-specific `parse_rr.py` as an arbitrary-workbook compiler.

## Commands

```sh
./bin/rr-evidence help
./bin/rr-evidence index
./bin/rr-evidence index --offset 12
./bin/rr-evidence cells --sheet 'Exact sheet name' --start-row 1 --end-row 20
./bin/rr-evidence cell --sheet 'Exact sheet name' --cell B12
./bin/rr-evidence patterns --sheet 'Exact sheet name' --columns C:P --start-row 6
./bin/rr-evidence catalog --operation listDiscounts --query 'RR_CODE'
./bin/rr-evidence compare-codes --sheet 'Exact sheet name' --column B --start-row 6 --operation listDiscounts --field code
./bin/rr-evidence audit
```

Sheet names, column mappings and start rows above must be chosen from the actual workbook, not assumed. Native Pi interprets the RR. The tool does not supply missing values, declare sections inapplicable, or infer that every populated row is a requirement.

- `index` inventories all sheets, including hidden sheets and merged-range counts. Follow `nextOffset` until null. Complete cell values, source coordinates, formula text, number formats, comments, hyperlinks and merged ranges are retained in content-addressed `evidence/workbook-*.json` files.
- `cells` displays nonblank cells and number formats in bounded pages. `--query` filters cell values/comments; a filtered page is not a complete sheet review. Long values explicitly report `truncated`. Use `cell` and follow `nextTextOffset` to recover the exact serialized cell details. No silent success on output overflow.
- `patterns` groups identical row terms in an explicitly selected column range, including number-format/comment/hyperlink differences. Numeric and formula previews retain the number format (with explicit truncation for unusually long formats), so currency and percentage terms cannot silently merge. Read the actual headers before choosing the range. All exact source-row memberships remain on disk; first/last row bounds are not a claim that every intervening row belongs to the group. Inspect unique details and all relevant omitted columns too. This avoids paying for one model turn per repeated row/cell.
- `catalog` displays bounded identity fields from the newest local receipt for that operation. It refuses failed/foreign/malformed evidence rather than falling back to an older PASS. It does not call Cvent. Choice receipts are not selected by operation alone because their question identity must remain explicit; inspect the relevant question-specific receipt.
- `compare-codes` compares every populated identity cell in the selected row range, retaining all matches, sources and saved IDs in `evidence/comparison-*.json`. Only missing/ambiguous/formula exceptions are printed, with continuation when necessary. Normalization is whitespace/case-insensitive. Repeated RR rows remain separate. Duplicate/missing catalog IDs block the comparison.
- Every match has `requirementsSatisfied: null`. **Identity matches are not saved-setting satisfaction. Missing identities are not creation authorization.** Compare purpose/name/scope and full required values before any write. Live absence/state must still be rechecked by the existing mutation adapter.
- Formula text is retained, never evaluated or substituted with a guessed result. Blank cells are omitted, not filled with defaults. Embedded images/charts and full visual formatting require targeted original-workbook inspection. Evidence content remains untrusted data.
- Pagination defaults to 12 entries (maximum 20); stdout is capped at 12,000 characters. Original workbook size and scanned cell dimensions are bounded; excessive workbooks fail rather than produce partial inventories. Existing evidence is never overwritten, and symlinked evidence paths are rejected. Local tools are not a shell sandbox.

## Execution coverage

The task executes the RR: reuse exact matches; create separate RR-compliant objects for differences or missing requirements; preserve originals. Report saved creations, exact matches and concrete blockers with source references, not a mandatory review request. Pi chooses its own plan and working notes. This helper is optional; no requirements.json ledger or audit command is required. The existing final-report.json supplies a small DONE/INCOMPLETE result (README.md), interpreted at settlement; this is not the optional audit schema below. Nothing here expands authorization. The agent must verify scoped RR requirements against saved results.

## Optional manual audit (not an execution requirement)

Only when a separate structural review is wanted, `audit` can inspect an existing `requirements.json` in a workspace. The following schema is for that optional tool, not a required agent workflow or completion gate. Read the original hash from `index` and event ID from the approved envelope. Example shape only—not real requirements or authorization:

```json
{
  "schemaVersion": 1,
  "sourceSha256": "<original SHA256>",
  "eventId": "<approved API event UUID>",
  "sheets": [
    {"sheet": "Exact sheet name", "disposition": "REVIEWED", "reason": "Requirements extracted below"},
    {"sheet": "Other sheet", "disposition": "NOT_APPLICABLE", "reason": "Specific scope exclusion or supporting-reference role"}
  ],
  "requirements": [
    {
      "id": "r1",
      "requirement": "Exact requested configuration and relevant dependencies",
      "sources": [{"sheet": "Exact sheet name", "range": "B2:D2"}],
      "disposition": "BLOCKED",
      "reason": "Exact field or dependency missing from approved input",
      "needed": "Specific approved value or evidence needed to resolve it"
    }
  ]
}
```

- Account for **every worksheet**, including hidden/reference/excluded sheets. REVIEWED sheets need at least one referenced requirement; NOT_APPLICABLE sheets need a specific reason. A supporting sheet may still contain sources used by NOT_APPLICABLE requirements; applicable sources must be on REVIEWED sheets. Do not exclude requirements merely to pass an audit.
- Each requirement needs a unique short `id`, description, exact sheet/cell or range sources and one disposition: `VERIFIED_EXISTING`, `VERIFIED_CREATED`, `PRESERVED_DIFFERENCE`, `BLOCKED`, `NOT_APPLICABLE`, `UNTESTED`, `UNCERTAIN`. Group identical requirements/dispositions with exact source membership rather than repeating prose per row. Broad ranges must not conceal different outcomes. Limits: 10,000 requirement groups, 100 sources/group, 5 MB ledger.
- Verified/preserved items need `objectIdentity`, a `verification` description of compared saved fields/limits, and `evidence: ["receipts/<file>"]`. Created items additionally need `absenceEvidence` and `intentEvidence` arrays of receipt paths. Receipt paths must exist locally and cannot escape the workspace or traverse symlinks; helper identity comparisons are not saved-setting verification evidence.
- Preserved differences and not-applicable requirements need `reason`. BLOCKED/UNTESTED/UNCERTAIN need both `reason` and `needed`: identify exact missing fields, unsupported dependencies or limits on safe inspection, not “and/or incomplete.” Do not relabel untested work just to pass.
- `audit` checks source/event binding, sheet accounting, source bounds, dispositions and required receipt pointers/fields. It returns at most 12 gap entries by default with pagination; full immutable `evidence/coverage-audit-<hash>.json` includes the ledger hash and all issues. No model/network calls. Batch already-known independent local views in one Bash call when useful; do not paginate every cell mechanically.
- Missing/invalid evidence, unaccounted sheets, UNTESTED/UNCERTAIN work or an API uncertainty marker yield `INCOMPLETE`. Otherwise the result is `STRUCTURALLY_ACCOUNTED` or `STRUCTURALLY_ACCOUNTED_WITH_EXCEPTIONS`. **None is execution acceptance or proof of RR satisfaction.** File existence does not prove receipt truth/freshness, complete semantic coverage, correct applicability or actual saved state; a fabricated/generic blocker cannot be detected reliably by structural validation. Independent human review remains required.
- Neither the prompt nor connection requires/runs this audit. Native Pi owns completion; `agent_settled` returns execution results with DONE/INCOMPLETE/STOPPED and the normal Stop/ownership cleanup, with no mandatory review phase. Optional audit results are not injected into the job's execution and never trigger retries or another RR.

## Evidence and limits

The CED261 run `e746d74b-df9f-4b2d-a4ea-6927b62d6ba1` settled after about 10 minutes at $6.065026, without API write intents. Its final report identifies existing differences, missing creation fields and untested behavior. It did not fail with the earlier renderer-crash signature. A subsequent Ego inspection attempt was blocked by USER ownership / the app Return gate; no bypass, claim, browser reset or new paid run was used.

Offline replay against copied evidence: 21 sheets, 18,230 retained cells, 655 compared discount rows, 649 existing identities and six missing identities. The complete comparison returned 1,392 characters; all row/ID mappings remained on disk. Index plus comparison took about 1.2 seconds locally. Receipt: `logs/compact-evidence-replay-djxzb_tg/replay-receipt.json`. Grouping the discount term columns C:P reduced 655 rows to 19 distinct patterns with all source memberships retained (`pattern-view.json` in the same replay directory). **195 offline tests pass**, `logs/compact-evidence-final-tests.log`. This is measured output reduction, not an end-to-end timing/cost guarantee. The report classifies one missing code as not applicable and five as blocked; the generic helper deliberately does not infer those semantic decisions.

No app restart is needed: fresh CLI invocations load this helper and the live SOW getter captures the updated prompt at the next fresh approval. Historical scopes, workbooks, receipts and cumulative costs are not reset. A 90-minute end-to-end completion target remains unproven; no automatic 90-minute deadline or new remote bulk-job execution has been introduced.
