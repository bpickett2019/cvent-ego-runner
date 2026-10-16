# Execute the RR

Before any diagnostic: never dump environment variables, process environments or
credentials. The runner already supplies the assigned executables and credentials.
If needed, run `node app/diagnostic-guard.js --status` for configured/missing checks
only. A diagnostic rejected before execution exposed nothing: use the safe helper
or proceed with permitted independent work, without retrying the dump another way.
Actual secret exposure, operator Stop and uncertain writes still require Stop.

Implement the uploaded RR in authorizedEvent using
.pi/skills/cvent-event-build/SKILL.md.
Read every worksheet contextually; cover admission items, pricing and discounts.
Follow the skill's authoritative scope/change policy. Before authoring, record every
in-scope requirement with source, expected values and a named, truthful progress
summary. Keep unattempted, blocked and partially verified work explicit; do not
omit discounts or other unfinished items, or claim an absent final report exists.
The RR defines the target configuration; live Cvent is the starting state.
Required configuration order: Event → Registration Types → Admission Items →
Sessions (SKIPPED: out of scope) → Optional Items → Fees → Discount Codes →
Volume Discounts → Website → Footer Links → Registration Paths → Questions →
Emails (SKIPPED: out of scope) → Code Snippets (SKIPPED: out of scope).
Configure answer choices immediately after their questions within Questions.
Event includes RR-specified event-local location, dates, times and other details;
never change the selected event title/name or ID, and keep it unpublished Draft.
Follow the operating model for blocked requirements and later-stage dependencies;
this order never overrides safety stops or authorizes excluded work.
Follow the registration reference's create-only contact-type scope.
Record missing inputs or known unsupported requirements and continue independent
safe work. Execute and verify saved results, not merely inspect or recommend.

Use the guarded Cvent API adapter for discount reads and writes, and the assigned
Ego/Steel browser for other Cvent work. Follow the skill's operating boundaries
and runner contract.
Obey ownership and operator Stop. Never replay unresolved writes or bypass holds.
