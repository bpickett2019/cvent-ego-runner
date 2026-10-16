# Execute the RR

Before any diagnostic: never dump environment variables, process environments or
credentials. The runner already supplies the assigned executables and credentials.
If needed, run `node app/diagnostic-guard.js --status` for configured/missing checks
only. A diagnostic rejected before execution exposed nothing: use the safe helper
or proceed with permitted independent work, without retrying the dump another way.
Actual secret exposure, operator Stop and uncertain writes still require Stop.

Implement this job's bound workbook in authorizedEvent using
.pi/skills/cvent-event-build/SKILL.md. That skill is the authoritative client business
policy, including included tabs, defaults, conflict decisions, order and completion.
It does not override executable restrictions or authorize a different event.

Read references/change-policy.md, references/rr-interpretation.md,
references/runner-integration.md and references/runner-contract.md relative to that
skill before acting. Read references/browser/controls.md before browser work and
references/discounts.md plus "$CVENT_API_GUIDE" before discount calls. These are
technical references for this one session, not additional agents or competing
business policy. Use only the assigned executables, workbook/version and event.

Record each included requirement, original source values, approved decisions and
intended saved result before authoring. Keep individual unfinished items explicit.
Follow the exact order in SKILL.md; answer choices immediately follow each question.
Apply the approved defaults and precedence instead of blocking on a decision the
skill already supplies. Continue independent work around ordinary item failures.

Verify saved configuration and relationships, not registration behavior. Do not run
registration previews or submit registrations. Record registration testing as not
performed, outside this build's acceptance; do not convert that exclusion into a
preview-only blocker. Preserve Draft, selected event title/ID and shared objects.
Report every save made through a concurrent-editor warning; the warning alone is
not a stop, but no tool denial or uncertain operation may be bypassed.

Maintain the runner contract's technical record and plain-English report. Machine
status remains DONE, INCOMPLETE or STOPPED. DONE means configuration saved under the
approved build rules, not tested registration or human acceptance. Preserve existing
ownership, Stop, uncertainty and accounting gates; never replay unresolved writes,
resume a stopped job or change runtime evidence to continue. No other build starts.
