import * as smd from "https://cdn.jsdelivr.net/npm/streaming-markdown/smd.min.js";

/** @type {Array<{role: string, content: string}>} */
let messages = [];
let isStreaming = false;
let activeMode = null;

// ── Tauri IPC bridge (no-op fallback for browser testing) ──────────────────
const invoke = window.__TAURI__?.core?.invoke ?? (() => Promise.resolve(null));

async function getApiKey() {
  return invoke("get_api_key");
}
async function setApiKey(key) {
  return invoke("set_api_key", { key });
}

// ── Models ────────────────────────────────────────────────────────────────────
const MODELS = [
  "anthropic/claude-sonnet-4-5:online",
  "anthropic/claude-3.5-sonnet:online",
  "openai/gpt-4o:online",
  "google/gemini-2.0-flash-001:online",
  "meta-llama/llama-3.3-70b-instruct:online",
];
const DEFAULT_MODEL = MODELS[0];

// ── System prompt (ported from backend/llm.py) ────────────────────────────────
const SYSTEM_PROMPT = `You are a thinking partner — like a sharp, well-read friend you can think out loud with.

Match the user's energy exactly. Short question = short answer. Casual = casual. Only go long when they do.

Never use bullet points, headers, or numbered lists unless the user explicitly asks for a breakdown. Write in plain prose, like you're texting a smart friend — not filing a report.

When you go deep: push back, surface real tensions, bring in sources that matter. But earn it — don't perform depth.

One follow-up question max, and only when it actually opens something up. Don't wrap up every response with a question.`;

const MODE_PROMPTS = {
  "steelman": "For this response, first identify and articulate the strongest possible version of the user's position — then engage with that, not a weaker version of it.",
  "devil's advocate": "For this response, argue against what the user is saying. Find the real flaws, challenge the assumptions, take a hard opposing stance. Don't hedge.",
  "first principles": "For this response, strip everything back to first principles. Refuse conventional framings. Challenge every assumption from the ground up.",
  "simplify": "For this response, explain as simply and concretely as possible. No jargon, no abstractions. Make it land for someone completely new to this.",
};

function buildSystemPrompt(mode) {
  let s = SYSTEM_PROMPT;
  if (mode && MODE_PROMPTS[mode]) s += `\n\n${MODE_PROMPTS[mode]}`;
  return s;
}

// ── Topics ────────────────────────────────────────────────────────────────────
const TOPICS = [
  { label: "should I quit my job?",              prominent: true,  starter: "I'm thinking about quitting my job but I'm not sure if I'm being rational or just burnt out. Help me think through it." },
  { label: "am I actually productive?",          prominent: false, starter: "I feel busy all the time but I'm not sure I'm making real progress. How do I figure out if I'm actually productive or just active?" },
  { label: "how do I stop procrastinating?",     prominent: true,  starter: "I keep procrastinating on things that actually matter to me. It's not laziness — what's really going on and how do I fix it?" },
  { label: "is social media worth it?",          prominent: false, starter: "I know social media is probably bad for me but I keep using it. Is the cost actually as high as people say, and what would I lose if I quit?" },
  { label: "how do I negotiate my salary?",      prominent: false, starter: "I want to negotiate my salary but I don't know how to approach it. Walk me through how to think about this." },
  { label: "AI is going to take my job",         prominent: true,  starter: "I'm genuinely worried AI is going to make my job obsolete in the next few years. How should I be thinking about this?" },
  { label: "should I start a side project?",     prominent: false, starter: "I keep thinking about starting a side project but never do. Help me figure out if I actually want to or if I'm just romanticizing it." },
  { label: "I can't stop doom-scrolling",        prominent: false, starter: "I pick up my phone and lose 30 minutes without even meaning to. What's actually happening in my brain and how do I break the loop?" },
  { label: "how do I build better habits?",      prominent: true,  starter: "I've tried building habits a dozen times and they never stick. What am I getting wrong?" },
  { label: "should I move to a new city?",       prominent: false, starter: "I'm considering moving to a new city for a fresh start but I'm scared I'm running away from something. Help me think through it honestly." },
  { label: "how do I deal with burnout?",        prominent: false, starter: "I think I'm burnt out but I'm not sure I can afford to slow down. What does real recovery actually look like?" },
  { label: "investing — where do I start?",      prominent: false, starter: "I know I should be investing but the whole thing feels overwhelming. Break down how I should actually think about starting." },
  { label: "my relationship is in a rut",        prominent: true,  starter: "My relationship feels like it's on autopilot. We're not fighting but we're not really connecting either. What's going on and what do I do?" },
  { label: "am I in the right career?",          prominent: false, starter: "I'm good at my job but I'm not sure I actually care about it. How do I figure out if I'm in the right career or just stuck?" },
  { label: "how do I have hard conversations?",  prominent: false, starter: "There's a conversation I've been avoiding for weeks because I'm scared of how it'll go. How should I think about approaching it?" },
  { label: "is college worth it anymore?",       prominent: false, starter: "Is a college degree actually worth the cost and time in 2025, or has that calculus fundamentally changed?" },
  { label: "how do I actually focus?",           prominent: true,  starter: "I sit down to do deep work and within 10 minutes I'm distracted. What does real focus take, and how do I build it?" },
  { label: "I feel stuck",                       prominent: false, starter: "I feel stuck — like I'm not moving forward in any meaningful area of my life. Help me figure out what's actually going on." },
  { label: "how do I spend money better?",       prominent: false, starter: "I make decent money but feel like I have nothing to show for it. How do I think about spending vs. saving vs. actually enjoying my life?" },
  { label: "what even is success?",              prominent: true,  starter: "I've been chasing a version of success that I'm not sure is actually mine. How do I figure out what I actually want?" },
];

const EMPTY_PROMPTS = [
  "What are you wrestling with today?",
  "Start with a half-baked idea.",
  "What do you wish you understood better?",
  "Disagree with something. Let's think it through.",
  "What question keeps coming back to you?",
  "Something that doesn't quite add up?",
];

// ── Boot ──────────────────────────────────────────────────────────────────────

function renderTopicWall() {
  const wall = document.getElementById("topic-wall");
  if (!wall) return;
  wall.innerHTML = "";
  TOPICS.forEach(topic => {
    const chip = document.createElement("button");
    chip.className = "topic-chip" + (topic.prominent ? " prominent" : "");
    chip.textContent = topic.label;
    chip.addEventListener("click", () => {
      const input = document.getElementById("input");
      input.value = topic.starter;
      autoResize(input);
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    });
    wall.appendChild(chip);
  });
}

async function init() {
  // Rotate empty state prompts
  let promptIdx = 0;
  const promptEl = document.getElementById("empty-prompt");
  if (promptEl) {
    setInterval(() => {
      promptEl.style.opacity = "0";
      setTimeout(() => {
        promptIdx = (promptIdx + 1) % EMPTY_PROMPTS.length;
        promptEl.textContent = EMPTY_PROMPTS[promptIdx];
        promptEl.style.opacity = "1";
      }, 400);
    }, 4000);
  }

  // Populate model dropdown
  const sel = document.getElementById("model-select");
  for (const m of MODELS) {
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = m;
    if (m === DEFAULT_MODEL) opt.selected = true;
    sel.appendChild(opt);
  }

  const toggle = document.getElementById("web-search-toggle");
  toggle.checked = DEFAULT_MODEL.includes(":online");
  toggle.addEventListener("change", syncModelSuffix);
  sel.addEventListener("change", () => {
    toggle.checked = sel.value.includes(":online");
  });

  // API key — auto-show settings if not set
  const key = await getApiKey();
  if (!key) showSettingsBar();
}

// ── Settings bar ──────────────────────────────────────────────────────────────

function showSettingsBar() {
  const bar = document.getElementById("settings-bar");
  bar.classList.remove("hidden");
  document.getElementById("settings-btn").classList.add("active");
  document.getElementById("api-key-input").focus();
}

function hideSettingsBar() {
  document.getElementById("settings-bar").classList.add("hidden");
  document.getElementById("settings-btn").classList.remove("active");
}

function toggleSettingsBar() {
  const bar = document.getElementById("settings-bar");
  if (bar.classList.contains("hidden")) {
    showSettingsBar();
  } else {
    hideSettingsBar();
  }
}

// ── Model helpers ──────────────────────────────────────────────────────────────

function syncModelSuffix() {
  const sel = document.getElementById("model-select");
  const toggle = document.getElementById("web-search-toggle");
  let model = sel.value.replace(/:online$/, "");
  if (toggle.checked) model += ":online";
  sel.options[sel.selectedIndex].value = model;
  sel.options[sel.selectedIndex].textContent = model;
}

function getSelectedModel() {
  return document.getElementById("model-select").value;
}

// ── Send ──────────────────────────────────────────────────────────────────────

async function sendMessage() {
  if (isStreaming) return;
  const input = document.getElementById("input");
  const text = input.value.trim();
  if (!text) return;

  const apiKey = await getApiKey();
  if (!apiKey) {
    showSettingsBar();
    document.getElementById("api-key-input").focus();
    return;
  }

  input.value = "";
  autoResize(input);

  const conversation = document.getElementById("conversation");
  const empty = document.getElementById("empty-state");
  if (empty) empty.remove();

  messages.push({ role: "user", content: text });
  appendMessage("user", text);

  const thinkingEl = createThinkingIndicator();
  conversation.appendChild(thinkingEl);
  scrollToBottom();

  setStreaming(true);

  let fullText = "";
  let contentEl = null;
  let mdParser = null;
  let observer = null;
  let firstChunk = true;
  let hasError = false;

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": "https://thinking-buddy.local",
        "X-Title": "sage",
      },
      body: JSON.stringify({
        model: getSelectedModel(),
        messages: [{ role: "system", content: buildSystemPrompt(activeMode) }, ...messages],
        stream: true,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`HTTP ${response.status}: ${err}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

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
          const delta = data.choices?.[0]?.delta?.content;
          if (delta) {
            if (firstChunk) {
              firstChunk = false;
              thinkingEl.remove();
              const assistantEl = appendMessage("assistant", "");
              contentEl = assistantEl.querySelector(".bubble-content");
              mdParser = smd.parser(smd.default_renderer(contentEl));
              observer = new MutationObserver((mutations) => {
                for (const m of mutations) {
                  for (const node of m.addedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                      node.classList.add("chunk-in");
                    }
                  }
                }
              });
              observer.observe(contentEl, { childList: true });
            }
            fullText += delta;
            smd.parser_write(mdParser, delta);
            scrollToBottom();
          }
        } catch (e) {
          if (e.message !== "undefined") throw e;
        }
      }
    }

    if (observer) { observer.disconnect(); observer = null; }
    if (mdParser) smd.parser_end(mdParser);
  } catch (err) {
    hasError = true;
    if (observer) { observer.disconnect(); observer = null; }
    thinkingEl.remove();
    if (!contentEl) {
      const el = appendMessage("assistant", "");
      contentEl = el.querySelector(".bubble-content");
    }
    fullText = `Error: ${err.message}`;
    contentEl.innerHTML = `<span class="error-msg">${escapeHtml(fullText)}</span>`;
  } finally {
    if (!hasError && fullText) messages.push({ role: "assistant", content: fullText });
    activeMode = null;
    document.querySelectorAll(".mode-btn").forEach(b => b.classList.remove("active"));
    setStreaming(false);
    scrollToBottom();
  }
}

// ── UI helpers ────────────────────────────────────────────────────────────────

function appendMessage(role, text) {
  const conversation = document.getElementById("conversation");

  const msg = document.createElement("div");
  msg.className = `message ${role}`;

  const body = document.createElement("div");
  body.className = "msg-body";

  const content = document.createElement("div");
  content.className = "bubble-content";
  if (text) content.innerHTML = role === "user" ? escapeHtml(text) : text;

  body.appendChild(content);
  msg.appendChild(body);
  conversation.appendChild(msg);
  scrollToBottom();
  return msg;
}

function createThinkingIndicator() {
  const el = document.createElement("div");
  el.className = "thinking";
  el.innerHTML = `
    <span class="thinking-label">sage</span>
    <div class="thinking-dots"><span></span><span></span><span></span></div>
  `;
  return el;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\n/g, "<br>");
}

function scrollToBottom() {
  const conversation = document.getElementById("conversation");
  conversation.scrollTop = conversation.scrollHeight;
}

function setStreaming(val) {
  isStreaming = val;
  document.getElementById("send-btn").disabled = val;
  document.getElementById("input").disabled = val;
}

function newConversation() {
  if (isStreaming) return;
  messages = [];
  document.getElementById("conversation").innerHTML = `
    <div class="empty-state" id="empty-state">
      <div class="empty-inner">
        <div class="empty-symbol">◆</div>
        <p class="empty-prompt" id="empty-prompt">What are you wrestling with today?</p>
        <p class="empty-hint">A question, a half-baked idea, something that doesn't add up.</p>
        <div class="topic-wall" id="topic-wall"></div>
      </div>
    </div>
  `;
  renderTopicWall();
}

// ── Textarea auto-resize + keyboard ──────────────────────────────────────────

function autoResize(el) {
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 180) + "px";
}

document.addEventListener("DOMContentLoaded", () => {
  const input = document.getElementById("input");
  input.addEventListener("input", () => autoResize(input));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  document.getElementById("send-btn").addEventListener("click", sendMessage);
  document.getElementById("new-btn").addEventListener("click", newConversation);
  document.getElementById("settings-btn").addEventListener("click", toggleSettingsBar);

  document.getElementById("save-key-btn").addEventListener("click", async () => {
    const key = document.getElementById("api-key-input").value.trim();
    if (key) {
      await setApiKey(key);
      hideSettingsBar();
    }
  });

  // Allow Enter key in API key input to save
  document.getElementById("api-key-input").addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      const key = e.target.value.trim();
      if (key) {
        await setApiKey(key);
        hideSettingsBar();
      }
    }
  });

  // Mode buttons — toggle active, one-shot (reset after send)
  document.querySelectorAll(".mode-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.mode;
      if (activeMode === mode) {
        activeMode = null;
        btn.classList.remove("active");
      } else {
        activeMode = mode;
        document.querySelectorAll(".mode-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
      }
    });
  });

  renderTopicWall();
  init();
});
