// PM 独立复验 profiler：相处细节模组隔离 + 生图性别分布（只读；跑完即删）
import { buildIdealProfile, MODULE_KEYS, MODULE_PROFILES } from "../public/ideal-profile.js";

// 恋爱味强信号词（非 lover 模组出现任一即判泄漏）
// 恋爱专属强信号（不含「朋友圈」等通用社交词，避免误伤老板发动态类中性条目）
const LOVE = ["情侣", "老公", "老婆", "男朋友", "女朋友", "谈恋爱", "情书", "纪念日",
  "表白", "约会", "情话", "情侣装", "WiFi密码", "爱你的TA",
  "第一次见面", "抢被子", "你的就是我的"];

// 从 prompt 反推立绘性别
function figOf(prompt) {
  if (prompt.includes("woman, female")||prompt.includes("pretty young woman")) return "f";
  if (prompt.includes("man, male")||prompt.includes("good-looking young man")) return "m";
  if (prompt.includes("androgynous")) return "n";
  return "?";
}

function fakeRecords(module, n = 12) {
  // 造点带 tag 的假记录，让维度有信号；question.module 决定模组
  const tagSets = [["边界", "掌控"], ["情绪价值", "网感"], ["金钱", "规划"], ["玩心", "抽象"]];
  const recs = [];
  for (let i = 0; i < n; i++) {
    recs.push({
      score: 3 + (i % 6),
      question: { module, tags: tagSets[i % tagSets.length] },
    });
  }
  return recs;
}

let fail = 0;
console.log("MODULE_KEYS:", MODULE_KEYS.join(","));
console.log("\n=== 相处细节模组隔离（非 lover 应 0 恋爱味）===");
for (const module of MODULE_KEYS) {
  const p = buildIdealProfile({ records: fakeRecords(module), seeking: "x", seed: "s-" + module });
  const details = p.relationship.details;
  const hits = [];
  for (const d of details) for (const w of LOVE) if (d.includes(w)) hits.push(`${w}@「${d.slice(0, 18)}…」`);
  const bad = module !== "lover" && hits.length > 0;
  if (bad) fail++;
  console.log(`\n[${module}] ${MODULE_PROFILES[module]?.name} 抽到${details.length}条 waiting="${MODULE_PROFILES[module]?.waiting?.any || MODULE_PROFILES[module]?.waiting?.androgynous}"`);
  details.forEach((d, i) => console.log(`   ${i + 1}. ${d}`));
  if (module !== "lover") console.log(`   → 恋爱味命中: ${hits.length ? "✗ " + JSON.stringify(hits) : "✓ 0"}`);
}

console.log("\n=== 生图性别（20 seed/模组）===");
for (const module of MODULE_KEYS) {
  const dist = { m: 0, f: 0, n: 0, "?": 0 };
  for (let s = 0; s < 20; s++) {
    const p = buildIdealProfile({ records: fakeRecords(module), seeking: "x", seed: `g${s}-${module}` });
    dist[figOf(p.portrait.prompt)]++;
  }
  let verdict = "";
  if (module === "bestie") verdict = dist.f === 20 && dist.m === 0 ? "✓ 全女" : "✗ 闺蜜应全女";
  else if (module === "lover") verdict = "(seeking=x→中性，见下)";
  else verdict = dist.m > 0 && dist.f > 0 ? "✓ 男女都出" : "✗ 性别单一";
  if (verdict.startsWith("✗")) fail++;
  console.log(`  [${module}] m=${dist.m} f=${dist.f} n=${dist.n} ${verdict}`);
}
// lover 三取向
console.log("  lover seeking: ", ["m", "f", "x"].map((sk) => {
  const p = buildIdealProfile({ records: fakeRecords("lover"), seeking: sk, seed: "L" + sk });
  return `${sk}→${figOf(p.portrait.prompt)}`;
}).join("  "));

// 生图 prompt 关键要素
const sample = buildIdealProfile({ records: fakeRecords("boss"), seeking: "x", seed: "sample" });
console.log("\n=== 生图 prompt 要素自检 ===");
const P = sample.portrait.prompt;
for (const [k, re] of [["像素向", /pixel art|retro game sprite/], ["低精度", /low resolution|minimal detail|chunky/],
  ["背景在场", /neon bar|warm dimly lit/], ["无写实脸", /photorealistic|expressive face|young adult/]]) {
  const has = re.test(P);
  const want = k !== "无写实脸";
  console.log(`  ${k}: ${has ? "有" : "无"} ${has === want ? "✓" : "✗"}`);
  if (has !== want) fail++;
}
console.log("  imageUrl 样例:", sample.portrait.imageUrl.slice(0, 90) + "...");

console.log(fail === 0 ? "\n✅ ALL PASS" : `\n❌ FAIL ×${fail}`);
process.exit(fail === 0 ? 0 : 1);
