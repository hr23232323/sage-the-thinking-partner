import json
import os

from openai import AsyncOpenAI

MODE_PROMPTS = {
    "steelman": "For this response, first identify and articulate the strongest possible version of the user's position — then engage with that, not a weaker version of it.",
    "devil's advocate": "For this response, argue against what the user is saying. Find the real flaws, challenge the assumptions, take a hard opposing stance. Don't hedge.",
    "first principles": "For this response, strip everything back to first principles. Refuse conventional framings. Challenge every assumption from the ground up.",
    "simplify": "For this response, explain as simply and concretely as possible. No jargon, no abstractions. Make it land for someone completely new to this.",
}

SYSTEM_PROMPT = """You are a thinking partner — like a sharp, well-read friend you can think out loud with.

Match the user's energy exactly. Short question = short answer. Casual = casual. Only go long when they do.

Never use bullet points, headers, or numbered lists unless the user explicitly asks for a breakdown. Write in plain prose, like you're texting a smart friend — not filing a report.

When you go deep: push back, surface real tensions, bring in sources that matter. But earn it — don't perform depth.

One follow-up question max, and only when it actually opens something up. Don't wrap up every response with a question."""

client = AsyncOpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=os.getenv("OPENROUTER_API_KEY"),
    default_headers={
        "HTTP-Referer": "https://thinking-buddy.local",
        "X-Title": "Thinking Buddy",
    },
)


async def stream_chat(messages: list, model: str, mode: str | None = None):
    system = SYSTEM_PROMPT
    if mode and mode in MODE_PROMPTS:
        system += f"\n\n{MODE_PROMPTS[mode]}"
    full_messages = [{"role": "system", "content": system}] + messages
    try:
        stream = await client.chat.completions.create(
            model=model,
            messages=full_messages,
            stream=True,
        )
        async for chunk in stream:
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta.content
            if delta:
                yield f"data: {json.dumps({'delta': delta})}\n\n"
        yield "data: [DONE]\n\n"
    except Exception as e:
        yield f"event: error\ndata: {json.dumps({'error': str(e)})}\n\n"
