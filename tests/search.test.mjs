import { test, describe } from "node:test";
import { strict as assert } from "node:assert";
import { parseStream, orchestrateMessage, searchModel, WEB_SEARCH_TOOL } from "../frontend/search.js";

// ── SSE stream helpers ────────────────────────────────────────────────────────

const enc = new TextEncoder();

function sseChunk(obj) {
  return enc.encode(`data: ${JSON.stringify(obj)}\n\n`);
}
function sseDone() {
  return enc.encode("data: [DONE]\n\n");
}

/** Build a content delta chunk */
function contentChunk(text) {
  return { choices: [{ delta: { content: text }, finish_reason: null }] };
}

/** Build a tool_calls delta chunk (any field may be omitted to simulate multi-chunk accumulation) */
function toolCallChunk({ id, name, args } = {}) {
  const tc = { index: 0, function: {} };
  if (id   !== undefined) tc.id = id;
  if (name !== undefined) tc.function.name = name;
  if (args !== undefined) tc.function.arguments = args;
  return { choices: [{ delta: { tool_calls: [tc] }, finish_reason: null }] };
}

/** Fake ReadableStreamDefaultReader from a list of raw Uint8Array chunks */
function makeReader(chunks) {
  let i = 0;
  return {
    async read() {
      if (i >= chunks.length) return { done: true, value: undefined };
      return { done: false, value: chunks[i++] };
    },
  };
}

/** Fake streaming fetch response */
function streamResponse(chunks) {
  return { ok: true, body: { getReader: () => makeReader(chunks) } };
}

/** Fake non-streaming JSON fetch response */
function jsonResponse(obj) {
  return { ok: true, json: async () => obj };
}

// ── Test 1: parseStream — plain multi-chunk text response ─────────────────────

describe("parseStream", () => {
  test("assembles content deltas into full text and returns no tool call", async () => {
    const reader = makeReader([
      sseChunk(contentChunk("Hello")),
      sseChunk(contentChunk(", ")),
      sseChunk(contentChunk("world")),
      sseChunk({ choices: [{ delta: {}, finish_reason: "stop" }] }),
      sseDone(),
    ]);

    const collected = [];
    const { toolCall } = await parseStream(reader, (d) => collected.push(d));

    assert.equal(collected.join(""), "Hello, world");
    assert.equal(toolCall, null);
  });

  test("accumulates tool call id/name/args spread across multiple chunks", async () => {
    // Simulates real OpenRouter streaming: id arrives first, then name, then args in pieces
    const reader = makeReader([
      sseChunk(toolCallChunk({ id: "call_abc123", name: "web_search", args: "" })),
      sseChunk(toolCallChunk({ args: '{"query":' })),
      sseChunk(toolCallChunk({ args: '"world news today 2026"}' })),
      sseChunk({ choices: [{ delta: {}, finish_reason: "tool_calls" }] }),
      sseDone(),
    ]);

    const { toolCall } = await parseStream(reader, () => {});

    assert.equal(toolCall.id, "call_abc123");
    assert.equal(toolCall.name, "web_search");
    assert.deepEqual(JSON.parse(toolCall.args), { query: "world news today 2026" });
  });
});

// ── Test 2: orchestrateMessage — multi-turn WITHOUT web search ────────────────

describe("orchestrateMessage — no web search", () => {
  test("two-turn conversation: each turn makes exactly one fetch call and accumulates correctly", async () => {
    const history = [];  // simulates the messages[] array in app.js

    const calls = [];
    async function mockFetch(url, opts) {
      const body = JSON.parse(opts.body);
      calls.push({ messages: body.messages, tools: body.tools });
      // Always respond with plain text, no tool calls
      return streamResponse([
        sseChunk(contentChunk(`Reply to: ${body.messages.at(-1).content}`)),
        sseDone(),
      ]);
    }

    // Turn 1 — "What is the meaning of life?"
    history.push({ role: "user", content: "What is the meaning of life?" });
    const t1 = await orchestrateMessage({
      apiKey: "test-key", model: "test-model",
      messages: history, systemPrompt: "You are sage.",
      webEnabled: false, onDelta: () => {}, _fetch: mockFetch,
    });

    assert.equal(t1.usedSearch, false);
    assert.equal(t1.fullText, "Reply to: What is the meaning of life?");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].tools, undefined, "no tools sent when webEnabled=false");

    // Simulate app.js pushing assistant reply to history
    history.push({ role: "assistant", content: t1.fullText });

    // Turn 2 — follow-up "Can you elaborate?"
    history.push({ role: "user", content: "Can you elaborate?" });
    const t2 = await orchestrateMessage({
      apiKey: "test-key", model: "test-model",
      messages: history, systemPrompt: "You are sage.",
      webEnabled: false, onDelta: () => {}, _fetch: mockFetch,
    });

    assert.equal(t2.usedSearch, false);
    assert.equal(calls.length, 2, "exactly 2 fetch calls total (one per turn)");

    // Second call must carry full history so the model has context
    const secondCallMessages = calls[1].messages;
    assert.equal(secondCallMessages[0].role, "system");
    assert.equal(secondCallMessages[1].role, "user",    "turn 1 user message present");
    assert.equal(secondCallMessages[2].role, "assistant", "turn 1 reply present");
    assert.equal(secondCallMessages[3].role, "user",    "turn 2 user message present");
    assert.equal(secondCallMessages[3].content, "Can you elaborate?");
  });
});

// ── Test 3: orchestrateMessage — multi-turn WITH web search tool call ─────────

describe("orchestrateMessage — web search tool call flow", () => {
  test("model triggers search: 3 fetches, pointed query, tool result in final call, correct response", async () => {
    const history = [];

    // Turn 1 (no search needed) — establish context
    history.push({ role: "user", content: "I follow world news closely." });
    history.push({ role: "assistant", content: "Good to know." });

    // Turn 2 — needs web search
    history.push({ role: "user", content: "What happened in the news today?" });

    let searchingCalled = false;
    const calls = [];
    const deltas = [];

    async function mockFetch(url, opts) {
      const body = JSON.parse(opts.body);
      calls.push(body);

      if (calls.length === 1) {
        // Main model: returns a tool call with a pointed query based on context
        assert.ok(body.tools, "tools must be included in first call");
        assert.equal(body.tools[0].function.name, "web_search");
        // Verify full history is sent (not just the last message)
        const userMessages = body.messages.filter(m => m.role === "user");
        assert.equal(userMessages.length, 2, "full history sent: both user turns");
        return streamResponse([
          sseChunk(toolCallChunk({ id: "call_999", name: "web_search", args: "" })),
          sseChunk(toolCallChunk({ args: '{"query":"world news today March 2026"}' })),
          sseChunk({ choices: [{ delta: {}, finish_reason: "tool_calls" }] }),
          sseDone(),
        ]);
      }

      if (calls.length === 2) {
        // Search execution: cheap :online model called with the pointed query
        assert.equal(body.model, searchModel("test-model"), "search uses same model + :online");
        assert.equal(body.stream, false, "search call is non-streaming");
        assert.equal(body.messages[0].content, 'world news today March 2026',
          "search query is the exact string from tool call args");
        return jsonResponse({
          choices: [{ message: { content: "Big story: peace deal signed in ongoing conflict." } }],
        });
      }

      if (calls.length === 3) {
        // Final call: main model with search results injected
        const toolMsg = body.messages.find(m => m.role === "tool");
        assert.ok(toolMsg, "tool result message must be present");
        assert.ok(toolMsg.content.includes("peace deal"), "search results injected correctly");
        assert.equal(toolMsg.tool_call_id, "call_999", "tool_call_id matches");

        const assistantToolCall = body.messages.find(m => m.role === "assistant" && m.tool_calls);
        assert.ok(assistantToolCall, "assistant tool_calls message present");

        // tool_choice must be "none" to prevent re-searching
        assert.equal(body.tool_choice, "none");

        return streamResponse([
          sseChunk(contentChunk("Based on latest news: a peace deal was signed.")),
          sseChunk(contentChunk(" This is a major development.")),
          sseDone(),
        ]);
      }

      throw new Error(`Unexpected fetch call #${calls.length}`);
    }

    const result = await orchestrateMessage({
      apiKey: "test-key", model: "test-model",
      messages: history, systemPrompt: "You are sage.",
      webEnabled: true,
      onDelta: (d) => deltas.push(d),
      onSearching: () => { searchingCalled = true; },
      _fetch: mockFetch,
    });

    assert.equal(calls.length, 3, "exactly 3 fetches: main → search → final");
    assert.equal(result.usedSearch, true);
    assert.equal(result.fullText, "Based on latest news: a peace deal was signed. This is a major development.");
    assert.ok(searchingCalled, "onSearching callback must be called");
    assert.deepEqual(deltas.join(""), result.fullText, "onDelta received every chunk");
  });

  test("search failure is handled gracefully — final call still gets a result", async () => {
    const history = [{ role: "user", content: "Latest stock prices?" }];
    let finalCallMessages;

    async function mockFetch(_url, opts) {
      const body = JSON.parse(opts.body);

      if (!body.stream) {
        // Search call: simulate API failure
        return { ok: false, text: async () => "503 Service Unavailable" };
      }

      if (!finalCallMessages) {
        // First streaming call: trigger tool use
        return streamResponse([
          sseChunk(toolCallChunk({ id: "call_x", name: "web_search", args: '{"query":"stock prices"}' })),
          sseChunk({ choices: [{ delta: {}, finish_reason: "tool_calls" }] }),
          sseDone(),
        ]);
      }

      // Second streaming call: final answer
      finalCallMessages = body.messages;
      return streamResponse([sseChunk(contentChunk("I couldn't fetch live prices.")), sseDone()]);
    }

    // Track second streaming call
    let callCount = 0;
    async function trackFetch(url, opts) {
      const body = JSON.parse(opts.body);
      if (body.stream) callCount++;
      if (callCount === 2) finalCallMessages = body.messages;
      return mockFetch(url, opts);
    }

    const result = await orchestrateMessage({
      apiKey: "test-key", model: "test-model",
      messages: history, systemPrompt: "You are sage.",
      webEnabled: true, onDelta: () => {}, _fetch: trackFetch,
    });

    assert.equal(result.usedSearch, true, "usedSearch=true even when search fails");
    // The tool result message should contain the failure notice, not throw
    const toolMsg = finalCallMessages?.find(m => m.role === "tool");
    assert.ok(toolMsg?.content.includes("Search failed"), "graceful failure message injected");
  });
});
