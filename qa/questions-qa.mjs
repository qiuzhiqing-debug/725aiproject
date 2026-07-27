// 题库硬指标校验（V2）— 所有题库子线程交付前必须跑绿
// 用法: node qa/questions-qa.mjs
// 底线: 每个 (模组 × 取向池 × 锅底) 配置能抽出 ≥35 道不重复题（3局×10轮=30 + buffer）
import { readdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const DIR = resolve(import.meta.dirname, "../public/questions-v2");
const POOLS = ["straight-f", "straight-m", "gay", "lesbian"];
const DECKS = ["qingtang", "fanqie", "mala"];
const SPICE_RANGE = { qingtang: [1, 2], fanqie: [3, 3], mala: [4, 5] };
const MIN_PER_CONFIG = 35;
const MIN_KING = 40;

const norm = (s) => (s || "").replace(/[\s，。！？、·…~—"'「」（）()!?.,:;]/g, "").toLowerCase();
let fail = 0, warn = 0;
const bad = (m) => { console.error("  ❌ " + m); fail++; };
const meh = (m) => { console.warn("  ⚠️ " + m); warn++; };

const files = readdirSync(DIR).filter((f) => f.endsWith(".js"));
const allIds = new Map();

for (const f of files) {
  const mod = await import(pathToFileURL(resolve(DIR, f)).href);
  console.log(`\n== ${f} ==`);

  if (mod.KING_QUESTIONS) {
    const ks = mod.KING_QUESTIONS;
    if (ks.length < MIN_KING) bad(`国王题库仅 ${ks.length} 道，需 ≥${MIN_KING}`);
    const seen = new Set();
    for (const q of ks) {
      if (!q.id || !q.text) bad(`国王题缺字段: ${JSON.stringify(q).slice(0, 60)}`);
      const n = norm(q.text);
      if (seen.has(n)) bad(`国王题重复: ${q.id}`);
      seen.add(n);
    }
    console.log(`  国王题 ${ks.length} 道`);
  }

  const M = mod.MODULE;
  if (!M) continue;
  if (!M.key || !M.name || !M.noun) bad("MODULE 缺 key/name/noun");
  const textSeen = new Map(); // norm -> id （模组内全局查重，跨锅底也不许重）

  for (const dk of DECKS) {
    const deck = M.decks?.[dk];
    if (!deck) { bad(`缺锅底 ${dk}`); continue; }
    const qs = deck.questions || [];
    const [lo, hi] = SPICE_RANGE[dk];

    for (const q of qs) {
      if (!q.id || !q.m || !q.f || !q.n || !q.pools?.length) { bad(`${q.id || "?"} 缺字段(id/m/f/n/pools)`); continue; }
      if (allIds.has(q.id)) bad(`id 跨文件重复: ${q.id} (又见于 ${allIds.get(q.id)})`);
      allIds.set(q.id, f);
      if (q.spice < lo || q.spice > hi) bad(`${q.id} spice=${q.spice} 不在 ${dk} 允许区间 [${lo},${hi}]`);
      for (const p of q.pools) if (p !== "all" && !POOLS.includes(p)) bad(`${q.id} 非法 pool: ${p}`);
      // 句式铁律：「这是一个满分XX，但他XX」→ m 以「他」开头 / f 以「她」开头 / n 以「TA」开头
      if (q.m && !q.m.startsWith("他")) bad(`${q.id} m 必须以「他」开头: ${q.m}`);
      if (q.f && !q.f.startsWith("她")) bad(`${q.id} f 必须以「她」开头: ${q.f}`);
      if (q.n && !/^TA/i.test(q.n)) bad(`${q.id} n 必须以「TA」开头: ${q.n}`);
      for (const t of [q.m, q.f, q.n]) {
        const n = norm(t);
        if (n.length < 6) meh(`${q.id} 文案过短: ${t}`);
        if (textSeen.has(n) && textSeen.get(n) !== q.id) bad(`文案重复: ${q.id} 与 ${textSeen.get(n)}: ${t}`);
        textSeen.set(n, q.id);
      }
    }

    // 每个取向池在本锅底的可用量（含 all）
    if (M.key === "lover") {
      for (const p of POOLS) {
        const n = qs.filter((q) => q.pools.includes("all") || q.pools.includes(p)).length;
        const tag = n >= MIN_PER_CONFIG ? "✓" : (bad(`${dk}×${p} 仅 ${n} 道，需 ≥${MIN_PER_CONFIG}`), "✗");
        console.log(`  ${dk} × ${p}: ${n} ${tag}`);
      }
    } else {
      const n = qs.length;
      if (n < MIN_PER_CONFIG) bad(`${dk} 仅 ${n} 道，需 ≥${MIN_PER_CONFIG}`);
      console.log(`  ${dk}: ${n} ${n >= MIN_PER_CONFIG ? "✓" : "✗"}`);
    }
  }
}

console.log(`\n共 ${allIds.size} 道题 | ${fail} 处不达标 | ${warn} 处警告`);
process.exit(fail ? 1 : 0);
