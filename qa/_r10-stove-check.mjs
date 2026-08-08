// 收尾自验：三档火按钮 / CHUG 真进度 / 马丁命名（不截图，只做 DOM 断言）
import { chromium } from "playwright";
const BASE = process.env.BASE || "http://127.0.0.1:8799";
const b = await chromium.launch({ args: ["--no-proxy-server"] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
let bad = 0;
const check = (ok, msg) => { if (!ok) bad++; console.log(`${ok ? "✓" : "✗"} ${msg}`); };
// 1) 大厅：灶台三档火
let page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(String(e)));
await page.goto(`${BASE}/?preview=lobbyReady`, { waitUntil: "domcontentloaded" });
await page.waitForSelector("#deckFire button", { timeout: 8000 }).catch(() => {});
await page.waitForTimeout(600);
const fire = await page.evaluate(() => ({
  select: !!document.querySelector("#deckSel"),
  btns: [...document.querySelectorAll("#deckFire button")].map((e) => ({
    deck: e.dataset.deck, sel: e.classList.contains("sel"), text: e.textContent.trim(),
  })),
  sw: document.documentElement.scrollWidth,
}));
check(!fire.select, "旧 <select id=deckSel> 已移除");
check(fire.btns.length === 3, `三档火按钮 = ${fire.btns.length} 个：${fire.btns.map((x) => x.deck + "/" + x.text).join(" | ")}`);
check(fire.btns.filter((x) => x.sel).length === 1, "有且只有一个 .sel 选中态");
check(fire.sw === 390, `390 零横向溢出 sw=${fire.sw}`);
check(errs.length === 0, `零 pageerror（${errs.length}）`);
await page.close();
// 2) 罚酒：--chug-progress 真进度（预览 completed=1 total=3 → 33%）
page = await ctx.newPage();
const errs2 = [];
page.on("pageerror", (e) => errs2.push(String(e)));
await page.goto(`${BASE}/?preview=drinking`, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".chug-stage", { timeout: 8000 }).catch(() => {});
await page.waitForTimeout(500);
const chug = await page.evaluate(() => {
  const el = document.querySelector(".chug-stage");
  return { inline: el?.getAttribute("style") || "", txt: (document.querySelector(".chug-stage .center.dim")?.textContent || "").trim() };
});
check(/--chug-progress:\s*33%/.test(chug.inline), `.chug-stage 进度变量 = "${chug.inline}"（对应 ${chug.txt}）`);
check(errs2.length === 0, `零 pageerror（${errs2.length}）`);
await page.close();
// 3) 马丁命名：反馈弹窗 + solo 建桌按钮 + 锐评署名
page = await ctx.newPage();
await page.goto(`${BASE}/?preview=feedback`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(500);
check((await page.textContent("#fbSend")).includes("马丁"), "反馈弹窗按钮 = " + (await page.textContent("#fbSend")));
await page.goto(`${BASE}/?preview=tableSolo`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(500);
check((await page.textContent("#createBtn")).includes("马丁"), "solo 建桌按钮 = " + (await page.textContent("#createBtn")));
await page.close();
await b.close();
console.log(bad ? `\n${bad} 项未过` : "\n全部通过");
process.exit(bad ? 1 : 0);
