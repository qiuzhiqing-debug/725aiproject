// 隔离铁桶证明脚本（R4 P0 · R9 改版：签名去 deck，题随被拷问者）
// 直接调用 worker.js 导出的选题真源函数 filterQuestionsForViewer / allowedPoolsFor，
// 构造 (f,m)/(f,f)/(m,f)/(m,m)/(x,x) 各视角，连抽 N≥200 题，断言：
//   直女(f,m)     → 0 条 gay 命中
//   拉拉(f,f)     → 0 条 straight/gay 命中
//   seeking=x     → 0 条任何取向池命中（neutral only）
// 用法：node qa/isolation-proof.mjs
import { allowedPoolsFor, filterQuestionsForViewer } from "../src/worker.js";

const N = 300; // 每档连抽题数（≥200）

// ---- 构造题库：五类池，满足 R4 配比（neutral≥30 / 专属 straight≥10 / 专属同性≥10）----
function mk(prefix, pools, count) {
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix}-${i + 1}`,
    spice: 1,
    tags: [],
    pools,
    m: `${prefix} 男版第 ${i + 1} 条`,
    f: `${prefix} 女版第 ${i + 1} 条`,
    n: `${prefix} TA版第 ${i + 1} 条`,
  }));
}
const BANK = [
  ...mk("ne", ["neutral"], 30),
  ...mk("sm", ["straight-m"], 12),
  ...mk("sf", ["straight-f"], 12),
  ...mk("gay", ["gay"], 12),
  ...mk("les", ["lesbian"], 12),
];

// 用池标签给单题归类（命中检测用）
function poolOf(q) {
  return (q.pools && q.pools[0]) || "all";
}

// 模拟 worker.drawQuestion 的池内去重抽题：只从 filterQuestionsForViewer 的结果里抽
function simulateDraws(gender, seeking, n) {
  const base = filterQuestionsForViewer(BANK, gender, seeking);
  const drawn = [];
  let used = [];
  for (let i = 0; i < n; i++) {
    let pool = base.filter((q) => !used.includes(q.id));
    if (!pool.length) { used = []; pool = base.slice(); }
    const q = pool[Math.floor(Math.random() * pool.length)];
    used.push(q.id);
    drawn.push(q);
  }
  return { base, drawn };
}

function tally(drawn) {
  const t = {};
  for (const q of drawn) { const p = poolOf(q); t[p] = (t[p] || 0) + 1; }
  return t;
}

const cases = [
  { label: "直女 满分男 (deck=man, gender=f, seeking=m)", gender: "f", seeking: "m", forbid: ["gay", "lesbian", "straight-f"] },
  { label: "男同 (gender=m, seeking=m)", gender: "m", seeking: "m", forbid: ["straight-m", "straight-f", "lesbian"] },
  { label: "直男 (gender=m, seeking=f)", gender: "m", seeking: "f", forbid: ["lesbian", "gay", "straight-m"] },
  { label: "拉拉 (gender=f, seeking=f)", gender: "f", seeking: "f", forbid: ["straight-m", "straight-f", "gay"] },
  { label: "不限 seeking=x (gender=f)", gender: "f", seeking: "x", forbid: ["gay", "lesbian", "straight-m", "straight-f"] },
  { label: "无档案主角（散客未选，gender/seeking 缺失）", gender: undefined, seeking: undefined, forbid: ["gay", "lesbian", "straight-m", "straight-f"] },
];

let failed = 0;
console.log(`== 隔离铁桶证明（每档抽 ${N} 题）==\n`);
for (const c of cases) {
  const allowed = allowedPoolsFor(c.gender, c.seeking);
  const { drawn } = simulateDraws(c.gender, c.seeking, N);
  const t = tally(drawn);
  const hits = c.forbid.reduce((s, p) => s + (t[p] || 0), 0);
  const ok = hits === 0;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} · ${c.label}`);
  console.log(`     允许池: [${allowed.join(", ")}]`);
  console.log(`     抽到分布: ${JSON.stringify(t)}`);
  console.log(`     禁池 [${c.forbid.join(", ")}] 命中数: ${hits}\n`);
}

// R4 三项硬指标单独回显
const zhinu = tally(simulateDraws("f", "m", N).drawn);
const lala = tally(simulateDraws("f", "f", N).drawn);
const anyx = tally(simulateDraws("f", "x", N).drawn);
console.log("== R4 三项硬指标 ==");
console.log(`直女 gay 命中: ${zhinu.gay || 0}`);
console.log(`拉拉 straight-m/straight-f/gay 命中: ${(lala["straight-m"] || 0) + (lala["straight-f"] || 0) + (lala.gay || 0)}`);
console.log(`seeking=x 任何取向池命中: ${(anyx.gay || 0) + (anyx.lesbian || 0) + (anyx["straight-m"] || 0) + (anyx["straight-f"] || 0)}`);

console.log(`\n${failed === 0 ? "✅ 全部通过：隔离铁桶生效" : `❌ ${failed} 档泄漏`}`);
process.exit(failed === 0 ? 0 : 1);
