// 海报生成：1080×1920 Canvas 长图（高对比白蓝年报风）
// 布局：乙游立绘 → 人物档案 → 酒桌数据 → 二维码
import { drawQR } from "./qrcode.js";

const W = 1080;
const H = 1920;
const IMG_H = 900;

// Canvas 字体降级安全：中文优先苹方/雅黑，兜底 sans-serif
const F = '"PingFang SC","Microsoft YaHei","Noto Sans SC",sans-serif';
const font = (weight, size) => `${weight} ${size}px ${F}`;

export async function renderPoster(aha, siteUrl) {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  const profile = aha.profile || {};
  const matchCard = profile.matchCard || {};
  const portrait = profile.portrait || {};

  /* ---- 背景：冷白大底 + 电光蓝/酸性黄几何块 ---- */
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#ffffff");
  bg.addColorStop(0.55, "#f3f8ff");
  bg.addColorStop(1, "#e9f2ff");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#d8efff";
  ctx.fillRect(0, IMG_H, W, 170);
  ctx.fillStyle = "#075bff";
  ctx.fillRect(W - 54, IMG_H, 54, H - IMG_H);
  ctx.fillStyle = "#d7ff34";
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
    ctx.fillStyle = "#e9f3ff";
    ctx.fillRect(0, 0, W, IMG_H);
    ctx.fillStyle = "#075bff";
    ctx.font = font("bold", 52);
    ctx.textAlign = "center";
    ctx.fillText("理想型立绘生成中…", W / 2, IMG_H / 2);
  }
  // 立绘区高对比描边 + 底部渐入冷白底
  let g = ctx.createLinearGradient(0, IMG_H - 200, 0, IMG_H);
  g.addColorStop(0, "rgba(243,248,255,0)");
  g.addColorStop(1, "#f3f8ff");
  ctx.fillStyle = g;
  ctx.fillRect(0, IMG_H - 200, W, 200);
  ctx.strokeStyle = "#07111f";
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, W - 10, IMG_H - 10);

  /* ---- 顶部标题（叠在立绘上，贴纸描边字） ---- */
  ctx.textAlign = "center";
  // 顶部提亮 scrim 保证标题可读
  g = ctx.createLinearGradient(0, 0, 0, 250);
  g.addColorStop(0, "rgba(255,255,255,0.96)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(8, 8, W - 16, 250);
  ctx.fillStyle = "#075bff";
  ctx.font = font("900", 40);
  ctx.fillText("满分男 · 酒桌局 · 年度理想型报告", W / 2, 92);
  ctx.font = font("900", 62);
  const heroLine = `${aha.protagonist.emoji || "🍺"} ${truncName(aha.protagonist.name, 8)} 的理想型`;
  ctx.lineWidth = 12;
  ctx.strokeStyle = "#ffffff";
  ctx.strokeText(heroLine, W / 2, 176);
  ctx.fillStyle = "#075bff";
  ctx.fillText(heroLine, W / 2, 176);

  /* ---- 理想型名字（叠在立绘下缘）+ 酒桌称号大字 ---- */
  let y = IMG_H - 46;
  ctx.font = font("900", 58);
  ctx.lineWidth = 10;
  ctx.strokeStyle = "#ffffff";
  ctx.strokeText(fitText(ctx, aha.idolName, 940), W / 2, y);
  ctx.fillStyle = "#07111f";
  ctx.fillText(fitText(ctx, aha.idolName, 940), W / 2, y);

  // 酒桌称号：电光蓝高对比横幅
  y = IMG_H + 26;
  ctx.font = font("900", 66);
  const tTxt = fitText(ctx, aha.title, 900);
  const tW = Math.min(W - 100, ctx.measureText(tTxt).width + 96);
  const bannerG = ctx.createLinearGradient((W - tW) / 2, 0, (W + tW) / 2, 0);
  bannerG.addColorStop(0, "#0047d8");
  bannerG.addColorStop(1, "#00bfe8");
  roundRect(ctx, (W - tW) / 2, y, tW, 100, 24);
  ctx.fillStyle = "#07111f";
  ctx.save();
  ctx.translate(8, 8);
  ctx.fill(); // 硬阴影
  ctx.restore();
  roundRect(ctx, (W - tW) / 2, y, tW, 100, 24);
  ctx.fillStyle = bannerG;
  ctx.fill();
  ctx.strokeStyle = "#07111f";
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.fillText(tTxt, W / 2, y + 74);
  ctx.fillStyle = "rgba(7,17,31,0.72)";
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

  // 卡片绘制器：冷白卡 + 深色描边 + 电光色条；返回卡高
  const drawCard = (x, cy, w, label, lines, accent, valSize, lineH) => {
    const padX = 32;
    const cardH = 56 + lines.length * lineH + 18;
    roundRect(ctx, x + 8, cy + 8, w, cardH, 20);
    ctx.fillStyle = "#07111f";
    ctx.fill();
    roundRect(ctx, x, cy, w, cardH, 20);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = "#07111f";
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.save();
    roundRect(ctx, x, cy, w, cardH, 20);
    ctx.clip();
    ctx.fillStyle = accent;
    ctx.fillRect(x, cy, 16, cardH);
    ctx.restore();
    ctx.textAlign = "left";
    ctx.fillStyle = "#075bff";
    ctx.font = font("900", 26);
    ctx.fillText(label, x + padX, cy + 44);
    ctx.fillStyle = "#07111f";
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
  y += drawCard(cardX, y, cardW, "相亲人物档案", [fitText(ctx, profileValue, cardW - 64)], "#075bff", 32, 42) + 18;
  // 行 1：最懂 TA 的人 + 容忍度（半宽并排）
  const c1 = cards[0], cTol = cards.find((c) => c.label === "容忍度");
  ctx.font = font("bold", 34);
  const h1 = drawCard(cardX, y, halfW, c1.label, [fitText(ctx, c1.value, halfW - 64)], "#00bfe8", 34, 44);
  drawCard(cardX + halfW + 20, y, halfW, cTol.label, [fitText(ctx, cTol.value, halfW - 64)], "#d7ff34", 34, 44);
  y += h1 + 22;
  // 行 2：一票否决（全宽，最多 2 行）
  const cVeto = cards.find((c) => c.label === "一票否决");
  if (cVeto) {
    ctx.font = font("bold", 34);
    const vLines = wrapText(ctx, cVeto.value, cardW - 64, 2);
    y += drawCard(cardX, y, cardW, cVeto.label, vLines, "#ff315c", 34, 44) + 20;
  }
  // 行 3：全场罚酒榜（收窄避开右下角二维码，单行截断）
  const cBoard = cards[cards.length - 1];
  const boardW = cardW - 260;
  ctx.font = font("bold", 30);
  drawCard(cardX, y, boardW, cBoard.label, [fitText(ctx, cBoard.value, boardW - 64)], "#ffb800", 30, 42);

  /* ---- 底部：二维码 + slogan ---- */
  const qrSize = 176;
  const qrX = W - 100 - qrSize, qrY = H - 120 - qrSize;
  roundRect(ctx, qrX - 14 + 7, qrY - 14 + 7, qrSize + 28, qrSize + 28, 20);
  ctx.fillStyle = "#07111f";
  ctx.fill();
  roundRect(ctx, qrX - 14, qrY - 14, qrSize + 28, qrSize + 28, 20);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.strokeStyle = "#07111f";
  ctx.lineWidth = 5;
  ctx.stroke();
  drawQR(ctx, siteUrl, qrX, qrY, qrSize, { dark: "#07111f", light: "#ffffff" });

  ctx.textAlign = "left";
  ctx.fillStyle = "#075bff";
  ctx.font = font("900", 44);
  ctx.fillText("今晚谁最懂 TA？", 100, H - 154);
  ctx.fillStyle = "rgba(7,17,31,0.76)";
  ctx.font = font("bold", 30);
  ctx.fillText("扫码进房 · 猜不中的都在罚酒", 100, H - 104);

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
