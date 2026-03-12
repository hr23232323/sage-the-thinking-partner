import * as smd from "https://cdn.jsdelivr.net/npm/streaming-markdown/smd.min.js";

/** @type {Array<{role: string, content: string}>} */
let messages = [];
let isStreaming = false;

const EMPTY_PROMPTS = [
  "What are you wrestling with today?",
  "Start with a half-baked idea.",
  "What do you wish you understood better?",
  "Disagree with something. Let's think it through.",
  "What question keeps coming back to you?",
  "Something that doesn't quite add up?",
];

// ── Boot ──────────────────────────────────────────────────────────────────────

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

  const res = await fetch("/models");
  const { models, default: defaultModel } = await res.json();
  const sel = document.getElementById("model-select");
  for (const m of models) {
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = m;
    if (m === defaultModel) opt.selected = true;
    sel.appendChild(opt);
  }

  const toggle = document.getElementById("web-search-toggle");
  toggle.checked = defaultModel.includes(":online");
  toggle.addEventListener("change", syncModelSuffix);
  sel.addEventListener("change", () => {
    toggle.checked = sel.value.includes(":online");
  });
}

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
    const response = await fetch("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, model: getSelectedModel() }),
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
          const { delta, error } = JSON.parse(payload);
          if (error) throw new Error(error);
          if (delta) {
            if (firstChunk) {
              firstChunk = false;
              thinkingEl.remove();
              const assistantEl = appendMessage("assistant", "");
              contentEl = assistantEl.querySelector(".bubble-content");
              mdParser = smd.parser(smd.default_renderer(contentEl));
              // Fade in each block element as smd adds it
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
      </div>
    </div>
  `;
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

  init();
});
