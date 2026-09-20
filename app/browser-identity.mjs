// App-managed read-only preflight: do not acquire a TaskSpace while RETURNING.
// Ego v2 cliLog(object) uses inspect(), so serialize explicitly for the API parser.
export function eventObservationProgram() {
  return `const eventNames = await js(${JSON.stringify(`(${collectEventNames.toString()})()`)});
    cliLog(JSON.stringify({info:await pageInfo(),snapshot:(await snapshotText()).slice(0,15000),eventNames}));`;
}

// Runs inside the assigned Cvent page; never infer identity from arbitrary body text.
export function collectEventNames(doc = document) {
  const text = node => (node?.value ?? node?.innerText ?? node?.textContent ?? "").trim();
  const isName = value => /^event (?:name|title)\s*:?$/i.test(value.trim());
  // Cvent's read-only Event Information screen labels this simply "Title".
  // Scope to the event model, not planner/stakeholder Title fields on that page.
  const labelled = [...doc.querySelectorAll("#EventInputModel_Title-container .cv-value, #EventInputModel_Title")].map(text);
  labelled.push(...[...doc.querySelectorAll("label")].filter(node => isName(text(node))).map(node => text(node.control)));
  for (const node of doc.querySelectorAll("[aria-label]")) {
    if (isName(node.getAttribute("aria-label"))) labelled.push(text(node));
  }
  for (const node of doc.querySelectorAll("dt, th, td")) {
    if (isName(text(node))) labelled.push(text(node.nextElementSibling));
  }
  const values = labelled.filter(Boolean);
  // Generic headings such as "Personal Information" name a page, not an event.
  return [...new Set(values)];
}
