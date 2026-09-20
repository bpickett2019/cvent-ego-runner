import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

// Transport only: Pi owns reasoning, tools, sessions, retries, and cancellation.
export class PiRpc extends EventEmitter {
  constructor({ cwd, workspace, env = process.env, spawnProcess = spawn }) {
    super();
    this.pending = new Map();
    this.closed = false;
    // Load the exact skill exercised against this bridge, not a same-name global
    // skill with a different API. Keep native tools and extensions unchanged.
    // Fresh conversation != fresh instructions: exclude development AGENTS/CLAUDE
    // files and explicitly supply the production policy using native CLI options.
    const args = ["--mode", "rpc", "--approve", "--session-dir", `${workspace}/pi-sessions`, "--thinking", "low",
      "--no-context-files", "--append-system-prompt", join(cwd, "app/runtime-policy.md"),
      "--no-skills", "--skill", join(cwd, ".pi/skills/ego-browser/SKILL.md")];
    if (!env.PI_PROVIDER || !env.PI_MODEL) throw new Error("Launch from the working Pi environment (PI_PROVIDER and PI_MODEL required)");
    args.push("--provider", env.PI_PROVIDER, "--model", env.PI_MODEL);
    this.child = spawnProcess("pi", args, {
      cwd, env: { ...env, RR_WORKSPACE: workspace, PATH: `${join(cwd, "bin")}:${env.PATH || process.env.PATH || ""}` }, detached: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let buffer = "";
    this.child.stdout.setEncoding("utf8");
    this.child.stdout.on("data", chunk => {
      buffer += chunk;
      let end;
      while ((end = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, end).replace(/\r$/, "");
        buffer = buffer.slice(end + 1);
        if (!line) continue;
        let event;
        try { event = JSON.parse(line); }
        catch { this.fail(new Error("Invalid Pi RPC JSONL; execution state uncertain")); return; }
        const pending = event.type === "response" && this.pending.get(event.id);
        if (pending) {
          clearTimeout(pending.timer);
          this.pending.delete(event.id);
          if (event.success) pending.resolve(event);
          else pending.reject(new Error(event.error || `${event.command} failed`));
        }
        this.emit("event", event);
      }
    });
    // Never forward stderr blindly: extensions can print private runtime details.
    this.child.stderr.resume();
    this.child.stdin.on("error", error => this.fail(error));
    this.child.on("error", error => this.fail(error));
    this.child.on("exit", (code, signal) => {
      this.closed = true;
      this.fail(new Error(`Pi exited (${code ?? signal}); reconcile uncertain writes before retry`));
      this.emit("exit", { code, signal });
    });
  }
  fail(error) {
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
    this.pending.clear();
    this.emit("fault", error);
  }
  request(command, timeoutMs = 30_000) {
    if (this.closed) return Promise.reject(new Error("Pi is not running"));
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Pi ${command.type} timed out; do not replay uncertain commands`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(JSON.stringify({ ...command, id }) + "\n");
    });
  }
  async freshSession() {
    const { data } = await this.request({ type: "get_state" });
    if (data?.isStreaming !== false || data?.isCompacting !== false || data?.pendingMessageCount !== 0) throw new Error("Pi is not idle; refusing session reset");
    const response = await this.request({ type: "new_session" });
    if (response.data?.cancelled !== false) throw new Error("new_session was not confirmed");
    const next = (await this.request({ type: "get_state" })).data;
    if (!next.sessionId || next.sessionId === data.sessionId || next.isStreaming !== false || next.isCompacting !== false || next.pendingMessageCount !== 0 || next.messageCount !== 0) throw new Error("Fresh empty idle session not confirmed");
    const stats = (await this.request({ type: "get_session_stats" })).data;
    if (stats?.cost !== 0) throw new Error("Fresh session has prior or unavailable spending; refusing context reuse");
    return next;
  }
  async resumeSession(sessionFile, sessionId) {
    const idle = state => state?.isStreaming === false && state?.isCompacting === false && state?.pendingMessageCount === 0;
    if (!idle((await this.request({ type: "get_state" })).data)) throw new Error("Pi is not idle; refusing session switch");
    const response = await this.request({ type: "switch_session", sessionPath: sessionFile });
    if (response.data?.cancelled !== false) throw new Error("Session continuation was not confirmed");
    const state = (await this.request({ type: "get_state" })).data;
    if (!idle(state) || state.sessionId !== sessionId || state.sessionFile !== sessionFile) throw new Error("Original idle session not confirmed");
    return state;
  }
  async stop(afterAbort = async () => {}) {
    const failures = [];
    // abort alone can continue queued messages. This ordering is mandatory.
    try { await this.request({ type: "clear_queue" }, 5000); }
    catch (error) { failures.push(error.message); }
    if (!failures.length) {
      const results = await Promise.allSettled([
        this.request({ type: "abort" }, 5000),
        this.request({ type: "abort_bash" }, 5000),
      ]);
      for (const result of results) if (result.status === "rejected") failures.push(result.reason.message);
    }
    await afterAbort().catch(error => failures.push(error.message));
    // Own process group only; never stop the shared Steel service or another Pi.
    await this.terminate();
    return failures;
  }
  async terminate() {
    if (this.child.pid) {
      const signal = name => { try { process.kill(-this.child.pid, name); } catch (error) { if (error.code !== "ESRCH") throw error; } };
      signal("SIGTERM");
      await new Promise(resolve => setTimeout(resolve, 250));
      signal("SIGKILL");
    }
  }
}
