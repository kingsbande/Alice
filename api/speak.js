const { checkAccess } = require("./_auth.js");

const TTS_TIMEOUT_MS = 8000;
const DEFAULT_DAILY_CHARACTER_LIMIT = 20000;
let dailyCharacterCount = 0;
let dailyCharacterDate = "";

function getDailyCharacterLimit() {
  const configured = Number(process.env.MAX_TTS_CHARS_PER_DAY);
  return Number.isSafeInteger(configured) && configured >= 0
    ? configured
    : DEFAULT_DAILY_CHARACTER_LIMIT;
}

function reserveCharacters(characterCount) {
  // Serverless instances do not share memory; use a durable counter for a hard cap.
  const today = new Date().toISOString().slice(0, 10);
  if (dailyCharacterDate !== today) {
    dailyCharacterDate = today;
    dailyCharacterCount = 0;
  }

  const limit = getDailyCharacterLimit();
  if (dailyCharacterCount + characterCount > limit) return false;
  dailyCharacterCount += characterCount;
  return true;
}

module.exports = async (req, res) => {
  const access = checkAccess(req);
  if (!access.ok) return res.status(401).json({ error: access.error });

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Use POST." });
  }

  const text = req.body?.text;
  if (typeof text !== "string" || !text.trim() || Array.from(text).length > 600) {
    return res.status(400).json({ error: "Text must be a non-empty string of at most 600 characters." });
  }
  if (!process.env.FISH_API_KEY) {
    return res.status(502).json({ error: "voice_unavailable" });
  }

  const characterCount = Array.from(text).length;
  if (!reserveCharacters(characterCount)) {
    return res.status(429).json({ error: "voice_limit" });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TTS_TIMEOUT_MS);
  try {
    const body = { text, format: "mp3" };
    if (process.env.FISH_VOICE_ID) body.reference_id = process.env.FISH_VOICE_ID;

    const response = await fetch("https://api.fish.audio/v1/tts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.FISH_API_KEY}`,
        "Content-Type": "application/json",
        model: process.env.FISH_MODEL || "s2.1-pro-free",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) return res.status(502).json({ error: "voice_unavailable" });

    const audio = Buffer.from(await response.arrayBuffer());
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(audio);
  } catch {
    return res.status(502).json({ error: "voice_unavailable" });
  } finally {
    clearTimeout(timeout);
  }
};
