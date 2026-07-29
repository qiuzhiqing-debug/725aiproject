import { chromium } from "playwright-core";

const BASE = "http://127.0.0.1:8787";
const URL = BASE + "/v2/cocktail";
const errors = [];

function attach(page, tag) {
  page.on("console", (m) => { if (m.type() === "error") errors.push(`[${tag}] console: ${m.text()}`); });
  page.on("pageerror", (e) => errors.push(`[${tag}] pageerror: ${e.message}`));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
setTimeout(() => { console.log("HARD TIMEOUT — dumping errors:", errors); process.exit(2); }, 110000);

// 点壶充能直到出酒（headless 无传感器 → createShaker ~1.2s 后走点击充能，每点 +14，需 ~10 下）
async function shakeToResult(page) {
  await page.waitForSelector("#mixShaker svg", { timeout: 8000 });
  for (let i = 0; i < 40; i++) {
    const resultShown = await page.locator("#result").evaluate(e => !e.classList.contains("hidden")).catch(() => false);
    if (resultShown) return;
    await page.locator("#mixShaker").click({ position: { x: 40, y: 80 }, force: true }).catch(() => {});
    await sleep(180);
  }
}

const browser = await chromium.launch({ channel: "msedge", headless: true });

// ---------- 1) 新客全流程 ----------
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const page = await ctx.newPage();
  attach(page, "new");
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "domcontentloaded" });
  await sleep(500);

  // 答 4 题：每题点第一个选项
  for (let q = 0; q < 4; q++) {
    await page.waitForSelector("#options .quiz-option");
    await page.locator("#options .quiz-option").first().click();
    await sleep(650);
  }
  // 摇壶：点壶充能到出酒
  await page.waitForSelector("#mixShaker svg", { timeout: 8000 });
  const hasShakerSvg = await page.locator("#mixShaker svg").count();
  const capExists = await page.locator("#mixShaker #shaker-cap").count();
  console.log("new: shaker svg inlined =", hasShakerSvg, " cap group =", capExists);
  await shakeToResult(page);
  // 出酒结果 → 点进注册
  await page.waitForSelector("#result:not(.hidden)", { timeout: 8000 });
  console.log("new: result shown, name =", await page.locator("#resultName").textContent());
  await page.locator("#resultGo").click();
  await page.waitForSelector("#register:not(.hidden)");
  // 填注册
  const nick = "coco" + Math.floor(Math.random() * 100000);
  await page.fill("#regName", nick);
  await page.fill("#regPass", "4321");
  await page.locator('#regGender button[data-v="m"]').click();
  await page.locator('#regSeeking button[data-v="f"]').click();
  await page.locator("#regSubmit").click();
  await page.waitForURL("**/v2/lobby**", { timeout: 8000 });
  const ls = await page.evaluate(() => ({
    id: localStorage.getItem("ideal_userId"),
    tok: !!localStorage.getItem("ideal_token"),
    name: localStorage.getItem("mfn_name"),
    g: localStorage.getItem("ideal_gender"),
    s: localStorage.getItem("ideal_seeking"),
  }));
  console.log("new: registered & redirected. localStorage =", JSON.stringify(ls));
  await ctx.close();
}

// ---------- 2) 老客识别（跳过注册） ----------
{
  // 先建一个老客
  const rn = "vip" + Math.floor(Math.random() * 100000);
  const reg = await fetch(BASE + "/api/register", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: rn, passcode: "5678", gender: "m", seeking: "f" }),
  }).then(r => r.json());
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const page = await ctx.newPage();
  attach(page, "returning");
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await page.evaluate(([id, tok, nm]) => {
    localStorage.setItem("ideal_userId", id);
    localStorage.setItem("ideal_token", tok);
    localStorage.setItem("mfn_name", nm);
  }, [reg.userId, reg.token, rn]);
  await page.reload({ waitUntil: "domcontentloaded" });
  await sleep(1200);
  const hostLine = await page.locator("#hostLine").textContent();
  console.log("returning: host greeting =", JSON.stringify(hostLine));
  // 走到出酒，点 resultGo 应直接跳大厅（跳过注册）
  for (let q = 0; q < 4; q++) {
    await page.locator("#options .quiz-option").first().click();
    await sleep(650);
  }
  await page.waitForSelector("#mixShaker svg");
  await shakeToResult(page);
  await page.waitForSelector("#result:not(.hidden)", { timeout: 8000 });
  await page.locator("#resultGo").click();
  const wentLobby = await page.waitForURL("**/v2/lobby**", { timeout: 6000 }).then(() => true).catch(() => false);
  const regHiddenOrSkipped = await page.url().includes("/v2/lobby");
  console.log("returning: resultGo → lobby directly (skip register) =", wentLobby && regHiddenOrSkipped);
  await ctx.close();
}

// ---------- 3) 对暗号找回 ----------
{
  const rn = "back" + Math.floor(Math.random() * 100000);
  await fetch(BASE + "/api/register", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: rn, passcode: "2468", gender: "f", seeking: "m" }),
  });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const page = await ctx.newPage();
  attach(page, "recover");
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "domcontentloaded" });
  await sleep(400);
  await page.locator("#recoverLink").click();
  await page.waitForSelector("#recover:not(.hidden)");
  await page.fill("#rcName", rn);
  await page.fill("#rcPass", "2468");
  await page.locator("#rcGo").click();
  const ok = await page.waitForURL("**/v2/lobby**", { timeout: 6000 }).then(() => true).catch(() => false);
  const ls = await page.evaluate(() => localStorage.getItem("ideal_userId"));
  console.log("recover: matched → lobby =", ok, " userId stored =", !!ls);
  // 错暗号
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const page2 = await ctx2.newPage();
  attach(page2, "recover-bad");
  await page2.goto(URL, { waitUntil: "domcontentloaded" });
  await page2.evaluate(() => localStorage.clear());
  await page2.reload({ waitUntil: "domcontentloaded" });
  await page2.locator("#recoverLink").click();
  await page2.fill("#rcName", rn);
  await page2.fill("#rcPass", "0000");
  await page2.locator("#rcGo").click();
  await sleep(800);
  const msg = await page2.locator("#rcMsg").textContent();
  console.log("recover-bad: error msg =", JSON.stringify(msg));
  await ctx.close();
  await ctx2.close();
}

await browser.close();
console.log("\n===== console/page errors:", errors.length, "=====");
errors.forEach(e => console.log(e));
process.exit(errors.length ? 1 : 0);
