// TYPE-16 判型体系测试（R8，docs/FEEDBACK-0801-R8.md）
// node 直跑：node test/type16.test.mjs → exit 0 全绿 / exit 1 有挂
import {
  TYPE_ALPHA,
  TYPE_NORM,
  TYPE_TABLE,
  HIDDEN_TYPE_IDS,
  classifyType16,
  buildIdealProfile,
} from "../public/ideal-profile.js";

let passed = 0;
let failed = 0;
function check(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok - ${name}`);
  } catch (err) {
    failed++;
    console.error(`  FAIL - ${name}\n    ${err && err.message}`);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}
function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg || "assertEqual"}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const DIMS = ["boundary", "warmth", "money", "play", "control", "romance", "absurd", "meme"];
function vec(overrides = {}) {
  const v = Object.fromEntries(DIMS.map((d) => [d, 0]));
  return Object.assign(v, overrides);
}

console.log("TYPE-16 tests");

/* 0. 常数 sanity（逐字采用 PM 标定值） */
check("常数逐字：TYPE_ALPHA=0.7 且 TYPE_NORM 八维齐全", () => {
  assertEqual(TYPE_ALPHA, 0.7, "TYPE_ALPHA");
  const expect = { boundary: 0.731, warmth: 0.330, money: 0.370, play: 0.461, control: 0.737, romance: 0.374, absurd: 0.605, meme: 0.330 };
  for (const d of DIMS) assertEqual(TYPE_NORM[d], expect[d], `TYPE_NORM.${d}`);
});

check("TYPE_TABLE 恰 16 条且 id/code 连号", () => {
  assertEqual(TYPE_TABLE.length, 16, "TYPE_TABLE.length");
  TYPE_TABLE.forEach((t, i) => {
    assertEqual(t.id, i + 1, `id at index ${i}`);
    assertEqual(t.code, `#${String(i + 1).padStart(2, "0")}`, `code at index ${i}`);
    assert(t.name && t.family && t.key, `entry ${i} incomplete`);
  });
});

/* 1. 16 型全部可被构造命中 */
check("16 型全部可构造命中", () => {
  const hit = new Set();
  for (const t of TYPE_TABLE) {
    const dim = t.key.slice(0, -1);
    const sign = t.key.endsWith("+") ? 1 : -1;
    // 主导维给大值使其族最强且族内占优；同族另一维给小值
    const got = classifyType16(vec({ [dim]: sign * 5 }));
    assertEqual(got.id, t.id, `构造 ${t.key} 应命中 ${t.code}，实际 ${got.code}`);
    hit.add(got.id);
  }
  assertEqual(hit.size, 16, "命中型号数");
});

/* 2. 确定性：同输入两次同输出 */
check("classifyType16 确定性（同输入同输出）", () => {
  const inputs = [
    vec({ warmth: 1.2, romance: -0.4, play: 0.9 }),
    vec({ boundary: -0.3, control: 0.31, money: 0.2, meme: -0.1 }),
    vec({ absurd: 0.77, meme: 0.76, money: 0.5 }),
  ];
  for (const s of inputs) {
    const a = classifyType16({ ...s });
    const b = classifyType16({ ...s });
    assertEqual(a.id, b.id, "两次判型不一致");
    assertEqual(a, b, "应返回同一 TYPE_TABLE 条目引用");
  }
});

/* 3. 全零向量 → #01 */
check("全零向量落 #01", () => {
  assertEqual(classifyType16(vec()).id, 1, "全零向量");
});

/* 4. buildIdealProfile 接线 */
check("buildIdealProfile 返回 type / archetype=型号名 / matchCard.typeCode / stages.profile", () => {
  const records = [
    { question: { id: "q1", module: "lover", tags: ["纯爱", "温柔"] }, score: 9 },
    { question: { id: "q2", module: "lover", tags: ["控制", "职场"] }, score: 2 },
    { question: { id: "q3", module: "lover", tags: ["浪漫", "仪式感"] }, score: 8 },
  ];
  const r = buildIdealProfile({ records, genderPreference: "m", seed: "type16-wire" });
  assert(r.type && typeof r.type === "object", "缺顶层 type 字段");
  for (const f of ["id", "code", "key", "name", "family", "hidden"]) {
    assert(f in r.type, `type 缺字段 ${f}`);
  }
  const entry = TYPE_TABLE.find((t) => t.id === r.type.id);
  assert(entry, "type.id 不在 TYPE_TABLE");
  assertEqual(r.type.name, entry.name, "type.name 与表不符");
  assertEqual(r.matchCard.archetype, r.type.name, "archetype 应等于型号名");
  assertEqual(r.portrait.archetype, r.type.name, "portrait.archetype 应等于型号名");
  assert(typeof r.matchCard.typeCode === "string" && /^#\d{2}$/.test(r.matchCard.typeCode), "matchCard.typeCode 缺失或格式错");
  assertEqual(r.matchCard.typeName, r.type.name, "matchCard.typeName");
  const profileStage = r.stages.find((s) => s.id === "profile");
  assert(profileStage, "缺 profile stage");
  assertEqual(profileStage.data.typeCode, r.type.code, "stages.profile.data.typeCode");
  assertEqual(profileStage.data.typeName, r.type.name, "stages.profile.data.typeName");
  // 同局确定性
  const r2 = buildIdealProfile({ records, genderPreference: "m", seed: "type16-wire" });
  assertEqual(r2.type.id, r.type.id, "同 records 同 seed 应同型");
});

/* 5. 隐藏款 = HIDDEN_TYPE_IDS 恰 3 个且 hidden===true */
check("隐藏款恰 3 个（#05/#13/#16）且 hidden 标志一致", () => {
  assertEqual(HIDDEN_TYPE_IDS.length, 3, "HIDDEN_TYPE_IDS 长度");
  assertEqual(JSON.stringify([...HIDDEN_TYPE_IDS]), JSON.stringify([5, 13, 16]), "隐藏款名单");
  for (const id of HIDDEN_TYPE_IDS) {
    const t = TYPE_TABLE.find((x) => x.id === id);
    assert(t, `隐藏款 ${id} 不在表内`);
    assertEqual(t.hidden, true, `${t.code} hidden 应为 true`);
  }
  const hiddenCount = TYPE_TABLE.filter((t) => t.hidden).length;
  assertEqual(hiddenCount, 3, "表内 hidden===true 应恰 3 个");
});

/* 6. 平局规则：order 与 hot 族强度完全相等 → 落 order */
check("族强度平局（order==hot）落 order 族", () => {
  // z = score / norm^0.7；令 order 与 hot 的 |z| 和完全相等：
  // 直接按 norm^alpha 构造 score，使每维 z 恰为指定值。
  const zTarget = { boundary: 1, control: 1, warmth: 1, romance: 1 }; // order 和 = hot 和 = 2
  const scores = vec();
  for (const [d, zv] of Object.entries(zTarget)) {
    scores[d] = zv * Math.pow(TYPE_NORM[d], TYPE_ALPHA);
  }
  const got = classifyType16(scores);
  assertEqual(got.family, "order", `平局应留 order，实际 ${got.family} (${got.code})`);
  // 族内 boundary 与 control 的 |z| 也相等 → 取 d1=boundary，方向 +
  assertEqual(got.id, 1, `族内平局应取 boundary+ (#01)，实际 ${got.code}`);
});

/* 附加：族内平局取 d1（>=）与方向规则 */
check("族内 |z| 平局取 d1；z>=0 为 +", () => {
  // wild 族：play 与 absurd 的 |z| 相等（一正一负）→ 主导取 play，方向 +
  const scores = vec({
    play: 1 * Math.pow(TYPE_NORM.play, TYPE_ALPHA),
    absurd: -1 * Math.pow(TYPE_NORM.absurd, TYPE_ALPHA),
  });
  const got = classifyType16(scores);
  assertEqual(got.key, "play+", `应为 play+ (#09)，实际 ${got.key}`);
  // z 恰为 0 的主导维 → "+"（用全零已验，再验单族负零边界：dom z=0 时取 +）
  const zeroDom = classifyType16(vec({ romance: 0, warmth: 0, boundary: 0.0001 }));
  assertEqual(zeroDom.key, "boundary+", "微正 boundary 应为 boundary+");
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
