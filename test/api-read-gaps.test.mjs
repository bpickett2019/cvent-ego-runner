import assert from "node:assert/strict";
import test from "node:test";
import { CventConnection } from "../app/cvent-api.mjs";
const eventId = "11111111-1111-1111-1111-111111111111", questionId = "22222222-2222-2222-2222-222222222222", otherId = "33333333-3333-3333-3333-333333333333";
const json = body => new Response(JSON.stringify(body));
function fixture(options = {}) {
  const calls = [];
  const api = new CventConnection({ intervalMs: 0, credentials: async () => ({ baseUrl: "https://api-platform.cvent.com/ea", clientId: "dummy", clientSecret: "dummy" }), clientFactory: async () => ({ getEvent: async () => ({ id: eventId }) }),
    fetcher: async (input, init = {}) => {
      const u = new URL(input); calls.push(u);
      if (u.pathname.endsWith("/oauth2/token")) return json({ access_token: "dummy" });
      assert.equal(init.method || "GET", "GET");
      if (u.pathname === "/ea/event-questions") {
        assert.equal(u.searchParams.get("filter"), `event.id eq '${eventId}'`);
        const q = { id: questionId, event: { id: options.foreign ? otherId : eventId } };
        return json({ data: options.missing ? [] : options.duplicate ? [q, q] : [q] });
      }
      const choices = u.pathname === `/ea/event-questions/${questionId}/choices`;
      assert.ok(choices || u.pathname === `/ea/events/${eventId}/features`);
      assert.equal(u.searchParams.get("filter"), null);
      if (options.denied) return new Response('{}', { status: 403 });
      const row = choices ? { id: u.searchParams.has("token") ? "second" : "first", question: { id: options.wrongQuestion ? otherId : questionId } } : { name: "Registration", enabled: true, event: { id: options.foreign ? otherId : eventId } };
      if (options.escape) return json({ data: [row], paging: { _links: { next: { href: `/ea/event-questions/${otherId}/choices?token=next` } } } });
      return json({ data: [row], ...(u.searchParams.has("token") ? {} : { paging: { nextToken: "next" } }) });
    } });
  return { calls, run: (op, input = {}) => api.execute({ apiEventId: eventId }, op, input) };
}
test("question choices require complete authorized-event membership then scoped pagination", async () => {
  const f = fixture(), rows = await f.run("listQuestionChoices", { questionId });
  assert.deepEqual(rows.map(r => r.id), ["first", "second"]);
  assert.ok(f.calls.findIndex(u => u.pathname === "/ea/event-questions") < f.calls.findIndex(u => u.pathname.endsWith("/choices")));
});
test("choices reject missing, foreign, duplicate or caller-spoofed question membership", async () => {
  for (const options of [{ missing: true }, { foreign: true }, { duplicate: true }]) {
    const f = fixture(options); await assert.rejects(f.run("listQuestionChoices", { questionId })); assert.ok(!f.calls.some(u => u.pathname.endsWith("/choices")));
  }
  for (const input of [{}, { questionId: "bad" }, { questionId, eventId }, { questionId: otherId }]) {
    const f = fixture(); await assert.rejects(f.run("listQuestionChoices", input)); assert.ok(!f.calls.some(u => u.pathname.endsWith("/choices")));
  }
  for (const options of [{ wrongQuestion: true }, { escape: true }, { denied: true }]) {
    const f = fixture(options); await assert.rejects(f.run("listQuestionChoices", { questionId }));
    assert.equal(f.calls.filter(u => u.pathname.endsWith("/choices")).length, 1);
  }
});
test("feature status reads all pages without exposing feature-setting or launch writes", async () => {
  const f = fixture(), rows = await f.run("listEventFeatures"); assert.equal(rows.length, 2);
  for (const options of [{ foreign: true }, { denied: true }, { escape: true }]) await assert.rejects(fixture(options).run("listEventFeatures"));
  for (const op of ["updateEventFeatures", "launchEventFeature"]) await assert.rejects(f.run(op), /not exposed/);
});
