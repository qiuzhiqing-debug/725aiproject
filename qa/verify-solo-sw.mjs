// Solo reveal scrollWidth verification after Fix 1
// Verifies document.documentElement.scrollWidth <= 390 at reveal phase
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const PLAYWRIGHT_PATH =
  "file:///D:/AIgo/理想型加载中/满分男/node_modules/playwright/index.mjs";
const { chromium } = await import(PLAYWRIGHT_PATH);

const BASE = "http://127.0.0.1:8787";
const QA_DIR = "D:/AIgo/理想型加载中/满分男/qa/";

async function waitFor(page, selector, timeout = 15000) {
  try {
    await page.waitForSelector(selector, { timeout });
    return true;
  } catch {
    return false;
  }
}

async function waitForExpr(page, expr, timeout = 15000, step = 400) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    try {
      if (await page.evaluate(expr)) return true;
    } catch {}
    await page.waitForTimeout(step);
  }
  console.log("TIMEOUT:", expr);
  return false;
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
});
const page = await ctx.newPage();

try {
  // Fresh solo game
  await page.goto(BASE + "/?solo=1");
  await page.evaluate("localStorage.clear()");
  await page.evaluate(
    `localStorage.setItem('ideal_cocktail', JSON.stringify({name:'测试鸡尾酒',glass:'highball'}))`
  );
  await page.goto(BASE + "/?solo=1");
  await page.waitForTimeout(1200);

  // Create game
  await page.fill("#nameIn", "SW测试");
  await page.click("#createBtn");
  await waitForExpr(page, "document.body.innerText.includes('开局')", 10000);

  // Set 2 rounds for speed
  await page.evaluate(
    "(()=>{const s=document.getElementById('roundsSel'); if(s){s.value='2'; s.dispatchEvent(new Event('change'));} return 'ok'})()"
  );
  await page.waitForTimeout(300);
  await page.click("#startBtn");

  // Wait for sticks phase - cup click approach (Fix 3)
  const hasCup = await waitFor(page, "#cup", 10000);
  if (!hasCup) {
    console.log("ERROR: #cup element not found");
    process.exit(1);
  }

  // Try clicking cup to activate (may use shaker or fall back to tap mode)
  await page.click("#cup");
  await page.waitForTimeout(800);

  // Check if tapBtn appeared after cup click (fallback mode), or if motion mode
  const mode = await page.evaluate(
    "(()=>{ const tap = !!document.getElementById('tapBtn'); return tap ? 'tap' : 'motion'; })()"
  );
  console.log("Shaker mode:", mode);

  // Click enough times to fill charge
  if (mode === "tap") {
    for (let i = 0; i < 15; i++) {
      await page.click("#tapBtn").catch(() => {});
      await page.waitForTimeout(60);
    }
  } else {
    // Motion mode - just keep clicking cup
    for (let i = 0; i < 20; i++) {
      await page.click("#cup").catch(() => {});
      await page.waitForTimeout(60);
    }
  }

  // Also try tapBtn if it appeared
  const tapExists = await page.$("#tapBtn");
  if (tapExists) {
    for (let i = 0; i < 130; i++) {
      await page.click("#tapBtn").catch(() => {});
      await page.waitForTimeout(40);
    }
  }

  // Try cup clicks as backup
  for (let i = 0; i < 30; i++) {
    await page.click("#cup").catch(() => {});
    await page.waitForTimeout(40);
  }

  await waitFor(page, "#doneBtn", 8000);
  await page.click("#doneBtn").catch(() => {});
  await waitFor(page, "[data-g]", 8000);
  await page.click('[data-g="m"]').catch(() => {});

  const results = [];

  for (let round = 1; round <= 2; round++) {
    console.log(`\n--- Round ${round} ---`);

    // Answer phase
    await waitFor(page, "#submitBtn", 12000);
    await page.waitForTimeout(500);

    // Set slider to 7
    await page.evaluate(
      "(()=>{const s=document.getElementById('slider'); if(s){s.value=7; s.dispatchEvent(new Event('input'));} return 'ok'})()"
    );
    await page.click("#submitBtn");

    // Reveal phase - measure scrollWidth immediately and after animation
    await waitFor(page, "#nextBtn", 12000);

    // Wait for scoreSlam animation to potentially kick in
    await page.waitForTimeout(800);

    const sw_immediate = await page.evaluate(
      "document.documentElement.scrollWidth"
    );
    const sw_body = await page.evaluate("document.body.scrollWidth");

    // Also wait through full animation (1.5s)
    await page.waitForTimeout(1500);
    const sw_after = await page.evaluate(
      "document.documentElement.scrollWidth"
    );
    const sw_body_after = await page.evaluate("document.body.scrollWidth");

    const laokShown = await page.evaluate(
      "!!document.querySelector('.laok-box.show')"
    );
    const laokText = await page.evaluate(
      "document.querySelector('.laok-box.show .laok-text')?.textContent || ''"
    );

    console.log(`Round ${round} reveal:`);
    console.log(
      `  html.scrollWidth immediate=${sw_immediate}, after=${sw_after}`
    );
    console.log(
      `  body.scrollWidth immediate=${sw_body}, after=${sw_body_after}`
    );
    console.log(`  laokShown=${laokShown}, laokText="${laokText}"`);

    results.push({ round, sw_immediate, sw_after, sw_body, sw_body_after, laokShown });

    await page.screenshot({
      path: QA_DIR + `verify-solo-reveal-r${round}.png`,
    });
    console.log(`  Screenshot: verify-solo-reveal-r${round}.png`);

    await page.click("#nextBtn");
    await page.waitForTimeout(600);
  }

  console.log("\n=== SUMMARY ===");
  let allOk = true;
  for (const r of results) {
    const ok = r.sw_immediate <= 390 && r.sw_after <= 390;
    if (!ok) allOk = false;
    console.log(
      `Round ${r.round}: sw=${r.sw_immediate}/${r.sw_after} ${ok ? "PASS" : "FAIL"} | laok=${r.laokShown}`
    );
  }
  console.log(allOk ? "ALL PASS" : "SOME FAILED");
} catch (e) {
  console.error("Error:", e.message);
} finally {
  await browser.close();
}
