// Compatibility layer for the documented ego-browser helper surface.
// Browser semantics remain in the pinned upstream Ego runtime.
export const cliLog = (value) => console.log(value);
export const listTaskSpaces = (...args) => globalThis.taskSpaces.list(...args);
export const useOrCreateTaskSpace = (...args) => globalThis.taskSpaces.useOrCreate(...args);
export const claimTaskSpace = (...args) => globalThis.taskSpaces.claim(...args);
export const takeOverTaskSpace = (...args) => globalThis.taskSpaces.takeOver(...args);
export const handOffTaskSpace = (...args) => globalThis.taskSpaces.handOff(...args);
export const waitForAgentControl = (...args) => globalThis.taskSpaces.waitForAgentControl(...args);
export const completeTaskSpace = (...args) => globalThis.taskSpaces.complete(...args);
export const listTabs = (...args) => globalThis.browser.listTabs(...args);
export const openOrReuseTab = (...args) => globalThis.browser.openOrReuseTab(...args);
export const currentTab = (...args) => globalThis.browser.currentTab(...args);
export const switchTab = (...args) => globalThis.browser.switchTab(...args);
export const closeTab = (...args) => globalThis.browser.closeTab(...args);
export const ensureRealTab = (...args) => globalThis.browser.ensureRealTab(...args);
export const pageInfo = (...args) => globalThis.page.info(...args);
const milliseconds = (seconds, fallback) => typeof seconds === "number" ? Math.max(0, seconds * 1000) : fallback;
export const gotoAndWait = (url, options = {}) => globalThis.page.goto(url, {
  waitUntil: options.waitUntil ?? "domcontentloaded",
  timeout: milliseconds(options.timeout, 60000),
  settle: milliseconds(options.settle, 0),
});
export const gotoUrl = (url) => gotoAndWait(url);
export const snapshotText = (...args) => globalThis.page.snapshot(...args);
const selectorFor = (target) => {
  const selector = typeof target === "string" ? target : target?.selector;
  if (selector?.startsWith("loc=css:")) return selector.slice("loc=css:".length);
  if (selector?.startsWith("css:")) return selector.slice("css:".length);
  return selector;
};
export const captureScreenshot = async (options = {}) => ({ path: await globalThis.page.screenshot(options), ...(await globalThis.page.info()) });
export const js = (...args) => globalThis.page.evaluate(...args);
export const click = (target, options = {}) => typeof target === "string"
  ? globalThis.page.locator(selectorFor(target)).click(options)
  : globalThis.page.mouse.click(target, options);
export const doubleClick = (target, options = {}) => typeof target === "string"
  ? globalThis.page.locator(selectorFor(target)).dblclick(options)
  : globalThis.page.mouse.dblclick(target, options);
export const hover = (target, options = {}) => {
  if (Array.isArray(target)) return globalThis.page.mouse.move(target[0], target[1]);
  if (target && typeof target === "object" && "x" in target && "y" in target && !target.selector) return globalThis.page.mouse.move(target.x, target.y);
  return globalThis.page.locator(selectorFor(target)).hover(options);
};
async function pointFor(target) {
  if (Array.isArray(target)) return { x: target[0], y: target[1] };
  if (target && typeof target === "object" && "x" in target && "y" in target && !target.selector) return target;
  const center = await globalThis.page.elementCenter(selectorFor(target));
  return target && typeof target === "object" && target.x !== undefined && target.y !== undefined
    ? { x: center.x + target.x, y: center.y + target.y } : center;
}
export const dragMouse = async (path, options = {}) => {
  if (!Array.isArray(path) || path.length < 2) throw new Error("dragMouse requires source and destination");
  const anchors = await Promise.all(path.map(pointFor));
  const points = [anchors[0]];
  const steps = Math.max(4, options.steps ?? 5);
  for (let i = 1; i < anchors.length; i += 1) for (let step = 1; step <= steps; step += 1) {
    const p = step / steps, from = anchors[i - 1], to = anchors[i];
    points.push({ x: from.x + (to.x - from.x) * p, y: from.y + (to.y - from.y) * p + Math.sin(p * Math.PI) * 8 });
  }
  return globalThis.page.mouse.drag(points, options);
};
export const scroll = (options) => typeof options === "number"
  ? globalThis.page.mouse.wheel(0, options)
  : globalThis.page.mouse.wheel(options?.dx ?? 0, options?.dy ?? 0);
export const scrollBy = (y) => scroll(y);
export const scrollToBottomUntil = async (predicate, options = {}) => {
  const { step = 900, wait: waitSeconds = 1, maxSteps = 20 } = options;
  for (let i = 0; i < maxSteps; i += 1) { if (await predicate()) return true; await scrollBy(step); await wait(waitSeconds); }
  return false;
};
export const typeText = (value, options = {}) => globalThis.page.keyboard.type(value, options);
export const fillInput = (target, value) => globalThis.page.locator(selectorFor(target)).fill(value);
export const pressKey = (key) => globalThis.page.keyboard.press(key);
export const dispatchKey = (key, options = {}) => globalThis.cdp("Input.dispatchKeyEvent", { type: options.type ?? "keyDown", key, ...(options.modifiers == null ? {} : { modifiers: options.modifiers }) });
export const uploadFile = (target, files) => globalThis.page.locator(selectorFor(target)).setInputFiles(files);
export const wait = (seconds) => globalThis.page.waitForTimeout(milliseconds(seconds, 0));
export const waitForLoad = (options = {}) => globalThis.page.waitForLoadState("domcontentloaded", { timeout: milliseconds(options.timeout, 60000) });
export const waitForElement = (target, options = {}) => globalThis.page.locator(selectorFor(target)).waitFor({ state: options.state ?? "visible", timeout: milliseconds(options.timeout, 30000) });
export const waitForNetworkIdle = (options = {}) => globalThis.page.waitForLoadState("networkidle", { timeout: milliseconds(options.timeout, 60000) });
export const browserFetch = (...args) => globalThis.fetch.browser(...args);
export const serverFetch = (...args) => globalThis.fetch.server(...args);
export const drainEvents = (...args) => globalThis.page.drainEvents(...args);
