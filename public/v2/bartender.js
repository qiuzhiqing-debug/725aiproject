/* ==========================================================================
   酒保「雪克」立绘组件 R12（纯 SVG 矢量 · 木质老机器成精 · 原创角色）
   --------------------------------------------------------------------------
   形象规格来源：docs/STORY-BIBLE.md §3.2 / §3.3（硬约束，逐条对照）

     · 材质 v2（Kim 2026-08-08 定）= **暖木质为主 + 黄铜只做关节点缀**。
       雪克是全场唯一最适合木质的东西 —— 头壳、机身、手臂主面全部是
       车出来的实木（nbWood 系渐变 + 木纹刻线）；黄铜退到**关节、铆钉、
       箍环、扣子、仪表框**这些"五金件"上。禁白色科技感不变。
     · **机身必须完全不透明（R12 修 bug）**：Kim 手机实测「雪克是透明的，
       有点吓人」。根因见下方 §透明根因。本文件里人物层
       （bk-body 及其子层）**一律 opacity=1 / fill-opacity=1**，
       只有"玻璃杯"和"高光"两类光学物件才允许半透明，且都不在剪影上。
     · 剪影三要素 = 圆头 + 酒保马甲 + 天线顶一颗橄榄（原样保留）。
     · 表情规格 v2 = 两颗圆睁的完整圆眼 + 一条放松的短线嘴（原样保留）。
       禁苦相、禁卖萌、禁方头。
     · 三色纪律：木 + 马甲深酒红 + 橄榄绿，黄铜作为五金第四色（点缀量）。

   §透明根因（R12 排查结论）
     旧版脸罩写的是 `fill="#1a1226" opacity="0.95"`。#1a1226 正好是全站
     背景「深夜紫黑 #14101f」的同族色 —— 一块**和背景同色、还带 5% 透明**
     的椭圆嵌在头中央，眼睛和嘴悬浮其上，视觉上就是「头上开了个洞、
     能看见后面的墙」= 透明 + 吓人。
     修法：脸罩换成**深烤木色 #241408（与紫黑背景明确拉开色相）**、
     opacity 去掉（=1）、外加黄铜围圈 + 内圈投影，读作"嵌进头里的深色
     玻璃面板"，不再是洞。同时把机身/头壳/手臂上所有 <1 的 opacity
     （旧版靠半透明叠色做旧）改成实色，杜绝任何背景透过人物。

   状态（对外契约不变）：
     idle → 眨眼 + 呼吸 + 手里擦杯    talk → 嘴部开合    pour → 举瓶倒酒
   用法：
     import { createBartender } from "./bartender.js";
     const bk = createBartender(document.querySelector("#slot"), "idle");
     bk.setState("talk");                       // "idle" | "talk" | "pour"
     // R12 新增可选项（不传 = 旧行为，cocktail 页不受影响）：
     createBartender(el, "idle", { scene: false });  // 不画后吧台画框，
     //   人物直接站进页面自己的场景里（大厅用这个）
   ========================================================================== */

// ---- 调色板：木为主 / 黄铜为五金 / 马甲深酒红 / 橄榄绿 ----
const P = {
  // 木（R12 主材质）：从受光棱到投影五档，够画出车削的圆柱体
  woodHi: "#d19a5c",    // 木受光棱（灯打上去那一条）
  wood: "#a86f38",      // 木本体
  woodMid: "#8a5729",   // 木中调
  woodDim: "#603a1a",   // 木暗棱
  woodDeep: "#33190a",  // 木投影 / 缝隙
  grain: "#4a2a11",     // 木纹刻线

  // 黄铜：只用在关节 / 铆钉 / 箍环 / 扣子 / 仪表框
  brassHi: "#f2d79b",
  brass: "#c99a4e",
  brassMid: "#a9793a",
  brassDim: "#7c5729",
  brassDeep: "#43301a",

  vest: "#4a1d26",      // 马甲：深酒红（店里的绒布同源）
  vestHi: "#682c37",
  vestDim: "#2c1016",
  olive: "#9aab52",     // 橄榄绿（与 logo 同源）
  oliveHi: "#c3d17c",
  oliveDim: "#5f6b2c",

  face: "#4a2c14",      // 脸罩受光（深烤木 —— **不是背景色，不透明**）
  faceDim: "#2a1708",   // 脸罩暗部
  faceEdge: "#1c1006",  // 脸罩内圈投影
  glass: "#e9dcc4",     // 玻璃杯（唯一允许半透明的物件）
  liquor: "#d98b33",    // 酒液
  shine: "#fff4dd",     // 高光

  // 场景光（只给他身后的墙，人物本身不受影响）
  neonPink: "#ff2d78",
  neonPinkSoft: "#ff9ec4",
  neonViolet: "#a24bff",
  neonCyan: "#2de2ff",
};

/* 后吧台背景（scene=true 时才画）：木层板 + 酒瓶剪影 + 霓虹洗墙 + 画框。
   cocktail 页把他当"带框头像"用，这层是他的画框；大厅页 scene=false。 */
const BG = `
  <g clip-path="url(#nbClip)">
    <rect x="6" y="6" width="308" height="308" fill="url(#nbWall)"/>

    <!-- 霓虹洗墙：粉从右上、紫从左下 -->
    <ellipse cx="252" cy="46" rx="150" ry="112" fill="url(#nbWashPink)"/>
    <ellipse cx="48" cy="250" rx="140" ry="120" fill="url(#nbWashViolet)"/>

    <!-- 后墙霓虹小招牌（粉管外框 + 青管一条） -->
    <g>
      <rect x="200" y="20" width="98" height="30" rx="15" fill="none"
            stroke="${P.neonPink}" stroke-width="10" opacity="0.14"/>
      <rect x="200" y="20" width="98" height="30" rx="15" fill="none"
            stroke="${P.neonPink}" stroke-width="4" opacity="0.6"/>
      <rect x="200" y="20" width="98" height="30" rx="15" fill="none"
            stroke="${P.neonPinkSoft}" stroke-width="1.5"/>
      <path d="M216 35 L232 35 M240 27 L240 43 M248 35 L264 35 M272 27 L272 43"
            fill="none" stroke="${P.neonCyan}" stroke-width="5" opacity="0.2"
            stroke-linecap="round"/>
      <path d="M216 35 L232 35 M240 27 L240 43 M248 35 L264 35 M272 27 L272 43"
            fill="none" stroke="${P.neonCyan}" stroke-width="2" opacity="0.95"
            stroke-linecap="round"/>
    </g>

    <!-- 吧台小台灯：黄铜灯罩 + 锥形光池（琥珀是点缀不是主光）。
         刻意偏左：正对头顶会把天线上那颗橄榄压进灯罩里，剪影就废了。 -->
    <rect x="66.5" y="8" width="3" height="22" fill="${P.brassDim}"/>
    <path d="M40 56c0-16 12-26 28-26s28 10 28 26z" fill="url(#nbShade)"/>
    <ellipse cx="68" cy="56" rx="28" ry="4.5" fill="${P.brassHi}"/>
    <path d="M54 58 L82 58 L136 232 L4 232 Z" fill="url(#nbPool)"/>

    <!-- 顶层板 + 层下暖光 -->
    <rect x="10" y="128" width="300" height="9" fill="url(#nbPlank)"/>
    <rect x="10" y="128" width="300" height="2" fill="${P.brass}" opacity="0.8"/>
    <rect x="10" y="137" width="300" height="5" fill="#000" opacity="0.45"/>

    <!-- 顶层酒瓶剪影（避开中央头部） -->
    ${bottleSil(112, 66, 62, 17, 0.75)}
    ${bottleSil(138, 80, 48, 15, 0.6)}
    ${bottleSil(232, 70, 58, 18, 0.72)}
    ${bottleSil(262, 56, 72, 22, 0.86)}
    ${bottleSil(292, 76, 52, 17, 0.78)}

    <!-- 第二层板 = 吧台后沿 -->
    <rect x="14" y="214" width="292" height="10" fill="url(#nbPlank)"/>
    <rect x="14" y="214" width="292" height="2" fill="${P.brass}" opacity="0.6"/>

    <!-- 二层小瓶（两侧点缀） -->
    ${bottleSil(40, 176, 38, 15, 0.6)}
    ${bottleSil(286, 178, 36, 14, 0.6)}

    <!-- 吧台台面：木沿 + 黄铜压条 -->
    <rect x="6" y="264" width="308" height="50" fill="${P.woodDeep}"/>
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

/* ---------- 雪克本体（矢量绘制 · 全实色，不许有一块半透明） ---------- */

// 身体：车削木桶机身 + 梯形马甲；肩铆钉/扣子/仪表框走黄铜
const BODY = `
  <!-- 木机身（实色，不透明）：这是他的"身体"，不是背景 -->
  <path d="M100 314 L110 230 Q112 214 130 210 L190 210 Q208 214 210 230 L220 314 Z"
        fill="url(#nbBody)" stroke="${P.woodDeep}" stroke-width="2.5"/>
  <!-- 木纹：三道顺着桶身的刻线（实色细线，不是半透明叠色） -->
  <path d="M118 224 Q116 268 112 312" fill="none" stroke="${P.grain}" stroke-width="1.6" stroke-linecap="round"/>
  <path d="M203 224 Q205 268 209 312" fill="none" stroke="${P.grain}" stroke-width="1.6" stroke-linecap="round"/>
  <!-- 腰上一道黄铜箍（五金件） -->
  <rect x="106" y="286" width="108" height="7" fill="url(#nbBrass)"/>
  <rect x="106" y="292" width="108" height="1.6" fill="${P.brassDeep}"/>

  <!-- 马甲：深酒红，V 领，两片前襟（实色） -->
  <path d="M114 314 L121 228 Q123 216 138 213 L160 246 L182 213 Q197 216 199 228 L206 314 Z"
        fill="${P.vest}" stroke="${P.vestDim}" stroke-width="2.5"/>
  <path d="M121 228 Q123 216 138 213 L160 246 L150 314 L116 314 Z" fill="${P.vestHi}"/>
  <!-- 马甲三颗黄铜扣 -->
  <circle cx="160" cy="268" r="4.2" fill="${P.brass}" stroke="${P.brassDeep}" stroke-width="1"/>
  <circle cx="160" cy="288" r="4.2" fill="${P.brass}" stroke="${P.brassDeep}" stroke-width="1"/>
  <circle cx="160" cy="308" r="4.2" fill="${P.brass}" stroke="${P.brassDeep}" stroke-width="1"/>
  <!-- 领结（橄榄绿，第三色的第二次出场） -->
  <path d="M160 218 L143 210 L143 228 Z" fill="${P.olive}" stroke="${P.oliveDim}" stroke-width="1.5"/>
  <path d="M160 218 L177 210 L177 228 Z" fill="${P.olive}" stroke="${P.oliveDim}" stroke-width="1.5"/>
  <circle cx="160" cy="219" r="3.4" fill="${P.brass}" stroke="${P.brassDeep}" stroke-width="1"/>
  <!-- 胸口老式压力表：黄铜表框嵌在木面板上（三十年的机器该有的零件） -->
  <rect x="196" y="246" width="30" height="34" rx="4" fill="${P.woodMid}" stroke="${P.brassDim}" stroke-width="2"/>
  <circle cx="211" cy="260" r="8" fill="${P.brassDeep}" stroke="${P.brass}" stroke-width="1.6"/>
  <path d="M211 260 L215 255" stroke="${P.oliveHi}" stroke-width="1.6" stroke-linecap="round"/>
  <rect x="202" y="272" width="18" height="3" rx="1.5" fill="${P.brassDim}"/>
  <!-- 肩关节：黄铜铆接件（关节 = 黄铜，这是材质分工的核心） -->
  <circle cx="120" cy="224" r="8" fill="url(#nbRivet)" stroke="${P.brassDeep}" stroke-width="1.5"/>
  <circle cx="200" cy="224" r="8" fill="url(#nbRivet)" stroke="${P.brassDeep}" stroke-width="1.5"/>`;

// 脖子：一节黄铜伸缩管（老机器的关节 —— 关节归黄铜）
const NECK = `
  <rect x="151" y="160" width="18" height="50" rx="4" fill="url(#nbNeck)" stroke="${P.brassDeep}" stroke-width="2"/>
  <rect x="148" y="168" width="24" height="4" rx="2" fill="${P.brassDim}"/>
  <rect x="148" y="180" width="24" height="4" rx="2" fill="${P.brassDim}"/>
  <rect x="148" y="192" width="24" height="4" rx="2" fill="${P.brassDim}"/>`;

/* 头：一个正圆的**实木头壳**（剪影测试的第一要素）。
   脸罩是嵌进去的深色木面板，实色不透明 —— R12 透明 bug 的修复点。 */
const HEAD = `
  <!-- 圆头本体：r=42 实木车削，比身体窄一圈 -->
  <circle cx="160" cy="124" r="42" fill="url(#nbHead)" stroke="${P.woodDeep}" stroke-width="3"/>
  <!-- 木纹：头壳上两道顺着球面的年轮 -->
  <path d="M124 106 A42 42 0 0 0 128 152" fill="none" stroke="${P.grain}" stroke-width="1.5" stroke-linecap="round"/>
  <path d="M196 106 A42 42 0 0 1 192 152" fill="none" stroke="${P.grain}" stroke-width="1.5" stroke-linecap="round"/>
  <!-- 头顶那道被摸了三十年的包浆亮弧（实色木高光，不是半透明白） -->
  <path d="M131 98 A42 42 0 0 1 181 88" fill="none" stroke="${P.woodHi}" stroke-width="4.5"
        stroke-linecap="round"/>
  <!-- 脸罩底：实色深烤木渐变（上亮下暗＝有厚度的面板），杜绝任何背景透出来 -->
  <ellipse cx="160" cy="128" rx="30" ry="26" fill="url(#nbFace)"/>
  <!-- 脸罩内圈投影：说明它是「嵌进头里的面板」，不是一个洞 -->
  <ellipse cx="160" cy="128" rx="30" ry="26" fill="none" stroke="${P.faceEdge}" stroke-width="3.4"/>
  <!-- 脸罩黄铜围圈（五金件） -->
  <ellipse cx="160" cy="128" rx="31.5" ry="27.5" fill="none" stroke="${P.brassDim}" stroke-width="2.6"/>
  <ellipse cx="160" cy="128" rx="33" ry="29" fill="none" stroke="${P.brass}" stroke-width="1.2"/>
  <!-- 面板上的一道反光（斜的，说明灯在他左上方） -->
  <path d="M141 113 Q149 107 158 109" fill="none" stroke="${P.shine}" stroke-width="2.6"
        stroke-linecap="round" opacity="0.3"/>
  <!-- 两侧黄铜螺丝 -->
  <circle cx="123" cy="128" r="4.4" fill="url(#nbRivet)" stroke="${P.brassDeep}" stroke-width="1.3"/>
  <circle cx="197" cy="128" r="4.4" fill="url(#nbRivet)" stroke="${P.brassDeep}" stroke-width="1.3"/>`;

// 天线 + 橄榄（签名道具：logo 里那颗橄榄就是他）。杆=黄铜关节，橄榄=橄榄绿
const ANTENNA = `
  <rect x="158" y="52" width="4" height="34" rx="2" fill="url(#nbNeck)"/>
  <circle cx="160" cy="86" r="4.4" fill="${P.brass}" stroke="${P.brassDeep}" stroke-width="1.3"/>
  <ellipse cx="160" cy="42" rx="10" ry="12" fill="${P.olive}" stroke="${P.oliveDim}" stroke-width="2"/>
  <ellipse cx="156.4" cy="37.5" rx="3" ry="4" fill="${P.oliveHi}"/>
  <ellipse cx="160" cy="42" rx="3.3" ry="4" fill="#c8324f"/>`;

/* ---- 五官（状态层）：表情规格 v2「正经的呆」，一字未改 ----
     眼 = 两颗圆睁的完整圆眼，瞳孔居中不斜视，一点高光。没有眼睑压条。
     嘴 = 一条放松的短线，两端极轻微上扬（幅度 1.2px）。
   R12 只把配色从"黄铜白"换成"暖木白"，让它压在深烤木脸罩上仍然跳得出来。 */
const EYES_OPEN = `
  <g>
    <!-- 左眼：眼白 → 瞳孔 → 高光。整颗圆，不被任何东西压住 -->
    <circle cx="147" cy="127.5" r="9" fill="#f6e6c8" stroke="${P.woodDim}" stroke-width="1.4"/>
    <circle cx="147" cy="127.5" r="4.6" fill="${P.woodDeep}"/>
    <circle cx="144.6" cy="125" r="1.9" fill="${P.shine}"/>
    <!-- 右眼 -->
    <circle cx="173" cy="127.5" r="9" fill="#f6e6c8" stroke="${P.woodDim}" stroke-width="1.4"/>
    <circle cx="173" cy="127.5" r="4.6" fill="${P.woodDeep}"/>
    <circle cx="170.6" cy="125" r="1.9" fill="${P.shine}"/>
  </g>`;
const EYES_SHUT = `
  <g>
    <rect x="138" y="126" width="18" height="3.2" rx="1.6" fill="${P.brassHi}"/>
    <rect x="164" y="126" width="18" height="3.2" rx="1.6" fill="${P.brassHi}"/>
  </g>`;

// 嘴：放松的短线 + 极轻微上扬（默认）/ 说话时张成一条窄缝
const MOUTH_IDLE = `<path d="M150.5 147.2 Q160 149.6 169.5 147.2" fill="none"
                    stroke="${P.brassHi}" stroke-width="4" stroke-linecap="round"/>`;
const MOUTH_OPEN = `<rect x="150" y="142" width="20" height="9" rx="2.6" fill="${P.faceEdge}"/>
                    <rect x="150" y="142" width="20" height="2.6" rx="1.3" fill="${P.brassHi}"/>`;

/* ---- idle：左手擦杯（镜头重点在动作）。臂=实木，肘腕手=黄铜关节 ---- */
const IDLE_ARM = `
  <!-- 被擦的玻璃杯（唯一允许半透明的物件：它本来就是玻璃） -->
  <g class="bk-wipe-glass">
    <path d="M62 226 L92 226 L88 276 Q86 283 77 283 Q68 283 66 276 Z"
          fill="${P.glass}" opacity="0.26" stroke="${P.glass}" stroke-width="2.4"/>
    <rect x="68" y="232" width="3" height="34" rx="1.5" fill="${P.shine}" opacity="0.55"/>
  </g>
  <g class="bk-wipe">
    <!-- 大臂→小臂：一根从肩画下来的实木臂（不是悬空的手） -->
    <path d="M120 226 L96 244" stroke="${P.woodDeep}" stroke-width="19" stroke-linecap="round"/>
    <path d="M120 226 L96 244" stroke="url(#nbArm)" stroke-width="14" stroke-linecap="round"/>
    <!-- 腕关节箍（黄铜） -->
    <circle cx="99" cy="242" r="6.5" fill="url(#nbRivet)" stroke="${P.brassDeep}" stroke-width="1.4"/>
    <!-- 手（黄铜） -->
    <circle cx="90" cy="248" r="10" fill="${P.brass}" stroke="${P.brassDeep}" stroke-width="2"/>
    <!-- 擦杯布 -->
    <path d="M80 240 Q66 246 70 262 Q82 262 88 252 Z" fill="${P.glass}"/>
  </g>`;

/* ---- pour：右手举瓶倒酒 ---- */
const POUR_ARM = `
  <path d="M200 226 L238 232" stroke="${P.woodDeep}" stroke-width="19" stroke-linecap="round"/>
  <path d="M200 226 L238 232" stroke="url(#nbArm)" stroke-width="14" stroke-linecap="round"/>
  <circle cx="234" cy="231" r="6.5" fill="url(#nbRivet)" stroke="${P.brassDeep}" stroke-width="1.4"/>
  <circle cx="242" cy="230" r="10" fill="${P.brass}" stroke="${P.brassDeep}" stroke-width="2"/>`;
const POUR_BOTTLE = `
  <g>
    <path d="M232 176 L246 176 L246 196 Q254 202 254 210 L254 236 L224 236 L224 210 Q224 202 232 196 Z"
          fill="${P.oliveDim}" stroke="${P.brassDeep}" stroke-width="2"/>
    <rect x="230.5" y="168" width="17" height="9" rx="2.5" fill="${P.brass}"/>
    <rect x="229" y="204" width="3.2" height="24" rx="1.6" fill="${P.shine}" opacity="0.45"/>
    <rect x="228" y="214" width="22" height="12" rx="2" fill="${P.brassHi}"/>
  </g>`;
const POUR_GLASS = `
  <path d="M212 268 L248 268 L243 306 Q241 312 230 312 Q219 312 217 306 Z"
        fill="${P.glass}" opacity="0.28" stroke="${P.glass}" stroke-width="2"/>
  <path d="M215 288 L245 288 L243 306 Q241 312 230 312 Q219 312 217 306 Z" fill="${P.liquor}" opacity="0.85"/>`;

export function createBartender(el, state = "idle", opts = {}) {
  if (!el) throw new Error("createBartender: 容器元素不存在");
  // scene=true（默认，cocktail 页沿用）：连后吧台画框一起画，当"带框头像"用。
  // scene=false（大厅用）：只画人，站进页面自己画的酒吧场景里。
  const scene = opts.scene !== false;

  const uid = "bk" + Math.random().toString(36).slice(2, 7);
  // defs 的 id 全部带 uid 后缀（同页多个雪克不会互相抢渐变）
  const svgMarkup = `
<svg viewBox="0 0 320 320" class="${uid} bk-root bk-${state}${scene ? " bk-framed" : " bk-bare"}"
     style="display:block;width:100%;height:100%">
  <defs>
    <clipPath id="nbClip"><rect x="8" y="8" width="304" height="304" rx="18"/></clipPath>
    <linearGradient id="nbWall" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0e0b18"/>
      <stop offset="0.42" stop-color="#241a3a"/>
      <stop offset="1" stop-color="#14101f"/>
    </linearGradient>
    <radialGradient id="nbWashPink" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="${P.neonPink}" stop-opacity="0.4"/>
      <stop offset="0.55" stop-color="${P.neonPink}" stop-opacity="0.13"/>
      <stop offset="1" stop-color="${P.neonPink}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="nbWashViolet" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="${P.neonViolet}" stop-opacity="0.34"/>
      <stop offset="0.58" stop-color="${P.neonViolet}" stop-opacity="0.1"/>
      <stop offset="1" stop-color="${P.neonViolet}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="nbPlank" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${P.wood}"/>
      <stop offset="1" stop-color="${P.woodDeep}"/>
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
    <!-- 木：一亮棱一暗棱，斜着打光 = 车削实木的体积感 -->
    <linearGradient id="nbHead" x1="0.12" y1="0" x2="0.88" y2="1">
      <stop offset="0" stop-color="${P.woodHi}"/>
      <stop offset="0.28" stop-color="${P.wood}"/>
      <stop offset="0.62" stop-color="${P.woodMid}"/>
      <stop offset="1" stop-color="${P.woodDim}"/>
    </linearGradient>
    <linearGradient id="nbBody" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${P.woodDim}"/>
      <stop offset="0.2" stop-color="${P.woodMid}"/>
      <stop offset="0.4" stop-color="${P.woodHi}"/>
      <stop offset="0.66" stop-color="${P.wood}"/>
      <stop offset="1" stop-color="${P.woodDeep}"/>
    </linearGradient>
    <!-- 脸罩：实色深烤木，上受光下压暗。**没有 stop-opacity**，一点都不透 -->
    <linearGradient id="nbFace" x1="0.2" y1="0" x2="0.8" y2="1">
      <stop offset="0" stop-color="${P.face}"/>
      <stop offset="0.55" stop-color="${P.faceDim}"/>
      <stop offset="1" stop-color="${P.faceEdge}"/>
    </linearGradient>
    <linearGradient id="nbArm" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${P.woodHi}"/>
      <stop offset="0.45" stop-color="${P.wood}"/>
      <stop offset="1" stop-color="${P.woodDim}"/>
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

  ${scene ? `<g class="bk-bg" clip-path="url(#nbClip)">${BG}</g>` : ""}

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
