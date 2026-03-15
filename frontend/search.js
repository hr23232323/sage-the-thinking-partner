// ── search.js — streaming + web search orchestration ─────────────────────────
// No DOM. No CDN imports. fetch is injectable for testing.

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// Search is executed by the same model with :online grounding appended —
// guaranteed to work since the user already has this model selected.
export function searchModel(model) {
  return model.replace(/:online$/, "") + ":online";
}

export const WEB_SEARCH_TOOL = {
  type: "function",
  function: {
    name: "web_search",
    description:
      "Search the web for current events, recent news, live data, or facts that may have changed since your training. " +
      "Use this ONLY when the question genuinely requires up-to-date information. " +
      "Do NOT use for conversational instructions like 'try again', 'rephrase', 'continue', or 'elaborate'.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "A precise, targeted search query derived from the full conversation context — not just the last message.",
        },
      },
      required: ["query"],
    },
  },
};

/**
 * Parse one OpenRouter SSE stream.
 * Calls onDelta(text) for each content chunk.
 * Returns { toolCall: { id, name, args } | null }
 *
 * @param {ReadableStreamDefaultReader} reader
 * @param {(delta: string) => void} onDelta
 */
export async function parseStream(reader, onDelta) {
  const decoder = new TextDecoder();
  let buffer = "";
  const pendingToolCalls = {}; // keyed by index — handles models that emit multiple tool calls

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6).trim();
      if (payload === "[DONE]") break;
      try {
        const data = JSON.parse(payload);
        if (data.error) throw new Error(data.error.message ?? JSON.stringify(data.error));

        // Accumulate tool call deltas per index (models may emit multiple tool calls)
        const tcDelta = data.choices?.[0]?.delta?.tool_calls;
        if (tcDelta) {
          console.log("[sage] tool_call delta:", JSON.stringify(tcDelta));
          for (const tc of tcDelta) {
            const idx = tc.index ?? 0;
            if (!pendingToolCalls[idx]) pendingToolCalls[idx] = { id: "", name: "", args: "" };
            if (tc.id) pendingToolCalls[idx].id = tc.id;
            if (tc.function?.name) pendingToolCalls[idx].name += tc.function.name;
            if (tc.function?.arguments) pendingToolCalls[idx].args += tc.function.arguments;
          }
        }

        const delta = data.choices?.[0]?.delta?.content;
        if (delta) onDelta(delta);
      } catch (e) {
        if (e.message !== "undefined") throw e;
      }
    }
  }

  // Use the first valid tool call; ignore any extras
  const firstToolCall = Object.values(pendingToolCalls).find(tc => tc.name) ?? null;
  return { toolCall: firstToolCall };
}

/**
 * Orchestrate one user turn against OpenRouter.
 *
 * Without web search: one streaming call, returns the response.
 * With web search: if the model calls the web_search tool, executes a
 * pointed search via a cheap :online model, injects results, and streams
 * the final answer. Tool exchange is ephemeral — not added to messages[].
 *
 * @param {object}   opts
 * @param {string}   opts.apiKey
 * @param {string}   opts.model
 * @param {Array}    opts.messages       full history (user + assistant turns)
 * @param {string}   opts.systemPrompt
 * @param {boolean}  opts.webEnabled     whether to offer the web_search tool
 * @param {function} opts.onDelta        called with each streamed text chunk
 * @param {function} [opts.onSearching]  called when a search is triggered
 * @param {function} [opts._fetch]       injectable fetch (defaults to global fetch)
 * @returns {{ fullText: string, usedSearch: boolean }}
 */
export async function orchestrateMessage({
  apiKey,
  model,
  messages,
  systemPrompt,
  webEnabled,
  onDelta,
  onSearching,
  _fetch = fetch,
}) {
  console.log("[sage] orchestrateMessage — model:", model, "| webEnabled:", webEnabled);
  async function post(body) {
    const res = await _fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": "https://github.com/hr23232323/sage-the-thinking-partner",
        "X-Title": "sage",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    return res;
  }

  const tools = webEnabled ? [WEB_SEARCH_TOOL] : undefined;

  // ── First call ─────────────────────────────────────────────────────────────
  const res1 = await post({
    model,
    messages: [{ role: "system", content: systemPrompt }, ...messages],
    stream: true,
    ...(tools && { tools, tool_choice: "auto" }),
  });

  let fullText = "";
  const { toolCall } = await parseStream(res1.body.getReader(), (delta) => {
    fullText += delta;
    onDelta(delta);
  });

  console.log("[sage] first call done — toolCall:", toolCall ? JSON.stringify(toolCall) : "null");

  if (!toolCall) return { fullText, usedSearch: false };

  // ── Model triggered a search ───────────────────────────────────────────────
  onSearching?.();
  let query;
  try {
    query = JSON.parse(toolCall.args).query;
  } catch (e) {
    console.warn("[sage] tool call args parse failed, skipping search:", toolCall.args);
    return { fullText, usedSearch: false };
  }
  console.log("[sage] searching with model:", searchModel(model), "| query:", query);

  let searchResult;
  try {
    const searchRes = await post({
      model: searchModel(model),
      messages: [{ role: "user", content: query }],
      stream: false,
    });
    const data = await searchRes.json();
    if (data.error) throw new Error(data.error.message ?? JSON.stringify(data.error));
    searchResult = data.choices?.[0]?.message?.content ?? "No results found.";
    console.log("[sage] search result length:", searchResult.length, "chars");
  } catch (e) {
    console.error("[sage] search failed:", e.message);
    searchResult = `Search failed: ${e.message}. Answer from training data only.`;
  }

  const toolExchange = [
    {
      role: "assistant",
      content: null,
      tool_calls: [{
        id: toolCall.id,
        type: "function",
        function: { name: toolCall.name, arguments: toolCall.args },
      }],
    },
    { role: "tool", tool_call_id: toolCall.id, content: searchResult },
  ];

  // ── Second call (with search results) ──────────────────────────────────────
  const res2 = await post({
    model,
    messages: [{ role: "system", content: systemPrompt }, ...messages, ...toolExchange],
    stream: true,
    ...(tools && { tools, tool_choice: "none" }),
  });

  fullText = "";
  await parseStream(res2.body.getReader(), (delta) => {
    fullText += delta;
    onDelta(delta);
  });

  return { fullText, usedSearch: true };
}
