# sage — ideas & improvements

> A living list of what would make sage dramatically better. Organized by theme, scored by impact vs. effort.

Last updated: March 2026

---

## The north star

sage should feel like the sharpest friend you have — one who **remembers** your ongoing struggles, **challenges** your thinking rather than flattering it, and is **available in two keystrokes** from anywhere on your Mac. Every idea below is evaluated against that standard.

---

## 🔥 Quick wins (high impact, low effort)

### 1. Global hotkey to open from anywhere
Right now you have to click the tray icon. A global hotkey (`Cmd+Shift+Space` or user-configurable) that opens sage from any app — instantly. This alone would 3x daily usage.
- Register via Tauri's `global-shortcut` plugin (already in the ecosystem)
- Configurable in settings

### 2. Selected text as instant context
Select any text in any Mac app → trigger sage → it opens with that text already quoted in the compose field. Like PopClip but deeper.
- Detect selected text via macOS Accessibility API
- Tauri has a `macos-private-api` feature already enabled

### 3. More thinking modes
The current four are good. These are obviously missing:
- **rubber duck** — just listen and ask clarifying questions, no answers yet
- **Socratic** — never give a direct answer, only ask questions that guide you to yours
- **pre-mortem** — assume this fails in 6 months, why did it?
- **inversion** — flip the problem, reason backwards
- **10/10/10** — how will you feel about this in 10 minutes / 10 months / 10 years?
- **second-order** — what happens next after the obvious consequence?
- **steel-man + rebuttal** — steelman, then immediately rebut the steelman

### 4. Custom modes
Let users define and save their own thinking frames. A simple text field for the prompt instruction, a name, and a keyboard shortcut. Power users build their own playbooks.

### 5. Keyboard shortcut for mode picker
`/` works great but muscle-memory shortcuts (`Cmd+1` through `Cmd+4`) for the four main modes would be faster for daily users.

### 6. Resizable window
440px fixed-width is tight for long responses. Let users drag to resize horizontally (min 380px, max 720px). Persist the preference.

### 7. Conversation search across full text
Current search only matches conversation titles. Full-text search across all message content is essential as history grows. Already all local data — just need to search it.

### 8. Pin / favorite conversations
A star on important threads. Pinned conversations float to the top of the history drawer. Critical for recurring topics ("my career thinking," "startup ideas").

### 9. Word/character count + reading time
Small stat below the compose field: `~240 words · 1 min read`. Useful for knowing when you're writing an essay vs. a question.

### 10. Undo last send
If you hit Enter by accident or regret what you sent, `Cmd+Z` should pull it back (before the response arrives). Removes friction.

---

## 🧠 Memory & continuity (the biggest unlock)

The difference between a chat tool and a thinking partner is that the partner **remembers you**. This is the #1 requested feature across all AI tools and the biggest gap in sage today.

### 11. User profile / persistent context
A small, user-editable "about me" text that gets prepended to every system prompt. Job, values, recurring goals, communication style. You define it once; sage knows it forever.

```
I'm a product manager at a B2B SaaS startup. I care deeply about user psychology
and writing clearly. I tend to overthink decisions and need to be pushed to act.
I'm currently figuring out whether to start my own company.
```

### 12. Project memory
Named projects that accumulate context across multiple conversations. You say "this is about my job search" and sage silently builds a mental model of your situation — decisions you've made, things you're stuck on, constraints you've mentioned.

When you return to that project, sage surfaces: *"Last time you were weighing staying vs. leaving. You landed on 'give it 90 days.' That was 3 weeks ago."*

### 13. Memory extraction
At the end of every conversation (or on demand), sage offers to extract key facts, decisions, and open questions into a persistent memory layer. Not raw conversation history — distilled semantic memory.

- **Facts:** "Has 3 years of PM experience, hates async culture"
- **Decisions:** "Decided to negotiate salary before accepting the offer"
- **Open questions:** "Still hasn't figured out equity situation"

### 14. Proactive thought resurface
When you open sage and start typing, it notices if your topic matches something from a past conversation and surfaces it: *"You worked through something similar in March — want me to bring in that context?"*

Turns sage from reactive to proactive — a genuine thinking partner, not a blank chat box.

### 15. Conversation branching / forking
Mid-conversation, fork to explore a different direction without losing the original thread. Like git branches for thinking. The fork icon appears on hover next to any message. Both branches remain accessible.

### 16. Recurring topic detection
Surface patterns: *"You've brought up quitting your job 4 times in the last 2 months. Want to dedicate a thread to thinking this through?"* Turns individual conversations into ongoing arcs.

---

## 🎙️ Input & capture

### 17. Voice input
Speak your thoughts instead of typing. Uses macOS's built-in speech recognition (no cloud, no Whisper API needed). Especially powerful for thinking out loud — rubber duck mode becomes truly conversational.
- Tauri can invoke `NSSpeechRecognizer` via Rust or JS `webkitSpeechRecognition`

### 18. Quick capture / brain dump mode
A frictionless input that captures a raw thought without requiring a response. Like an inbox for your brain. Typing `!` as the first character sends a note to "brain dump" storage without triggering AI at all — just saved for later connection.

### 19. Paste-and-think
Paste any long text (article, email, job description, document) → sage automatically detects it and asks "what do you want to think through?" One-click to summarize, critique, steelman, or extract key questions.

### 20. Image input
Paste or drag in a screenshot, diagram, or photo. "What's wrong with this design?" / "Help me think through this org chart" / "I screenshot this article — what's the core argument?" OpenRouter supports vision models.

### 21. URL input detection
Paste a URL → sage fetches and reads the page, then invites you to think about it. Works with articles, job postings, LinkedIn profiles. Uses the existing web search infrastructure.

---

## 🖥️ macOS-native depth

### 22. Share extension
Select text in Safari, Mail, Notes, or any app → right-click → "Think about this with sage." Pre-fills the compose field with the selected text plus context about where it came from.

### 23. App context awareness
Know what app is in focus when sage opens. Adapt the persona:
- **In Xcode:** subtle shift toward technical, code-review mindset
- **In Mail/Messages:** more communication-focused
- **In Notes/Obsidian:** writing partner mode
Uses `NSWorkspace` to detect the frontmost app — no screen recording needed.

### 24. Notification when response finishes
For long responses, send a macOS notification so you can context-switch away and come back. Currently you have to watch it stream.

### 25. Menubar quick-reply badge
Show the number of unread conversations in the tray icon badge. When you have an ongoing async conversation, know at a glance.

### 26. Spotlight / Raycast integration
An Alfred workflow or Raycast extension that opens sage with a selected thought. Lets sage live inside the productivity tools people already have muscle memory for.

---

## 📊 Thinking outputs & intelligence

### 27. Action item extraction
After a conversation, one-click to extract any commitments, next steps, or decisions into a clean list. The most common thing missing from AI thinking tools — "we talked through a lot, but what am I *doing* next?"

### 28. Decision log
A persistent, auto-populated log of decisions made across all conversations. "On March 5th you decided to negotiate before accepting. On Feb 12th you decided to give the job 90 days." Surfaces without asking.

### 29. Conversation summary
One-click summary of any conversation. Useful for long threads. Also auto-generated when a conversation exceeds ~30 messages and stored alongside the thread.

### 30. Weekly thinking digest
Every Sunday, sage quietly generates a digest: what topics you explored, what decisions you made, what's still open. Sent as a local notification. Turns ephemeral conversations into a visible arc of your thinking.

### 31. Insight clustering
Across all conversations, detect recurring themes and surface them: "Autonomy comes up constantly in your career conversations. Want to explore that thread?" Makes the tool feel like it's learning about you.

---

## ⚡ Conversation UX

### 32. Multi-model comparison
Send the same message to two models simultaneously and see responses side-by-side. Especially valuable for important decisions — see how Gemini and Claude reason differently about the same problem.

### 33. Model-specific routing
Automatically choose the best model for the query type:
- Code/technical questions → Qwen 3 or Sonnet
- Current events → Gemini 2.5 Pro with :online
- Creative/writing → Sonnet or GPT-4o
User can toggle auto-routing on/off.

### 34. Conversation temperature slider
A simple slider in settings: conservative ↔ bold. Controls the model's temperature and slightly adjusts the system prompt. "Bold" mode gives more provocative pushback; "conservative" is gentler and more measured.

### 35. Response length selector
Before sending, a subtle 3-way toggle: `brief` / `normal` / `deep`. Appends a length instruction to the system prompt. Solves the "I wanted a quick answer but got an essay" problem.

### 36. Inline follow-up chips
After a response, show 2-3 intelligent follow-up questions as tappable chips below the response. Like YouTube's related videos but for thinking. Auto-generated by the model. One tap and the follow-up is sent.

### 37. Highlight + quote in reply
Select any part of the AI's response → click "Reply to this" → quoted section appears in compose field. Natural conversation flow without copy-pasting.

### 38. Message editing
Edit a sent message and regenerate the response. Saves starting a new thread when you realize you asked the wrong question.

### 39. Regenerate response
One-click to regenerate the last assistant response (different sampling = different take). Essential for exploring multiple perspectives.

---

## 🎨 Design & polish

### 40. Compact / expanded mode
A small toggle to switch between full height (current) and a compact 3-line quick-entry mode. Compact mode is just a text field + send — zero chrome. Expanded is the full experience. Power users stay in compact until they need depth.

### 41. Font size control
Small / normal / large text size toggle. Accessibility and preference. One setting, three states.

### 42. Custom accent color
Let users swap the warm brown accent for their own color. Small but makes the app feel personal.

### 43. Conversation backgrounds
Subtle background tint per conversation (not mode, but for personalizing recurring topics). "My career conversations" get a slightly different visual feel from "random questions."

### 44. Animated empty state variations
The current diamond + prompts is great. Add seasonal / contextual variations: morning vs. evening phrasing, different topic walls based on day of week.

---

## 🏗️ Infrastructure & reliability

### 45. Offline mode / graceful degradation
Detect no internet and show a clear "You're offline" state rather than confusing API errors. Potentially allow reading past conversations offline.

### 46. Multiple API key support
Some users have different OpenRouter accounts or want to use different keys for different purposes. Support 2-3 named API keys and let users switch.

### 47. Conversation backup / sync via iCloud
Optional (not default) iCloud sync for conversations across multiple Macs. Still local-first, but solves the "I use two machines" problem. Off by default, opt-in.

### 48. Rate limit handling
Gracefully handle OpenRouter rate limits with helpful messaging ("you're sending a lot! give it a moment") rather than raw error strings.

### 49. Model availability check
On startup, ping OpenRouter to verify which models are available and remove broken ones from the picker. Avoid confusing "model not found" errors.

### 50. Conversation length warning
When a conversation approaches the model's context window limit, warn the user and offer to start a fresh thread with a summary injected as context.

---

## 🚀 Distribution & growth

### 51. Brew cask distribution
`brew install --cask sage-thinking-buddy` — frictionless for developer audience, great for HN/Product Hunt launches. Needs notarized DMG (now done ✓).

### 52. GitHub Sponsors / pay-what-you-want
Not a paywall — sage stays free and open. But a GitHub Sponsors page for people who want to support it. Many local-first dev tools monetize this way (Obsidian's early model, various Alfred plugins).

### 53. Referral invite code
Users get a referral link. When someone installs via the link, both get... nothing monetarily, but maybe a special custom mode or accent color unlock. Drives word-of-mouth without a backend.

### 54. Windows / Linux builds
Tauri is cross-platform. The core app is already portable. Would dramatically increase reach. Needs:
- Windows: tray icon + window positioning via WinAPI
- Linux: X11/Wayland tray support
- Minor platform-specific CSS adjustments

### 55. Public roadmap / changelog
A simple in-app "What's new" panel when there's an update. Keep users feeling the momentum. And a public GitHub roadmap (Projects board) so the community can vote on features.

---

## 💡 Wild / moonshot ideas

### 56. Meeting prep mode
Paste a calendar event + attendee names → sage helps you prepare talking points, anticipate objections, and clarify your own goals before walking in.

### 57. Email / message drafting
Paste an email you need to respond to → sage helps you think through the right response, then drafts it in your voice. Knows your communication style from your user profile.

### 58. Thinking together (multiplayer)
Share a thinking session URL. Two people, same conversation, both can type. A shared scratchpad for co-thinking. Requires a lightweight relay server (would break local-first, but opt-in).

### 59. Daily question / streak
Every morning, sage asks one thought-provoking question based on your ongoing threads. Answer it in 60 seconds. Builds a thinking habit. Streaks visible in the tray icon.

### 60. API / plugin system
Let other apps send queries to sage via a local HTTP endpoint. Your own scripts, Alfred, Raycast, Obsidian plugins — all can invoke sage as a thinking engine. Becomes infrastructure, not just an app.

---

## Priority matrix

| | Low Effort | High Effort |
|---|---|---|
| **High Impact** | Global hotkey (#1), Selected text (#2), More modes (#3), Custom modes (#4), Voice input (#17), Action item extraction (#27) | Project memory (#12), Conversation branching (#15), Multi-model comparison (#32), iCloud sync (#47) |
| **Medium Impact** | Resizable window (#6), Full-text search (#7), Pin conversations (#8), Regenerate (#39), Compact mode (#40) | App context awareness (#23), Weekly digest (#30), Insight clustering (#31) |
| **Lower Impact** | Font size (#41), Word count (#9), Undo send (#10) | Multiplayer (#58), Plugin API (#60) |

---

## What to build next (recommended order)

1. **Global hotkey** — immediate daily usage unlock
2. **User profile / persistent context** — makes every conversation better
3. **Selected text as context** — zero-friction capture
4. **More modes** (rubber duck, pre-mortem, Socratic) — deepens the thinking toolkit
5. **Custom modes** — retains power users
6. **Action item extraction** — makes conversations actionable
7. **Resizable window** — polish
8. **Full-text conversation search** — essential as history grows
9. **Voice input** — changes the interaction paradigm
10. **Project memory** — transforms sage from a tool into a partner

---

*This list is alive. Add to it, cross things off, argue with it.*

---

## 🔁 Iteration 2 — deeper cuts

### 61. Onboarding flow
Currently a blank slate on first launch — confusing for non-technical users. A 3-step onboarding:
1. Paste your OpenRouter key (with a link to get one, estimated cost: "~$1 for 1000 messages")
2. Pick a default model
3. Tell sage two sentences about yourself (seeds the user profile)
Done. Under 60 seconds.

### 62. Smart conversation title generation
Current titles are just the first 50 characters of the user's first message. Instead, after the first AI response, silently generate a 5-word descriptive title. "Should I quit?" → "Weighing the job exit decision." Makes history far more navigable.

### 63. Token / cost estimator
A subtle indicator showing estimated cost of the current conversation (based on model pricing from OpenRouter). Most users have no idea what they're spending. Demystifies the BYOK model and builds trust.
- Show as: `~$0.003` next to the model selector
- OpenRouter publishes pricing per model in their API

### 64. Conversation templates
Pre-built conversation starters with structure — not just a single prompt but a guided flow:
- **Weekly review** — "What did I ship this week? What got in my way? What matters next?"
- **Decision framework** — "What am I deciding? What are my options? What am I afraid of?"
- **1:1 prep** — "Who is this with? What do I want from this conversation? What do they need from me?"
These aren't modes — they're structured multi-turn scaffolds. User picks one from a menu and sage guides the conversation.

### 65. System prompt transparency
A small "view prompt" link in settings that shows the exact system prompt being sent (including the active mode modifier). Builds trust with power users who want to know exactly what sage is saying to the model.

### 66. Hotkey to copy last response
`Cmd+Shift+C` copies just the most recent assistant message. Faster than highlighting and copying manually — useful when you want to paste the answer somewhere else.

### 67. Drag-to-reorder conversation history
Allow drag-and-drop reordering of threads in the history drawer. Lets users curate their active threads to the top without pinning.

### 68. Character / persona mode
Beyond thinking frameworks — let users invoke a persona: "respond as a skeptical VC," "respond as my future self 10 years from now," "respond as a therapist." Separate from modes, combinable with them.

### 69. Thinking time investment display
Show the total time spent thinking in sage: "You've had 47 conversations totaling about 3 hours of thinking time." A subtle signal that builds identity around the practice of deliberate thinking.

### 70. Export to Obsidian / Notion / Readwise
One-click export that formats the conversation for specific destinations:
- **Obsidian**: Markdown with front matter (`date`, `tags`, `mode`)
- **Notion**: Formatted blocks via Notion API
- **Readwise**: Highlights extracted, formatted as Reader import

### 71. "What should I think about?" prompt
An empty-state button below the topic wall: "Not sure what to explore? Let sage suggest." sage looks at recent conversation themes and suggests 3 specific questions worth exploring now. Proactive rather than reactive.

### 72. Response annotation / highlighting
Let users highlight any part of an AI response and tag it: ⭐ important, ❓ questionable, ✓ agreed. Annotations persist with the conversation. Makes reviewing old threads faster.

### 73. Keyboard-only mode
Full keyboard navigation: Tab between header/input/history, j/k to scroll messages, r to reply, n for new conversation. For users who never want to reach for the mouse.

### 74. Thinking "depth" indicator
A subtle progress-like signal that shows how deep the current conversation has gone — based on message count and topic transitions. "Surface → exploring → deep." Not gamification, just orientation.

### 75. Per-conversation model override
Currently the model is global. Let users set a different model per conversation — useful for having "my Gemini threads" and "my Claude threads" without constantly toggling.

---

## 🔬 Technical improvements (code quality & architecture)

### T1. Model list from OpenRouter API
Hardcoded `MODELS` array in app.js goes stale. Fetch the list dynamically from `openrouter.ai/api/v1/models`, filter to capable text models, cache for 24h. Users always see current models.

### T2. Conversation export format versioning
The JSON store has no schema version. If the data model changes (e.g. adding memory/annotations), there's no migration path. Add a `store_version: 1` field now, before it matters.

### T3. Input sanitization on export
The `exportConversation()` markdown export uses raw message content. If a message contains markdown that breaks the export structure, it can produce malformed output. Escape or fence appropriately.

### T4. Test coverage for app.js
`search.js` has solid tests. `app.js` has none. At minimum, test:
- `buildSystemPrompt()` with and without mode
- `getConversationTitle()` edge cases
- `saveCurrentConversation()` deduplication logic

### T5. Error boundary for streaming failures
If a stream fails mid-response (network drop, API timeout), the partial response gets committed to `messages[]` with no indication it's incomplete. Add a `[response truncated]` marker and a retry button.

### T6. Debounce `saveCurrentConversation()`
Currently saves on every assistant response. For rapid back-and-forth, this hammers disk I/O unnecessarily. Debounce to 500ms after the last change.

### T7. Remove CDN dependency for streaming-markdown
`smd.min.js` is loaded from `cdn.jsdelivr.net` on every launch. This breaks offline use and is a supply-chain dependency. Bundle it locally in `frontend/vendor/`.

### T8. Memory leak in MutationObserver
In `sendMessage()`, a `MutationObserver` is created for each message but `observer.disconnect()` only runs in the `finally` block. If the component is cleaned up mid-stream (e.g. new conversation started), the observer leaks. Guard against this.

---

## 💭 System prompt experiments worth trying

The system prompt is the soul of sage. These variants are worth A/B testing:

### SP1. More confrontational default
Current prompt is collegial. Try: *"Your job is not to comfort — it's to find what's wrong with the thinking. If the reasoning is sound, say so briefly. If it's not, say exactly why, specifically."* May produce more valuable pushback.

### SP2. Shorter responses by default
Add to system prompt: *"Default to responses under 150 words. Go longer only if the question genuinely requires it and the user has written more than 100 words themselves."* Matches the conversational feel better.

### SP3. Explicit anti-sycophancy instruction
*"Never start a response with agreement or validation. Never say 'great question,' 'absolutely,' or 'of course.' If the user is right, say why. If they're wrong, say why."* Research shows this meaningfully changes model behavior.

### SP4. Memory-aware prompt prefix
When user profile exists, prepend: *"Here is what you know about this person: [profile]. Use this context naturally — don't reference it explicitly unless it's directly relevant."*
