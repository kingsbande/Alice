# Alice: free voice assistant

Browser voice (Web Speech API) + a serverless proxy that falls back across free LLM providers.

## Files
- `index.html`: the whole UI. Tap the orb to talk, or type.
- `api/chat.js`: Vercel serverless function. Tries Groq, then Gemini, then OpenRouter.

## Run it
1. Create free API keys with any of: Groq, Google AI Studio (Gemini), OpenRouter. One key is enough; more means more fallback.
2. Put the project in a Git repo and import it on Vercel (free Hobby plan), or run locally with `npx vercel dev`.
3. Add environment variables in Vercel (Project Settings, Environment Variables):
   - `GROQ_API_KEY`
   - `GEMINI_API_KEY`
   - `OPENROUTER_API_KEY`
   - `TAVILY_API_KEY` (optional; enables web search for time-sensitive questions)
4. Redeploy, then open the site in Chrome or Edge.

Web search runs only when a question appears time-sensitive, helping conserve Tavily's free quota. The `searched` field in the `/api/chat` response indicates whether results were used. Tavily's free allowance can change, so check your Tavily dashboard for current limits.

## Optional overrides
Model names change. If a provider starts failing, set `GROQ_MODEL`, `GEMINI_MODEL` or `OPENROUTER_MODEL` to a current free model.

## How to test
1. With `TAVILY_API_KEY` configured, ask a time-sensitive question such as "What is the latest news today?" Check the `/api/chat` response for `"searched": true`.
2. Ask a timeless question such as "Why is the sky blue?" Check the response for `"searched": false`.
3. Remove or comment out `TAVILY_API_KEY`, restart the local server, and ask a question. Alice should still reply, with `"searched": false`.

## Notes
- Voice input needs Chrome or Edge and an internet connection. It sends audio to the browser vendor.
- Microphone access needs HTTPS (Vercel provides it) or localhost.
- Anyone with your site URL can use your free quota. Before sharing widely, add rate limiting.
- Chichewa isn't supported by browser speech recognition. English only for now.
