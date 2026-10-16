import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { RUN_SKILLS } from "./run-policy.mjs";
import { GUARD_COMMAND } from "./diagnostic-guard.js";

// Transport only: Pi owns reasoning, tools, sessions, retries, and cancellation.
export class PiRpc extends EventEmitter {
  constructor({ cwd, workspace, env = process.env, spawnProcess = spawn }) {
    super();
    this.pending = new Map();
    this.closed = false;
    // Advertise the single event-build skill. Its bundled references include
    // the pinned Ego/Steel controls; native Pi reads relevant guidance on demand.
    // Exclude development context; keep native tools, extensions and compaction.
    const thinking = env.PI_THINKING_LEVEL ?? "high";
    if (!["off", "minimal", "low", "medium", "high", "xhigh", "max"].includes(thinking)) {
      throw new Error("Invalid PI_THINKING_LEVEL; native execution was not started");
    }
    const args = ["--mode", "rpc", "--approve", "--session-dir", `${workspace}/pi-sessions`, "--thinking", thinking,
      "--no-context-files", "--extension", join(cwd, "app/diagnostic-guard.js"),
      "--no-skills", ...RUN_SKILLS.flatMap(name => ["--skill", join(cwd, ".pi/skills", name, "SKILL.md")])];
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
      this.fail(new Error(`Pi exited (${code ?? signal}); this run stopped, do not replay uncertain commands`));
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
    const commands = (await this.request({ type: "get_commands" })).data?.commands;
    if (!Array.isArray(commands) || !commands.some(command => command.name === GUARD_COMMAND && command.source === "extension")) {
      throw new Error("Required diagnostic guard did not load; no AI prompt was sent");
    }
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
  // Pi owns cancellation/idle state. Callers must revoke tool ownership first;
  // native idle does not prove remote writes or spending have been reconciled.
  async pause(sessionId) {
    if (typeof sessionId !== "string" || !sessionId) throw new Error("Expected native session identity required for pause");
    try {
      const failures = await this.cancelPending();
      if (failures.length) throw new Error("Native cancellation was not confirmed; pause requires reconciliation");
      const { data: state } = await this.request({ type: "get_state" }, 5000);
      if (state?.sessionId !== sessionId || state.isStreaming !== false || state.isCompacting !== false || state.pendingMessageCount !== 0) {
        throw new Error("Same idle native session was not confirmed; pause requires reconciliation");
      }
      return state; // Retain this process and its history; no reset or prompt.
    } catch (error) {
      // An unconfirmed cancellation cannot be represented as a safe human pause.
      // The controller still owns browser cleanup and uncertainty/accounting holds.
      await this.terminate();
      throw error;
    }
  }
  async cancelPending() {
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
    return failures;
  }
  async stop(afterAbort = async () => {}) {
    const failures = await this.cancelPending();
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
