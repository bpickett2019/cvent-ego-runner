# Executable coverage

[SKILL.md](.pi/skills/cvent-event-build/SKILL.md) defines the business task.
[CVENT-API.md](CVENT-API.md) describes the allowed API inputs. Library/SDK methods
and catalog reads do not establish authoring permission or live acceptance.

| Area | Execution route | Limits |
| --- | --- | --- |
| Event, registration types, admissions, fees, paths, questions and choices | Assigned Ego browser; API catalog reads where available | Must establish supported event-local controls and saved readback. Shared definitions stay protected. |
| Discount codes | configureDiscount through the assigned CLI | Create/update and explicit item-link replacement; no registration-type Advanced Filters, code rename or whole-discount deletion. |
| Website and footers | Assigned Ego browser | No public authoring API exposed. Per-path footer separation and editor-specific operations need observed scope and saved evidence. |
| Assets | Supported assigned-browser workflow or confirmed human handoff | SDK upload signatures do not prove remote file staging/transfer; unavailable assets remain dependencies. |
| Object deletion | No verified browser or whole-discount operation | Do not bypass guards. Association unlinking is not object deletion. |
| Non-discount library writers | Denied by RR CLI | Not alternate runtime routes. |
| Volume discounts and other excluded work | No authoring under the current skill | Technical availability does not expand scope. |

The bridge supports top-document snapshots and explicit verified same-renderer iframe
subtrees, not automatic nested/out-of-process frame coverage. Screenshot capability
alone does not prove reliable editing or saved verification of an inaccessible field.

For each included requirement, establish a supported operation and a saved readback
route. A known pre-write gap blocks its dependent work; possible unresolved effects
stop further writes. Never expand eligibility or mark a partial requirement complete
to avoid a capability gap.

Historical receipts and [the coverage archive](docs/history/CVENT-API-COVERAGE.md)
remain historical evidence, not current instructions, permission or replay recipes.
Source, fixture tests, installed code, saved Cvent configuration and human acceptance
are separate claims. No full live acceptance follows from this documentation.
