#!/usr/bin/env node
import { appendFile, open, readFile, unlink } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import process from "node:process";
import { CdpClient } from "./cdp-client.mjs";
import { SteelEgoHost } from "./host.mjs";
import { saveObserverForHost } from "./save-observer.mjs";

const project = resolve(new URL("..", import.meta.url).pathname);
const workspace = process.env.RR_WORKSPACE || resolve(project, "data/current");
const runtimePath = resolve(workspace, "runtime.json");
const statePath = resolve(workspace, "state.json");
const lockPath = resolve(workspace, "operation.lock");
const executionLog = resolve(workspace, "ego-executions.jsonl");

async function stdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

async function acquireLock() {
  const deadline = Date.now() + 30_000;
  while (true) {
    try {
      const handle = await open(lockPath, "wx", 0o600);
      await handle.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
      return handle;
    } catch (error) {
      if (error.code !== "EEXIST" || Date.now() >= deadline) throw error;
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === "--version" || args[0] === "-v") {
    console.log("ego-lite dca7003349c5f7132189ba00547cbbd7ff8e597e + steel-cdp-v2-bridge (session-ledger patch)");
    return;
  }
  if (args[0] === "nodejs") args.shift();
  let program;
  if (args.length === 2 && args[0] === "-e") program = args[1];
  else if (args.length) throw new Error("Usage: ego-browser nodejs [-e code] < program.js");

  const startedAt = new Date();
  const lock = await acquireLock();
  let client;
  let runtime;
  let outcome = "ok";
  try {
    runtime = JSON.parse(await readFile(runtimePath, "utf8"));
    if (!runtime.cdpEndpoint || !runtime.steelSessionId) throw new Error("Canonical BrowserRuntime is incomplete");
    client = new CdpClient(runtime.cdpEndpoint);
    await client.connect();
    const host = new SteelEgoHost(client, runtimePath);
    globalThis.ego = host;
    globalThis.observeSave = saveObserverForHost(host);
    globalThis.saveOnce = saveObserverForHost(host, { submit: true });

    const nativeFetch = globalThis.fetch;
    globalThis.fetch = async (input, init = {}) => {
      const url = input instanceof Request ? input.url : String(input);
      const method = String(init.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
      if (/cvent\.com/i.test(url) && !["GET", "HEAD", "OPTIONS"].includes(method)) {
        throw new Error(`GuardrailViolation: server-side Cvent ${method} forbidden`);
      }
      return nativeFetch(input, init);
    };
    process.env.EGO_BROWSER_AGENT_WORKSPACE = resolve(project, ".pi/skills/ego-browser");
    const instance = createHash("sha256").update(runtime.steelSessionId).digest("hex");
    process.env.EGO_BROWSER_INSTANCE_ID = `steel:${instance}`;
    process.env.EGO_BROWSER_STATE_DIR = resolve(project, "data/ego-v2", instance);
    process.env.EGO_BROWSER_PAGE_BUDGET = "1";
    const { runMain } = await import("../vendor/ego-lite/package/ego-browser/dist/src/run.js");
    const code = await runMain({ argv: [], stdinText: program ?? await stdin() });
    if (code !== 0) process.exitCode = code;
  } catch (error) {
    outcome = "error";
    throw error;
  } finally {
    const endedAt = new Date();
    const state = await readFile(statePath, "utf8").then(JSON.parse).catch(() => ({}));
    await appendFile(executionLog, JSON.stringify({ startedAt: startedAt.toISOString(), endedAt: endedAt.toISOString(), elapsedMs: endedAt - startedAt, stage: state.currentStage || null, ownership: runtime?.ownership || null, targetId: runtime?.activeTargetId || null, outcome }) + "\n").catch(() => {});
    client?.close();
    await lock.close().catch(() => {});
    await unlink(lockPath).catch(() => {});
  }
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});
