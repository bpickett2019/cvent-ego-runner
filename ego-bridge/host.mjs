import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { readSaveSignals } from "./save-observer.mjs";

const INTERACTIVE_ROLE = /^(button|link|textbox|searchbox|combobox|checkbox|radio|menuitem|option|slider|spinbutton|switch|tab|treeitem)$/i;
const WRITE_METHOD = /^(Input\.|DOM\.(set|remove)|Page\.navigate|Page\.reload|Target\.(createTarget|closeTarget)|Storage\.(set|clear)|Network\.(set|clear)|Fetch\.continueRequest)/;
const FORBIDDEN = /\b(publish|go\s+live|send\s+(?:email|invitation)|delete|archive)\b/i;
const LOGIN_HOST = /(^|\.)(login\.microsoftonline\.com|login\.app\.cvent\.com)$/i;

function eventIdentity(raw) {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password || url.port ||
        !["app.cvent.com", "events.app.cvent.com"].includes(url.hostname)) return null;
    const queryIds = [...url.searchParams].filter(([key]) => key.toLowerCase() === "evtstub").map(([, value]) => value);
    const pathIds = url.pathname.match(/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/ig) || [];
    const ids = [...queryIds, ...pathIds];
    if (queryIds.length > 1 || !ids.length || new Set(ids).size !== 1) return null;
    return ids[0];
  } catch { return null; }
}

// Narrow bootstrap: a skill may open the already API-confirmed event from the
// neutral Events list. This grants no list input, authoring or other-event access.
export function isApprovedEventNavigation(runtime, currentUrl, destinationUrl) {
  try {
    const from = new URL(currentUrl), to = new URL(destinationUrl);
    const expected = runtime.expectedEvtstub;
    if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(expected || "")) return false;
    if (runtime.apiEvent?.id !== expected || !runtime.expectedEventName || runtime.apiEvent.name !== runtime.expectedEventName) return false;
    const eventPage = /^\/subscribers\/events2\/(?:overview\/overview\/index\/view|details\/eventdetails\/index)\/?$/i;
    const list = from.protocol === "https:" && !from.username && !from.password && !from.port &&
      ["app.cvent.com", "events.app.cvent.com"].includes(from.hostname) &&
      /^\/subscribers\/events2\/eventselection\/?$/i.test(from.pathname) && !from.search && !from.hash;
    // Cvent's Registration menu lands on its separate analytics frontend.
    // Recognize only this exact same-event overview as a return source, never
    // as a new authoring host or an approved navigation destination.
    const registrationOverview = from.origin === "https://event-insights-ui.app.cvent.com" &&
      !from.username && !from.password && !from.hash &&
      /^\/events\/registrationInsights\/registrationOverview\/?$/.test(from.pathname) &&
      [...from.searchParams].length === 1 && from.searchParams.get("evtstub") === expected;
    if (!list && !registrationOverview && eventIdentity(currentUrl) !== expected) return false;
    return eventPage.test(to.pathname) && !to.hash && [...to.searchParams].length === 1 && eventIdentity(destinationUrl) === expected;
  } catch { return false; }
}

function numericId(name) {
  let hash = 2166136261;
  for (const byte of Buffer.from(name)) { hash ^= byte; hash = Math.imul(hash, 16777619); }
  return (hash >>> 0) || 1;
}

function escapeCss(value) {
  return value.replace(/([\\"#.:[\],>+~*'\s])/g, "\\$1");
}

export class SteelEgoHost {
  constructor(client, runtimePath) {
    this.client = client;
    this.runtimePath = runtimePath;
    this.onCDPMessage = () => {};
    this.onSendCDPMessageError = () => {};
    this.selected = true;
    this.taskName = "cvent-ego-runner";
    client.setExternalSink((message) => this.onCDPMessage?.(message));
  }

  async runtime() { return JSON.parse(await readFile(this.runtimePath, "utf8")); }
  async saveRuntime(runtime) {
    runtime.updatedAt = new Date().toISOString();
    await writeFile(this.runtimePath, JSON.stringify(runtime, null, 2) + "\n");
  }

  async targetInfos() {
    const { targetInfos = [] } = await this.client.request("Target.getTargets");
    return targetInfos.filter((target) => target.type === "page");
  }

  async activeTarget() {
    const runtime = await this.runtime();
    const targets = await this.targetInfos();
    const target = targets.find((item) => item.targetId === runtime.activeTargetId);
    if (!target) throw new Error("Assigned page target is missing; stop rather than select another tab");
    return target;
  }

  async forbiddenUiLabel(envelope, pattern = FORBIDDEN) {
    let expression = null;
    if (envelope.method === "Input.dispatchMouseEvent" && Number.isFinite(envelope.params?.x) && Number.isFinite(envelope.params?.y)) {
      expression = `(() => { const e=document.elementFromPoint(${JSON.stringify(envelope.params.x)},${JSON.stringify(envelope.params.y)}); const a=e?.closest('button,a,[role=button],[role=menuitem],input'); return a ? [a.innerText,a.value,a.getAttribute('aria-label'),a.title].filter(Boolean).join(' ') : ''; })()`;
    } else if (envelope.method === "Input.dispatchKeyEvent") {
      expression = `(() => { const a=document.activeElement; return a ? [a.innerText,a.value,a.getAttribute('aria-label'),a.title].filter(Boolean).join(' ') : ''; })()`;
    }
    if (expression) {
      const result = await this.client.request("Runtime.evaluate", { expression, returnByValue: true }, envelope.sessionId);
      const label = String(result.result?.value || "");
      if (pattern.test(label)) return label;
    }
    if (envelope.method === "Runtime.callFunctionOn" && envelope.params?.objectId) {
      const result = await this.client.request("Runtime.callFunctionOn", { objectId: envelope.params.objectId, functionDeclaration: "function(){return [this.innerText,this.value,this.getAttribute?.('aria-label'),this.title].filter(Boolean).join(' ')}", returnByValue: true }, envelope.sessionId);
      const label = String(result.result?.value || "");
      if (pattern.test(label)) return label;
    }
    return null;
  }

  async assertOperationAllowed(envelope) {
    const runtime = await this.runtime();
    if (runtime.ownership === "USER") throw Object.assign(new Error("User owns the canonical browser"), { error_code: "EGO_TASK_SPACE_USER_IN_CONTROL" });
    if (["Target.createTarget", "Target.closeTarget", "Browser.close", "Target.disposeBrowserContext"].includes(envelope.method)) {
      throw new Error("GuardrailViolation: assigned browser tabs/session must be preserved");
    }
    if (envelope.params?.targetId && envelope.params.targetId !== runtime.activeTargetId) {
      throw new Error("GuardrailViolation: unassigned browser target");
    }
    const source = `${envelope.params?.expression || ""}\n${envelope.params?.functionDeclaration || ""}`;
    const likelyWrite = WRITE_METHOD.test(envelope.method) ||
      (envelope.method === "Runtime.evaluate" && /(?:\.click\s*\(|\.value\s*=|dispatchEvent|localStorage\.|sessionStorage\.)/.test(source)) ||
      (envelope.method === "Runtime.callFunctionOn" && /(?:\.click\s*\(|\.value\s*=|dispatchEvent|focus\s*\(|blur\s*\()/.test(source));
    if (runtime.ownership === "BOOTSTRAPPING" && likelyWrite) {
      const page = await this.activeTarget();
      if (!runtime.freshProfile || !runtime.jobId || envelope.method !== "Page.navigate" ||
          envelope.params?.url !== "https://app.cvent.com/Subscribers/Events2/EventSelection" ||
          !["about:blank", "chrome://newtab/", "chrome://new-tab-page/"].includes(page.url)) {
        throw new Error("Clean-browser bootstrap permits only opening Cvent from the new blank page");
      }
      return;
    }
    if (runtime.ownership === "RETURNING" && likelyWrite) throw new Error("Browser is read-only while returning control to the agent");
    if (runtime.ownership === "LOCATING" && likelyWrite) {
      const current = await this.activeTarget();
      if (envelope.method !== "Page.navigate" || !isApprovedEventNavigation(runtime, current.url, envelope.params?.url)) {
        throw new Error("GuardrailViolation: event location permits only navigation to the confirmed event's overview/details; no authoring");
      }
    }
    if (!likelyWrite) return;
    if (existsSync(join(dirname(this.runtimePath), "api-write-uncertain.json"))) throw new Error("GuardrailViolation: an API write is uncertain; browser mutations are blocked until reconciliation");
    if (existsSync(join(dirname(this.runtimePath), "browser-save-uncertain.json"))) throw new Error("BrowserSaveUncertainError: a browser save is uncertain; further mutations are blocked");
    const forbiddenLabel = FORBIDDEN.test(source) ? source.match(FORBIDDEN)?.[0] : await this.forbiddenUiLabel(envelope);
    if (forbiddenLabel) throw new Error(`GuardrailViolation: prohibited Cvent action detected (${String(forbiddenLabel).slice(0, 120)})`);

    const target = await this.activeTarget();
    let url;
    try { url = new URL(target.url); } catch { return; }
    if (LOGIN_HOST.test(url.hostname) || (/cvent\.com$/i.test(url.hostname) && /\/(?:login|signin|sign-on|auth)(?:\/|$)/i.test(url.pathname))) throw new Error("GuardrailViolation: authentication input is human-only; use Take Control");
    if (runtime.ownership === "AGENT" && eventIdentity(target.url) === runtime.expectedEvtstub) {
      const observed = await this.client.request("Runtime.evaluate", { expression: `(${readSaveSignals.toString()})().pending`, returnByValue: true }, envelope.sessionId);
      if (observed.exceptionDetails || typeof observed.result?.value !== "boolean") throw new Error("Cannot establish pending-save state; mutation not dispatched");
      if (observed.result.value) throw new Error("SavePendingError: Saving is visible; use observeSave, inspect validation, and do not close/navigate/repeat Save");
      const latest = await this.runtime();
      if (latest.ownership !== "AGENT" || latest.runtimeId !== runtime.runtimeId || latest.activeTargetId !== runtime.activeTargetId || latest.steelSessionId !== runtime.steelSessionId) throw new Error("Control changed during pending-save check; mutation not dispatched");
    }
    if (envelope.method === "Page.navigate") {
      if (isApprovedEventNavigation(runtime, target.url, envelope.params?.url)) return;
      // Preserve ordinary navigation within the selected event, but never allow
      // a correct current URL to authorize a different destination event.
      if (!runtime.expectedEvtstub || eventIdentity(target.url) !== runtime.expectedEvtstub ||
          eventIdentity(envelope.params?.url) !== runtime.expectedEvtstub || FORBIDDEN.test(envelope.params?.url || "")) {
        throw new Error("GuardrailViolation: navigation requires the approved current event and destination, or its confirmed Events-list link");
      }
    }
    const isCvent = /(^|\.)cvent\.com$/i.test(url.hostname);
    if (!isCvent) return;
    const expected = runtime.expectedEvtstub;
    if (!expected || !target.url.includes(expected)) {
      throw new Error(`GuardrailViolation: Cvent write requires current URL to contain expected evtstub; url=${target.url}`);
    }
  }

  sendCDPMessage(payload) {
    let envelope;
    try { envelope = JSON.parse(payload); }
    catch (error) { this.onSendCDPMessageError?.(String(error), "INVALID_CDP_MESSAGE"); return; }
    void this.assertOperationAllowed(envelope).then(async () => {
      if (envelope.method === "Target.activateTarget" && envelope.params?.targetId) {
        const runtime = await this.runtime();
        runtime.activeTargetId = envelope.params.targetId;
        await this.saveRuntime(runtime);
      }
      this.client.sendEnvelope(envelope);
    }).catch((error) => this.onSendCDPMessageError?.(error.message || String(error), error.error_code || "EGO_OPERATION_FAILED"));
  }

  async listTabs() {
    const runtime = await this.runtime();
    // The app's Return gate must observe the assigned tab while RETURNING.
    // This is inventory only; task acquisition and mutations still require AGENT.
    if (!["AGENT", "RETURNING", "LOCATING", "BOOTSTRAPPING"].includes(runtime.ownership)) throw new Error("Use the app Return to Agent gate before accessing tabs");
    const target = await this.activeTarget();
    return { tabs: [{ targetId: target.targetId, title: target.title || "", url: target.url || "", index: 0, active: true }] };
  }

  async createTab(url = "about:blank") {
    await this.assertOperationAllowed({ method: "Target.createTarget", params: { url } });
    const result = await this.client.request("Target.createTarget", { url });
    const runtime = await this.runtime();
    runtime.activeTargetId = result.targetId;
    await this.saveRuntime(runtime);
    return { targetId: result.targetId };
  }

  async snapshot(options = {}) {
    const runtime = await this.runtime();
    if (runtime.ownership === "USER") throw Object.assign(new Error("User owns the canonical browser"), { error_code: "EGO_TASK_SPACE_USER_IN_CONTROL" });
    const target = await this.activeTarget();
    const { sessionId } = await this.client.request("Target.attachToTarget", { targetId: target.targetId, flatten: true });
    await this.client.request("Accessibility.enable", {}, sessionId);
    let result = await this.client.request("Accessibility.getFullAXTree", {}, sessionId);
    const stableLocators = new Map();
    const bounds = new Map();
    const scope = options.scope || "full_page";
    if (!["full_page", "only_within_viewport", "subtree"].includes(scope)) throw new Error("Unsupported snapshot scope");
    let frameId;
    if (scope === "subtree") {
      const root = (result.nodes || []).find(node => node.backendDOMNodeId === options.root);
      if (!root) throw new Error("Snapshot subtree unavailable in the top document; take a fresh top-document snapshot");
      if (/^iframe(?:presentational)?$/i.test(root.role?.value || "")) {
        const { node } = await this.client.request("DOM.describeNode", { backendNodeId: options.root, depth: 1 }, sessionId);
        const { frameTree } = await this.client.request("Page.getFrameTree", {}, sessionId);
        const containsFrame = tree => (tree?.childFrames || []).some(child => child.frame?.id === node?.frameId || containsFrame(child));
        if (!node?.frameId || !node.contentDocument?.backendNodeId || !containsFrame(frameTree)) {
          throw new Error("Iframe snapshot unavailable: only an attached same-renderer frame in the assigned page is supported; no other target will be attached");
        }
        frameId = node.frameId;
        result = await this.client.request("Accessibility.getFullAXTree", { frameId }, sessionId);
        if (!(result.nodes || []).some(item => item.frameId === frameId && item.backendDOMNodeId === node.contentDocument.backendNodeId)) {
          throw new Error("Iframe snapshot unavailable: frame document identity could not be verified");
        }
      }
    }
    let viewport;
    // Frame refs carry provenance; never suggest an unscoped CSS locator that
    // could select a same-named control in the top document instead.
    if (!frameId) try {
      const dom = await this.client.request("DOMSnapshot.captureSnapshot", { computedStyles: [] }, sessionId);
      const strings = dom.strings || [];
      const document = dom.documents?.[0];
      const nodes = document?.nodes;
      for (let i = 0; i < (document?.layout?.nodeIndex?.length || 0); i++) {
        bounds.set(nodes.backendNodeId[document.layout.nodeIndex[i]], document.layout.bounds[i]);
      }
      if (scope === "only_within_viewport") {
        const result = await this.client.request("Runtime.evaluate", { expression: "({width:innerWidth,height:innerHeight,x:scrollX,y:scrollY})", returnByValue: true }, sessionId);
        viewport = result.result?.value;
        if (!viewport || !bounds.size) throw new Error("Viewport snapshot geometry unavailable; use full_page");
      }
      for (let index = 0; index < (nodes?.backendNodeId?.length || 0); index += 1) {
        const backendNodeId = nodes.backendNodeId[index];
        const raw = nodes.attributes?.[index] || [];
        const attrs = new Map();
        for (let i = 0; i < raw.length; i += 2) attrs.set(strings[raw[i]] || "", strings[raw[i + 1]] || "");
        const tag = (strings[nodes.nodeName?.[index] ?? -1] || "").toLowerCase();
        const id = attrs.get("id"), cventId = attrs.get("data-cvent-id"), name = attrs.get("name"), href = attrs.get("href");
        if (id) stableLocators.set(backendNodeId, `css:#${escapeCss(id)}`);
        else if (cventId) stableLocators.set(backendNodeId, `css:[data-cvent-id="${cventId.replace(/"/g, '\\"')}"]`);
        else if (name && tag) stableLocators.set(backendNodeId, `css:${tag}[name="${name.replace(/"/g, '\\"')}"]`);
        else if (href && tag === "a") stableLocators.set(backendNodeId, `css:a[href="${href.replace(/"/g, '\\"')}"]`);
      }
    } catch (error) { if (scope === "only_within_viewport") throw error; /* Full-page AX refs remain valid. */ }

    const nodesById = new Map((result.nodes || []).map(node => [node.nodeId, node]));
    let subtree;
    if (scope === "subtree" && !frameId) {
      const root = (result.nodes || []).find(node => node.backendDOMNodeId === options.root);
      subtree = new Set();
      const visit = node => { if (!node || subtree.has(node.nodeId)) return; subtree.add(node.nodeId); for (const id of node.childIds || []) visit(nodesById.get(id)); };
      visit(root);
    }
    const refs = [];
    const lines = [`page ${JSON.stringify(target.title || "")} url=${target.url}`, frameId
      ? "[Steel snapshot: selected iframe document only; nested iframe contents not included]"
      : "[Steel snapshot: top document only; iframe contents not included; request an iframe ref subtree to inspect a supported frame]"];
    for (const node of result.nodes || []) {
      if (subtree && !subtree.has(node.nodeId)) continue;
      if (viewport) {
        let cursor = node, box;
        while (cursor && !box) { box = bounds.get(cursor.backendDOMNodeId); cursor = nodesById.get(cursor.parentId); }
        if (!box || box[2] <= 0 || box[3] <= 0 || box[0] + box[2] <= viewport.x || box[1] + box[3] <= viewport.y || box[0] >= viewport.x + viewport.width || box[1] >= viewport.y + viewport.height) continue;
      }
      if (node.ignored || node.backendDOMNodeId == null) continue;
      const role = String(node.role?.value || "generic");
      const name = String(node.name?.value || "").trim().replace(/\s+/g, " ").slice(0, 300);
      const value = node.value?.value == null ? "" : String(node.value.value).slice(0, 300);
      if (!name && !value && !INTERACTIVE_ROLE.test(role) && !/^iframe(?:presentational)?$/i.test(role)) continue;
      const backendNodeId = Number(node.backendDOMNodeId);
      refs.push({ backendNodeId, role, name, ...(frameId ? { frameId } : {}) });
      const stable = stableLocators.get(backendNodeId);
      lines.push(`${role}${name ? ` ${JSON.stringify(name)}` : ""}${value ? ` value=${JSON.stringify(value)}` : ""} [ref=${backendNodeId}${stable ? `, loc=${stable}` : ""}]`);
      if (lines.length >= 800) { lines.push("[Snapshot truncated at 800 lines; inspect a subtree or use bounded page.evaluate]"); break; }
    }
    const content = lines.join("\n");
    const max = Number.isFinite(options.maxResultLength) ? Math.max(0, options.maxResultLength) : undefined;
    return { content: max == null ? content : content.slice(0, max), refs };
  }

  async listTaskSpaces() {
    const runtime = await this.runtime();
    const ownership = runtime.ownership === "USER" ? "user" : runtime.ownership === "RETURNING" ? "agentDelegatedToUser" : "agent";
    return { taskSpaces: [{ taskId: this.taskName, id: numericId(this.taskName), name: this.taskName, ownership }] };
  }
  async createTaskSpace() { throw new Error("Reuse the assigned cvent-ego-runner TaskSpace; creating another space is forbidden"); }
  async useTaskSpace(id) {
    if (id !== numericId(this.taskName)) throw new Error("Unassigned TaskSpace");
    const runtime = await this.runtime();
    if (!["AGENT", "LOCATING", "BOOTSTRAPPING"].includes(runtime.ownership)) throw new Error("Use the app Return to Agent gate before resuming this TaskSpace");
    this.selected = true;
    return { done: true };
  }
  async claimTaskSpace(id) {
    if ((await this.runtime()).ownership !== "AGENT") throw new Error("Use the app Return to Agent gate before claiming control");
    await this.useTaskSpace(id);
    return (await this.listTaskSpaces()).taskSpaces[0];
  }
  async handOffTaskSpace() { const runtime = await this.runtime(); runtime.ownership = "USER"; await this.saveRuntime(runtime); return { done: true }; }
  async takeOverTaskSpace() { await this.claimTaskSpace(numericId(this.taskName)); return { done: true }; }
  async completeTaskSpace() { return { done: true }; }
  async closeTaskSpace() { throw new Error("The canonical browser cannot be closed by task-space cleanup"); }
  async getBrowserVersion() { return "ego-browser-v2 Steel assigned-session bridge"; }
}
