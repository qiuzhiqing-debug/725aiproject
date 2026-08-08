// R13 自验：精选立绘图池 两态验证
//  · type-01-m（public/art 里有 a/b 两张）→ 亮相立绘必须来自 /art/type-01-m-*.png
//  · type-09-m（还没画）→ 必须回退到 image.pollinations.ai 在线生图 URL
import { chromium } from "playwright";
const B = "http://127.0.0.1:8790";
const b = await chromium.launch({ args: ["--no-proxy-server"] });

async function probeCase(ptype, tag, { blockOnline }) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  const errs = [];
  const reqs = [];
  p.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
  p.on("request", (r) => {
    const u = r.url();
    if (/\/art\/|image\.pollinations\.ai/.test(u)) reqs.push(`${r.method()} ${u.slice(0, 110)}`);
  });
  if (blockOnline) await p.route(/image\.pollinations\.ai/, (r) => r.abort());
  await p.goto(`${B}/?preview=aha&ptype=${ptype}`, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(blockOnline ? 4000 : 12000);
  const info = await p.evaluate(() => {
    const img = document.getElementById("artImg");
    return {
      src: img ? img.getAttribute("src") : "(img已移除=彻底没图)",
      currentSrc: img ? img.currentSrc : "",
      naturalWidth: img ? img.naturalWidth : 0,
      wrapClass: document.getElementById("artWrap")?.className || "",
      badge: document.querySelector(".gx-type-badge")?.innerText.replace(/\s+/g, " ") || "",
      poolCache: sessionStorage.getItem("mfn_art_pool_v1"),
    };
  });
  const file = `qa/_r13-art-${tag}.jpg`;
  await p.screenshot({ path: file, quality: 82, type: "jpeg" });
  await ctx.close();
  return { info, reqs, errs, file };
}

console.log("=== A. type-01-m（图池有货）===");
const a1 = await probeCase(1, "type01-hit", { blockOnline: false });
console.log(JSON.stringify(a1.info, null, 1));
console.log("请求:", a1.reqs);
console.log("pageerror:", a1.errs);
console.log("截图:", a1.file);

console.log("\n=== A2. type-01-m 再来一次（同 seed 必须同一张）===");
const a2 = await probeCase(1, "type01-hit-again", { blockOnline: false });
console.log("src:", a2.info.src, "| 与首次一致:", a2.info.src === a1.info.src);

console.log("\n=== B. type-09-m（图池没货 → 回退在线生图）===");
const b1 = await probeCase(9, "type09-online", { blockOnline: true });
console.log(JSON.stringify(b1.info, null, 1));
console.log("请求:", b1.reqs);
console.log("pageerror:", b1.errs);
console.log("截图:", b1.file);

await b.close();

const okA = /^\/art\/type-01-m-[abcd]\.png$/.test(a1.info.src) && a1.info.naturalWidth > 0;
const okA2 = a2.info.src === a1.info.src;
const artProbed09 = b1.reqs.filter((r) => r.includes("/art/type-09"));
const okB = /image\.pollinations\.ai/.test(b1.info.src || "") || b1.reqs.some((r) => r.includes("pollinations"));
console.log("\n---- 判定 ----");
console.log("A 命中精选图:", okA);
console.log("A2 同 seed 同图:", okA2);
console.log("B 探过 09 的 4 个候选:", artProbed09.length, "| 回退在线 URL:", okB);
process.exit(okA && okA2 && okB ? 0 : 1);
