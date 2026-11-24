# Alice PC helper (Windows)

The helper is a plain Node.js 18+ local server with no npm dependencies. It runs only on your PC; Vercel excludes the entire `pc-agent/` folder.

## Install and pair
1. Install Node.js 18 or newer if it is not already installed.
2. Edit `config.json` and set `allowedOrigin` to the exact origin of your Alice site, for example `https://alice.example.com` (no trailing slash). `http://localhost:3000` is also allowed for local development.
3. Review and edit `actions.json`. The sample Documents and Downloads entries use `C:\\Users\\Datty Mgayi`; replace this with your Windows account folder if it differs. VS Code and VLC paths use `%LOCALAPPDATA%` and `%ProgramFiles%`; edit them if those apps are installed elsewhere. Every app entry grants Alice permission to open or close that app after you confirm; each folder or site entry grants permission to open it. Remove anything you do not want available. Closing an app asks Windows to close it without force; an app may prompt you to save unsaved work.
4. In a terminal, open this folder and run:

   ```text
   node server.js
   ```

5. On first run, the helper prints a random pairing token and saves it in `token.txt`. Paste the token into **Settings → PC pairing token** in Alice, then turn on **PC control**. The token is stored in this browser's local storage and sent only to the loopback helper. Keep it private.
6. The helper prints its local URL. Leave its terminal open while using PC control.

The token file is created with restrictive permissions where the operating system supports them. It is ignored by Git. On later runs, read the token from `token.txt`; the helper does not print it again.

## Allowed actions and targets
Edit `actions.json` to configure the app executable paths, folder paths, website URLs, and enabled controls. Restart the helper after editing this file. Alice receives only the configured key names, never the configured paths or URLs. A request can name only a key from the matching group in this file. The helper does not provide arbitrary command execution, file access, typing, screenshots, or sleep actions.

The helper can also adjust brightness on Windows devices that expose the standard WMI brightness interface, toggle mute on the default microphone, and ask Windows to close a configured app. Brightness controls may not work with external monitors. Microphone mute affects the default capture device.

**Shutdown and restart are disruptive.** After the normal confirmation card, Alice requires another confirmation: say the exact phrase **“confirm shutdown”** or **“confirm restart”**, or press the clearly labelled final button. The final card warns that unsaved work may be lost. Cancel at either step to do nothing.

## Security behavior
- The HTTP listener binds only to `127.0.0.1`; it is not exposed on your network.
- Every request except the CORS `OPTIONS` preflight needs `Authorization: Bearer <token>`. Requests from other website origins are refused; the configured exact origin and `http://localhost:3000` are allowed.
- The helper accepts only the fixed supported action names and configured target keys. The AI can propose an action but cannot execute it; the browser requires your explicit button or spoken confirmation before sending `/run`.
- The token is never sent to Alice's cloud API. The cloud receives only the available target/control names.
- `/run` is limited to 10 actions per minute. `audit.log` records only the timestamp, action, target key, and result.

Chrome's Local Network Access permission is rolling out from Chrome 142. A deployed HTTPS Alice site may prompt for permission to connect to the local helper; allow local network access for the site if you want PC control. This is separate from the helper's origin and token checks. See [Chrome's Local Network Access update](https://developer.chrome.com/blog/local-network-access).

## Stop or start automatically
Stop the helper with **Ctrl+C** in its terminal. To run it when you sign in, use Windows Task Scheduler: create a task triggered **At log on**, set its program to your `node.exe`, set the argument to the full path of `pc-agent\server.js`, and set **Start in** to the `pc-agent` folder. Keep `token.txt` and `actions.json` in place.
