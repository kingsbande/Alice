// Alice proxy: tries each configured free provider in order, falls back on error or rate limit.
// Keys live in environment variables, never in the browser.

const SYSTEM_PROMPT =
  "You are Alice, a friendly voice assistant. Your replies are spoken aloud, so answer in one to three short sentences of plain speech. " +
  "No markdown, lists, emojis, or URLs. Be warm and direct. If a question needs a long answer, give the key point and offer to continue. " +
  "Reply in the language the user writes in.";

// All three accept the OpenAI-style chat format, so one adapter covers them.
// Model names change often: override them with the env vars if one is retired.
const PROVIDERS = [
  {
    name: "groq",
    url: "https://api.groq.com/openai/v1/chat/completions",
    key: process.env.GROQ_API_KEY,
    model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
  },
  {
    name: "gemini",
    url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    key: process.env.GEMINI_API_KEY,
    model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
  },
  {
    name: "openrouter",
    url: "https://openrouter.ai/api/v1/chat/completions",
    key: process.env.OPENROUTER_API_KEY,
    model: process.env.OPENROUTER_MODEL || "meta-llama/llama-3.3-70b-instruct:free",
  },
];

const TIMEOUT_MS = 6000;
const MAX_TURNS = 10;
const MAX_CHARS = 2000;

async function callProvider(p, messages) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(p.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${p.key}` },
      body: JSON.stringify({ model: p.model, messages, max_tokens: 200, temperature: 0.7 }),
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`${p.name} returned ${r.status}`);
    const data = await r.json();
    const text = data?.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error(`${p.name} returned no text`);
    return text;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = async (req, res) => {
  const startedAt = Date.now();
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Use POST." });
  }

  const raw = Array.isArray(req.body?.messages) ? req.body.messages : [];
  const history = raw
    .filter((m) => (m?.role === "user" || m?.role === "assistant") && typeof m.content === "string")
    .slice(-MAX_TURNS)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));

  if (!history.length || history[history.length - 1].role !== "user") {
    return res.status(400).json({ error: "Send at least one user message." });
  }

  const messages = [{ role: "system", content: SYSTEM_PROMPT }, ...history];
  const active = PROVIDERS.filter((p) => p.key);

  if (!active.length) {
    return res.status(500).json({ error: "No API keys are set. Add at least one key in your environment variables." });
  }

  for (const p of active) {
    const providerStartedAt = Date.now();
    try {
      const reply = await callProvider(p, messages);
      return res.status(200).json({
        reply,
        provider: p.name,
        timing: {
          providerMs: Date.now() - providerStartedAt,
          serverMs: Date.now() - startedAt,
        },
      });
    } catch (err) {
      console.info(`[alice timing] provider=${p.name} providerMs=${Date.now() - providerStartedAt} result=error`);
      console.error(err.message); // visible in Vercel logs; try the next provider
    }
  }

  return res.status(503).json({ error: "Alice can’t reach any AI service right now. Try again in a minute." });
};
