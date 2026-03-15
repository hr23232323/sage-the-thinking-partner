import * as smd from "https://cdn.jsdelivr.net/npm/streaming-markdown/smd.min.js";
import { orchestrateMessage } from "./search.js";

/** @type {Array<{role: string, content: string}>} */
let messages = [];
let isStreaming = false;
let activeMode = null;
let currentConversationId = null;

// ── Tauri IPC bridge (no-op fallback for browser testing) ──────────────────
const invoke = window.__TAURI__?.core?.invoke ?? (() => Promise.resolve(null));

async function getApiKey() {
  return invoke("get_api_key");
}
async function setApiKey(key) {
  return invoke("set_api_key", { key });
}
async function getConversations() {
  return invoke("get_conversations") ?? [];
}
async function saveConversation(conversation) {
  return invoke("save_conversation", { conversation });
}
async function deleteConversation(id) {
  return invoke("delete_conversation", { id });
}
async function getPrefs() {
  return invoke("get_prefs") ?? {};
}
async function setPrefs(prefs) {
  return invoke("set_prefs", { prefs });
}

// ── Models ────────────────────────────────────────────────────────────────────
const MODELS = [
  "qwen/qwen3-32b:nitro",
  "google/gemini-2.5-pro",
  "anthropic/claude-sonnet-4-5",
  "openai/gpt-4o",
];
const DEFAULT_MODEL = MODELS[0];


// ── System prompt ────────────────────────────────────────────────────────────
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

  const half = Math.ceil(TOPICS.length / 2);
  const rows = [TOPICS.slice(0, half), TOPICS.slice(half)];

  rows.forEach((rowTopics, i) => {
    const track = document.createElement("div");
    track.className = "topic-track" + (i === 1 ? " slow" : "");

    [0, 1].forEach(() => {
      rowTopics.forEach(topic => {
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
        track.appendChild(chip);
      });
    });

    wall.appendChild(track);
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

  // Load saved prefs
  const prefs = await getPrefs();

  // Apply theme early
  applyTheme(prefs.theme || "light");

  // Populate model dropdown
  const sel = document.getElementById("model-select");
  for (const m of MODELS) {
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = m;
    if (m === DEFAULT_MODEL) opt.selected = true;
    sel.appendChild(opt);
  }

  // Restore saved model
  if (prefs.model) {
    const match = Array.from(sel.options).find(o => o.value === prefs.model);
    if (match) sel.value = match.value;
  }

  const toggle = document.getElementById("web-search-toggle");
  toggle.checked = prefs.web ?? false;

  function savePrefs() {
    setPrefs({ model: getSelectedModel(), web: toggle.checked, theme: document.documentElement.getAttribute("data-theme") || "light" });
  }

  toggle.addEventListener("change", savePrefs);
  sel.addEventListener("change", savePrefs);

  // Wire up history button
  document.getElementById("history-btn").addEventListener("click", showHistoryPanel);

  // API key — auto-show settings if not set
  const key = await getApiKey();
  if (!key) showSettingsBar();
  
  // Load last conversation if exists
  const convs = await getConversations();
  if (convs.length > 0) {
    loadConversation(convs[0]);
  }
}

// ── Theme ─────────────────────────────────────────────────────────────────────

function applyTheme(theme) {
  const isDark = theme === "dark";
  document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
  document.getElementById("theme-icon-moon").style.display = isDark ? "none" : "";
  document.getElementById("theme-icon-sun").style.display = isDark ? "" : "none";
}

async function toggleTheme() {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  const next = isDark ? "light" : "dark";
  applyTheme(next);
  const prefs = await getPrefs();
  setPrefs({ ...prefs, theme: next });
}

// ── Settings panel ────────────────────────────────────────────────────────────

async function showSettingsBar() {
  hideHistoryPanel();
  document.getElementById("settings-bar").classList.add("open");
  document.getElementById("settings-btn").classList.add("active");
  const input = document.getElementById("api-key-input");
  const key = await getApiKey();
  if (key) input.value = key;
  input.focus();
}

function hideSettingsBar() {
  document.getElementById("settings-bar").classList.remove("open");
  document.getElementById("settings-btn").classList.remove("active");
}

function toggleSettingsBar() {
  const bar = document.getElementById("settings-bar");
  if (bar.classList.contains("open")) hideSettingsBar();
  else showSettingsBar();
}

// ── Model helpers ──────────────────────────────────────────────────────────────

function getSelectedModel() {
  return document.getElementById("model-select").value;
}

// ── Conversation management ─────────────────────────────────────────────────

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function getConversationTitle(msgs) {
  if (!msgs.length) return "New conversation";
  const firstUser = msgs.find(m => m.role === "user");
  if (firstUser) {
    const title = firstUser.content.slice(0, 50);
    return title + (firstUser.content.length > 50 ? "..." : "");
  }
  return "New conversation";
}

async function saveCurrentConversation() {
  if (!messages.length) return;
  
  const conversation = {
    id: currentConversationId || generateId(),
    title: getConversationTitle(messages),
    messages: messages,
    mode: activeMode,
    created_at: Date.now(),
  };
  
  currentConversationId = conversation.id;
  await saveConversation(conversation);
}

async function loadConversation(conversation) {
  currentConversationId = conversation.id;
  messages = conversation.messages || [];
  activeMode = conversation.mode || null;
  
  const conversationEl = document.getElementById("conversation");
  conversationEl.innerHTML = "";
  
  if (messages.length === 0) {
    renderTopicWall();
  } else {
    for (const msg of messages) {
      appendMessage(msg.role, msg.content);
    }
  }
  
  // Update mode buttons
  document.querySelectorAll(".mode-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.mode === activeMode);
  });
  
  hideHistoryPanel();
  updateCopyBtn();
}

function startNewConversation() {
  if (isStreaming) return;
  currentConversationId = null;
  messages = [];
  activeMode = null;

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
  document.querySelectorAll(".mode-btn").forEach(btn => btn.classList.remove("active"));
  updateCopyBtn();
}

function showHistoryPanel() {
  hideSettingsBar();

  const list = document.getElementById("history-list");
  const searchInput = document.getElementById("history-search");
  searchInput.value = "";
  list.innerHTML = "";

  let allConvs = [];

  function renderList(convs) {
    list.innerHTML = "";
    if (!convs.length) {
      list.innerHTML = "<p class='history-empty'>no threads yet</p>";
      return;
    }
    convs.forEach(conv => {
      const item = document.createElement("div");
      item.className = "history-item";

      const load = document.createElement("button");
      load.className = "history-load";
      load.innerHTML = `
        <span class="history-title">${escapeHtml(conv.title || "Untitled")}</span>
        <span class="history-date">${new Date(conv.created_at).toLocaleDateString()}</span>
      `;
      load.addEventListener("click", () => loadConversation(conv));

      const del = document.createElement("button");
      del.className = "history-delete";
      del.title = "Delete thread";
      del.innerHTML = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><line x1="3" y1="3" x2="13" y2="13"/><line x1="13" y1="3" x2="3" y2="13"/></svg>`;
      del.addEventListener("click", async (e) => {
        e.stopPropagation();
        await deleteConversation(conv.id);
        if (currentConversationId === conv.id) startNewConversation();
        item.remove();
        if (!list.querySelector(".history-item")) {
          list.innerHTML = "<p class='history-empty'>no threads yet</p>";
        }
      });

      item.appendChild(load);
      item.appendChild(del);
      list.appendChild(item);
    });
  }

  getConversations().then(convs => {
    allConvs = convs;
    renderList(allConvs);
  });

  searchInput.oninput = () => {
    const q = searchInput.value.trim().toLowerCase();
    renderList(q ? allConvs.filter(c => (c.title || "").toLowerCase().includes(q)) : allConvs);
  };

  document.getElementById("history-drawer").classList.add("open");
  document.getElementById("drawer-backdrop").classList.add("visible");
  document.getElementById("history-btn").classList.add("active");
}

function hideHistoryPanel() {
  document.getElementById("history-drawer").classList.remove("open");
  document.getElementById("drawer-backdrop").classList.remove("visible");
  document.getElementById("history-btn").classList.remove("active");
}

// ── Copy chat ─────────────────────────────────────────────────────────────────

function updateCopyBtn() {
  const btn = document.getElementById("copy-btn");
  btn.style.display = messages.length ? "flex" : "none";
}

async function copyChat() {
  if (!messages.length) return;
  const text = messages.map(m =>
    `${m.role === "user" ? "You" : "sage"}:\n${m.content}`
  ).join("\n\n---\n\n");

  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // fallback for environments where clipboard API is restricted
    const ta = Object.assign(document.createElement("textarea"), {
      value: text, style: "position:fixed;opacity:0"
    });
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }

  const btn = document.getElementById("copy-btn");
  btn.classList.add("copied");
  setTimeout(() => btn.classList.remove("copied"), 1500);
}

// ── Export ────────────────────────────────────────────────────────────────────

function exportConversation() {
  if (!messages.length) return;
  const title = getConversationTitle(messages);
  const md = messages.map(m => {
    const label = m.role === "user" ? "**You**" : "**sage**";
    return `${label}\n\n${m.content}`;
  }).join("\n\n---\n\n");
  const blob = new Blob([`# ${title}\n\n${md}\n`], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title.slice(0, 40).replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.md`;
  a.click();
  URL.revokeObjectURL(url);
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

  const conversationEl = document.getElementById("conversation");
  const empty = document.getElementById("empty-state");
  if (empty) empty.remove();

  messages.push({ role: "user", content: text });
  appendMessage("user", text);

  const thinkingEl = createThinkingIndicator();
  conversationEl.appendChild(thinkingEl);
  scrollToBottom();
  setStreaming(true);

  // DOM rendering state — mutated by onDelta closure
  let contentEl = null, mdParser = null, observer = null;
  let fullText = "";
  let hasError = false;

  function onDelta(delta) {
    if (!contentEl) {
      if (thinkingEl.parentNode) collapseThinking(thinkingEl, () => {});
      const el = appendMessage("assistant", "");
      contentEl = el.querySelector(".bubble-content");
      mdParser = smd.parser(smd.default_renderer(contentEl));
      observer = new MutationObserver((mutations) => {
        for (const m of mutations)
          for (const node of m.addedNodes)
            if (node.nodeType === Node.ELEMENT_NODE) node.classList.add("chunk-in");
      });
      observer.observe(contentEl, { childList: true });
    }
    smd.parser_write(mdParser, delta);
    scrollToBottom();
  }

  function onSearching(query) {
    addThinkingStep(thinkingEl, "search", query);
  }

  function onSynthesizing() {
    addThinkingStep(thinkingEl, "synthesize");
  }

  try {
    ({ fullText } = await orchestrateMessage({
      apiKey,
      model: getSelectedModel(),
      messages,
      systemPrompt: buildSystemPrompt(activeMode),
      webEnabled: document.getElementById("web-search-toggle").checked,
      onDelta,
      onSearching,
      onSynthesizing,
    }));
  } catch (err) {
    hasError = true;
    if (thinkingEl.parentNode) { thinkingEl.style.transition = "none"; thinkingEl.remove(); }
    const el = appendMessage("assistant", "");
    el.querySelector(".bubble-content").innerHTML =
      `<span class="error-msg">${escapeHtml("Error: " + err.message)}</span>`;
  } finally {
    if (observer) observer.disconnect();
    if (mdParser) smd.parser_end(mdParser);
    if (!hasError && fullText) messages.push({ role: "assistant", content: fullText });
    activeMode = null;
    document.querySelectorAll(".mode-btn").forEach(b => b.classList.remove("active"));
    setStreaming(false);
    scrollToBottom();
    if (!hasError && messages.length > 0) saveCurrentConversation();
    updateCopyBtn();
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
    <div class="thinking-header">
      <span class="thinking-label">sage</span>
      <div class="thinking-dots"><span></span><span></span><span></span></div>
    </div>
    <div class="thinking-log"></div>
  `;
  return el;
}

function addThinkingStep(thinkingEl, type, text) {
  const log = thinkingEl.querySelector(".thinking-log");
  if (!log) return;
  const step = document.createElement("div");
  step.className = "thinking-step";
  if (type === "search") {
    step.innerHTML = `<span class="thinking-step-arrow">↳</span><span class="thinking-step-text">searching <em>"${escapeHtml(text)}"</em></span>`;
  } else {
    step.innerHTML = `<span class="thinking-step-arrow">↳</span><span class="thinking-step-text">synthesizing…</span>`;
  }
  log.appendChild(step);
  scrollToBottom();
}

function collapseThinking(thinkingEl, onDone) {
  const h = thinkingEl.getBoundingClientRect().height;
  thinkingEl.style.height = h + "px";
  thinkingEl.style.overflow = "hidden";
  thinkingEl.style.transition = "height 0.28s ease, opacity 0.2s ease, margin-bottom 0.28s ease";
  requestAnimationFrame(() => {
    thinkingEl.style.height = "0";
    thinkingEl.style.opacity = "0";
    thinkingEl.style.marginBottom = "0";
  });
  let done = false;
  const cleanup = () => { if (done) return; done = true; thinkingEl.remove(); onDone(); };
  thinkingEl.addEventListener("transitionend", function handler(e) {
    if (e.propertyName === "height") {
      thinkingEl.removeEventListener("transitionend", handler);
      cleanup();
    }
  });
  // Fallback in case transitionend doesn't fire (e.g. reduced motion)
  setTimeout(cleanup, 400);
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
  document.getElementById("new-btn").addEventListener("click", startNewConversation);
  document.getElementById("theme-btn").addEventListener("click", toggleTheme);
  document.getElementById("copy-btn").addEventListener("click", copyChat);
  document.getElementById("export-btn").addEventListener("click", exportConversation);
  document.getElementById("settings-btn").addEventListener("click", toggleSettingsBar);
  document.getElementById("close-history").addEventListener("click", hideHistoryPanel);
  document.getElementById("drawer-backdrop").addEventListener("click", hideHistoryPanel);

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
