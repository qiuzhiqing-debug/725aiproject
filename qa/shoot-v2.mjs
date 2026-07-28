// qa 截图脚本：node qa/shoot-v2.mjs [round]
import { chromium } from "playwright";

const BASE = "http://127.0.0.1:4899";
const SHOTS = [
  { name: "v2-lobby-844x390", w: 844, h: 390, url: "/v2/lobby.html" },
  { name: "v2-lobby-390x844", w: 390, h: 844, url: "/v2/lobby.html" },
  { name: "v2-lobby-1280x800", w: 1280, h: 800, url: "/v2/lobby.html" },
  { name: "v2-cocktail-390x844", w: 390, h: 844, url: "/v2/cocktail.html" },
  { name: "v2-cocktail-1280x800", w: 1280, h: 800, url: "/v2/cocktail.html" },
];

const browser = await chromium.launch();
for (const s of SHOTS) {
  const page = await browser.newPage({ viewport: { width: s.w, height: s.h } });
  await page.goto(BASE + s.url, { waitUntil: "networkidle" });
  await page.waitForTimeout(1600); // 字体+弹幕入场
  await page.screenshot({ path: `qa/${s.name}.png` });
  await page.close();
  console.log("done", s.name);
}

// 调酒动画各阶段：自动答完 4 题后抓混酒/结果帧
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto(BASE + "/v2/cocktail.html", { waitUntil: "networkidle" });
await page.waitForTimeout(900);
for (let i = 0; i < 4; i++) {
  await page.click(`.quiz-option:nth-child(${(i % 4) + 1})`);
  await page.waitForTimeout(420);
}
await page.waitForTimeout(1400); // 摇壶+开始倒酒
await page.screenshot({ path: "qa/v2-cocktail-mixing-390x844.png" });
await page.waitForTimeout(3200); // 完成定格 + 结果卡
await page.screenshot({ path: "qa/v2-cocktail-result-390x844.png" });
console.log("done mixing/result");
await browser.close();
