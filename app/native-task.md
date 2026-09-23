# RR Execution

Implement the uploaded RR in authorizedEvent within approved-sow.md.
The RR defines the target configuration; live Cvent is the starting state.
Correct differences and create confirmed missing requirements.
Execute and verify—not merely inspect, plan or recommend.

## 1. Initialize Progress and Follow the Stage Order

Read every worksheet, including notes, mappings, continuation rows,
formulas/cached values, strikeouts and assets. Distinguish requirements
from examples and blank templates. Never invent missing values.

Before inspecting Cvent, initialize state.json.requirements per
RPC-CONNECTION.md. Use stable IDs, source cells, expected values,
stages and unverified statuses. Include every identified in-scope
requirement; separate genuine exclusions. Populate Remaining immediately,
not after the first edit or at the end.

Work in this order:
1. Discounts and their required eligibility dependencies.
2. Event details, registration types, admission/optional items,
   availability, fees and price tiers.
3. Registration paths and assignments, required admission/payment
   steps and vouchers.
4. Fields, questions, choices and advanced/conditional rules.
5. Website theme, branding, header, footer, pages and presentation.

Before advancing, earlier-stage requirements must be verified or have
specific, evidenced blockers. Unattempted work is not blocked.
Record shared blockers once and continue independent earlier-stage work.

Use Site Designer early only for a named current-stage functional
dependency. Complete, save and verify that work, then return to the
earliest unfinished stage. Do not inspect or polish unrelated presentation
during foundation work, including checking existing branding matches.

## 2. Execute Each Requirement

For each requirement or connected dependency group:
1. Inspect the relevant current configuration.
2. Compare it with the exact RR values and relationships.
3. Correct existing differences or create confirmed missing objects.
4. Save, establish the outcome, and independently read back persistence.
5. Immediately update the requirement status, then continue.

Complete this loop before surveying unrelated objects. Additional
inspection must resolve a named missing fact, identity, scope, control
or verification need. Do not inventory the whole event before making
grounded corrections.

Identify objects by verified codes/IDs, object types or explicit mappings,
not similar labels alone. An existing code does not prove its settings
are correct. Repeated RR rows may require distinct fees or relationships.

For registration paths:
- Verify each registration type by code and its RR-required path.
- Correct assignments that differ from the RR.
- Reuse or update the verified, mapped event-only path.
- Create an RR-named path only when the required object is confirmed missing.
- Configure its required current-stage functional steps, admissions and
  payment; track fields/questions/rules for Stage 3.
- Verify saved path identities, assignments and connections—not just names.

These creations and in-place reassignments are authorized within scope.
An old path may remain or be reused when appropriate; age or naming alone
does not determine correctness. Preserve unrelated paths and avoid duplicates.

Batch grounded edits within an understood editor, but never across
uncertainty. Investigate unfamiliar controls using observed evidence and
documented methods. Do not guess URLs or repeat failures without new facts.

## 3. Use Ego and Preserve Boundaries

Load .pi/skills/ego-browser/SKILL.md and its
references/steel-bridge.md once unless already in context.
The Steel reference governs browser lifecycle and save handling.

Use "$EGO_BROWSER_BIN" nodejs in the assigned Steel browser for all
Cvent inspection, configuration and verification. No direct Cvent API
calls, alternate browser connections or other agents.

Preserve the bound event ID/name, unpublished Draft, unspecified settings
and unrelated content. Never delete/archive objects, remove widgets or
placements, delete-and-recreate, reset, clone or publish.
No shared-account/object changes, attendee/CRM access, communications
or Sessions/Speakers configuration. Prove permitted scope before writing.

Human login/MFA only. Never inspect credentials, dump environment variables,
read process environments, or search secret-bearing files or prior-job
transcripts. Use supplied executable paths directly.

Obey ownership and operator Stop. Stop Cvent actions on lost identity/control,
expired login, exposed secrets, crash/disconnect or unresolved write outcomes.
Never replay unresolved writes or bypass holds. Preserve evidence and reports.
A pending Save requires bounded observation—not another Save or navigation.

## 4. Report Verified Progress

Before each meaningful batch, update currentStage, currentAction and
updatedAt. Include the requirement ID and prefix the action with READ,
EDIT, SAVE_PENDING or VERIFY; use LOCAL for workbook/report work.

Keep state.json.requirements current after every verified change,
existing match or evidenced blocker. Only independently verified saved
results count as completed. Clicks, Save dispatches, tool success and
filesystem writes are not verified Cvent changes.

Missing inputs block dependent work, not unrelated executable requirements.
Never fabricate values, progress or completion. Blocked work is not excluded.

Write reports/final-report.md and reports/final-report.json per
RPC-CONNECTION.md. Preserve unresolved writes in unresolved-changes.json.

Report DONE only when every in-scope requirement and Draft are verified,
both completion flags are true, blockers/untested are empty, and no
unresolved execution remains. Otherwise report INCOMPLETE.

## 5. Workbook Interpretation

Workbooks differ by show; locate sheets and columns by header name.
Do not configure from sheets named OLD, DNU or DO NOT USE.

Discount rows with only a name are section headings; rows with other
values but no code are blocked.

"Admission Items" often holds show shorthand (e.g. EO-PB), not real
admission codes. Resolve each token in this order:
1. A "Token Legend" sheet, if present, is authoritative. It is
   reference, not configuration. ALL means no registration-type
   restriction.
2. Otherwise infer the admission item and registration types from the
   token, the reg-type list, any NEW REG MAPPING sheet and contrasting
   row names. That is interpretation, not inventing values.
Inference rules:
- An audience suffix covers that audience's reg types including their
  Pre-Approved variants (e.g. ATT also covers ATTPRE).
- A bare admission code (e.g. VIP) means that item with no
  registration-type restriction.
- Filters apply to the whole discount; if its items need different
  eligibility, block it.
- If evidence still supports more than one reading, choose the
  narrower eligibility and note it for review. Never choose the
  broader one.
Record every mapping with its source (legend or inferred) and evidence
when initializing requirements. List all inferred mappings at the top
of the final report for operator review.

If a token is unclear or Admission Items is blank, block the discount
with the raw token as evidence; never guess, skip, or create a
discount without an admission item.

Set eligibility at Pricing > Discounts > Edit > Advanced Filters,
selecting the full label matching the verified code. Join multiple
types with OR, never AND.
