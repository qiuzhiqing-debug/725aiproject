// 海报生成：1080×1920 Canvas 长图（霓虹暗紫像素酒吧风，与 theme-v2 同源）
// 布局：乙游立绘 → 人物档案 → 酒桌数据 → 二维码（扫码直接进当前房间）
import { drawQR } from "./qrcode.js";

const W = 1080;
const H = 1920;
const IMG_H = 900;

/* ---------- 配色真源：public/theme-v2.css ----------
   海报配色不在这里硬编码，而是启动时从 :root 的 CSS 变量读取，
   样式线改 theme-v2.css 海报就跟着换肤。读不到时回退到下面的默认值
   （默认值 = theme-v2 当前定稿，保证无 DOM 环境也能出图）。 */
const THEME_FALLBACK = {
  "--bar-bg-deep": "#120a1c",
  "--bar-bg": "#1a1026",
  "--bar-bg-wall": "#2c1a42",
  "--bar-bg-raise": "#241536",
  "--neon-pink": "#ff2d78",
  "--neon-pink-hot": "#ff6ea8",
  "--neon-cyan": "#2de2ff",
  "--neon-purple": "#a86bff",
  "--neon-amber": "#ffb648",
  "--neon-green": "#58ff9b",
  "--neon-red": "#ff4141",
  "--ink-hi": "#f4ecff",
  "--ink-mid": "#b9a8d4",
  "--line-neon": "#55307f",
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

  /* ---- 背景：深紫黑舞台 + 霓虹光晕 ---- */
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, C.bgTop);
  bg.addColorStop(0.55, C.bgMid);
  bg.addColorStop(1, C.bgBottom);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = C.band;
  ctx.fillRect(0, IMG_H, W, 170);
  ctx.fillStyle = C.pink;
  ctx.fillRect(W - 54, IMG_H, 54, H - IMG_H);
  ctx.fillStyle = C.cyan;
  ctx.fillRect(0, H - 38, W, 38);

  /* ---- 立绘：全幅占上 55% ---- */
  try {
    let img;
    try {
      img = await loadImage(portrait.imageUrl || aha.imageUrl, 3500);
    } catch (error) {
      if (!portrait.fallbackUrl) throw error;
      img = await loadImage(portrait.fallbackUrl, 8000);
    }
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
    ctx.fillStyle = C.band;
    ctx.fillRect(0, 0, W, IMG_H);
    ctx.font = font("bold", 52);
    ctx.textAlign = "center";
    neonText(ctx, "立绘迟到了，人先到了", W / 2, IMG_H / 2, C.pinkHot, C.pink);
  }
  // 立绘区描边 + 底部渐入暗紫底
  let g = ctx.createLinearGradient(0, IMG_H - 200, 0, IMG_H);
  g.addColorStop(0, alpha(C.bgMid, 0));
  g.addColorStop(1, C.bgMid);
  ctx.fillStyle = g;
  ctx.fillRect(0, IMG_H - 200, W, 200);
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, W - 10, IMG_H - 10);

  /* ---- 顶部标题（叠在立绘上，霓虹招牌字） ---- */
  ctx.textAlign = "center";
  // 顶部压暗 scrim 保证标题可读
  g = ctx.createLinearGradient(0, 0, 0, 250);
  g.addColorStop(0, alpha(C.bgTop, 0.94));
  g.addColorStop(1, alpha(C.bgTop, 0));
  ctx.fillStyle = g;
  ctx.fillRect(8, 8, W - 16, 250);
  ctx.font = font("900", 40);
  neonText(ctx, "理想型 · 加载中 · 深夜营业", W / 2, 92, C.cyan, C.cyan, 20);
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
  neonText(ctx, fitText(ctx, archetypeLabel, 940), W / 2, y, C.text, C.purple, 22);

  // 酒桌称号：霓虹粉紫横幅
  y = IMG_H + 26;
  ctx.font = font("900", 66);
  const tTxt = fitText(ctx, aha.title, 900);
  const tW = Math.min(W - 100, ctx.measureText(tTxt).width + 96);
  const bannerG = ctx.createLinearGradient((W - tW) / 2, 0, (W + tW) / 2, 0);
  bannerG.addColorStop(0, C.pink);
  bannerG.addColorStop(1, C.purple);
  roundRect(ctx, (W - tW) / 2, y, tW, 100, 24);
  ctx.fillStyle = alpha(C.bgTop, 0.9);
  ctx.save();
  ctx.translate(8, 8);
  ctx.fill(); // 硬阴影
  ctx.restore();
  roundRect(ctx, (W - tW) / 2, y, tW, 100, 24);
  ctx.fillStyle = bannerG;
  ctx.fill();
  ctx.strokeStyle = C.deep;
  ctx.lineWidth = 6;
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
  const drawCard = (x, cy, w, label, lines, accent, valSize, lineH) => {
    const padX = 32;
    const cardH = 56 + lines.length * lineH + 18;
    roundRect(ctx, x + 8, cy + 8, w, cardH, 20);
    ctx.fillStyle = alpha(C.bgTop, 0.85);
    ctx.fill();
    roundRect(ctx, x, cy, w, cardH, 20);
    ctx.fillStyle = C.card;
    ctx.fill();
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.save();
    roundRect(ctx, x, cy, w, cardH, 20);
    ctx.clip();
    ctx.fillStyle = accent;
    ctx.fillRect(x, cy, 16, cardH);
    // 顶缘描光
    ctx.fillStyle = alpha(accent, 0.25);
    ctx.fillRect(x, cy, w, 3);
    ctx.restore();
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
  const h1 = drawCard(cardX, y, halfW, c1.label, [fitText(ctx, c1.value, halfW - 64)], C.cyan, 34, 44);
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

  /* ---- 底部：二维码（扫码直接进这桌）+ slogan ---- */
  const qrSize = 176;
  const qrX = W - 100 - qrSize, qrY = H - 120 - qrSize;
  roundRect(ctx, qrX - 14 + 7, qrY - 14 + 7, qrSize + 28, qrSize + 28, 20);
  ctx.fillStyle = alpha(C.bgTop, 0.9);
  ctx.fill();
  roundRect(ctx, qrX - 14, qrY - 14, qrSize + 28, qrSize + 28, 20);
  ctx.fillStyle = C.white;
  ctx.fill();
  ctx.strokeStyle = C.pink;
  ctx.lineWidth = 5;
  ctx.stroke();
  // 深色码点 + 纯白底，扫码稳定；siteUrl 由调用方用 location.origin + 房间码动态拼
  drawQR(ctx, siteUrl, qrX, qrY, qrSize, { dark: C.deep, light: C.white });

  ctx.textAlign = "left";
  ctx.font = font("900", 44);
  neonText(ctx, "今晚谁最懂 TA？", 100, H - 154, C.pinkHot, C.pink, 22);
  ctx.fillStyle = C.textDim;
  ctx.font = font("bold", 30);
  ctx.fillText("扫码坐进这桌 · 猜不中的都在罚酒", 100, H - 104);

  return canvas.toDataURL("image/png");
}

/* ---------- 工具 ---------- */

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
