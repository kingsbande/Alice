const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { spawn } = require("node:child_process");

const ROOT = __dirname;
const EXPLORER_EXE = path.join(process.env.SystemRoot || "C:\\Windows", "explorer.exe");
const TOKEN_FILE = path.join(ROOT, "token.txt");
const ACTIONS_FILE = path.join(ROOT, "actions.json");
const CONFIG_FILE = path.join(ROOT, "config.json");
const AUDIT_FILE = path.join(ROOT, "audit.log");
const PORT = Number.parseInt(process.env.ALICE_AGENT_PORT || "8765", 10);
const MAX_BODY_BYTES = 1024;
const RATE_WINDOW_MS = 60 * 1000;
const ACTIONS_PER_WINDOW = 10;
const TARGET_KEY_PATTERN = /^[a-z0-9 _-]{1,30}$/i;
const ACTIONS = [
  "open_app",
  "open_folder",
  "open_site",
  "close_app",
  "volume_up",
  "volume_down",
  "mute",
  "media_play_pause",
  "media_next",
  "media_previous",
  "brightness_up",
  "brightness_down",
  "microphone_mute",
  "lock_screen",
  "shutdown",
  "restart",
];
const TARGET_ACTIONS = {
  open_app: "apps",
  open_folder: "folders",
  open_site: "sites",
  close_app: "apps",
};
const MEDIA_SCRIPTS = {
  volume_up: "$ErrorActionPreference = 'Stop'; Add-Type 'using System; using System.Runtime.InteropServices; public class AliceKeys { [DllImport(\"user32.dll\")] public static extern void keybd_event(byte key, byte scan, int flags, UIntPtr extra); }'; [AliceKeys]::keybd_event(0xAF, 0, 0, [UIntPtr]::Zero); [AliceKeys]::keybd_event(0xAF, 0, 2, [UIntPtr]::Zero)",
  volume_down: "$ErrorActionPreference = 'Stop'; Add-Type 'using System; using System.Runtime.InteropServices; public class AliceKeys { [DllImport(\"user32.dll\")] public static extern void keybd_event(byte key, byte scan, int flags, UIntPtr extra); }'; [AliceKeys]::keybd_event(0xAE, 0, 0, [UIntPtr]::Zero); [AliceKeys]::keybd_event(0xAE, 0, 2, [UIntPtr]::Zero)",
  mute: "$ErrorActionPreference = 'Stop'; Add-Type 'using System; using System.Runtime.InteropServices; public class AliceKeys { [DllImport(\"user32.dll\")] public static extern void keybd_event(byte key, byte scan, int flags, UIntPtr extra); }'; [AliceKeys]::keybd_event(0xAD, 0, 0, [UIntPtr]::Zero); [AliceKeys]::keybd_event(0xAD, 0, 2, [UIntPtr]::Zero)",
  media_play_pause: "$ErrorActionPreference = 'Stop'; Add-Type 'using System; using System.Runtime.InteropServices; public class AliceKeys { [DllImport(\"user32.dll\")] public static extern void keybd_event(byte key, byte scan, int flags, UIntPtr extra); }'; [AliceKeys]::keybd_event(0xB3, 0, 0, [UIntPtr]::Zero); [AliceKeys]::keybd_event(0xB3, 0, 2, [UIntPtr]::Zero)",
  media_next: "$ErrorActionPreference = 'Stop'; Add-Type 'using System; using System.Runtime.InteropServices; public class AliceKeys { [DllImport(\"user32.dll\")] public static extern void keybd_event(byte key, byte scan, int flags, UIntPtr extra); }'; [AliceKeys]::keybd_event(0xB0, 0, 0, [UIntPtr]::Zero); [AliceKeys]::keybd_event(0xB0, 0, 2, [UIntPtr]::Zero)",
  media_previous: "$ErrorActionPreference = 'Stop'; Add-Type 'using System; using System.Runtime.InteropServices; public class AliceKeys { [DllImport(\"user32.dll\")] public static extern void keybd_event(byte key, byte scan, int flags, UIntPtr extra); }'; [AliceKeys]::keybd_event(0xB1, 0, 0, [UIntPtr]::Zero); [AliceKeys]::keybd_event(0xB1, 0, 2, [UIntPtr]::Zero)",
  brightness_up: "$ErrorActionPreference = 'Stop'; $monitor = Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness | Select-Object -First 1; if ($null -eq $monitor) { throw 'No brightness control is available.' }; $level = [Math]::Min(100, [int]$monitor.CurrentBrightness + 10); $result = Invoke-CimMethod -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods -MethodName WmiSetBrightness -Arguments @{ Timeout = 1; Brightness = $level }; if ($result.ReturnValue -ne 0) { throw 'Brightness adjustment failed.' }",
  brightness_down: "$ErrorActionPreference = 'Stop'; $monitor = Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness | Select-Object -First 1; if ($null -eq $monitor) { throw 'No brightness control is available.' }; $level = [Math]::Max(0, [int]$monitor.CurrentBrightness - 10); $result = Invoke-CimMethod -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods -MethodName WmiSetBrightness -Arguments @{ Timeout = 1; Brightness = $level }; if ($result.ReturnValue -ne 0) { throw 'Brightness adjustment failed.' }",
  microphone_mute: `$ErrorActionPreference = 'Stop'; Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class AliceMicrophone {
  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E"), ClassInterface(ClassInterfaceType.None)]
  private class DeviceEnumerator {}
  [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  private interface IDeviceEnumerator {
    [PreserveSig] int EnumAudioEndpoints(int flow, uint mask, out IntPtr devices);
    [PreserveSig] int GetDefaultAudioEndpoint(int flow, int role, out IDevice device);
    [PreserveSig] int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string id, out IDevice device);
    [PreserveSig] int RegisterEndpointNotificationCallback(IntPtr callback);
    [PreserveSig] int UnregisterEndpointNotificationCallback(IntPtr callback);
  }
  [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  private interface IDevice {
    [PreserveSig] int Activate(ref Guid iid, uint context, IntPtr parameters, [MarshalAs(UnmanagedType.IUnknown)] out object instance);
    [PreserveSig] int OpenPropertyStore(int access, out IntPtr properties);
    [PreserveSig] int GetId(out IntPtr id);
    [PreserveSig] int GetState(out uint state);
  }
  [ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  private interface IEndpointVolume {
    [PreserveSig] int RegisterControlChangeNotify(IntPtr notify);
    [PreserveSig] int UnregisterControlChangeNotify(IntPtr notify);
    [PreserveSig] int GetChannelCount(out uint count);
    [PreserveSig] int SetMasterVolumeLevel(float level, ref Guid context);
    [PreserveSig] int SetMasterVolumeLevelScalar(float level, ref Guid context);
    [PreserveSig] int GetMasterVolumeLevel(out float level);
    [PreserveSig] int GetMasterVolumeLevelScalar(out float level);
    [PreserveSig] int SetChannelVolumeLevel(uint channel, float level, ref Guid context);
    [PreserveSig] int SetChannelVolumeLevelScalar(uint channel, float level, ref Guid context);
    [PreserveSig] int GetChannelVolumeLevel(uint channel, out float level);
    [PreserveSig] int GetChannelVolumeLevelScalar(uint channel, out float level);
    [PreserveSig] int SetMute([MarshalAs(UnmanagedType.Bool)] bool muted, ref Guid context);
    [PreserveSig] int GetMute([MarshalAs(UnmanagedType.Bool)] out bool muted);
  }
  public static void ToggleDefaultCaptureMute() {
    IDeviceEnumerator enumerator = null;
    object endpoint = null;
    IDevice device = null;
    try {
      enumerator = (IDeviceEnumerator)new DeviceEnumerator();
      Marshal.ThrowExceptionForHR(enumerator.GetDefaultAudioEndpoint(1, 0, out device));
      var iid = typeof(IEndpointVolume).GUID;
      Marshal.ThrowExceptionForHR(device.Activate(ref iid, 23, IntPtr.Zero, out endpoint));
      var volume = (IEndpointVolume)endpoint;
      bool muted;
      Marshal.ThrowExceptionForHR(volume.GetMute(out muted));
      var context = Guid.Empty;
      Marshal.ThrowExceptionForHR(volume.SetMute(!muted, ref context));
    } finally {
      if (enumerator != null) Marshal.ReleaseComObject(enumerator);
      if (endpoint != null && Marshal.IsComObject(endpoint)) Marshal.ReleaseComObject(endpoint);
      if (device != null) Marshal.ReleaseComObject(device);
    }
  }
}
'@; [AliceMicrophone]::ToggleDefaultCaptureMute()`,
};

function loadJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function ensureToken() {
  try {
    const saved = fs.readFileSync(TOKEN_FILE, "utf8").trim();
    if (!/^[a-f0-9]{64}$/i.test(saved)) throw new Error("pc-agent/token.txt must contain a 32-byte hexadecimal token.");
    return saved;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  const token = crypto.randomBytes(32).toString("hex");
  try {
    fs.writeFileSync(TOKEN_FILE, token, { flag: "wx", mode: 0o600 });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    return ensureToken();
  }
  if (process.platform !== "win32") fs.chmodSync(TOKEN_FILE, 0o600);
  console.log("Alice PC helper pairing token (paste into Alice Settings):");
  console.log(token);
  console.log(`The token is also saved in ${TOKEN_FILE}.`);
  return token;
}

const token = ensureToken();
const config = loadJson(CONFIG_FILE);
const actions = loadJson(ACTIONS_FILE);
const allowedOrigin = typeof config.allowedOrigin === "string" ? config.allowedOrigin : "";
const rateHistory = [];

function isAllowedOrigin(origin) {
  return origin === "http://localhost:3000" || (Boolean(allowedOrigin) && origin === allowedOrigin);
}

function setCorsHeaders(req, res) {
  const origin = req.headers.origin;
  res.setHeader("Vary", "Origin");
  if (typeof origin === "string" && isAllowedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
}

function sendJson(res, status, value) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(value));
}

function authorized(req) {
  const header = req.headers.authorization;
  const match = typeof header === "string" && /^Bearer ([a-f0-9]{64})$/i.exec(header);
  if (!match) return false;
  const expected = Buffer.from(token, "hex");
  const provided = Buffer.from(match[1], "hex");
  return expected.length === provided.length && crypto.timingSafeEqual(expected, provided);
}

function targetKeys(group) {
  const value = actions[group];
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.keys(value).filter((key) => TARGET_KEY_PATTERN.test(key));
}

function enabledControls() {
  return Array.isArray(actions.controls)
    ? [...new Set(actions.controls.filter((action) => ACTIONS.includes(action) && !TARGET_ACTIONS[action]))]
    : [];
}

function getCapabilities() {
  return {
    apps: targetKeys("apps"),
    folders: targetKeys("folders"),
    sites: targetKeys("sites"),
    controls: enabledControls(),
  };
}

function logAudit(action, target, result) {
  const entry = {
    timestamp: new Date().toISOString(),
    action: ACTIONS.includes(action) ? action : "unknown",
    target: typeof target === "string" && TARGET_KEY_PATTERN.test(target) ? target : "",
    result,
  };
  fs.appendFileSync(AUDIT_FILE, `${JSON.stringify(entry)}\n`, { encoding: "utf8", mode: 0o600 });
}

function sendRunResult(res, action, target, result, status, body) {
  try {
    logAudit(action, target, result);
  } catch {
    const message = result === "ok"
      ? "The action may have run, but the audit log could not be written."
      : "The action was not run because the audit log could not be written.";
    return sendJson(res, 500, { ok: false, message });
  }
  return sendJson(res, status, body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let exceeded = false;
    req.on("data", (chunk) => {
      if (exceeded) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        exceeded = true;
        reject(Object.assign(new Error("Request body is too large."), { status: 413 }));
        req.resume();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!exceeded) resolve(Buffer.concat(chunks).toString("utf8"));
    });
    req.on("error", reject);
  });
}

function spawnDetached(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { detached: true, stdio: "ignore", windowsHide: true });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

function spawnAndWait(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "ignore", windowsHide: true });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error("The requested action failed."));
    });
  });
}

function configuredAppPath(target) {
  const configured = actions.apps && actions.apps[target];
  if (typeof configured !== "string") return null;
  const allowedVariables = {
    LOCALAPPDATA: process.env.LOCALAPPDATA,
    ProgramFiles: process.env.ProgramFiles,
    "ProgramFiles(x86)": process.env["ProgramFiles(x86)"],
    USERPROFILE: process.env.USERPROFILE,
  };
  const expanded = configured.replace(/%([^%]+)%/g, (placeholder, name) => {
    const value = allowedVariables[name];
    if (!value) throw new Error("An app path variable is not available.");
    return value;
  });
  if (/%[^%]+%/.test(expanded) || !path.isAbsolute(expanded)) return null;
  return expanded;
}

async function execute(action, target) {
  if (action === "open_app") {
    const exe = configuredAppPath(target);
    if (!exe) throw new Error("That app is not configured.");
    await spawnDetached(exe, []);
    return;
  }
  if (action === "open_folder") {
    const folder = actions.folders && actions.folders[target];
    if (typeof folder !== "string" || !path.isAbsolute(folder) || !fs.existsSync(folder)) {
      throw new Error("That folder is not configured or no longer exists.");
    }
    await spawnDetached(EXPLORER_EXE, [folder]);
    return;
  }
  if (action === "close_app") {
    const exe = configuredAppPath(target);
    if (!exe) throw new Error("That app is not configured.");
    await spawnAndWait("taskkill.exe", ["/IM", path.win32.basename(exe), "/T"]);
    return;
  }
  if (action === "open_site") {
    const site = actions.sites && actions.sites[target];
    if (typeof site !== "string") throw new Error("That site is not configured.");
    const url = new URL(site);
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("That site is not configured.");
    await spawnDetached("rundll32.exe", ["url.dll,FileProtocolHandler", url.href]);
    return;
  }
  if (action === "lock_screen") {
    await spawnDetached("rundll32.exe", ["user32.dll,LockWorkStation"]);
    return;
  }
  if (action === "shutdown" || action === "restart") {
    await spawnDetached("shutdown.exe", action === "shutdown" ? ["/s", "/t", "0"] : ["/r", "/t", "0"]);
    return;
  }
  if (MEDIA_SCRIPTS[action]) {
    await spawnAndWait("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-WindowStyle",
      "Hidden",
      "-Command",
      MEDIA_SCRIPTS[action],
    ]);
    return;
  }
  throw new Error("That action is not supported.");
}

function withinRateLimit() {
  const now = Date.now();
  while (rateHistory.length && rateHistory[0] <= now - RATE_WINDOW_MS) rateHistory.shift();
  if (rateHistory.length >= ACTIONS_PER_WINDOW) return false;
  rateHistory.push(now);
  return true;
}

async function handleRun(req, res) {
  let input;
  try {
    input = JSON.parse(await readBody(req));
  } catch (error) {
    const status = error.status || 400;
    return sendJson(res, status, { ok: false, message: status === 413 ? "Request body is too large." : "Send a valid JSON action." });
  }

  const action = typeof input?.action === "string" ? input.action : "";
  const requestedTarget = typeof input?.target === "string" ? input.target : "";
  const target = TARGET_KEY_PATTERN.test(requestedTarget) ? requestedTarget : "";
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      Object.keys(input).some((key) => key !== "action" && key !== "target")) {
    return sendRunResult(res, action, target, "rejected", 400, { ok: false, message: "Send only an action and target." });
  }
  if (!ACTIONS.includes(action)) {
    return sendRunResult(res, action, target, "rejected", 400, { ok: false, message: "That action is not supported." });
  }

  if (!withinRateLimit()) {
    return sendRunResult(res, action, target, "rate_limited", 429, { ok: false, message: "The PC helper action limit was reached. Try again in a minute." });
  }

  if (TARGET_ACTIONS[action]) {
    const group = TARGET_ACTIONS[action];
    if (!target || !Object.prototype.hasOwnProperty.call(actions[group] || {}, target)) {
      return sendRunResult(res, action, target, "rejected", 400, { ok: false, message: "That target is not configured." });
    }
  } else if (!enabledControls().includes(action) || (input?.target != null && input.target !== "")) {
    return sendRunResult(res, action, target, "rejected", 400, { ok: false, message: "That action is not enabled." });
  }

  try {
    await execute(action, target);
  } catch (error) {
    const message = error.message === "That folder is not configured or no longer exists."
      ? error.message
      : "The PC action could not be completed.";
    return sendRunResult(res, action, target, "failed", 500, { ok: false, message });
  }

  return sendRunResult(res, action, target, "ok", 200, { ok: true, message: "Done." });
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    const origin = req.headers.origin;
    if (typeof origin !== "string" || !isAllowedOrigin(origin)) {
      return sendJson(res, 403, { ok: false, message: "Origin is not allowed." });
    }
    setCorsHeaders(req, res);
    res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Private-Network", "true");
    res.setHeader("Access-Control-Max-Age", "600");
    res.writeHead(204);
    return res.end();
  }

  if (!authorized(req)) return sendJson(res, 401, { error: "Unauthorized." });

  const origin = req.headers.origin;
  if (typeof origin === "string" && !isAllowedOrigin(origin)) {
    return sendJson(res, 403, { error: "Origin is not allowed." });
  }
  setCorsHeaders(req, res);

  const pathname = new URL(req.url, "http://127.0.0.1").pathname;
  if (req.method === "GET" && pathname === "/capabilities") {
    return sendJson(res, 200, getCapabilities());
  }
  if (req.method === "POST" && pathname === "/run") return handleRun(req, res);
  res.setHeader("Allow", "GET, POST, OPTIONS");
  return sendJson(res, 404, { error: "Not found." });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Alice PC helper listening on http://127.0.0.1:${PORT}`);
});
