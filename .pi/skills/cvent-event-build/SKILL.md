---
name: cvent-event-build
description: Make one Cvent event match an RR build doc (.xlsx) end to end. Leaves the event in Draft and reports in plain English what it changed, filled in, decided or could not do.
---

# Cvent event build

You are setting up one Cvent event so it matches the build doc. The event is usually a clone of last year's show, so most things already exist. Make Cvent match the doc and keep moving.

These rules are approved business policy from the client. Where another file disagrees on a business rule, this file wins. These rules do not override tool restrictions, runtime guards, browser ownership or the supported login handoff. Never bypass a denied operation.

## Never
- Publish. The event stays in Draft.
- Send emails or submit a registration.
- Change the event title or ID.
- Change anything shared across the Cvent account (contact types, shared venues, templates, other events).
- Make up a value that isn't in the doc or in these rules.

## Stop making changes only if
- The operator presses Stop or takes control of the browser.
- You are in a different event than the one assigned, or can't tell which event you're in.
- A password or other login secret shows up on screen or in your output.
- A change may have been sent, but you can't establish what happened after the tool's normal checks.

Anything else (missing values, odd data, a control you can't find): note it and keep going.

## Which parts of the doc to use
- Use these tabs: 01 Event, 02 Registration Types, 03 Admission Items, 06 Fees, 07 Discount Codes, 09 Website, 10 Footer Links, 11 Registration Paths, 12 Questions.
- Skip every other tab.
- 06 Fees: only rows where Item Type is "Admission Item".
- 07 Discount Codes: ignore the Sessions and Optional Items columns.
- 09 Website: do every row except the Theme row. Brand Color 1–5 go into Cvent's brand color slots in the same order, even if the colors look odd.

## How to read a cell
- Filled cell: make Cvent match it.
- Blank cell on something that already exists in Cvent: leave Cvent as it is.
- Blank cell on something you are creating, where Cvent requires a value: use the fill-in values below.
- Anything in Cvent that isn't in the doc (last year's leftovers): leave it alone.
- Column names are Cvent's field names.
- Reg types and admission items may be written by code or name. Match by code first. Ignore spaces around `|` when matching names.
- Several values in one cell are separated by `;` or a new line.
- Dates are mm/dd/yyyy. Times are h:mm AM/PM. Money is a plain number.
- "None" in a date field means no date limit. On something that exists, clear that date. When creating, leave it off.
- The show name is the Event Title on 01 Event. Replace `<Insert Show Name Here>` (or any similar placeholder) with it. This does not change the event's title in Cvent.
- Instructions in a Notes cell (hide an answer, link some text, add a checkbox) are part of the job. Do them.

## Capacity (no limit)
When a cell says "Unlimited", or you are creating something that requires a capacity and the cell is blank:
- If the Cvent field has an unlimited option, use it.
- Discount codes through `$CVENT_API_BIN`: use `-1` (the API's unlimited). It rejects anything above 32767.
- Any other capacity field: use `100000` as the approved fallback. If the field rejects it, note it.
- Never use 0, because 0 blocks registration.

## Fill-in values (only when Cvent requires a value and the doc is blank)
- Fee Name: the item's name.
- Codes: `NULL-` plus the item's name in capital letters and numbers only (e.g. `NULL-EXPOONLY`). If it's longer than the field allows, cut it to fit. If a different item already uses it, add `-2`, then `-3`, and so on. Before creating anything, check whether an earlier run already created it with that code, and reuse it.
- Other text: `NULL`.
- Money and other numbers: `0`.
- Yes/No: `No`.
- Dates: start = today, end = one year from today.

## When the doc disagrees with itself
Don't stop. Use these rules:
- Which path a reg type is on: use 11 Registration Paths. If no path on 11 lists it, use the path named on 02.
- Registration approval: use 11 Registration Paths.
- End date earlier than start date: move the end date to the following year.
- The same answer listed twice: create it once and use the first code.
- An answer code that's missing or used twice: create the answer and leave its code blank.
- A reg type that isn't on 02 (e.g. `ATT`): if exactly one reg type clearly matches, use it. If not, skip that whole fee or assignment. Never let a missing reg type turn into "everyone."
- A discount that lists Admission Items and also says "The Final total": attach the listed items. Set "Apply this discount to" as written if the tool allows both. If it doesn't, keep the items.
- A question under "Path Not Given": put it on the path whose questions it fits best.

Anything not covered here: choose the reading closest to what the doc says, and put it in the report.

## Order
Event → Registration Types → Admission Items → Fees → Discount Codes → Website → Footer Links → Registration Paths → Questions (answer choices right after each question).

If one thing fails, note it and move on.

## Making changes
- Discounts go through `$CVENT_API_BIN`. Everything else goes through `$EGO_BROWSER_BIN`.
- Look first. If Cvent already matches the doc, move on.
- If Cvent warns that someone else is editing, save anyway and keep working. List each of these saves in the report so someone can check nothing was overwritten.
- Save once. Wait until Cvent shows the save finished or was rejected.
- Browser edits: after the save finishes, reopen or reload the page and check the saved value.
- Discounts: use the API tool's own check of the saved result.
- If the value matches the doc, it's done.
- Before any retry, make sure the earlier change has settled and check whether it already created or changed the item. Retry once at most, and only if the tool allows a safe retry. Then note it.
- Never repeat a change whose outcome you don't know. Wait and check again. If you still can't tell, stop making changes (see "Stop making changes only if").
- Navigate from the event's left menu, never from a saved link.
- If you get logged out, pause and ask the operator to log back in, then continue where you stopped.

## Footer Links (10)
- "Registration Path / Site" says which footer the row belongs to.
- Add that footer's links in the Order column's order. Each row is one link: Link Text, then its URL or email.
- "Attendee / Press" = the Attendee | Buyer, Attendee | Buyer | Preapproved and Press/Media paths.
- "Exhibitor" = the Exhibitor path.
- Paths not named keep their current footer.

## Questions (12)
- Each path block lists that path's questions in page order.
- A question listed under several paths is one question in Cvent, placed on each of those paths.
- "Display if Reg Type = X" = only those reg types see it.
- "Display if CODE = answer" = shows only when that answer is picked.
- "Display Sub-Question if CODE = Any Value" = a sub-question of CODE.
- Answer codes are in Notes as "Answer Codes: …", in the same order as the answers.
- "Backend Only" questions: create them, but don't place them on any path.

## Report
Use the format in references/runner-contract.md.

The reader is not technical and is juggling 20 other events. Write so a third grader could follow it and fix things:
- Short sentences and everyday words. No code, no jargon.
- Never use cell addresses like "C15" in the written report. Name the tab, the row (by its reg type, question or item name) and the column.
- Keep the technical details (exact cells, original doc values, Cvent IDs, saved-value evidence, each unfinished item) in the technical record that references/runner-contract.md asks for.
- For every item, say what happened, why, and how to fix it.

Examples:
> **Expo Only fee for Exhibitor / Paid**: The Fee Name was empty, so I named it "Expo Only" so the fee could be saved. To change it: open the Fees tab, find the Expo Only row for EXPAID, and type the name you want in the Fee Name column.

> **Independent Rep/Dealer/Broker**: The Registration Types tab puts it on the Internal path, but the Registration Paths tab puts it on Attendee | Buyer. I used Attendee | Buyer. If that's wrong, fix whichever tab is wrong so they agree.

Sections:
- **Done:** what you changed, plus a count of things that already matched.
- **I filled in a blank:** each blank you filled, what you put and why. Put placeholder prices ($0) and NULL text first, since visitors would see them.
- **I made a judgment call:** each place the doc disagreed with itself or was unclear, what you chose and why.
- **Not done:** anything you couldn't do, why, and what to check or fix.
- **Not included in this build:** Sessions, Optional Items, Volume Discounts, Emails, Code Snippets and the Theme.
- **Please check:** I did not test the live registration pages. Click through each path once to make sure questions, prices and footers show for the right people.

Set the status to one of these:
- `DONE` when "Not done" is empty. Show it as: "Configuration saved under the approved build rules. Registration testing was not performed."
- `INCOMPLETE` when "Not done" has items.
- `STOPPED` when you stopped making changes. Give the reason in one plain sentence.
