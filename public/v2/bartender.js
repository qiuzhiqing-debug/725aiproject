/* ==========================================================================
   酒保「九八」立绘组件 R10（纯 SVG 矢量 · 黄铜老机器成精 · 原创角色）
   --------------------------------------------------------------------------
   形象规格来源：docs/STORY-BIBLE.md §3.2 / §3.3（硬约束，逐条对照）

     · 材质 = 黄铜/暖铜 + 木质感的老式机器 —— 像酒馆里用了三十年的
       咖啡机/点唱机成的精。**禁白色科技感**：全身没有一块冷白塑料，
       金属一律走 #f2d79b→#c99a4e→#43301a 的黄铜梯度，胸腔嵌深木板。
     · 剪影三要素 = 圆头 + 酒保马甲 + 天线顶一颗橄榄。
       —— 涂黑仍可认（剪影测试）：头是纯圆，肩是梯形马甲，天线是一根
       细杆顶一颗球。**禁方头**：头部只有一个 r=52 的正圆。
     · 表情 = 正经的呆：两颗圆眼「半垂」（上眼睑压下三分之一）+ 一条直线嘴。
       呆感来自过度认真，**禁卖萌**：没有腮红、没有星星眼、没有笑弧。
     · 镜头重点在动作不在脸：手上永远有活（擦杯 / 摇壶 / 倒酒）。
     · 三色纪律（IP-AND-ART-RESEARCH §一.2）：黄铜 + 马甲深酒红 + 橄榄绿，完。

   与 logo 的同源关系：天线顶那颗橄榄 = 马天尼杯 logo 里的那颗橄榄。
   用户先认识 logo，再认识他（签名道具已预埋）。

   状态（对外契约不变，签名一字未改）：
     idle → 眨眼 + 呼吸 + 手里擦杯    talk → 嘴部开合    pour → 举瓶倒酒
   用法：
     import { createBartender } from "./bartender.js";
     const bk = createBartender(document.querySelector("#slot"), "idle");
     bk.setState("talk");   // "idle" | "talk" | "pour"
   ========================================================================== */

// ---- 三色调色板（黄铜 / 马甲深酒红 / 橄榄绿），外加木与玻璃两种材质 ----
const P = {
  brassHi: "#f2d79b",   // 黄铜受光棱
  brass: "#c99a4e",     // 黄铜本体
  brassMid: "#a9793a",  // 黄铜中调
  brassDim: "#7c5729",  // 黄铜暗棱
  brassDeep: "#43301a", // 黄铜投影 / 缝隙
  vest: "#4a1d26",      // 马甲：深酒红（店里的绒布同源）
  vestHi: "#682c37",    // 马甲受光
  vestDim: "#2c1016",   // 马甲暗部
  olive: "#9aab52",     // 橄榄绿（与 logo 同源）
  oliveHi: "#c3d17c",
  oliveDim: "#5f6b2c",
  wood: "#4b2b19",      // 胸腔木板
  woodHi: "#7d4c29",
  woodDim: "#2b160c",
  glass: "#e9dcc4",     // 玻璃杯
  liquor: "#d98b33",    // 酒液
  ink: "#241009",       // 眼/嘴（不是纯黑：暖褐）
  shine: "#fff4dd",     // 高光
};

/* 后吧台背景：木层板 + 酒瓶剪影 + 一盏吊灯的光池。
   高精度背景 / 低调人物的关系保持（人物压在其上），但材质全部换成木与铜。 */
const BG = `
  <g clip-path="url(#nbClip)">
    <rect x="6" y="6" width="308" height="308" fill="url(#nbWall)"/>

    <!-- 吊灯：黄铜灯罩 + 锥形光池（画出来的光，不是滤镜）。
         刻意偏左：正对头顶会把天线上那颗橄榄压进灯罩里，剪影就废了。 -->
    <rect x="66.5" y="8" width="3" height="22" fill="${P.brassDim}"/>
    <path d="M40 56c0-16 12-26 28-26s28 10 28 26z" fill="url(#nbShade)"/>
    <ellipse cx="68" cy="56" rx="28" ry="4.5" fill="${P.brassHi}"/>
    <path d="M54 58 L82 58 L136 232 L4 232 Z" fill="url(#nbPool)"/>

    <!-- 顶层板 + 层下暖光 -->
    <rect x="10" y="128" width="300" height="9" fill="url(#nbPlank)"/>
    <rect x="10" y="128" width="300" height="2" fill="${P.brass}" opacity="0.8"/>
    <rect x="10" y="137" width="300" height="5" fill="#000" opacity="0.45"/>

    <!-- 顶层酒瓶剪影（避开中央头部；轮廓画出瓶颈/瓶肩/瓶身，不是圆角矩形） -->
    ${bottleSil(112, 66, 62, 17, 0.75)}
    ${bottleSil(138, 80, 48, 15, 0.6)}
    ${bottleSil(232, 70, 58, 18, 0.72)}
    ${bottleSil(262, 56, 72, 22, 0.86)}
    ${bottleSil(292, 76, 52, 17, 0.78)}

    <!-- 第二层板 = 吧台后沿 -->
    <rect x="14" y="214" width="292" height="10" fill="url(#nbPlank)"/>
    <rect x="14" y="214" width="292" height="2" fill="${P.brass}" opacity="0.6"/>

    <!-- 二层小瓶（两侧点缀，中间会被肩膀盖住） -->
    ${bottleSil(40, 176, 38, 15, 0.6)}
    ${bottleSil(286, 178, 36, 14, 0.6)}

    <!-- 吧台台面：木沿 + 黄铜压条（九八就站在这后面） -->
    <rect x="6" y="264" width="308" height="50" fill="${P.woodDim}"/>
    <rect x="6" y="264" width="308" height="7" fill="url(#nbBrass)"/>
    <rect x="6" y="276" width="308" height="1.5" fill="#000" opacity="0.4"/>

    <!-- 画框内侧黄铜细边 -->
    <rect x="9.5" y="9.5" width="301" height="301" rx="16" fill="none"
          stroke="${P.brassDim}" stroke-width="3"/>
    <rect x="12" y="12" width="296" height="296" rx="14" fill="none"
          stroke="${P.brassHi}" stroke-width="1" opacity="0.5"/>
  </g>`;

/* 一支立瓶的剪影：瓶口 + 瓶颈 + 收肩 + 瓶身，底边坐在层板上 */
function bottleSil(cx, topY, h, bw, op) {
  const nw = bw * 0.3;            // 瓶颈宽
  const neck = h * 0.34;          // 瓶颈长
  const sh = h * 0.14;            // 收肩高
  const bot = topY + h;
  return `<path d="M${cx - nw / 2} ${topY}
    L${cx + nw / 2} ${topY}
    L${cx + nw / 2} ${topY + neck}
    Q${cx + bw / 2} ${topY + neck + sh} ${cx + bw / 2} ${topY + neck + sh + 2}
    L${cx + bw / 2} ${bot}
    L${cx - bw / 2} ${bot}
    L${cx - bw / 2} ${topY + neck + sh + 2}
    Q${cx - bw / 2} ${topY + neck + sh} ${cx - nw / 2} ${topY + neck} Z"
    fill="#0d0709" opacity="${op}"/>
    <rect x="${cx - nw / 2 - 1.2}" y="${topY - 4}" width="${nw + 2.4}" height="4.5" rx="1.4" fill="#0d0709" opacity="${op}"/>
    <rect x="${cx - bw / 2 + 2}" y="${topY + neck + sh + 6}" width="1.6" height="${h * 0.34}" fill="${P.brassHi}" opacity="${op * 0.3}"/>`;
}

/* ---------- 九八本体（矢量绘制，不是像素格） ---------- */

// 身体：梯形马甲 + 圆肩 + 黄铜机身缝，胸口一块深木面板嵌着仪表
const BODY = `
  <!-- 身后的机身（黄铜筒身），肩膀是两个圆铆接件 -->
  <path d="M100 314 L110 230 Q112 214 130 210 L190 210 Q208 214 210 230 L220 314 Z"
        fill="url(#nbBody)" stroke="${P.brassDeep}" stroke-width="2.5"/>
  <!-- 马甲：深酒红，V 领，两片前襟 -->
  <path d="M114 314 L121 228 Q123 216 138 213 L160 246 L182 213 Q197 216 199 228 L206 314 Z"
        fill="${P.vest}" stroke="${P.vestDim}" stroke-width="2.5"/>
  <path d="M121 228 Q123 216 138 213 L160 246 L150 314 L116 314 Z" fill="${P.vestHi}" opacity="0.55"/>
  <!-- 马甲三颗黄铜扣 -->
  <circle cx="160" cy="268" r="4.2" fill="${P.brass}" stroke="${P.brassDeep}" stroke-width="1"/>
  <circle cx="160" cy="288" r="4.2" fill="${P.brass}" stroke="${P.brassDeep}" stroke-width="1"/>
  <circle cx="160" cy="308" r="4.2" fill="${P.brass}" stroke="${P.brassDeep}" stroke-width="1"/>
  <!-- 领结（橄榄绿，第三色的第二次出场） -->
  <path d="M160 218 L143 210 L143 228 Z" fill="${P.olive}" stroke="${P.oliveDim}" stroke-width="1.5"/>
  <path d="M160 218 L177 210 L177 228 Z" fill="${P.olive}" stroke="${P.oliveDim}" stroke-width="1.5"/>
  <circle cx="160" cy="219" r="3.4" fill="${P.oliveDim}"/>
  <!-- 胸口木面板 + 老式压力表（三十年的机器该有的零件） -->
  <rect x="196" y="246" width="30" height="34" rx="4" fill="${P.wood}" stroke="${P.brassDim}" stroke-width="2"/>
  <circle cx="211" cy="260" r="8" fill="${P.brassDeep}" stroke="${P.brass}" stroke-width="1.6"/>
  <path d="M211 260 L215 255" stroke="${P.oliveHi}" stroke-width="1.6" stroke-linecap="round"/>
  <rect x="202" y="272" width="18" height="3" rx="1.5" fill="${P.brassDim}"/>
  <!-- 肩铆钉 -->
  <circle cx="120" cy="224" r="8" fill="url(#nbRivet)" stroke="${P.brassDeep}" stroke-width="1.5"/>
  <circle cx="200" cy="224" r="8" fill="url(#nbRivet)" stroke="${P.brassDeep}" stroke-width="1.5"/>`;

// 脖子：一节黄铜伸缩管（老机器的关节）
const NECK = `
  <rect x="151" y="160" width="18" height="50" rx="4" fill="url(#nbNeck)" stroke="${P.brassDeep}" stroke-width="2"/>
  <rect x="148" y="168" width="24" height="4" rx="2" fill="${P.brassDim}"/>
  <rect x="148" y="180" width="24" height="4" rx="2" fill="${P.brassDim}"/>
  <rect x="148" y="192" width="24" height="4" rx="2" fill="${P.brassDim}"/>`;

// 头：一个正圆（剪影测试的第一要素）。面板是深色玻璃罩，五官画在罩上。
const HEAD = `
  <!-- 圆头本体：r=42，比身体窄一圈 —— 圣经要的是「小头 + 半身 + 动作」 -->
  <circle cx="160" cy="124" r="42" fill="url(#nbHead)" stroke="${P.brassDeep}" stroke-width="3"/>
  <!-- 头顶那道被摸了三十年的包浆亮弧 -->
  <path d="M131 98 A42 42 0 0 1 181 88" fill="none" stroke="${P.brassHi}" stroke-width="4.5"
        stroke-linecap="round" opacity="0.75"/>
  <!-- 脸罩：深色玻璃（不是白色屏幕） -->
  <ellipse cx="160" cy="128" rx="30" ry="26" fill="${P.ink}" opacity="0.95"/>
  <ellipse cx="160" cy="128" rx="30" ry="26" fill="none" stroke="${P.brassDim}" stroke-width="2.6"/>
  <!-- 玻璃罩上的一道反光（斜的，说明灯在他左上方） -->
  <path d="M141 113 Q149 107 158 109" fill="none" stroke="${P.shine}" stroke-width="2.6"
        stroke-linecap="round" opacity="0.28"/>
  <!-- 两侧螺丝 -->
  <circle cx="123" cy="128" r="4.4" fill="url(#nbRivet)" stroke="${P.brassDeep}" stroke-width="1.3"/>
  <circle cx="197" cy="128" r="4.4" fill="url(#nbRivet)" stroke="${P.brassDeep}" stroke-width="1.3"/>`;

// 天线 + 橄榄（签名道具：logo 里那颗橄榄就是他）
const ANTENNA = `
  <rect x="158" y="52" width="4" height="34" rx="2" fill="url(#nbNeck)"/>
  <circle cx="160" cy="86" r="4.4" fill="${P.brass}" stroke="${P.brassDeep}" stroke-width="1.3"/>
  <!-- 橄榄：椭球 + 红心（= 马天尼杯 logo 里那颗，签名道具） -->
  <ellipse cx="160" cy="42" rx="10" ry="12" fill="${P.olive}" stroke="${P.oliveDim}" stroke-width="2"/>
  <ellipse cx="156.4" cy="37.5" rx="3" ry="4" fill="${P.oliveHi}" opacity="0.85"/>
  <ellipse cx="160" cy="42" rx="3.3" ry="4" fill="#c8324f"/>`;

/* ---- 五官（状态层）：正经的呆 ----
   眼：两颗圆眼，上眼睑压下约 1/3 = 半垂；瞳是暖琥珀（机器亮着但不刺眼）。
   嘴：一条直线，端点方头，绝不上扬。 */
const EYES_OPEN = `
  <g>
    <circle cx="147" cy="127" r="8" fill="${P.brassHi}"/>
    <circle cx="147" cy="128.5" r="4.4" fill="${P.brassDeep}"/>
    <circle cx="173" cy="127" r="8" fill="${P.brassHi}"/>
    <circle cx="173" cy="128.5" r="4.4" fill="${P.brassDeep}"/>
    <!-- 上眼睑压到眼球一半：这一笔就是「过度认真的呆」，不是萌 -->
    <rect x="138" y="115" width="18" height="12.5" fill="${P.ink}"/>
    <rect x="164" y="115" width="18" height="12.5" fill="${P.ink}"/>
    <!-- 眼睑下缘那道铜边（机械感的眼皮） -->
    <rect x="139" y="126" width="16" height="1.6" rx="0.8" fill="${P.brassDim}"/>
    <rect x="165" y="126" width="16" height="1.6" rx="0.8" fill="${P.brassDim}"/>
  </g>`;
const EYES_SHUT = `
  <g>
    <rect x="139" y="126" width="16" height="3" rx="1.5" fill="${P.brassDim}"/>
    <rect x="165" y="126" width="16" height="3" rx="1.5" fill="${P.brassDim}"/>
  </g>`;

// 嘴：一条直线（默认）/ 说话时张成一条窄缝
const MOUTH_IDLE = `<rect x="148" y="145" width="24" height="4.4" rx="1.4" fill="${P.brass}"/>`;
const MOUTH_OPEN = `<rect x="150" y="142" width="20" height="9" rx="2.6" fill="${P.brassDeep}"/>
                    <rect x="150" y="142" width="20" height="2.6" rx="1.3" fill="${P.brass}"/>`;

/* ---- idle：左手擦杯（镜头重点在动作） ---- */
const IDLE_ARM = `
  <!-- 被擦的玻璃杯（先画，手压在它上面） -->
  <g class="bk-wipe-glass">
    <path d="M62 226 L92 226 L88 276 Q86 283 77 283 Q68 283 66 276 Z"
          fill="${P.glass}" opacity="0.26" stroke="${P.glass}" stroke-width="2.4"/>
    <rect x="68" y="232" width="3" height="34" rx="1.5" fill="${P.shine}" opacity="0.55"/>
  </g>
  <g class="bk-wipe">
    <!-- 大臂→小臂：一根从肩画下来的黄铜臂（不是悬空的手） -->
    <path d="M120 226 L96 244" stroke="${P.brassDim}" stroke-width="19" stroke-linecap="round"/>
    <path d="M120 226 L96 244" stroke="url(#nbNeck)" stroke-width="14" stroke-linecap="round"/>
    <!-- 手 -->
    <circle cx="90" cy="248" r="10" fill="${P.brass}" stroke="${P.brassDeep}" stroke-width="2"/>
    <!-- 擦杯布 -->
    <path d="M80 240 Q66 246 70 262 Q82 262 88 252 Z" fill="${P.glass}" opacity="0.8"/>
  </g>`;

/* ---- pour：右手举瓶倒酒 ---- */
const POUR_ARM = `
  <path d="M200 226 L238 232" stroke="${P.brassDeep}" stroke-width="19" stroke-linecap="round"/>
  <path d="M200 226 L238 232" stroke="url(#nbNeck)" stroke-width="14" stroke-linecap="round"/>
  <circle cx="242" cy="230" r="10" fill="${P.brass}" stroke="${P.brassDeep}" stroke-width="2"/>`;
const POUR_BOTTLE = `
  <g>
    <path d="M232 176 L246 176 L246 196 Q254 202 254 210 L254 236 L224 236 L224 210 Q224 202 232 196 Z"
          fill="${P.oliveDim}" stroke="${P.brassDeep}" stroke-width="2"/>
    <rect x="230.5" y="168" width="17" height="9" rx="2.5" fill="${P.brass}"/>
    <rect x="229" y="204" width="3.2" height="24" rx="1.6" fill="${P.shine}" opacity="0.45"/>
    <rect x="228" y="214" width="22" height="12" rx="2" fill="${P.brassHi}" opacity="0.9"/>
  </g>`;
const POUR_GLASS = `
  <path d="M212 268 L248 268 L243 306 Q241 312 230 312 Q219 312 217 306 Z"
        fill="${P.glass}" opacity="0.28" stroke="${P.glass}" stroke-width="2"/>
  <path d="M215 288 L245 288 L243 306 Q241 312 230 312 Q219 312 217 306 Z" fill="${P.liquor}" opacity="0.85"/>`;

export function createBartender(el, state = "idle") {
  if (!el) throw new Error("createBartender: 容器元素不存在");

  const uid = "bk" + Math.random().toString(36).slice(2, 7);
  // defs 的 id 全部带 uid 后缀（同页多个九八不会互相抢渐变）；
  // 下面用一次性正则把所有 url(#nbXxx) / id="nbXxx" 补上后缀，避免手写 replace 链。
  const svgMarkup = `
<svg viewBox="0 0 320 320" class="${uid} bk-root bk-${state}"
     style="display:block;width:100%;height:100%">
  <defs>
    <clipPath id="nbClip"><rect x="8" y="8" width="304" height="304" rx="18"/></clipPath>
    <linearGradient id="nbWall" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#120b0e"/>
      <stop offset="0.42" stop-color="#301c1e"/>
      <stop offset="1" stop-color="#180e12"/>
    </linearGradient>
    <linearGradient id="nbPlank" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${P.woodHi}"/>
      <stop offset="1" stop-color="${P.woodDim}"/>
    </linearGradient>
    <linearGradient id="nbBrass" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${P.brassHi}"/>
      <stop offset="0.5" stop-color="${P.brass}"/>
      <stop offset="1" stop-color="${P.brassDim}"/>
    </linearGradient>
    <linearGradient id="nbShade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${P.brassDim}"/>
      <stop offset="0.6" stop-color="${P.brass}"/>
      <stop offset="1" stop-color="${P.brassHi}"/>
    </linearGradient>
    <linearGradient id="nbPool" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffd39a" stop-opacity="0.4"/>
      <stop offset="1" stop-color="#e8a75c" stop-opacity="0"/>
    </linearGradient>
    <!-- 黄铜：一亮棱一暗棱，斜着打光 = 金属感的全部秘密 -->
    <linearGradient id="nbHead" x1="0.12" y1="0" x2="0.88" y2="1">
      <stop offset="0" stop-color="${P.brassHi}"/>
      <stop offset="0.3" stop-color="${P.brass}"/>
      <stop offset="0.62" stop-color="${P.brassMid}"/>
      <stop offset="1" stop-color="${P.brassDim}"/>
    </linearGradient>
    <linearGradient id="nbBody" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${P.brassDim}"/>
      <stop offset="0.22" stop-color="${P.brass}"/>
      <stop offset="0.4" stop-color="${P.brassHi}"/>
      <stop offset="0.66" stop-color="${P.brassMid}"/>
      <stop offset="1" stop-color="${P.brassDeep}"/>
    </linearGradient>
    <linearGradient id="nbNeck" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${P.brassHi}"/>
      <stop offset="0.42" stop-color="${P.brass}"/>
      <stop offset="1" stop-color="${P.brassDim}"/>
    </linearGradient>
    <radialGradient id="nbRivet" cx="0.34" cy="0.28" r="0.8">
      <stop offset="0" stop-color="${P.brassHi}"/>
      <stop offset="0.5" stop-color="${P.brass}"/>
      <stop offset="1" stop-color="${P.brassDeep}"/>
    </radialGradient>
  </defs>
  <style>
    .${uid} .bk-eyes-shut, .${uid} .bk-mouth-open,
    .${uid} .bk-pour-layer { visibility: hidden; }
    .${uid} .bk-idle-layer { visibility: visible; }
    .${uid}.bk-pour .bk-idle-layer { visibility: hidden; }

    /* idle：眨眼循环（4s 里合眼 0.24s）——机器眨眼比人慢半拍，更呆 */
    .${uid}.bk-idle .bk-eyes-open { animation: ${uid}-blinkA 4s step-end infinite; }
    .${uid}.bk-idle .bk-eyes-shut { animation: ${uid}-blinkB 4s step-end infinite; }
    @keyframes ${uid}-blinkA { 0%,93.9% {visibility:visible} 94%,99.9% {visibility:hidden} 100%{visibility:visible} }
    @keyframes ${uid}-blinkB { 0%,93.9% {visibility:hidden} 94%,99.9% {visibility:visible} 100%{visibility:hidden} }

    /* idle：手里那只杯永远在擦（镜头重点在动作不在脸） */
    .${uid}.bk-idle .bk-wipe {
      transform-origin: 120px 226px;
      animation: ${uid}-wipe 2.2s ease-in-out infinite;
    }
    @keyframes ${uid}-wipe {
      0%,100% { transform: translateY(0) rotate(0deg); }
      50%     { transform: translateY(-7px) rotate(-5deg); }
    }

    /* talk：嘴开合 */
    .${uid}.bk-talk .bk-mouth-idle { animation: ${uid}-talkA 0.46s step-end infinite; }
    .${uid}.bk-talk .bk-mouth-open  { animation: ${uid}-talkB 0.46s step-end infinite; }
    @keyframes ${uid}-talkA { 0%,49% {visibility:visible} 50%,100% {visibility:hidden} }
    @keyframes ${uid}-talkB { 0%,49% {visibility:hidden} 50%,100% {visibility:visible} }

    /* pour：手臂层显示，瓶身倾倒，酒线伸缩 */
    .${uid}.bk-pour .bk-pour-layer { visibility: visible; }
    .${uid}.bk-pour .bk-bottle {
      transform-origin: 242px 230px;
      animation: ${uid}-tilt 1.6s ease-in-out infinite;
    }
    @keyframes ${uid}-tilt { 0%,100% {transform:rotate(96deg)} 50% {transform:rotate(112deg)} }
    .${uid}.bk-pour .bk-stream {
      transform-origin: 232px 246px;
      animation: ${uid}-stream 0.8s ease-in-out infinite;
    }
    @keyframes ${uid}-stream { 0%,100% {transform:scaleY(0.8)} 50% {transform:scaleY(1)} }

    /* 天线上的橄榄：极缓的一点晃（他自己不知道） */
    .${uid} .bk-antenna {
      transform-origin: 160px 92px;
      animation: ${uid}-ant 5.2s ease-in-out infinite;
    }
    @keyframes ${uid}-ant { 0%,100% {transform:rotate(-2.4deg)} 50% {transform:rotate(2.4deg)} }

    /* 呼吸感：老机器的液压起伏（所有状态） */
    .${uid} .bk-body { animation: ${uid}-breath 3.4s ease-in-out infinite; }
    @keyframes ${uid}-breath { 0%,100% {transform:translateY(0)} 50% {transform:translateY(2px)} }

    @media (prefers-reduced-motion: reduce) {
      .${uid} * { animation: none !important; }
    }
  </style>

  <g class="bk-bg" clip-path="url(#nbClip)">${BG}</g>

  <g class="bk-body">
    ${BODY}
    ${NECK}

    <!-- idle：擦杯（pour 时整层隐藏，手要去拿瓶子） -->
    <g class="bk-idle-layer">
      ${IDLE_ARM}
    </g>

    <g class="bk-antenna">${ANTENNA}</g>
    ${HEAD}

    <g class="bk-eyes-open">${EYES_OPEN}</g>
    <g class="bk-eyes-shut">${EYES_SHUT}</g>
    <g class="bk-mouth-idle">${MOUTH_IDLE}</g>
    <g class="bk-mouth-open">${MOUTH_OPEN}</g>

    <g class="bk-pour-layer">
      ${POUR_GLASS}
      ${POUR_ARM}
      <g class="bk-bottle">${POUR_BOTTLE}</g>
      <g class="bk-stream">
        <rect x="230" y="246" width="4" height="34" rx="2" fill="${P.liquor}"/>
        <ellipse cx="232" cy="282" rx="6" ry="3" fill="${P.liquor}" opacity="0.7"/>
      </g>
    </g>
  </g>
</svg>`;

  // 同页多实例隔离：id="nbXxx" → id="nbXxx-uid"，url(#nbXxx) → url(#nbXxx-uid)
  el.innerHTML = svgMarkup
    .replace(/id="(nb[A-Za-z]+)"/g, (m, id) => `id="${id}-${uid}"`)
    .replace(/url\(#(nb[A-Za-z]+)\)/g, (m, id) => `url(#${id}-${uid})`);

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
