// 海报生成：1080×1920 Canvas 长图
// R10 走「审美风」（故事圣经 §五点五：UI 精致 → 海报审美风，不许骑墙）：
//   与 UI 同一个色彩系统同一个气质 —— 暖黑酒红底、大比例琥珀灯、黄铜压条、
//   马天尼粉只给「酒桌称号」这一处心动时刻。排版讲究：立绘顶天，
//   信息区靠黄铜细线分栏，不再靠霓虹描边把每块都框起来。
// 布局：立绘 → 称号横幅 → 人物档案 → 酒桌数据 → 二维码（R11 起指向站点落地首页）
//
// R11 交付要点（Kim 手机验收）：
//  · 输出必须是 canvas 合成后的单张 dataURL（见结尾 canvas.toDataURL），
//    调用方直接塞进一个 <img>，手机长按 = 存整张图，不做 DOM 拼接/背景分层。
//  · 立绘等图超时时间放宽到 15s，并优先复用亮相页已经加载成功的那张图
//    （同一 URL 命中浏览器缓存，秒回），避免「海报洗出来但人没进来」的半张图。
//  · 立绘真没来时画「你老公来咯 + 🪽🪽」占位，跟亮相页等待态同一块视觉。
import { drawQR } from "./qrcode.js";

const W = 1080;
const H = 1920;
const IMG_H = 900;

// 等图/失败占位（与 app.js WAITING_FALLBACK 同一套说法）
const POSTER_WAITING = { m: "你老公来咯", f: "你老婆来咯", n: "你的TA来咯" };
const POSTER_WINGS = "🪽🪽";

/* ---------- 配色真源：public/theme-v2.css ----------
   海报配色不在这里硬编码，而是启动时从 :root 的 CSS 变量读取，
   样式线改 theme-v2.css 海报就跟着换肤。读不到时回退到下面的默认值
   （默认值 = theme-v2 当前定稿，保证无 DOM 环境也能出图）。 */
const THEME_FALLBACK = {
  "--bar-bg-deep": "#110a0d",
  "--bar-bg": "#1a1014",
  "--bar-bg-wall": "#331e20",
  "--bar-bg-raise": "#251519",
  "--neon-pink": "#ff2d78",
  "--neon-pink-hot": "#ff6ea8",
  "--neon-cyan": "#2de2ff",
  "--neon-purple": "#c99a4e",   // 角色=黄铜（R10 起）
  "--neon-amber": "#e8a75c",
  "--neon-green": "#9aab52",
  "--neon-red": "#d8543f",
  "--ink-hi": "#f6e8d6",
  "--ink-mid": "#c9ac90",
  "--line-neon": "#5c3a24",
};

const FONT_STACK =
  '"Fusion Pixel 12px Proportional SC","PingFang SC","Microsoft YaHei","Noto Sans SC",sans-serif';

function readTheme() {
  let cs = null;
  try {
    cs = getComputedStyle(document.documentElement);
  } catch {
    cs = null;
  }
  const out = {};
  for (const [k, def] of Object.entries(THEME_FALLBACK)) {
    const v = cs ? String(cs.getPropertyValue(k) || "").trim() : "";
    out[k] = v || def;
  }
  return out;
}

const T = readTheme();
// 材质色（海报专用；UI 侧同源于 theme-v2 的 --brass-* / --wood-*）
const M = {
  brassHi: "#f2d79b",
  brass: "#c99a4e",
  brassDim: "#7c5729",
  brassDeep: "#43301a",
  wood: "#4b2b19",
  woodDim: "#2b160c",
  amberHi: "#ffdca6",
};

const C = {
  bgTop: T["--bar-bg-deep"],
  bgMid: T["--bar-bg"],
  bgBottom: T["--bar-bg-wall"],
  band: T["--bar-bg-raise"],
  card: T["--bar-bg-wall"],
  deep: T["--bar-bg-deep"],
  pink: T["--neon-pink"],
  pinkHot: T["--neon-pink-hot"],
  cyan: T["--neon-cyan"],
  purple: T["--neon-purple"],
  amber: T["--neon-amber"],
  green: T["--neon-green"],
  red: T["--neon-red"],
  text: T["--ink-hi"],
  textDim: T["--ink-mid"],
  line: T["--line-neon"],
  white: "#ffffff", // 扫码可靠性：二维码底永远纯白
};

// 把主题色转成带透明度的 rgba（支持 #rgb / #rrggbb，解析失败原样返回）
function alpha(color, a) {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(color).trim());
  if (!m) return color;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

const font = (weight, size) => `${weight} ${size}px ${FONT_STACK}`;

// 霓虹字：canvas 用 shadowBlur 模拟 glow
function neonText(ctx, text, x, y, fill, glow, blur = 26) {
  ctx.save();
  ctx.shadowColor = glow;
  ctx.shadowBlur = blur;
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
  ctx.shadowBlur = 0;
  ctx.fillText(text, x, y); // 第二遍提亮字芯
  ctx.restore();
}

export async function renderPoster(aha, siteUrl) {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  const profile = aha.profile || {};
  const matchCard = profile.matchCard || {};
  const portrait = profile.portrait || {};

  /* ---- 背景：暖黑酒红舞台（关了大灯的店）---- */
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, C.bgTop);
  bg.addColorStop(0.55, C.bgMid);
  bg.addColorStop(1, C.bgTop);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  // 信息区底：深绒面 + 顶上一道灯池（画出来的光，不是纯色带）
  ctx.fillStyle = C.band;
  ctx.fillRect(0, IMG_H, W, H - IMG_H);
  const pool = ctx.createRadialGradient(W / 2, IMG_H, 0, W / 2, IMG_H, 720);
  pool.addColorStop(0, alpha(C.amber, 0.2));
  pool.addColorStop(1, alpha(C.amber, 0));
  ctx.fillStyle = pool;
  ctx.fillRect(0, IMG_H - 40, W, 560);
  // 右侧一根黄铜竖条（海报的脊；不是霓虹色块）
  brassBar(ctx, W - 46, IMG_H, 46, H - IMG_H, false);
  // 页脚一条木沿 + 黄铜压边
  ctx.fillStyle = M.woodDim;
  ctx.fillRect(0, H - 44, W, 44);
  brassBar(ctx, 0, H - 44, W, 9, true);

  /* ---- 立绘：全幅占上 55% ---- */
  // 候选顺序：亮相页已确认加载成功的 URL（走缓存，最稳）→ 主图 → 兜底图。
  // 旧版主图只等 3.5s，pollinations 现生成经常超时 → 海报常年缺立绘，
  // 这就是 Kim「长按保存好像不是完整海报」的来源。
  const srcCandidates = [aha.loadedImageUrl, portrait.imageUrl || aha.imageUrl, portrait.fallbackUrl]
    .filter((u, i, arr) => u && arr.indexOf(u) === i);
  try {
    let img = null;
    let lastError = null;
    for (const src of srcCandidates) {
      try {
        img = await loadImage(src, 15000);
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (!img) throw lastError || new Error("no portrait source");
    // cover 裁切
    const scale = Math.max(W / img.width, IMG_H / img.height);
    const dw = img.width * scale, dh = img.height * scale;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, IMG_H);
    ctx.clip();
    ctx.drawImage(img, (W - dw) / 2, (IMG_H - dh) / 2, dw, dh);
    ctx.restore();
  } catch {
    // 立绘没来：跟亮相页等待态同一块——大字居中 +（下一行）两只翅膀，没有别的字。
    const heroLine = String(aha.waitingText || "").replace(/🪽/g, "").trim()
      || POSTER_WAITING[aha.gender] || POSTER_WAITING.n;
    ctx.fillStyle = C.band;
    ctx.fillRect(0, 0, W, IMG_H);
    ctx.textAlign = "center";
    ctx.font = font("900", 88);
    neonText(ctx, heroLine, W / 2, IMG_H / 2 - 10, M.amberHi, C.amber, 30);
    ctx.font = font("900", 76);
    ctx.fillStyle = C.text;
    ctx.fillText(POSTER_WINGS, W / 2, IMG_H / 2 + 96);
  }
  // 立绘区描边 + 底部渐入暗紫底
  let g = ctx.createLinearGradient(0, IMG_H - 200, 0, IMG_H);
  g.addColorStop(0, alpha(C.bgMid, 0));
  g.addColorStop(1, C.bgMid);
  ctx.fillStyle = g;
  ctx.fillRect(0, IMG_H - 200, W, 200);
  // 立绘 = 挂在店里的一幅画：黄铜画框（外暗棱 + 内亮棱）
  ctx.strokeStyle = M.brassDeep;
  ctx.lineWidth = 14;
  ctx.strokeRect(7, 7, W - 14, IMG_H - 14);
  ctx.strokeStyle = M.brass;
  ctx.lineWidth = 4;
  ctx.strokeRect(16, 16, W - 32, IMG_H - 32);
  ctx.strokeStyle = alpha(M.brassHi, 0.55);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(19.5, 19.5, W - 39, IMG_H - 39);
  // 画框下沿那条黄铜压条（画和信息区的交界）
  brassBar(ctx, 0, IMG_H - 9, W, 11, true);

  /* ---- 顶部标题（叠在立绘上，霓虹招牌字） ---- */
  ctx.textAlign = "center";
  // 顶部压暗 scrim 保证标题可读
  g = ctx.createLinearGradient(0, 0, 0, 250);
  g.addColorStop(0, alpha(C.bgTop, 0.94));
  g.addColorStop(1, alpha(C.bgTop, 0));
  ctx.fillStyle = g;
  ctx.fillRect(8, 8, W - 16, 250);
  ctx.font = font("900", 40);
  neonText(ctx, "理想型 · 加载中 · 深夜营业", W / 2, 92, M.amberHi, C.amber, 24);
  ctx.font = font("900", 62);
  const heroLine = `${aha.protagonist.emoji || "🍺"} ${truncName(aha.protagonist.name, 8)} 的理想型`;
  ctx.lineWidth = 12;
  ctx.strokeStyle = alpha(C.bgTop, 0.9);
  ctx.strokeText(heroLine, W / 2, 176);
  neonText(ctx, heroLine, W / 2, 176, C.pinkHot, C.pink, 30);

  /* ---- 理想型类型（叠在立绘下缘）+ 酒桌称号大字 ---- */
  let y = IMG_H - 46;
  ctx.font = font("900", 58);
  ctx.lineWidth = 10;
  ctx.strokeStyle = alpha(C.bgTop, 0.85);
  const archetypeLabel = matchCard.archetype || portrait.archetype || "理想型档案";
  ctx.strokeText(fitText(ctx, archetypeLabel, 940), W / 2, y);
  neonText(ctx, fitText(ctx, archetypeLabel, 940), W / 2, y, C.text, C.amber, 26);

  // 酒桌称号：霓虹粉紫横幅
  y = IMG_H + 26;
  ctx.font = font("900", 66);
  const tTxt = fitText(ctx, aha.title, 900);
  const tW = Math.min(W - 100, ctx.measureText(tTxt).width + 96);
  // 酒桌称号 = 全张海报唯一的心动时刻，马天尼粉只在这里出场（圣经 §四）
  const bannerG = ctx.createLinearGradient((W - tW) / 2, y, (W - tW) / 2, y + 100);
  bannerG.addColorStop(0, C.pinkHot);
  bannerG.addColorStop(1, C.pink);
  roundRect(ctx, (W - tW) / 2, y, tW, 100, 26);
  ctx.fillStyle = alpha(C.bgTop, 0.92);
  ctx.save();
  ctx.translate(0, 12);
  ctx.fill(); // 落在桌面上的影子
  ctx.restore();
  roundRect(ctx, (W - tW) / 2, y, tW, 100, 26);
  ctx.fillStyle = bannerG;
  ctx.fill();
  ctx.save();
  ctx.shadowColor = alpha(C.pink, 0.6);
  ctx.shadowBlur = 42;
  ctx.fill();
  ctx.restore();
  // 黄铜包边（金属件的两道棱）
  ctx.strokeStyle = M.brassDeep;
  ctx.lineWidth = 7;
  ctx.stroke();
  roundRect(ctx, (W - tW) / 2 + 3.5, y + 3.5, tW - 7, 93, 23);
  ctx.strokeStyle = alpha(M.brassHi, 0.7);
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = C.white;
  ctx.fillText(tTxt, W / 2, y + 74);
  ctx.fillStyle = alpha(C.text, 0.78);
  ctx.font = font("bold", 32);
  ctx.fillText(fitText(ctx, `酒桌称号 · ${aha.titleSub}`, 980), W / 2, y + 148);

  /* ---- 数据卡区 ---- */
  const s = aha.stats;
  const cards = [];
  cards.push({
    label: "最懂 TA 的人",
    value: s.bestKnower ? `${truncName(s.bestKnower.name, 7)} · 命中 ${s.bestKnower.count} 次` : "暂无 · 全桌罚酒",
  });
  if (s.lights && s.lights.total > 0)
    cards.push({ label: "非诚勿扰灯光席", value: `💗 理想型收获 ${s.lights.burst}/${s.lights.total} 爆灯` });
  if (s.veto) cards.push({ label: "一票否决", value: `“${s.veto}”`, wrap: true });
  cards.push({ label: "容忍度", value: `${s.tolerancePct}% · 均分 ${s.avgScore}` });
  const medals = ["🥇", "🥈", "🥉"];
  cards.push({
    label: "全场罚酒榜",
    value: s.drinkBoard.slice(0, 3).map((p, i) => `${medals[i]} ${truncName(p.name, 5)} ${p.drinks}杯`).join("  ") || "全桌滴酒未罚",
  });

  // 卡片绘制器：暗紫卡 + 霓虹描边 + 电光色条；返回卡高
  // 数据卡 = 吧台上的一块木牌：木底 + 黄铜左槽 + 上棱受光下棱压暗
  const drawCard = (x, cy, w, label, lines, accent, valSize, lineH) => {
    const padX = 34;
    const cardH = 56 + lines.length * lineH + 18;
    roundRect(ctx, x, cy + 9, w, cardH, 18);
    ctx.fillStyle = alpha("#000000", 0.55);
    ctx.fill();
    roundRect(ctx, x, cy, w, cardH, 18);
    ctx.fillStyle = M.wood;
    ctx.fill();
    ctx.save();
    roundRect(ctx, x, cy, w, cardH, 18);
    ctx.clip();
    // 木纹：几道不等距的手绘纹路（不是重复图案）
    ctx.fillStyle = alpha("#000000", 0.22);
    [11, 34, 63, 92].forEach((o) => ctx.fillRect(x, cy + o, w, 2));
    ctx.fillStyle = alpha(M.amberHi, 0.05);
    [22, 74].forEach((o) => ctx.fillRect(x, cy + o, w, 1));
    // 黄铜左槽（这一条是哪一栏）
    const gs = ctx.createLinearGradient(x, cy, x + 16, cy);
    gs.addColorStop(0, M.brassHi);
    gs.addColorStop(1, accent);
    ctx.fillStyle = gs;
    ctx.fillRect(x, cy, 16, cardH);
    // 上棱受光 / 下棱压暗 = 木牌的厚度
    ctx.fillStyle = alpha(M.amberHi, 0.16);
    ctx.fillRect(x, cy, w, 2);
    ctx.fillStyle = alpha("#000000", 0.5);
    ctx.fillRect(x, cy + cardH - 3, w, 3);
    ctx.restore();
    ctx.strokeStyle = M.brassDeep;
    ctx.lineWidth = 2.5;
    roundRect(ctx, x, cy, w, cardH, 18);
    ctx.stroke();
    ctx.textAlign = "left";
    ctx.fillStyle = accent;
    ctx.font = font("900", 26);
    ctx.fillText(label, x + padX, cy + 44);
    ctx.fillStyle = C.text;
    ctx.font = font("bold", valSize);
    lines.forEach((ln, i) => ctx.fillText(ln, x + padX, cy + 44 + 46 + i * lineH));
    ctx.textAlign = "center";
    return cardH;
  };

  y = IMG_H + 196;
  const cardX = 70, cardW = W - 140, halfW = (cardW - 20) / 2;
  // 人物档案：MBTI / 星座 / 职业，海报第一眼就能读出是哪一挂。
  const profileValue = [
    matchCard.mbti,
    matchCard.archetype,
    matchCard.zodiac,
    matchCard.occupation,
  ].filter(Boolean).join(" · ") || "乙游理想型档案已生成";
  ctx.font = font("bold", 32);
  y += drawCard(cardX, y, cardW, "相亲人物档案", [fitText(ctx, profileValue, cardW - 64)], C.pink, 32, 42) + 18;
  // 行 1：最懂 TA 的人 + 容忍度（半宽并排）
  const c1 = cards[0], cTol = cards.find((c) => c.label === "容忍度");
  ctx.font = font("bold", 34);
  const h1 = drawCard(cardX, y, halfW, c1.label, [fitText(ctx, c1.value, halfW - 64)], C.amber, 34, 44);
  drawCard(cardX + halfW + 20, y, halfW, cTol.label, [fitText(ctx, cTol.value, halfW - 64)], C.green, 34, 44);
  y += h1 + 22;
  // 行 2：一票否决（全宽，最多 2 行）
  const cVeto = cards.find((c) => c.label === "一票否决");
  if (cVeto) {
    ctx.font = font("bold", 34);
    const vLines = wrapText(ctx, cVeto.value, cardW - 64, 2);
    y += drawCard(cardX, y, cardW, cVeto.label, vLines, C.red, 34, 44) + 20;
  }
  // 行 3：全场罚酒榜（收窄避开右下角二维码，单行截断）
  const cBoard = cards[cards.length - 1];
  const boardW = cardW - 260;
  ctx.font = font("bold", 30);
  drawCard(cardX, y, boardW, cBoard.label, [fitText(ctx, cBoard.value, boardW - 64)], C.amber, 30, 42);

  /* ---- 底部：二维码（R11 改指站点落地首页 = 链路第一环）+ slogan ---- */
  const qrSize = 176;
  const qrX = W - 100 - qrSize, qrY = H - 120 - qrSize;
  roundRect(ctx, qrX - 16, qrY - 16 + 9, qrSize + 32, qrSize + 32, 18);
  ctx.fillStyle = alpha("#000000", 0.55);
  ctx.fill();
  roundRect(ctx, qrX - 16, qrY - 16, qrSize + 32, qrSize + 32, 18);
  ctx.fillStyle = C.white;
  ctx.fill();
  ctx.strokeStyle = M.brassDeep;
  ctx.lineWidth = 7;
  ctx.stroke();
  roundRect(ctx, qrX - 12.5, qrY - 12.5, qrSize + 25, qrSize + 25, 15);
  ctx.strokeStyle = M.brass;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  // 深色码点 + 纯白底，扫码稳定；R11 起 siteUrl = 站点落地首页（不再是房间码深链），
  // 海报是拉新素材，扫码人先进首页调一杯，别被塞进一桌陌生人里。
  drawQR(ctx, siteUrl, qrX, qrY, qrSize, { dark: C.deep, light: C.white });

  ctx.textAlign = "left";
  ctx.font = font("900", 44);
  neonText(ctx, "今晚谁最懂 TA？", 100, H - 154, M.amberHi, C.amber, 26);
  ctx.fillStyle = C.textDim;
  ctx.font = font("bold", 30);
  // 占位文案，等 Kim 终审；铁律：不提「这桌/这个房间」
  ctx.fillText("扫码来 99% 酒吧调一杯", 100, H - 104);

  return canvasToObjectUrl(canvas);
}

/* ---------- 工具 ---------- */

/* R12 长按保存修复：输出 Blob URL 而不是 dataURL。
   病因：1080×1920 PNG 的 data: URI 有好几 MB，微信 X5 / iOS WKWebView 对超长 data: URI 的
   <img> 长按菜单支持很差（经常只弹「识别图中二维码」，压根没有「保存图片」这一项）。
   blob: 是一条真实资源 URL，长按菜单命中率明显更高，也不用扛 base64 那 33% 的膨胀。
   兼容兜底：老 WebView 没有 canvas.toBlob 或 URL.createObjectURL → 原样退回 dataURL，
   宁可长按难存，也绝不让海报出不来。
   注意：调用方负责在换图/离场时 URL.revokeObjectURL（app.js setPosterUrl 已经做了）。 */
function canvasToObjectUrl(canvas) {
  return new Promise((resolve) => {
    const fallback = () => {
      try { resolve(canvas.toDataURL("image/png")); } catch { resolve(""); }
    };
    try {
      if (typeof canvas.toBlob !== "function" || typeof URL?.createObjectURL !== "function") return fallback();
      canvas.toBlob((blob) => {
        if (!blob) return fallback();
        try { resolve(URL.createObjectURL(blob)); } catch { fallback(); }
      }, "image/png");
    } catch {
      fallback();
    }
  });
}

// 黄铜压条：一根真的金属条（亮棱 / 本体 / 暗棱三段），横竖都能画。
// 海报里所有「分隔」都用它，不用 1px 描边线 —— 这是「工艺密度」的来源。
function brassBar(ctx, x, y, w, h, horizontal) {
  const g = horizontal
    ? ctx.createLinearGradient(x, y, x, y + h)
    : ctx.createLinearGradient(x, y, x + w, y);
  g.addColorStop(0, M.brassHi);
  g.addColorStop(0.34, M.brass);
  g.addColorStop(0.72, M.brassDim);
  g.addColorStop(1, M.brassDeep);
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// 长昵称截断
function truncName(s, n) {
  s = String(s ?? "");
  return s.length > n ? s.slice(0, n) + "…" : s;
}

// 单行：超宽则截断加省略号（按实际测宽，中英文混排安全）
function fitText(ctx, text, maxW) {
  text = String(text ?? "");
  if (ctx.measureText(text).width <= maxW) return text;
  while (text.length > 1 && ctx.measureText(text + "…").width > maxW) text = text.slice(0, -1);
  return text + "…";
}

// 中文换行：逐字符断行（无空格语言安全），限行数，末行省略号
function wrapText(ctx, text, maxW, maxLines) {
  text = String(text ?? "");
  const lines = [];
  let line = "";
  for (const ch of text) {
    if (ctx.measureText(line + ch).width > maxW) {
      lines.push(line);
      line = ch;
      if (lines.length === maxLines) break;
    } else line += ch;
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines && ctx.measureText(text).width > maxW * maxLines) {
    let last = lines[maxLines - 1];
    while (last && ctx.measureText(last + "…").width > maxW) last = last.slice(0, -1);
    lines[maxLines - 1] = last + "…";
  }
  return lines.slice(0, maxLines);
}

function loadImage(src, timeoutMs = 20000) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
    setTimeout(() => rej(new Error("timeout")), timeoutMs);
  });
}
