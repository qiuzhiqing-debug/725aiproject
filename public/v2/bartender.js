/* ==========================================================================
   酒保「老K」立绘组件（pixel-bar 风 · 纯 SVG 像素半身像 · 原创角色）
   --------------------------------------------------------------------------
   人设：夜班调酒师——短黑发、略疲惫、一直在工作，不主动向玩家卖帅。
   状态：
     idle → 眨眼循环（约 4s 一次，双帧）
     talk → 嘴部开合循环
     pour → 右手举瓶倒酒（酒瓶 + 酒线动画）
   用法：
     import { createBartender } from "./bartender.js";
     const bk = createBartender(document.querySelector("#slot"), "idle");
     bk.setState("talk");   // "idle" | "talk" | "pour"
   ========================================================================== */

// ---- 像素调色板（角色专属，不进 theme：立绘换装时只改这里） ----
const PAL = {
  H: "#17141f", // 头发主色（近黑）
  h: "#3b323f", // 头发受光面
  S: "#c48763", // 皮肤
  s: "#915945", // 皮肤暗部
  N: "#6c4038", // 颈部与胡茬阴影
  W: "#c8b7a4", // 旧白衬衫
  w: "#8d7e7c", // 衬衫暗部
  V: "#211821", // 马甲（近黑酒红）
  v: "#50303c", // 马甲受光面
  T: "#7e3947", // 松领带（暗红）
  t: "#532431", // 领带暗部
  C: "#a9b8ad", // 擦杯布（灰绿）
  c: "#71827b", // 擦杯布暗部
  E: "#d6c7b5", // 眼部微光
  P: "#160f18", // 瞳孔
  G: "#3ad08f", // 酒瓶玻璃
  g: "#1e7d54", // 酒瓶暗部
  L: "#ffb648", // 酒液（琥珀）
};

// ---- 半身像素图（24 宽 × 24 高，"." = 透明）----
// 脸部不带五官：眉/眼/嘴由状态层叠加
const BASE = [
  "........................",
  "........................",
  "........HHHHHH..........",
  ".......HHHHHHHH.........",
  ".......HHhHHHHH.........",
  ".......HSSSSSSH.........",
  ".......HSSSSSSH.........",
  ".......HSSSSSSH.........",
  ".......HSSSSSSH.........",
  "........sSSSSs..........",
  ".........sSSs...........",
  "..........NN............",
  ".......WWwNNwWW.........",
  "......VVWWTTWWVV........",
  ".....VVVWWTtWWVVV.......",
  "....VVVVWWWWWWVVVV......",
  "...VVVVVWWWWWWVVVVV.....",
  "...VVVVVVWWWWVVVVVV.....",
  "...VVVVVVWWWWVVVVVV.....",
  "...VVVVVVVVVVVVVVVV.....",
  "...VVVVVVVVVVVVVVVV.....",
  "..VVVVVVVVVVVVVVVVVV....",
  "..VVVVVVVVVVVVVVVVVV....",
  "..VVVVVVVVVVVVVVVVVV....",
];

const CELL = 10; // 每像素 10 单位，viewBox 240×240

function mapToRects(rows) {
  // 行内连续同色合并成一个 rect，控制节点数量
  let out = "";
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      if (ch === "." || !PAL[ch]) { x++; continue; }
      let x2 = x;
      while (x2 + 1 < row.length && row[x2 + 1] === ch) x2++;
      out += `<rect x="${x * CELL}" y="${y * CELL}" width="${(x2 - x + 1) * CELL}" height="${CELL}" fill="${PAL[ch]}"/>`;
      x = x2 + 1;
    }
  });
  return out;
}

// ---- 五官与手臂（状态层，直接用 rect 坐标，单位 = 像素格 ×CELL）----
function px(x, y, w, h, fill) {
  return `<rect x="${x * CELL}" y="${y * CELL}" width="${w * CELL}" height="${h * CELL}" fill="${fill}"/>`;
}

// 眉毛：压低、平直，避免“挑眉卖帅”
const BROWS =
  px(9, 6, 2, 1, PAL.H) +
  px(13, 6, 2, 1, PAL.H);

// 眼睛两帧
const EYES_OPEN =
  px(9, 7, 1, 1, PAL.E) + px(10, 7, 1, 1, PAL.P) +
  px(13, 7, 1, 1, PAL.P) + px(14, 7, 1, 1, PAL.E);
const EYES_SHUT =
  px(9, 7, 2, 1, PAL.s) + px(13, 7, 2, 1, PAL.s);

// 鼻影 + 下颌线胡渣
const FACE_DETAIL =
  px(11, 8, 1, 1, PAL.s) +
  px(10, 10, 3, 1, PAL.N);

// 嘴：平直闭嘴 / 说话，不做歪嘴笑
const MOUTH_IDLE = px(10, 9, 3, 1, PAL.N);
const MOUTH_OPEN = px(10, 8, 3, 2, "#5b3034");

// pour 状态：右侧举瓶手臂 + 酒瓶 + 酒线（酒线用 CSS 动画伸缩）
const POUR_ARM =
  px(16, 14, 2, 5, PAL.V) +                  // 抬起的大臂（袖）
  px(17, 11, 2, 3.5, PAL.W) +                // 卷起的衬衫小臂
  px(18, 9.5, 1.6, 1.8, PAL.S);              // 手
const POUR_BOTTLE =
  px(18.4, 5.2, 1.4, 1.2, PAL.g) +           // 瓶颈
  px(17.8, 6.4, 2.6, 3.4, PAL.G) +           // 瓶身
  px(18.2, 7, 0.6, 2.2, "#8df0c0");          // 瓶身高光

export function createBartender(el, state = "idle") {
  if (!el) throw new Error("createBartender: 容器元素不存在");

  const uid = "bk" + Math.random().toString(36).slice(2, 7);
  el.innerHTML = `
<svg viewBox="0 0 240 240" class="${uid} bk-root bk-${state}"
     shape-rendering="crispEdges" style="image-rendering:pixelated;display:block;width:100%;height:100%">
  <style>
    .${uid} .bk-eyes-shut, .${uid} .bk-mouth-open,
    .${uid} .bk-pour-layer { visibility: hidden; }

    /* idle：眨眼循环（4s 里合眼 0.24s） */
    .${uid}.bk-idle .bk-eyes-open { animation: ${uid}-blinkA 4s step-end infinite; }
    .${uid}.bk-idle .bk-eyes-shut { animation: ${uid}-blinkB 4s step-end infinite; }
    @keyframes ${uid}-blinkA { 0%,93.9% {visibility:visible} 94%,99.9% {visibility:hidden} 100%{visibility:visible} }
    @keyframes ${uid}-blinkB { 0%,93.9% {visibility:hidden} 94%,99.9% {visibility:visible} 100%{visibility:hidden} }

    /* talk：嘴开合 */
    .${uid}.bk-talk .bk-mouth-idle { animation: ${uid}-talkA 0.46s step-end infinite; }
    .${uid}.bk-talk .bk-mouth-open  { animation: ${uid}-talkB 0.46s step-end infinite; }
    @keyframes ${uid}-talkA { 0%,49% {visibility:visible} 50%,100% {visibility:hidden} }
    @keyframes ${uid}-talkB { 0%,49% {visibility:hidden} 50%,100% {visibility:visible} }

    /* pour：手臂层显示，瓶身小幅倾斜，酒线伸缩 */
    .${uid}.bk-pour .bk-pour-layer { visibility: visible; }
    .${uid}.bk-pour .bk-bottle {
      transform-origin: 190px 80px;
      animation: ${uid}-tilt 1.6s ease-in-out infinite;
    }
    @keyframes ${uid}-tilt { 0%,100% {transform:rotate(24deg)} 50% {transform:rotate(34deg)} }
    .${uid}.bk-pour .bk-stream {
      transform-origin: 206px 92px;
      animation: ${uid}-stream 0.8s ease-in-out infinite;
    }
    @keyframes ${uid}-stream { 0%,100% {transform:scaleY(0.75)} 50% {transform:scaleY(1)} }

    /* 呼吸感：整体极缓慢起伏（所有状态） */
    .${uid} .bk-body { animation: ${uid}-breath 3.4s ease-in-out infinite; }
    @keyframes ${uid}-breath { 0%,100% {transform:translateY(0)} 50% {transform:translateY(2px)} }
  </style>

  <g class="bk-body">
    ${mapToRects(BASE)}
    ${BROWS}
    ${FACE_DETAIL}
    <g class="bk-eyes-open">${EYES_OPEN}</g>
    <g class="bk-eyes-shut">${EYES_SHUT}</g>
    <g class="bk-mouth-idle">${MOUTH_IDLE}</g>
    <g class="bk-mouth-open">${MOUTH_OPEN}</g>

    <g class="bk-pour-layer">
      ${POUR_ARM}
      <g class="bk-bottle">${POUR_BOTTLE}</g>
      <g class="bk-stream">
        ${px(20.2, 9.2, 0.5, 4.5, PAL.L)}
        ${px(20.1, 13.4, 0.7, 0.6, PAL.L)}
      </g>
    </g>
  </g>
</svg>`;

  const svg = el.firstElementChild;
  return {
    el: svg,
    setState(next) {
      svg.classList.remove("bk-idle", "bk-talk", "bk-pour");
      svg.classList.add("bk-" + (["idle", "talk", "pour"].includes(next) ? next : "idle"));
    },
  };
}

export default createBartender;
