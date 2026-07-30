/* ==========================================================================
   酒保「老K」立绘组件 V4（低精度人物 + 高精度背景 · 纯 SVG · 原创角色）
   --------------------------------------------------------------------------
   美术方向（R2.5 保留 + 0729-R3 重画）：
     · 人物「低精度」：粗像素块、简笔五官（约 20×20 网格），干净松弛不刻画皱纹。
     · 背景「高精度」：霓虹后吧台——酒瓶架、霓虹灯管、层板辉光，细节下功夫。
   人设（R3 拍板 · 文艺暖男「作家安东尼」那一挂）：
     干净清瘦、微卷短发、笑容温和、少沧桑感；文艺松弛、会接话的年轻店主，
     年龄感 28–32。不是硬朗西式大叔，不是韩系少年——就是"文艺暖男"。
     明亮干净的皮肤、柔软的暖棕微卷发、上扬的浅浅一笑；不做法令纹/眼袋/胡青。
   霓虹光：左侧偏 #ff2d78 粉、右侧偏 #a86bff 紫。
   状态（对外契约不变）：
     idle → 眨眼循环    talk → 嘴部开合    pour → 举瓶倒酒
   用法：
     import { createBartender } from "./bartender.js";
     const bk = createBartender(document.querySelector("#slot"), "idle");
     bk.setState("talk");   // "idle" | "talk" | "pour"
   ========================================================================== */

// ---- 人物调色板（粗像素、少分层：一个亮面 + 基色 + 一个暗面即可） ----
// R3：整体调亮调暖——皮肤更干净、头发暖棕带柔光挑染，去掉近黑与胡青感。
const PAL = {
  H: "#2f2530", // 头发（暖棕黑，比旧版暖，年轻）
  h: "#5a4350", // 发丝挑染/微卷高光（柔和暖褐）
  S: "#dcae89", // 皮肤基色（更亮更干净）
  F: "#f1c9a3", // 皮肤亮面（左侧受光）
  s: "#c08d6a", // 皮肤暗面（浅一档，不做皱纹）
  N: "#a06a52", // 颈影（纯阴影，不做胡青）
  W: "#e7e1d5", // 衬衫（干净暖白）
  w: "#b3a9bd", // 衬衫暗面
  V: "#2e2340", // 马甲主色（暗紫，略提亮不厚重）
  v: "#4d3156", // 马甲亮缘（粉侧）
  u: "#38305c", // 马甲暗缘（紫侧）
  T: "#a1495a", // 松领带（暗红，略提亮）
  t: "#6d3242", // 领带暗部
  m: "#b06a5e", // 唇色（温和暖调，用于微笑）
  E: "#f6f0e6", // 眼白/微光
  P: "#241820", // 瞳孔
  g: "#1e7d54", // 酒瓶暗部
  B: "#3ad08f", // 酒瓶玻璃
  A: "#ffb648", // 酒液（琥珀）
};

// ---- 半身像素图（20 宽 × 20 高，粗块；"." = 透明，露出背景）----
// 脸部不带五官：眉/眼/嘴由状态层叠加。
// R3：微卷短发（h 挑染打散头顶轮廓，右侧一缕碎刘海），清瘦干净的脸型。
const BASE = [
  "....................",
  "......HhHHHh........",
  ".....HhHHHHhH.......",
  ".....HFSSSShH.......",
  ".....HFSSSSSSH......",
  "......FSSSSSs.......",
  "......FSSSSSs.......",
  "......SSSSSSS.......",
  "......FSSSSs........",
  ".......sSSs.........",
  "........NNN.........",
  ".....vVWWWWWVu......",
  "....vVVWTTTWVVu.....",
  "...vVVVWWTtWWVVu....",
  "..vVVVVWWTtWWVVu....",
  "..VVVVVWWTtWWVVVu...",
  ".VVVVVVWWWWWWVVVVu..",
  ".VVVVVVVVVVVVVVVVu..",
  "VVVVVVVVVVVVVVVVVVu.",
  "VVVVVVVVVVVVVVVVVVu.",
];

const CELL = 16; // 每像素 16 单位，viewBox 320×320（粗像素 = 低精度人物）

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

// ---- 五官（状态层，单位 = 像素格 ×CELL）。简笔、平和，不加皱纹 ----
function px(x, y, w, h, fill) {
  return `<rect x="${x * CELL}" y="${y * CELL}" width="${(w * CELL).toFixed(1)}" height="${(h * CELL).toFixed(1)}" fill="${fill}"/>`;
}

// 眉毛：细、柔、略舒展 = 温和不锋利（用发丝挑染色，比头发更轻）
const BROWS =
  px(6.4, 3.95, 1.6, 0.4, PAL.h) +
  px(9.2, 3.95, 1.6, 0.4, PAL.h);

// 眼睛：眼白+瞳，右上加一点高光=有神温柔；闭眼是两道柔和短横（笑眼）
const EYES_OPEN =
  px(6.5, 4.5, 1.4, 0.9, PAL.E) + px(6.85, 4.6, 0.75, 0.8, PAL.P) + px(6.9, 4.62, 0.28, 0.28, PAL.E) +
  px(9.1, 4.5, 1.4, 0.9, PAL.E) + px(9.45, 4.6, 0.75, 0.8, PAL.P) + px(9.5, 4.62, 0.28, 0.28, PAL.E);
const EYES_SHUT =
  px(6.5, 4.92, 1.4, 0.36, PAL.s) + px(9.1, 4.92, 1.4, 0.36, PAL.s);

// 静态细节：仅一点柔和鼻影（小、浅；不做法令纹/抬头纹/眼袋）
const FACE_DETAIL =
  px(8.35, 5.4, 0.7, 0.9, PAL.s);

// 嘴：温和上扬的浅浅一笑（两端轻抬），暖唇色；说话帧微张
const MOUTH_IDLE =
  px(7.4, 6.7, 2.2, 0.45, PAL.m) +
  px(7.05, 6.52, 0.5, 0.36, PAL.m) +
  px(9.55, 6.52, 0.5, 0.36, PAL.m);
const MOUTH_OPEN =
  px(7.5, 6.55, 2.0, 0.85, "#7a3a3a") +
  px(7.6, 6.58, 1.8, 0.28, PAL.m);

// pour 状态：右臂举瓶（前景，压在背景之上）
const POUR_ARM =
  px(13.4, 11.6, 2.6, 2.6, PAL.W) +           // 卷袖大臂
  px(15.0, 7.6, 1.8, 4.4, PAL.S) +            // 裸小臂
  px(15.0, 7.6, 0.5, 4.4, PAL.F) +            // 小臂受光
  px(15.1, 6.2, 1.8, 1.6, PAL.S);            // 手
const POUR_BOTTLE =
  px(15.8, 3.4, 1.1, 1.3, PAL.g) +            // 瓶颈
  px(15.1, 4.6, 2.5, 3.0, PAL.B) +            // 瓶身
  px(15.4, 5.0, 0.5, 2.0, "#8df0c0");         // 瓶身高光

// ---- 高精度背景：霓虹后吧台（酒瓶架 + 灯管 + 层板辉光） ----
// 站在人物之后，rounded-rect 裁切成一个"框内场景"，粗像素人物压在其上。
// 一支立瓶：瓶身 + 颈 + 软光晕 + 高光条 + 液面
function bottle(cx, topY, bw, bh, body, cap) {
  const bx = cx - bw / 2;
  return `
    <rect x="${bx - 2}" y="${topY - 3}" width="${bw + 4}" height="${bh + 6}" rx="${bw / 2}"
          fill="${body}" opacity="0.45" filter="url(#bkGlow)"/>
    <rect x="${cx - 2.2}" y="${topY - 9}" width="4.4" height="10" rx="1.6" fill="${cap}"/>
    <rect x="${bx}" y="${topY}" width="${bw}" height="${bh}" rx="${bw / 2.6}"
          fill="${body}" stroke="#120a1c" stroke-width="1.2"/>
    <rect x="${bx + 1.6}" y="${topY + 3}" width="1.8" height="${bh - 8}" rx="0.9"
          fill="#ffffff" opacity="0.55"/>
    <rect x="${bx + 2}" y="${topY + bh * 0.45}" width="${bw - 4}" height="${bh * 0.5}" rx="2"
          fill="#000" opacity="0.18"/>`;
}

const BG = `
  <g clip-path="url(#bkClip)">
    <!-- 后墙渐变 -->
    <rect x="6" y="6" width="308" height="308" fill="url(#bkWall)"/>
    <!-- 顶部霓虹灯管（粉），带辉光 + 锐芯 -->
    <rect x="54" y="30" width="212" height="9" rx="4.5" fill="#ff2d78"
          opacity="0.5" filter="url(#bkGlow)"/>
    <rect x="60" y="33" width="200" height="3" rx="1.5" fill="#ffd7e6"/>
    <!-- 顶层板 + 层下青色辉光 -->
    <rect x="14" y="150" width="292" height="8" fill="#150c22"/>
    <rect x="14" y="150" width="292" height="2" fill="#2de2ff" opacity="0.6" filter="url(#bkGlow)"/>
    <!-- 顶层立瓶（左右两侧，避开中央头部） -->
    ${bottle(40, 78, 22, 68, "#3ad08f", "#0f5a3a")}
    ${bottle(74, 92, 18, 54, "#a86bff", "#3a1f66")}
    ${bottle(246, 88, 18, 58, "#ffb648", "#8a5410")}
    ${bottle(280, 74, 22, 72, "#2de2ff", "#0f5a6a")}
    <!-- 第二层板（更低，作吧台后沿） -->
    <rect x="20" y="212" width="280" height="10" fill="#180e26"/>
    <rect x="20" y="212" width="280" height="2" fill="#ff2d78" opacity="0.45" filter="url(#bkGlow)"/>
    <!-- 二层小瓶（点缀，多在两侧，中间会被肩膀盖住） -->
    ${bottle(52, 170, 16, 42, "#ff2d78", "#7a1436")}
    ${bottle(268, 172, 16, 40, "#4be0c0", "#12564a")}
    <!-- 吧台前沿暗带 -->
    <rect x="6" y="256" width="308" height="58" fill="#120a1f" opacity="0.55"/>
    <!-- 内框霓虹描边 -->
    <rect x="9" y="9" width="302" height="302" rx="16" fill="none"
          stroke="#a86bff" stroke-width="2" opacity="0.5" filter="url(#bkGlow)"/>
    <rect x="9" y="9" width="302" height="302" rx="16" fill="none"
          stroke="#c9a8ff" stroke-width="1"/>
  </g>`;

export function createBartender(el, state = "idle") {
  if (!el) throw new Error("createBartender: 容器元素不存在");

  const uid = "bk" + Math.random().toString(36).slice(2, 7);
  el.innerHTML = `
<svg viewBox="0 0 320 320" class="${uid} bk-root bk-${state}"
     style="image-rendering:auto;display:block;width:100%;height:100%">
  <defs>
    <clipPath id="bkClip"><rect x="8" y="8" width="304" height="304" rx="18"/></clipPath>
    <linearGradient id="bkWall" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2a1440"/>
      <stop offset="0.5" stop-color="#1d1030"/>
      <stop offset="1" stop-color="#120a1f"/>
    </linearGradient>
    <filter id="bkGlow" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="3"/>
    </filter>
  </defs>
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
      transform-origin: 256px 120px;
      animation: ${uid}-tilt 1.6s ease-in-out infinite;
    }
    @keyframes ${uid}-tilt { 0%,100% {transform:rotate(24deg)} 50% {transform:rotate(34deg)} }
    .${uid}.bk-pour .bk-stream {
      transform-origin: 263px 118px;
      animation: ${uid}-stream 0.8s ease-in-out infinite;
    }
    @keyframes ${uid}-stream { 0%,100% {transform:scaleY(0.75)} 50% {transform:scaleY(1)} }

    /* 呼吸感：整体极缓慢起伏（所有状态） */
    .${uid} .bk-body { animation: ${uid}-breath 3.4s ease-in-out infinite; }
    @keyframes ${uid}-breath { 0%,100% {transform:translateY(0)} 50% {transform:translateY(2px)} }
  </style>

  <g class="bk-bg">${BG}</g>

  <g class="bk-body" shape-rendering="crispEdges">
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
        ${px(16.0, 7.6, 0.4, 4.2, PAL.A)}
        ${px(15.9, 11.5, 0.6, 0.5, PAL.A)}
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
