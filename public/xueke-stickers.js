/* ==========================================================================
   雪克表情贴纸 XUEKE_STICKERS（R12 · 纯内联 SVG · 零依赖）
   --------------------------------------------------------------------------
   形象真源：docs/STORY-BIBLE.md §3.1 / §3.2 / §3.3
   语言真源：docs/XUEKE-VOICE.md（腔调与分段口径，跟本文件的分段一一对应）
   几何语言：public/v2/bartender.js（同一套黄铜/圆头/橄榄天线/马甲/圆睁眼）

     · 圆头 = 一个正圆（剪影三要素之一），永不方头。
     · 天线顶一颗橄榄 = 签名道具（= 马天尼杯 logo 里那颗）。
     · 眼 = 圆睁的完整圆眼，无眼睑压条；「正经的呆」靠睁太圆 + 坐太正，
       不靠半垂眼、不靠苦相、不靠腮红星星眼。
     · 三色纪律：黄铜 + 马甲深酒红 + 橄榄绿。深色底上成立（每张自带一枚
       深夜紫黑的圆底盘 + 黄铜细边，贴到任何底色上都不会糊掉）。

   对外契约（前端只认这三个）：
     XUEKE_STICKERS       { id: { svg, label, band } }
     XUEKE_BAND_STICKERS  { band: [id, ...] }   band ∈ "0-2"|"3-4"|"5-6"|"7-8"|"9-10"
     xuekeBand(score)     → band 字符串（与 src/worker.js 的 xkBand 同口径）
     stickerForScore(score, seed) → { band, id, label, svg }

   确定性铁律：同一个 (score, seed) 永远返回同一张。分段只由 score 决定，
   段内花色由 seed 的 FNV-1a 高位取模决定（seed 缺省 → 段内第一张）。
   —— 这条是 Kim 在 R12 炸出来的那个 bug 的另一半：表情绝不许和分数打架。
   ========================================================================== */

// ---- 调色板：与 bartender.js 逐值对齐（改这里之前先改 bartender.js）----
const P = {
  brassHi: "#f2d79b",
  brass: "#c99a4e",
  brassMid: "#a9793a",
  brassDim: "#7c5729",
  brassDeep: "#43301a",
  vest: "#4a1d26",
  vestDim: "#2c1016",
  olive: "#9aab52",
  oliveHi: "#c3d17c",
  oliveDim: "#5f6b2c",
  glass: "#e9dcc4",
  liquor: "#d98b33",
  ink: "#1a1226",
  shine: "#fff4dd",
  pink: "#ff2d78",
  cyan: "#2de2ff",
  smoke: "#8d8397",
};

/* ---- 零件库：每张贴纸都是这些零件的拼装（保证跨表情形象不漂）---- */

// 底盘：深夜紫黑圆 + 黄铜细边（"深色底上成立"的全部秘密）。
// 刻意不用 <defs>/渐变：贴纸尺寸小（≤3KB 硬预算），金属感靠"一道亮弧 + 一道暗弧"
// 就够了；顺带彻底免掉同页多张贴纸的渐变 id 撞车问题。
const disc =
  `<circle cx="60" cy="60" r="58" fill="#171122"/>` +
  `<circle cx="60" cy="60" r="58" fill="none" stroke="${P.brassDim}" stroke-width="2"/>`;

// 马甲肩 + 领结（半身，剪影三要素之二）
const body =
  `<path d="M28 120 Q32 101 47 96 L60 108 L73 96 Q88 101 92 120 Z" fill="${P.vest}" stroke="${P.vestDim}" stroke-width="2"/>` +
  `<path d="M60 100 L49 95 L49 106 Z" fill="${P.olive}" stroke="${P.oliveDim}" stroke-width="1.3"/>` +
  `<path d="M60 100 L71 95 L71 106 Z" fill="${P.olive}" stroke="${P.oliveDim}" stroke-width="1.3"/>` +
  `<circle cx="60" cy="100.5" r="2.6" fill="${P.oliveDim}"/>`;

// 脖子：一节黄铜伸缩管（老机器的关节）
const neck =
  `<rect x="52" y="84" width="16" height="16" rx="3" fill="${P.brass}" stroke="${P.brassDeep}" stroke-width="1.6"/>` +
  `<rect x="50" y="88" width="20" height="3" rx="1.5" fill="${P.brassDim}"/>`;

/* 天线 + 橄榄。mode:
   "up"    正立（默认）
   "burnt" 焦黑歪倒（宕机）
   "pop"   弹起（震惊）
   "bloom" 开花（9-10 的签名动作：橄榄上冒出粉/青两瓣小花） */
function antenna(mode) {
  if (mode === "burnt") {
    return `<g transform="rotate(-26 60 40)"><rect x="58.5" y="24" width="3" height="17" rx="1.5" fill="${P.brassDim}"/>` +
      `<ellipse cx="60" cy="19" rx="7.6" ry="9" fill="${P.oliveDim}" stroke="#2f3316" stroke-width="1.6"/>` +
      `<ellipse cx="60" cy="19" rx="2.4" ry="3" fill="#6b2130"/></g>`;
  }
  const y = mode === "pop" ? -6 : 0;
  let extra = "";
  if (mode === "bloom") {
    extra =
      `<circle cx="49" cy="14" r="4.4" fill="${P.pink}" opacity=".92"/>` +
      `<circle cx="71" cy="15" r="3.8" fill="${P.cyan}" opacity=".88"/>` +
      `<circle cx="60" cy="5" r="3.4" fill="${P.brassHi}"/>` +
      `<path d="M42 26 L45 21 M78 27 L75 22" stroke="${P.brassHi}" stroke-width="2" stroke-linecap="round" opacity=".8"/>`;
  }
  return `<g transform="translate(0 ${y})"><rect x="58.5" y="24" width="3" height="17" rx="1.5" fill="${P.brass}"/>` +
    `<circle cx="60" cy="41" r="3.2" fill="${P.brass}" stroke="${P.brassDeep}" stroke-width="1"/>` +
    extra +
    `<ellipse cx="60" cy="19" rx="8" ry="9.5" fill="${P.olive}" stroke="${P.oliveDim}" stroke-width="1.7"/>` +
    `<ellipse cx="60" cy="19" rx="2.6" ry="3.2" fill="#c8324f"/></g>`;
}

// 圆头（正圆）+ 顶上被摸了三十年的包浆亮弧 + 右下暗弧（金属感=一亮一暗两道弧）
// + 深色玻璃脸罩（五官画在罩上，绝不是白色屏幕）
const head =
  `<circle cx="60" cy="64" r="33" fill="${P.brass}" stroke="${P.brassDeep}" stroke-width="2.4"/>` +
  `<path d="M37 45A33 33 0 0 1 76 37" fill="none" stroke="${P.brassHi}" stroke-width="3.4" stroke-linecap="round" opacity=".75"/>` +
  `<path d="M90 64A30 30 0 0 1 39 85" fill="none" stroke="${P.brassDim}" stroke-width="7" opacity=".6"/>` +
  `<ellipse cx="60" cy="67" rx="24" ry="20.5" fill="${P.ink}" stroke="${P.brassDim}" stroke-width="2.1"/>` +
  `<path d="M45 56Q51 51 58 53" fill="none" stroke="${P.shine}" stroke-width="2.1" stroke-linecap="round" opacity=".26"/>`;

/* 眼：一律圆睁的完整圆眼（禁半垂/禁星星眼）。
   "wide" 瞪到最大（震惊）  "round" 标准  "bright" 标准+双高光（高分）
   "x"    电路烧了的叉眼（只给宕机） */
function eyes(mode) {
  if (mode === "x") {
    const x = (cx) =>
      `<path d="M${cx - 6} 60 L${cx + 6} 72 M${cx + 6} 60 L${cx - 6} 72" stroke="${P.brassHi}" stroke-width="3.4" stroke-linecap="round"/>`;
    return x(50) + x(70);
  }
  const r = mode === "wide" ? 9.2 : 7;
  const pr = mode === "wide" ? 3.6 : 3.8;
  const one = (cx) =>
    `<circle cx="${cx}" cy="66" r="${r}" fill="${P.brassHi}" stroke="${P.brassDim}" stroke-width="1.2"/>` +
    `<circle cx="${cx}" cy="66" r="${pr}" fill="${P.brassDeep}"/>` +
    `<circle cx="${cx - 1.9}" cy="63.9" r="1.6" fill="${P.shine}" opacity=".92"/>` +
    (mode === "bright" ? `<circle cx="${cx + 2.2}" cy="68.4" r="1" fill="${P.shine}" opacity=".7"/>` : "");
  return one(50) + one(70);
}

// 皱起来的黄铜眉：两根压低内倾的铜条（3-4 段专用，是"皱眉"不是"耷拉眼皮"——
// 眼睛照样圆睁，皱的是眉。用受光的亮铜色画，深色脸罩上必须一眼看见，
// 否则 3-4 段和 5-6 段在缩略图里就长得一样了）。
const brow =
  `<rect x="40" y="51" width="17" height="4.2" rx="2.1" fill="${P.brassHi}" transform="rotate(15 48.5 53)"/>` +
  `<rect x="63" y="51" width="17" height="4.2" rx="2.1" fill="${P.brassHi}" transform="rotate(-15 71.5 53)"/>`;

/* 嘴：短线为主（放松/平直），张嘴只给震惊 */
const MOUTH = {
  // 放松短线，两端极轻微上扬 —— 待命的从容（默认）
  line: `<path d="M52 80 Q60 82.4 68 80" fill="none" stroke="${P.brass}" stroke-width="3.2" stroke-linecap="round"/>`,
  // 一条端端正正的直线 —— 面无表情
  flat: `<rect x="51" y="79" width="18" height="3.2" rx="1.6" fill="${P.brass}"/>`,
  // 抿住的短线 —— 皱眉配套（比 flat 短，不是苦相的耷拉弧）
  tight: `<rect x="54" y="79.4" width="12" height="3" rx="1.5" fill="${P.brassDim}"/>`,
  // 张成一个方口 —— 震惊/宕机
  open: `<rect x="53" y="75" width="14" height="10" rx="3" fill="${P.brassDeep}" stroke="${P.brassDim}" stroke-width="1.4"/>`,
  // 张成一个小圆口 —— 「哦？」
  o: `<circle cx="60" cy="80" r="4.4" fill="${P.brassDeep}" stroke="${P.brassDim}" stroke-width="1.3"/>`,
};

/* ---- 道具（手上永远有活：镜头重点在动作不在脸）---- */

// 头顶冒烟（宕机）
const PROP_SMOKE =
  `<g opacity=".85"><path d="M46 34 Q40 26 45 19 Q50 12 44 5" fill="none" stroke="${P.smoke}" stroke-width="4" stroke-linecap="round" opacity=".55"/>` +
  `<path d="M76 33 Q82 26 78 19" fill="none" stroke="${P.smoke}" stroke-width="3.4" stroke-linecap="round" opacity=".4"/>` +
  `<circle cx="43" cy="4" r="4" fill="${P.smoke}" opacity=".3"/><circle cx="79" cy="14" r="3" fill="${P.smoke}" opacity=".25"/></g>`;

// 一只被擦的玻璃杯 + 抹布（idle 的标志动作）
const PROP_WIPE =
  `<path d="M14 78 L34 78 L31 106 Q30 111 24 111 Q18 111 17 106 Z" fill="${P.glass}" opacity=".2" stroke="${P.glass}" stroke-width="2.4"/>` +
  `<rect x="18" y="82" width="2.6" height="19" rx="1.3" fill="${P.shine}" opacity=".75"/>` +
  `<path d="M26 84 Q14 89 17 102 Q27 102 32 93 Z" fill="${P.glass}" opacity=".72"/>` +
  `<circle cx="30" cy="83" r="7" fill="${P.brass}" stroke="${P.brassDeep}" stroke-width="1.8"/>`;

// 小本本 + 笔（"我就记着"）
const PROP_NOTE =
  `<g transform="rotate(-8 24 96)"><rect x="8" y="80" width="30" height="34" rx="3" fill="${P.glass}" opacity=".9" stroke="${P.brassDeep}" stroke-width="1.6"/>` +
  `<path d="M13 89 H33 M13 96 H33 M13 103 H27" stroke="${P.brassDim}" stroke-width="1.7" stroke-linecap="round" opacity=".8"/></g>` +
  `<rect x="86" y="74" width="4" height="26" rx="2" fill="${P.brassDim}" transform="rotate(24 88 87)"/>` +
  `<circle cx="82" cy="98" r="7" fill="${P.brass}" stroke="${P.brassDeep}" stroke-width="1.8"/>`;

// 举瓶斟酒（7-8 的签名动作）
const PROP_POUR =
  `<g transform="rotate(112 96 74)"><path d="M89 42 L103 42 L103 58 Q110 63 110 70 L110 88 L82 88 L82 70 Q82 63 89 58 Z" fill="${P.oliveDim}" stroke="${P.brassDeep}" stroke-width="1.8"/>` +
  `<rect x="88" y="35" width="16" height="8" rx="2" fill="${P.brass}"/></g>` +
  `<rect x="100" y="82" width="3.4" height="22" rx="1.7" fill="${P.liquor}"/>` +
  `<path d="M92 104 L116 104 L113 118 L95 118 Z" fill="${P.glass}" opacity=".28" stroke="${P.glass}" stroke-width="1.8"/>` +
  `<path d="M94 111 L114 111 L113 118 L95 118 Z" fill="${P.liquor}" opacity=".85"/>`;

// 举杯（马天尼杯 + 那颗橄榄，9-10 的签名动作）
const PROP_CHEERS =
  `<path d="M84 74 L118 74 L101 95 Z" fill="${P.glass}" opacity=".3" stroke="${P.glass}" stroke-width="2"/>` +
  `<path d="M88 78 L114 78 L101 94 Z" fill="${P.liquor}" opacity=".8"/>` +
  `<rect x="99.4" y="94" width="3.2" height="16" rx="1.6" fill="${P.glass}" opacity=".7"/>` +
  `<rect x="92" y="109" width="18" height="3.2" rx="1.6" fill="${P.glass}" opacity=".7"/>` +
  `<ellipse cx="101" cy="80" rx="4.2" ry="5" fill="${P.olive}" stroke="${P.oliveDim}" stroke-width="1.2"/>` +
  `<circle cx="101" cy="80" r="1.5" fill="#c8324f"/>` +
  `<circle cx="86" cy="94" r="7" fill="${P.brass}" stroke="${P.brassDeep}" stroke-width="1.8"/>`;

// 举到嘴边的一杯（3-4：不予置评，先抿一口）。刻意收窄并压到右下角，
// 挡住脸颊而不是整张脸——挡住脸就成了一块灰玻璃，什么都读不出来。
const PROP_CUP_UP =
  `<path d="M82 76 L106 76 L103 100 Q102 106 94 106 Q86 106 85 100 Z" fill="${P.glass}" opacity=".22" stroke="${P.glass}" stroke-width="2.2"/>` +
  `<path d="M84 88 L104 88 L103 100 Q102 106 94 106 Q86 106 85 100 Z" fill="${P.liquor}" opacity=".9"/>` +
  `<rect x="86" y="79" width="2.4" height="16" rx="1.2" fill="${P.shine}" opacity=".55"/>` +
  `<circle cx="80" cy="99" r="7" fill="${P.brass}" stroke="${P.brassDeep}" stroke-width="1.8"/>`;

// 点头动线（7-8：轻轻一点，不是卖萌的星星）
const PROP_NOD =
  `<path d="M22 46 Q16 56 22 66" fill="none" stroke="${P.brassHi}" stroke-width="2.6" stroke-linecap="round" opacity=".55"/>` +
  `<path d="M98 46 Q104 56 98 66" fill="none" stroke="${P.brassHi}" stroke-width="2.6" stroke-linecap="round" opacity=".55"/>` +
  `<path d="M52 108 L60 116 L68 108" fill="none" stroke="${P.brassHi}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" opacity=".7"/>`;

// 电流噼啪（0-2：算不过来了）
const PROP_SPARK =
  `<path d="M20 40 L27 48 L21 51 L28 60" fill="none" stroke="${P.cyan}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" opacity=".85"/>` +
  `<path d="M100 40 L93 48 L99 51 L92 60" fill="none" stroke="${P.cyan}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" opacity=".85"/>`;

/* ---- 组装 ---- */

function build(id, { ant = "up", eye = "round", mouth = "line", withBrow = false, back = "", front = "" }) {
  return (
    `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" style="display:block;width:100%;height:100%">` +
    disc + back + body + neck + antenna(ant) + head +
    (withBrow ? brow : "") + eyes(eye) + MOUTH[mouth] + front +
    `</svg>`
  );
}

/* ---- 十张贴纸。band 是它的"出场分段"，与 xuekeBand 严格一致 ---- */
const SPEC = [
  // 0-2：震惊 / 宕机冒烟 —— 分低到机器算不过来
  ["xk-smoke", "0-2", "宕机冒烟", { ant: "burnt", eye: "x", mouth: "open", back: PROP_SMOKE }],
  ["xk-shock", "0-2", "震惊到弹天线", { ant: "pop", eye: "wide", mouth: "open", back: PROP_SPARK }],
  // 3-4：皱铜眉
  ["xk-frown", "3-4", "皱铜眉", { eye: "round", mouth: "tight", withBrow: true }],
  ["xk-sip", "3-4", "皱眉先抿一口", { eye: "round", mouth: "flat", withBrow: true, front: PROP_CUP_UP }],
  // 5-6：面无表情擦杯
  ["xk-wipe", "5-6", "面无表情擦杯", { eye: "round", mouth: "flat", front: PROP_WIPE }],
  ["xk-note", "5-6", "不评价，只记账", { eye: "round", mouth: "flat", front: PROP_NOTE }],
  // 7-8：点头斟酒
  ["xk-nod", "7-8", "点头", { eye: "bright", mouth: "line", back: PROP_NOD }],
  ["xk-pour", "7-8", "斟酒", { eye: "bright", mouth: "line", front: PROP_POUR }],
  // 9-10：橄榄天线开花 / 举杯
  ["xk-bloom", "9-10", "天线开花", { ant: "bloom", eye: "bright", mouth: "o" }],
  ["xk-cheers", "9-10", "举杯", { ant: "bloom", eye: "bright", mouth: "line", front: PROP_CHEERS }],
];

export const XUEKE_STICKERS = Object.freeze(
  Object.fromEntries(SPEC.map(([id, band, label, opts]) => [id, Object.freeze({ id, band, label, svg: build(id, opts) })]))
);

// 分段 → 该段的贴纸 id 列表（顺序即"段内第一张"的口径，别随手洗牌）
export const XUEKE_BANDS = Object.freeze(["0-2", "3-4", "5-6", "7-8", "9-10"]);
export const XUEKE_BAND_STICKERS = Object.freeze(
  Object.fromEntries(
    XUEKE_BANDS.map((b) => [b, Object.freeze(SPEC.filter(([, band]) => band === b).map(([id]) => id))])
  )
);

/* 分数 → 分段。与 src/worker.js 的 xkBand() 必须逐字一致（改一处就改两处）。
   口径：先四舍五入到整数、再夹到 0..10；非数字 → 中性段 "5-6"（永不抛错）。 */
export function xuekeBand(score) {
  const n = Math.round(Number(score));
  if (!Number.isFinite(n)) return "5-6";
  const v = n < 0 ? 0 : n > 10 ? 10 : n;
  if (v <= 2) return "0-2";
  if (v <= 4) return "3-4";
  if (v <= 6) return "5-6";
  if (v <= 8) return "7-8";
  return "9-10";
}

// FNV-1a，取高位取模（低位偏斜会让段内一半花色永远抽不到）
function hash32(s) {
  let h = 0x811c9dc5;
  const str = String(s);
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h;
}

/* 分数 → 一张贴纸。分段由 score 决定（确定性），段内花色由 seed 决定（同样确定性）。
   seed 缺省/空 → 段内第一张。返回 { band, id, label, svg }。 */
export function stickerForScore(score, seed) {
  const band = xuekeBand(score);
  const ids = XUEKE_BAND_STICKERS[band];
  const idx = seed == null || seed === "" ? 0 : Math.floor((hash32(String(seed) + band) / 4294967296) * ids.length);
  const s = XUEKE_STICKERS[ids[Math.min(idx, ids.length - 1)]];
  return { band, id: s.id, label: s.label, svg: s.svg };
}

// 已有 band 字段时（服务端广播的 xkBand）直接取，不用再算一次分数
export function stickerForBand(band, seed) {
  const b = XUEKE_BAND_STICKERS[band] ? band : "5-6";
  const ids = XUEKE_BAND_STICKERS[b];
  const idx = seed == null || seed === "" ? 0 : Math.floor((hash32(String(seed) + b) / 4294967296) * ids.length);
  const s = XUEKE_STICKERS[ids[Math.min(idx, ids.length - 1)]];
  return { band: b, id: s.id, label: s.label, svg: s.svg };
}

export default XUEKE_STICKERS;
