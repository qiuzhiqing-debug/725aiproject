// QA 交互驱动器 — 基于 CDP,持久 Edge headless 实例,执行一个流程脚本
// 用法: node drive.mjs <flow.mjs> [w] [h] [mobile]
// flow 脚本导出 default async (ctx) => {...}, ctx = { goto, eval, click, type, shot, wait, logs }
import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const [flowPath, w = "390", h = "844", mobile = "1"] = process.argv.slice(2);
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const PORT = 9200 + Math.floor(Math.random() * 500);
const PROFILE = process.env.TEMP + "/cdp-drive-" + PORT;
const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

const child = spawn(EDGE, [
  "--headless", `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
  "--no-first-run", "--no-default-browser-check", "--mute-audio",
  "--disable-sync", "--disable-extensions", "--disable-component-extensions-with-background-pages",
  "--disable-features=msImplicitSignin,msSeamlessWebToBrowserSignIn,msSyncConsentExperience",
  "about:blank",
], { stdio: "ignore" });

setTimeout(() => { console.error("HARD TIMEOUT"); try { child.kill(); } catch {}; process.exit(2); }, 180000);

async function getTarget() {
  for (let i = 0; i < 25; i++) {
    await new Promise((r) => setTimeout(r, 600));
    try {
      const list = JSON.parse(await (await fetch(`http://127.0.0.1:${PORT}/json`)).text());
      const t = list.find((x) => x.type === "page");
      if (t) return t;
    } catch {}
  }
  throw new Error("CDP not reachable");
}

let idc = 0, sock = null;
const consoleLogs = [];

function rawRpc(method, params = {}, timeoutMs = 30000) {
  return new Promise((res, rej) => {
    const id = ++idc;
    const h = (ev) => {
      const d = JSON.parse(ev.data);
      if (d.id === id) {
        sock.removeEventListener("message", h);
        d.error ? rej(new Error(method + ": " + d.error.message)) : res(d.result);
      }
    };
    sock.addEventListener("message", h);
    sock.send(JSON.stringify({ id, method, params }));
    setTimeout(() => rej(new Error(method + ": rpc timeout")), timeoutMs);
  });
}

async function connect() {
  const t = await getTarget();
  sock = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r, j) => { sock.onopen = r; sock.onerror = () => j(new Error("ws connect failed")); });
  sock.addEventListener("message", (ev) => {
    try {
      const d = JSON.parse(ev.data);
      if (d.method === "Runtime.consoleAPICalled") {
        const args = (d.params.args || []).map((a) => a.value ?? a.description ?? "").join(" ");
        consoleLogs.push(`[${d.params.type}] ${args}`);
      }
      if (d.method === "Runtime.exceptionThrown") {
        consoleLogs.push(`[exception] ${d.params.exceptionDetails?.exception?.description || d.params.exceptionDetails?.text}`);
      }
    } catch {}
  });
  await rawRpc("Runtime.enable");
  await rawRpc("Page.enable");
  await rawRpc("Emulation.setDeviceMetricsOverride", {
    width: +w, height: +h, deviceScaleFactor: 2, mobile: true,
  });
  if (mobile === "1") await rawRpc("Emulation.setUserAgentOverride", { userAgent: IPHONE_UA });
}

async function rpc(method, params, timeoutMs) {
  try {
    return await rawRpc(method, params, timeoutMs);
  } catch (e) {
    // 连接可能被断开:重连一次
    try { sock.close(); } catch {}
    await connect();
    return await rawRpc(method, params, timeoutMs);
  }
}

const ctx = {
  logs: consoleLogs,
  goto: async (url) => { await rpc("Page.navigate", { url }); await ctx.wait(800); },
  wait: (ms) => new Promise((r) => setTimeout(r, ms)),
  eval: async (expr) => {
    const r = await rpc("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error("eval failed: " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  },
  click: async (sel) => ctx.eval(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return 'NOT FOUND';e.click();return 'ok'})()`),
  clickText: async (sel, text) => ctx.eval(`(()=>{const es=[...document.querySelectorAll(${JSON.stringify(sel)})];const e=es.find(x=>x.textContent.includes(${JSON.stringify(text)}));if(!e)return 'NOT FOUND';e.click();return 'ok'})()`),
  type: async (sel, text) => ctx.eval(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return 'NOT FOUND';e.focus();e.value=${JSON.stringify(text)};e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return 'ok'})()`),
  url: async () => ctx.eval("location.href"),
  shot: async (out) => {
    await ctx.wait(300);
    const s = await rpc("Page.captureScreenshot", { format: "jpeg", quality: 82 }, 45000);
    await writeFile(out, Buffer.from(s.data, "base64"));
    console.log("SHOT " + out);
  },
  log: (...a) => console.log("LOG", ...a),
};

try {
  await connect();
  const flow = (await import(pathToFileURL(flowPath).href)).default;
  await flow(ctx);
  if (consoleLogs.length) console.log("CONSOLE:\n" + consoleLogs.join("\n"));
} catch (e) {
  console.error("FLOW ERROR:", e.message);
  if (consoleLogs.length) console.log("CONSOLE:\n" + consoleLogs.join("\n"));
} finally {
  try { child.kill(); } catch {}
}
process.exit(0);
