# Alice: free voice assistant

Browser voice (Web Speech API) + a serverless proxy that falls back across free LLM providers.

## Files
- `index.html`: the whole UI. Tap the orb to talk, or type.
- `api/chat.js`: Vercel serverless function. Tries Gemini, then Groq, then OpenRouter.
- `api/speak.js`: protected Fish Audio text-to-speech proxy with built-in voice fallback in the browser.
- `api/send-email.js`: sends a confirmed draft to a contact using Gmail SMTP.

## Run it
1. Create free API keys with any of: Groq, Google AI Studio (Gemini), OpenRouter. One key is enough; more means more fallback.
2. Put the project in a Git repo and import it on Vercel (free Hobby plan), or run locally with `npx vercel dev`.
3. Add environment variables in Vercel (Project Settings, Environment Variables):
   - `ALICE_ACCESS_CODE` (required; the code Alice asks you to enter)
   - `GROQ_API_KEY`
   - `GEMINI_API_KEY`
   - `OPENROUTER_API_KEY`
   - `TAVILY_API_KEY` (optional; enables web search for time-sensitive questions)
   - `CONTACTS_JSON` (contact names mapped to email addresses, for example `{"mr banda":"banda@example.com"}`)
   - `SMTP_USER` (the Gmail address that sends the email)
   - `SMTP_APP_PASSWORD` (a Google app password, not your Google account password)
   - `MAX_EMAILS_PER_DAY` (optional; defaults to `10`)
   - `FISH_API_KEY` (optional; enables Fish Audio speech through the server proxy)
   - `FISH_MODEL` (optional; defaults to `s2.1-pro-free`)
   - `FISH_VOICE_ID` (optional; Fish Audio voice model/reference id)
   - `MAX_TTS_CHARS_PER_DAY` (optional; defaults to `20000` characters per serverless instance)
4. Redeploy, then open the site in Chrome or Edge.

Set `CONTACTS_JSON` in Vercel's environment-variable settings, not in Git. For local `vercel dev`, keep it and the other secrets in your ignored `.env` file and never commit that file. Alice sends only to names in this contact map; it cannot read email. The model sees contact names, not the mapped email addresses.

To use Gmail SMTP, create a Google app password. Google requires 2-Step Verification to be enabled, and the option may be unavailable for some account types or security configurations. Follow Google's [current app-password instructions](https://support.google.com/accounts/answer/185833?hl=en). You can revoke the app password at any time from your Google Account's App Passwords page. Keep in mind that Google's guidance may change.

The daily email cap is best-effort: Vercel serverless instances do not share the in-memory counter. Use a durable shared database counter if you need a hard cap.

Web search runs only when a question appears time-sensitive, helping conserve Tavily's free quota. The `searched` field in the `/api/chat` response indicates whether results were used. Tavily's free allowance can change, so check your Tavily dashboard for current limits.

Weather questions use live observations and a three-day forecast from Open-Meteo instead of web-search snippets. Alice asks for a city or town and country when the request doesn't include a location. No Open-Meteo API key is required.

## Personality and settings
Alice uses a calm, capable, quietly witty butler-like style: concise spoken replies, honest uncertainty, and rare dry humor. Open **Settings** to choose what she calls you, and choose **Auto (Fish Audio, then built-in)** or **Built-in only** for speech. These preferences are stored in this browser's local storage. The browser voice picker selects the voice used by the built-in engine and for Fish Audio fallback.

For a Fish Audio voice, choose one from the [Fish Audio voice library](https://fish.audio/) and copy its model id into `FISH_VOICE_ID`. Only clone or use a voice you have permission to use. Fish Audio's free API access or free plan terms may change or be time-limited, and use may be limited to personal purposes; check Fish Audio's current pricing and terms before deploying. Alice automatically uses the built-in browser voice when Fish Audio is unavailable or the free access ends. The TTS character cap is best-effort because serverless instances do not share memory; use a durable shared counter if you need a hard cap.

## Listening modes
Alice starts in **Tap** mode on every page load. **Conversation** mode listens after each reply, without listening while Alice speaks. It retries silence up to three times, then pauses; say "goodbye", "that's all", or "stop listening", press Escape, or tap the orb while listening to leave the mode.

**Standby** listens for the wake word "Alice" and ignores other speech. It keeps the microphone open, and your browser may send audio to its speech service while it runs. Turn it off when you don't need it. Standby works only while the tab is open, and continuous listening can be unreliable in mobile browsers.

## Optional overrides
Model names change. If a provider starts failing, set `GROQ_MODEL`, `GEMINI_MODEL` or `OPENROUTER_MODEL` to a current free model.

## How to test
### Chat
1. With `TAVILY_API_KEY` configured, ask a time-sensitive question such as "What is the latest news today?" Check the `/api/chat` response for `"searched": true`.
2. Ask a timeless question such as "Why is the sky blue?" Check the response for `"searched": false`.
3. Remove or comment out `TAVILY_API_KEY`, restart the local server, and ask a question. Alice should still reply, with `"searched": false`.

### Personality and hands-free modes
1. Ask for a greeting and a simple answer; check that replies are brief, calm, courteous, and not flattering.
2. Change **What should Alice call you?** in Settings, ask a question, then clear the field and verify she stops using the name.
3. Select **Conversation** and check that Alice listens, replies, then listens again.
4. Say "that's all" and verify conversation mode ends.
5. Press Escape while Alice is speaking and verify speech stops immediately.
6. Enable **Standby**; verify speech without "Alice" is ignored, then say "Alice, what's the date?" and check that Alice answers.
7. Create an email draft in conversation mode and verify it can still be confirmed or cancelled by voice.
8. With a valid `FISH_API_KEY` and Auto selected, ask Alice a question and verify the reply is spoken with Fish Audio.
9. Set a wrong `FISH_API_KEY`; verify the reply falls back to the built-in voice instead of going silent.
10. Tap the orb during speech and verify playback stops immediately.
11. Use Conversation mode and verify listening resumes after the spoken reply.
12. Select **Built-in only**, send a message, and verify that no request is made to `/api/speak`.
13. Set `MAX_TTS_CHARS_PER_DAY` to a small value, exceed it, and verify the daily character-limit notice appears while Alice continues speaking with the built-in voice.

### Email
1. Draft an email, then say or type "cancel"; verify nothing is sent.
2. Draft an email, revise it by voice, then explicitly send it to a test contact in `CONTACTS_JSON`.
3. Try an unknown contact; Alice should refuse to send.
4. Try a wrong or missing access code; the API should refuse the request.
5. Set `MAX_EMAILS_PER_DAY` to `1`, send one test message, then try another; the second send should show the daily-cap message.

## Notes
- Voice input needs Chrome or Edge and an internet connection. It sends audio to the browser vendor.
- Microphone access needs HTTPS (Vercel provides it) or localhost.
- Anyone with your site URL can use your free quota. Before sharing widely, add rate limiting.
- Chichewa isn't supported by browser speech recognition. English only for now.
