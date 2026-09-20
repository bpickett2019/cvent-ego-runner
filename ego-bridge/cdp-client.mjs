import WebSocket from "ws";

export class CdpClient {
  constructor(endpoint) {
    this.endpoint = endpoint;
    this.socket = null;
    this.nextInternalId = 1_000_000_000;
    this.pending = new Map();
    this.externalSink = () => {};
  }

  async connect() {
    if (this.socket?.readyState === WebSocket.OPEN) return;
    this.socket = new WebSocket(this.endpoint, { perMessageDeflate: false });
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`CDP connect timeout: ${this.endpoint}`)), 15_000);
      this.socket.once("open", () => { clearTimeout(timeout); resolve(); });
      this.socket.once("error", (error) => { clearTimeout(timeout); reject(error); });
    });
    this.socket.on("message", (raw) => {
      const text = raw.toString();
      let message;
      try { message = JSON.parse(text); } catch { return; }
      const pending = this.pending.get(message.id);
      if (pending) {
        this.pending.delete(message.id);
        clearTimeout(pending.timer);
        if (message.error) pending.reject(new Error(message.error.message || JSON.stringify(message.error)));
        else pending.resolve(message.result ?? {});
        return;
      }
      this.externalSink(text);
    });
    this.socket.on("close", () => {
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(new Error("Steel CDP socket closed"));
      }
      this.pending.clear();
    });
  }

  setExternalSink(sink) { this.externalSink = sink; }

  sendEnvelope(envelope) {
    if (this.socket?.readyState !== WebSocket.OPEN) throw new Error("Steel CDP socket is not open");
    this.socket.send(JSON.stringify(envelope));
  }

  request(method, params = {}, sessionId) {
    const id = this.nextInternalId++;
    const envelope = { id, method, params, ...(sessionId ? { sessionId } : {}) };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP request timed out: ${method}`));
      }, 20_000);
      this.pending.set(id, { resolve, reject, timer });
      try { this.sendEnvelope(envelope); }
      catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
    });
  }

  close() {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.close();
  }
}
