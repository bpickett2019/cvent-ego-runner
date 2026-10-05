# Assets and human upload

Read [scope and intake](scope-and-intake.md), [website and fields](website-and-fields.md), and the assigned [Steel bridge](browser/references/steel-bridge.md). Do not infer upload capability from generic Page API documentation.

## Capture the exact intended asset

For each banner, billboard or other applicable supplied image, record:
- authoritative source reference and source folder/location/filename;
- intended Cvent library folder and destination filename (case, extension and punctuation preserved);
- intended header/body widget, page/path, ordering and supplied crop/link/alt text;
- actual supplied file identity/checksum when accessible, and human upload status;
- independently observed Cvent asset identity, folder/name and saved widget association.

A local source folder is not a Cvent destination folder. A filename alone does not prove file content. Don't use another event's similarly named image, generate a substitute, silently rename files, create duplicate uploads or change shared folders/permissions.

## Human upload boundary

The agreed workflow has the user upload into the desired Cvent folder with the specified filename. First verify whether the exact supplied asset already exists; reuse a verified match. When upload is still required, report the precise file/destination needed and record that requirement blocked until the human completes it. Continue independent safe work. Do not pretend the current dashboard provides an asset intake form or copy an inaccessible local path into a remote browser expecting it to work.

Only the app's supported explicit Take Control/Return flow may transfer browser ownership. Do not set runtime flags, press Return on the user's behalf, enter credentials, launch another browser or use a skill takeover to bypass USER ownership. If an active tool prevents Take Control, wait for its normal boundary or obey Stop; do not interrupt a possible Save. A stopped job requires a fresh build; it cannot be resumed by an upload or marker edit.

Automated image upload is not implied by this consolidation. If separately authorized later, it still requires a verified assigned-runtime upload mechanism, available approved bytes and demonstrated destination/name handling. No arbitrary external URL fetches, private RR/session uploads or shared-library mutation.

## Verification

After human upload and explicit verified Return, re-observe the current event and asset. Check destination folder/name and identity against intake, bind the correct image to the intended widget, save once, then verify saved settings plus rendered crop/placement. Verify banner and billboard independently. Missing/wrong asset or unverified filename/placement is INCOMPLETE, not success because the page displays some image. Asset library changes across shared events remain outside this task's authority.
