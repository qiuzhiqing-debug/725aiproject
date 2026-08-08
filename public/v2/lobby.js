/* ==========================================================================
   大厅 lobby.js —— R12「走过卡座」
   --------------------------------------------------------------------------
   整页是一间连续的店，从上往下：门头 → 酒柜 → 吧台 → 卡座 → 店规。
   本文件负责三件事：
     1) 把酒柜整面墙画出来（密集瓶群 + 像素小画相框 + 黑板价目牌 + 壁灯 + 霓虹招牌），
        全是"画出来的实体"：相框有框有挂钉有挂绳，黑板有木框有粉笔字，
        招牌有灯管有支架有电线 —— 没有一个裸文本框贴色。
     2) 卡座 = 纵向滚动的桌卡列表（每卡只放桌号 / 人数 / 状态三样，≥72px 可拇指点）。
        列表语义天然不封顶：/api/tables 返回几桌就渲染几桌。
     3) 沿用原有协议，一个字没改：
          GET  /api/tables            → { tables:[{ table, players, deck }] }
          POST /api/table/:n/join     → { code }   → /?room=CODE&table=N
          POST /api/room（兜底）       → { code }   → /?room=CODE
          GET  /api/room/:code        → 找朋友校验
          /?solo=1                    → 吧台单人位
   ========================================================================== */
import { createBartender } from "./bartender.js";

/* ========================================================================
   零、小工具：确定性伪随机（同一台设备刷新酒柜长得一样，不会每次抖）
   ======================================================================== */
function mulberry(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (rnd, arr) => arr[Math.floor(rnd() * arr.length)];

/* ========================================================================
   一、酒柜整面墙（SVG）
   ======================================================================== */
const W = 390;          // 画布宽（= 390 手机宽，1 单位 = 1px，尺寸所见即所得）
const H = 470;          // 画布高
const SHELF = [210, 300, 390];   // 三层层板的台面 y（瓶子底边坐在这上面）

// 木与铜（场景实体物件才配用木纹；UI 组件依然禁木纹）
const M = {
  woodHi: "#8a5a33", wood: "#5f3a1f", woodMid: "#4a2c17", woodDim: "#331d0e", woodDeep: "#1d1108",
  brassHi: "#e8c98f", brass: "#b08a4c", brassDim: "#6d5228", brassDeep: "#2f2413",
  slate: "#1b241f", slateHi: "#26332c", chalk: "#e6ead8", chalkDim: "#a9b39c",
  pink: "#ff2d78", pinkSoft: "#ff9ec4", cyan: "#2de2ff", violet: "#a24bff", amber: "#ffd39a",
};

// 瓶身色卡：六种酒的玻璃色（成排时按色系分组 → 满而不乱）
const BOTTLE_COLORS = [
  { g: "#1f3d2a", hi: "#3f7a52" },  // 深绿玻璃（金酒 / 香槟）
  { g: "#42260f", hi: "#8a5220" },  // 琥珀（威士忌）
  { g: "#2a1a2e", hi: "#5c3a63" },  // 紫黑（利口酒）
  { g: "#123040", hi: "#2a6a86" },  // 蓝玻璃（伏特加）
  { g: "#3d1220", hi: "#7d2a42" },  // 酒红（红酒）
  { g: "#3a3524", hi: "#7a7048" },  // 磨砂透明（朗姆）
];

/* 一支酒瓶：瓶口 + 瓶颈 + 收肩 + 瓶身 + 高光 + 纸标签 + 瓶盖（不是圆角矩形） */
function bottle(cx, baseY, h, bw, c, rnd) {
  const nw = Math.max(4, bw * 0.32);
  const neck = h * (0.3 + rnd() * 0.1);
  const sh = h * 0.13;
  const topY = baseY - h;
  const shoulderY = topY + neck;
  const labelH = Math.min(h * 0.26, 20);
  const labelY = baseY - labelH - h * 0.16;
  return `
    <g>
      <path d="M${cx - nw / 2} ${topY + 4}
        L${cx + nw / 2} ${topY + 4}
        L${cx + nw / 2} ${shoulderY}
        Q${cx + bw / 2} ${shoulderY + sh} ${cx + bw / 2} ${shoulderY + sh + 2}
        L${cx + bw / 2} ${baseY}
        L${cx - bw / 2} ${baseY}
        L${cx - bw / 2} ${shoulderY + sh + 2}
        Q${cx - bw / 2} ${shoulderY + sh} ${cx - nw / 2} ${shoulderY} Z"
        fill="${c.g}" stroke="#0b0710" stroke-width="1"/>
      <rect x="${cx - nw / 2 - 1.4}" y="${topY}" width="${nw + 2.8}" height="5" rx="1.6" fill="${M.brassDim}"/>
      <rect x="${cx - bw / 2 + 2.2}" y="${shoulderY + sh + 4}" width="${Math.max(1.6, bw * 0.12)}"
            height="${(baseY - shoulderY - sh) * 0.62}" rx="1" fill="${c.hi}"/>
      <rect x="${cx - bw / 2 + 1.4}" y="${labelY}" width="${bw - 2.8}" height="${labelH}" rx="1.5"
            fill="#d9cdb0" opacity="0.82"/>
      <rect x="${cx - bw / 2 + 3}" y="${labelY + labelH * 0.32}" width="${bw - 6}" height="1.4" fill="#6b5a3c"/>
      <rect x="${cx - bw / 2 + 3}" y="${labelY + labelH * 0.58}" width="${(bw - 6) * 0.6}" height="1.2" fill="#8b7a58"/>
    </g>`;
}

/* 一排酒瓶：铺满层板，按色系成组，高度错落但底边全部对齐 → 满而不乱 */
function bottleRow(baseY, x0, x1, rnd, hMin, hMax) {
  let out = "";
  let x = x0;
  let c = pick(rnd, BOTTLE_COLORS);
  let runLeft = 2 + Math.floor(rnd() * 3);
  while (x < x1 - 10) {
    if (runLeft-- <= 0) { c = pick(rnd, BOTTLE_COLORS); runLeft = 2 + Math.floor(rnd() * 3); }
    const bw = 11 + rnd() * 9;
    const h = hMin + rnd() * (hMax - hMin);
    if (x + bw > x1) break;
    out += bottle(x + bw / 2, baseY, h, bw, c, rnd);
    x += bw + 1 + rnd() * 4;
  }
  return out;
}

/* 一块层板：木板 + 黄铜压条 + 两个托架 + 板下暖光 */
function shelf(y) {
  return `
    <g>
      <rect x="6" y="${y}" width="${W - 12}" height="9" fill="url(#lbPlank)"/>
      <rect x="6" y="${y}" width="${W - 12}" height="2.4" fill="${M.brass}"/>
      <rect x="6" y="${y + 9}" width="${W - 12}" height="2" fill="#000" opacity="0.5"/>
      <rect x="6" y="${y + 11}" width="${W - 12}" height="16" fill="url(#lbUnder)"/>
      <path d="M30 ${y + 9} l0 12 l10 -12 z" fill="${M.brassDim}"/>
      <path d="M360 ${y + 9} l0 12 l-10 -12 z" fill="${M.brassDim}"/>
    </g>`;
}

/* ---- 像素小画（挂在墙上的三幅）----
   每幅 = 木框 + 内衬 + 画芯（像素格）+ 顶上一颗黄铜挂钉 + 两根挂绳。 */
const PIX = {
  martini: {
    pal: { a: "#2de2ff", b: "#9aab52", c: "#ff2d78" },
    rows: [
      "aaaaaaaaa",
      ".aaaaaaa.",
      "..aaaaa..",
      "...aba...",
      "....a....",
      "....a....",
      "....a....",
      "...aaa...",
      "..aaaaa..",
    ],
  },
  cat: {
    pal: { a: "#e6d5b8", b: "#3a2a1e", c: "#ff9ec4" },
    rows: [
      ".........",
      ".a.....a.",
      ".aa...aa.",
      ".aaaaaaa.",
      ".ab.a.ba.",
      ".aaaaaaa.",
      "..aacaa..",
      ".aaaaaaa.",
      "..a...a..",
    ],
  },
  moon: {
    pal: { a: "#ffd39a", b: "#c98b4a", c: "#f3ecff" },
    rows: [
      "....aaa..",
      "..aaab...",
      ".aab.....",
      ".aab.....",
      ".aab.....",
      "..aab....",
      "....aaa..",
      ".........",
      ".c.....c.",
    ],
  },
};

function pixArt(x, y, cell, key) {
  const art = PIX[key];
  let out = "";
  art.rows.forEach((row, r) => {
    [...row].forEach((ch, c) => {
      if (ch === ".") return;
      out += `<rect x="${x + c * cell}" y="${y + r * cell}" width="${cell}" height="${cell}" fill="${art.pal[ch]}"/>`;
    });
  });
  return out;
}

/* 相框：木框有厚度、内衬有卡纸、顶上有挂钉、钉上垂两根挂绳 */
function frame(x, y, size, key, tilt) {
  const inner = size - 14;
  const cell = inner / 9;
  const nailX = x + size / 2;
  const nailY = y - 12;
  return `
    <g>
      <path d="M${nailX} ${nailY + 3} L${x + 5} ${y + 4} M${nailX} ${nailY + 3} L${x + size - 5} ${y + 4}"
            stroke="${M.brassDim}" stroke-width="1.2" fill="none"/>
      <g transform="rotate(${tilt} ${x + size / 2} ${y + size / 2})">
        <rect x="${x + 2}" y="${y + 3}" width="${size}" height="${size}" rx="2" fill="#000" opacity="0.45"/>
        <rect x="${x}" y="${y}" width="${size}" height="${size}" rx="2" fill="url(#lbFrame)"/>
        <rect x="${x + 3.5}" y="${y + 3.5}" width="${size - 7}" height="${size - 7}" fill="none"
              stroke="${M.brassHi}" stroke-width="1" opacity="0.6"/>
        <rect x="${x + 5}" y="${y + 5}" width="${size - 10}" height="${size - 10}" fill="#0f0b18"/>
        <rect x="${x + 7}" y="${y + 7}" width="${inner}" height="${inner}" fill="#171129"/>
        ${pixArt(x + 7, y + 7, cell, key)}
        <path d="M${x + 5} ${y + 5} L${x + size - 5} ${y + 5} L${x + size - 5} ${y + 12} L${x + 5} ${y + 18} Z"
              fill="#fff" opacity="0.07"/>
      </g>
      <circle cx="${nailX}" cy="${nailY}" r="2.6" fill="url(#lbRivet)"/>
    </g>`;
}

/* 黑板价目牌：木框 + 板岩面 + 粉笔手写（有笔触抖动，不是印刷体） */
function chalkboard(x, y, w, h) {
  const lines = [
    ["今 晚", 17, M.chalk, 0],
    ["破冰局 ⋯⋯ 免费", 12, M.chalkDim, 0],
    ["升温局 ⋯⋯ 免费", 12, M.chalkDim, 0],
    ["说真话 ⋯⋯ 自付", 12, M.chalk, 0],
  ];
  let ty = y + 28;
  let txt = "";
  lines.forEach(([s, fs, fill], i) => {
    txt += `<text x="${x + w / 2 + (i % 2 ? 1 : -1)}" y="${ty}" text-anchor="middle"
              font-family="Inter, -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif" font-size="${fs}" font-weight="${i === 0 ? 700 : 500}"
              letter-spacing="${i === 0 ? 4 : 0.5}" fill="${fill}" opacity="0.92">${s}</text>`;
    ty += i === 0 ? 26 : 22;
  });
  return `
    <g>
      <!-- 挂钉 + 挂绳 -->
      <path d="M${x + w / 2} ${y - 10} L${x + 8} ${y + 3} M${x + w / 2} ${y - 10} L${x + w - 8} ${y + 3}"
            stroke="${M.brassDim}" stroke-width="1.2" fill="none"/>
      <rect x="${x + 3}" y="${y + 4}" width="${w}" height="${h}" rx="3" fill="#000" opacity="0.45"/>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="url(#lbFrame)"/>
      <rect x="${x + 6}" y="${y + 6}" width="${w - 12}" height="${h - 12}" rx="1.5" fill="${M.slate}"/>
      <rect x="${x + 6}" y="${y + 6}" width="${w - 12}" height="${h - 12}" rx="1.5" fill="url(#lbSlate)"/>
      <!-- 擦不干净的粉笔灰 -->
      <path d="M${x + 12} ${y + h - 26} q${w * 0.3} -8 ${w - 26} 3" stroke="${M.chalk}" stroke-width="5"
            fill="none" opacity="0.05" stroke-linecap="round"/>
      ${txt}
      <!-- 板槽里那截粉笔 -->
      <rect x="${x + 8}" y="${y + h - 12}" width="${w - 16}" height="4" rx="1.5" fill="${M.woodHi}"/>
      <rect x="${x + w - 34}" y="${y + h - 15}" width="14" height="3.4" rx="1.7" fill="${M.chalk}" opacity="0.85"/>
      <circle cx="${x + w / 2}" cy="${y - 13}" r="2.8" fill="url(#lbRivet)"/>
    </g>`;
}

/* 霓虹小招牌「99%」：灯管（外晕 + 主管 + 管芯）+ 两根黄铜支架 + 一条垂下来的电线 */
function neonSign(x, y, w, h) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  return `
    <g>
      <!-- 电线：从上方墙里出来，绕一下才接到牌子 -->
      <path d="M${cx + w * 0.3} ${y - 22} q6 12 -2 20" stroke="#0d0a16" stroke-width="2.2" fill="none"/>
      <!-- 支架：两根黄铜臂 + 墙上的固定盘 -->
      <rect x="${x + 8}" y="${y - 12}" width="3" height="14" fill="${M.brassDim}"/>
      <rect x="${x + w - 11}" y="${y - 12}" width="3" height="14" fill="${M.brassDim}"/>
      <circle cx="${x + 9.5}" cy="${y - 13}" r="3" fill="url(#lbRivet)"/>
      <circle cx="${x + w - 9.5}" cy="${y - 13}" r="3" fill="url(#lbRivet)"/>
      <!-- 背板（灯管钉在这块黑板上） -->
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="#0d0a16" stroke="${M.brassDeep}" stroke-width="1.5"/>
      <!-- 灯管外框 -->
      <rect x="${x + 5}" y="${y + 5}" width="${w - 10}" height="${h - 10}" rx="6" fill="none"
            stroke="${M.pink}" stroke-width="8" opacity="0.16"/>
      <rect x="${x + 5}" y="${y + 5}" width="${w - 10}" height="${h - 10}" rx="6" fill="none"
            stroke="${M.pink}" stroke-width="3" opacity="0.7"/>
      <rect x="${x + 5}" y="${y + 5}" width="${w - 10}" height="${h - 10}" rx="6" fill="none"
            stroke="${M.pinkSoft}" stroke-width="1.1"/>
      <!-- 灯管字：99%（外晕 + 管芯两层描边＝发光的玻璃管） -->
      <text x="${cx}" y="${cy + 8}" text-anchor="middle" font-family="Inter, -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif"
            font-size="24" font-weight="800" fill="none" stroke="${M.cyan}" stroke-width="7" opacity="0.2">99%</text>
      <text x="${cx}" y="${cy + 8}" text-anchor="middle" font-family="Inter, -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif"
            font-size="24" font-weight="800" fill="none" stroke="${M.cyan}" stroke-width="2.6" opacity="0.85">99%</text>
      <text x="${cx}" y="${cy + 8}" text-anchor="middle" font-family="Inter, -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif"
            font-size="24" font-weight="800" fill="none" stroke="#dffaff" stroke-width="0.9">99%</text>
    </g>`;
}

/* 层板小台灯：坐在层板上的一盏黄铜灯（底座 + 灯杆 + 灯罩 + 往下打的光池）。
   琥珀在 R11 v2 里降为"吧台小台灯点缀"，就是这两盏。 */
function shelfLamp(x, baseY) {
  const shadeY = baseY - 30;
  return `
    <g>
      <!-- 光池：先画，压在瓶群上，说明这盏灯真的在照 -->
      <path d="M${x - 9} ${shadeY + 2} L${x + 9} ${shadeY + 2} L${x + 34} ${baseY + 46} L${x - 34} ${baseY + 46} Z"
            fill="url(#lbPool)"/>
      <ellipse cx="${x}" cy="${baseY}" rx="9" ry="3" fill="${M.brassDeep}"/>
      <rect x="${x - 7}" y="${baseY - 4}" width="14" height="4" rx="1.6" fill="url(#lbShade)"/>
      <rect x="${x - 1.4}" y="${shadeY}" width="2.8" height="${baseY - shadeY - 3}" fill="${M.brassDim}"/>
      <path d="M${x - 11} ${shadeY + 2} c0-8 4.8-12 11-12 s11 4 11 12 z" fill="url(#lbShade)"/>
      <ellipse cx="${x}" cy="${shadeY + 2}" rx="11" ry="2.4" fill="${M.amber}"/>
    </g>`;
}

/* 挂杯架：柜体底下两根黄铜轨，倒挂一排高脚杯（酒吧的标准件，也把底部填满） */
function glassRack(y, x0, x1) {
  let cups = "";
  const n = Math.floor((x1 - x0) / 30);
  const step = (x1 - x0) / n;
  for (let i = 0; i < n; i++) {
    const cx = x0 + step * (i + 0.5);
    cups += `
      <g>
        <rect x="${cx - 1}" y="${y + 4}" width="2" height="13" fill="#8fa0b8" opacity="0.5"/>
        <path d="M${cx - 10} ${y + 34} q0 -17 10 -17 q10 0 10 17 z"
              fill="#cfe0ff" opacity="0.13"/>
        <path d="M${cx - 10} ${y + 34} q0 -17 10 -17 q10 0 10 17"
              fill="none" stroke="#cfe0ff" stroke-width="1.2" opacity="0.5"/>
        <ellipse cx="${cx}" cy="${y + 34}" rx="10" ry="2.4" fill="#cfe0ff" opacity="0.3"/>
        <rect x="${cx - 6}" y="${y + 20}" width="1.6" height="10" fill="#fff" opacity="0.28"/>
      </g>`;
  }
  return `
    <g>
      <rect x="${x0 - 6}" y="${y}" width="${x1 - x0 + 12}" height="4" rx="2" fill="url(#lbShade)"/>
      <rect x="${x0 - 6}" y="${y + 6}" width="${x1 - x0 + 12}" height="3" rx="1.5" fill="${M.brassDim}"/>
      ${cups}
    </g>`;
}

/* 整面酒柜 */
function buildBackbar() {
  const rnd = mulberry(9909);
  return `
<svg class="bb" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="酒柜">
  <defs>
    <linearGradient id="lbWall" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#160f22"/>
      <stop offset="0.5" stop-color="#241a3a"/>
      <stop offset="1" stop-color="#140f21"/>
    </linearGradient>
    <linearGradient id="lbPlank" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${M.woodHi}"/>
      <stop offset="0.55" stop-color="${M.wood}"/>
      <stop offset="1" stop-color="${M.woodDeep}"/>
    </linearGradient>
    <linearGradient id="lbFrame" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${M.woodHi}"/>
      <stop offset="0.45" stop-color="${M.wood}"/>
      <stop offset="1" stop-color="${M.woodDim}"/>
    </linearGradient>
    <linearGradient id="lbUnder" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#000" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#000" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="lbShade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${M.brassDim}"/>
      <stop offset="0.6" stop-color="${M.brass}"/>
      <stop offset="1" stop-color="${M.brassHi}"/>
    </linearGradient>
    <linearGradient id="lbPool" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${M.amber}" stop-opacity="0.3"/>
      <stop offset="1" stop-color="${M.amber}" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="lbSlate" cx="0.4" cy="0.3" r="0.8">
      <stop offset="0" stop-color="${M.slateHi}"/>
      <stop offset="1" stop-color="${M.slate}"/>
    </radialGradient>
    <radialGradient id="lbRivet" cx="0.34" cy="0.28" r="0.8">
      <stop offset="0" stop-color="${M.brassHi}"/>
      <stop offset="0.5" stop-color="${M.brass}"/>
      <stop offset="1" stop-color="${M.brassDeep}"/>
    </radialGradient>
    <radialGradient id="lbPink" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="${M.pink}" stop-opacity="0.3"/>
      <stop offset="1" stop-color="${M.pink}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="lbViolet" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="${M.violet}" stop-opacity="0.28"/>
      <stop offset="1" stop-color="${M.violet}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <!-- 背墙：竖向护墙板（一条条木板拼的，不是一块纯色） -->
  <rect width="${W}" height="${H}" fill="url(#lbWall)"/>
  ${Array.from({ length: 9 }, (_, i) =>
    `<rect x="${i * 44}" y="0" width="43" height="${H}" fill="${M.woodDeep}" opacity="0.5"/>
     <rect x="${i * 44 + 43}" y="0" width="1.4" height="${H}" fill="#000" opacity="0.55"/>`).join("")}
  <!-- 霓虹洗墙（R11 v2：霓虹是主光，木是暗部结构） -->
  <ellipse cx="330" cy="40" rx="190" ry="150" fill="url(#lbPink)"/>
  <ellipse cx="50" cy="330" rx="200" ry="170" fill="url(#lbViolet)"/>

  <!-- 上层墙面的实体装饰：黑板价目牌 + 三幅像素小画 + 霓虹小招牌 -->
  ${chalkboard(12, 26, 136, 126)}
  ${frame(158, 30, 52, "martini", -2.5)}
  ${frame(158, 98, 44, "moon", 2)}
  ${frame(216, 86, 46, "cat", -3)}
  ${neonSign(282, 26, 96, 50)}

  <!-- 三层层板 + 密集瓶群（瓶子先画，层板后画 → 瓶底压在板上） -->
  ${bottleRow(SHELF[0], 10, W - 10, rnd, 30, 56)}
  ${shelfLamp(66, SHELF[0])}
  ${shelf(SHELF[0])}
  ${bottleRow(SHELF[1], 10, W - 10, rnd, 36, 64)}
  ${shelf(SHELF[1])}
  ${bottleRow(SHELF[2], 10, W - 10, rnd, 36, 64)}
  ${shelfLamp(322, SHELF[2])}
  ${shelf(SHELF[2])}

  <!-- 最下面一截：柜体底座 + 倒挂的一排高脚杯，接到吧台 -->
  <rect x="0" y="${SHELF[2] + 11}" width="${W}" height="${H - SHELF[2] - 11}" fill="${M.woodDeep}"/>
  <rect x="0" y="${SHELF[2] + 11}" width="${W}" height="2" fill="${M.brassDim}"/>
  ${glassRack(SHELF[2] + 24, 26, W - 26)}
</svg>`;
}

const backbarArt = document.getElementById("backbarArt");
if (backbarArt) backbarArt.innerHTML = buildBackbar();

/* ========================================================================
   二、雪克：站在吧台后（scene:false → 不带画框，直接站进这间店）
   ======================================================================== */
const K_LINES = [
  "今晚想喝点什么故事？",
  "往下走，找张空卡座坐下。",
  "人齐了就开局，不急。",
  "灯我调暗了点，看人更清楚。",
  "一个人来的，坐吧台，我陪你。",
  "第一杯别喝太快。",
];
const bartenderSlot = document.getElementById("bartenderSlot");
const xuekeLine = document.getElementById("xuekeLine");
const xuekeSay = document.getElementById("xuekeSay");
const bartender = bartenderSlot ? createBartender(bartenderSlot, "idle", { scene: false }) : null;

let kIdx = 0;
function sayXueke(text, hold = 3200) {
  if (!xuekeLine) return;
  xuekeSay.classList.remove("pop");
  void xuekeSay.offsetWidth;
  xuekeLine.textContent = text;
  xuekeSay.classList.add("pop");
  bartender && bartender.setState("talk");
  clearTimeout(sayXueke._t);
  sayXueke._t = setTimeout(() => bartender && bartender.setState("idle"), hold);
}
if (bartenderSlot) {
  bartenderSlot.addEventListener("click", () => sayXueke(K_LINES[++kIdx % K_LINES.length]));
}
// 自己也会时不时说一句（低密度，不刷屏）
setInterval(() => {
  if (document.hidden) return;
  sayXueke(K_LINES[++kIdx % K_LINES.length]);
}, 11000);

/* ========================================================================
   三、卡座：纵向桌卡列表
   ======================================================================== */
const boothList = document.getElementById("boothList");
const boothNote = document.getElementById("boothNote");
const DECK_NAME = { man: "满分男", woman: "满分女", agent: "满分Agent" };
const SEATS = 8;               // 一桌坐满是几个人（与协议里的 N/8 一致）
const DEFAULT_TABLES = 8;      // 接口没就绪时先摆这么多桌，接口回来以它为准

const cards = new Map();       // 桌号 → <li> 里那个 button

function makeBooth(n) {
  const li = document.createElement("li");
  li.className = "booth-row";
  const btn = document.createElement("button");
  btn.className = "booth";
  btn.type = "button";
  btn.dataset.table = String(n);
  btn.innerHTML = `
    <span class="booth-plate" aria-hidden="true">
      <i class="plate-nail"></i>
      <b class="plate-no">${n}</b>
      <i class="plate-unit">号</i>
      <i class="plate-nail"></i>
    </span>
    <span class="booth-info">
      <span class="booth-people">空着</span>
      <span class="booth-sub">桌子留着，人到就开</span>
    </span>
    <span class="booth-state" data-state="free"><i class="state-lamp"></i><em>空</em></span>`;
  btn.addEventListener("click", () => joinTable(n, btn));
  li.appendChild(btn);
  boothList.appendChild(li);
  cards.set(n, btn);
  return btn;
}

function paintBooth(n, players, deck) {
  const btn = cards.get(n) || makeBooth(n);
  if (btn.classList.contains("loading")) return;
  const people = btn.querySelector(".booth-people");
  const sub = btn.querySelector(".booth-sub");
  const state = btn.querySelector(".booth-state");
  const lampText = state.querySelector("em");

  if (players >= SEATS) {
    btn.dataset.full = "1";
    people.textContent = `${players} 人在座`;
    sub.textContent = "这桌坐满了，往下再看一张";
    state.dataset.state = "full";
    lampText.textContent = "满";
  } else if (players > 0) {
    delete btn.dataset.full;
    people.textContent = `${players} 人在座`;
    sub.textContent = deck && DECK_NAME[deck] ? `在聊《${DECK_NAME[deck]}》` : "已经开灯了，进去拼一桌";
    state.dataset.state = "live";
    lampText.textContent = "开";
  } else {
    delete btn.dataset.full;
    people.textContent = "空着";
    sub.textContent = "桌子留着，人到就开";
    state.dataset.state = "free";
    lampText.textContent = "空";
  }
}

// 先把默认桌摆出来（接口没就绪也有得看，且不报错）
for (let n = 1; n <= DEFAULT_TABLES; n++) paintBooth(n, 0, null);

async function refreshTables() {
  try {
    const res = await fetch("/api/tables");
    if (!res.ok) throw new Error("tables not ready");
    const data = await res.json();
    if (!data || !Array.isArray(data.tables)) return;
    // 列表天然不封顶：接口给几桌就有几桌
    data.tables.forEach((t) => paintBooth(Number(t.table), Number(t.players) || 0, t.deck));
    const live = data.tables.filter((t) => Number(t.players) > 0).length;
    if (boothNote) {
      boothNote.textContent = live
        ? `${live} 桌已经开灯了 · 一共 ${data.tables.length} 桌`
        : `一共 ${data.tables.length} 桌，都空着 —— 你来开第一桌。`;
    }
  } catch {
    /* 接口没就绪：保持默认空桌，不报错 */
  }
}
refreshTables();
setInterval(refreshTables, 5000);

/* ---------------- 点卡入桌（协议不变） ---------------- */
let joining = false;
async function joinTable(n, btn) {
  if (joining) return;
  joining = true;
  btn.classList.add("loading");
  const people = btn.querySelector(".booth-people");
  const prev = people.textContent;
  people.textContent = "带路中…";

  try {
    try {
      const res = await fetch(`/api/table/${n}/join`, { method: "POST" });
      if (res.ok) {
        const { code } = await res.json();
        if (code) { location.href = `/?room=${code}&table=${n}`; return; }
      }
    } catch { /* 落到兜底 */ }
    const res2 = await fetch("/api/room", { method: "POST" });
    if (res2.ok) {
      const { code } = await res2.json();
      if (code) { location.href = `/?room=${code}`; return; }
    }
    throw new Error("no code");
  } catch {
    btn.classList.remove("loading");
    people.textContent = prev;
    joining = false;
    sayXueke("线路有点堵，缓两秒再点。");
    document.getElementById("bartenderStage")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

/* ========================================================================
   四、吧台单人位 / 我的柜子 / 生面孔立牌
   ======================================================================== */
document.getElementById("soloSeat").addEventListener("click", () => {
  location.href = "/?solo=1";
});

const myUserId = localStorage.getItem("ideal_userId");
const homeEntry = document.getElementById("homeEntry");
const guestBanner = document.getElementById("guestBanner");
if (homeEntry) {
  homeEntry.addEventListener("click", () => {
    const id = localStorage.getItem("ideal_userId");
    location.href = id ? `/u.html?id=${encodeURIComponent(id)}` : "/v2/cocktail.html";
  });
}
if (!myUserId && guestBanner) {
  guestBanner.hidden = false;
  document.body.classList.add("guest-mode");
}

/* ========================================================================
   五、找朋友：报房间码
   ======================================================================== */
const codeboard = document.getElementById("codeboard");
const codeInput = document.getElementById("codeInput");
const codeMsg = document.getElementById("codeMsg");
const codeGo = document.getElementById("codeGo");

function openCodeboard() {
  codeboard.hidden = false;
  codeMsg.textContent = "";
  codeInput.value = "";
  setTimeout(() => codeInput.focus(), 50);
}
function closeCodeboard() { codeboard.hidden = true; }

document.getElementById("findFriendsBtn").addEventListener("click", openCodeboard);
if (location.hash === "#find") openCodeboard();
document.getElementById("codeClose").addEventListener("click", closeCodeboard);
codeboard.addEventListener("click", (e) => { if (e.target === codeboard) closeCodeboard(); });
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !codeboard.hidden) closeCodeboard();
});
codeInput.addEventListener("input", () => {
  codeInput.value = codeInput.value.replace(/\D/g, "").slice(0, 4);
  codeInput.classList.remove("err");
});
codeInput.addEventListener("keydown", (e) => { if (e.key === "Enter") goFindFriends(); });
codeGo.addEventListener("click", goFindFriends);

async function goFindFriends() {
  const code = codeInput.value.trim();
  if (!/^\d{4}$/.test(code)) {
    codeMsg.textContent = "四位数字，再看一眼。";
    codeInput.classList.add("err");
    setTimeout(() => codeInput.classList.remove("err"), 400);
    return;
  }
  codeGo.disabled = true;
  codeGo.textContent = "带路中…";
  try {
    const res = await fetch(`/api/room/${code}`);
    if (res.ok) { location.href = `/?room=${code}`; return; }
    codeMsg.textContent = "这桌还没开灯，再问问发码的人。";
  } catch {
    location.href = `/?room=${code}`;
    return;
  }
  codeGo.disabled = false;
  codeGo.textContent = "带我过去";
}
