/* ==========================================================================
   酒吧大厅 lobby.js
   - 生成前景圆桌（点击 → window.onTableClick(n)）
   - 吧台单人位（点击 → window.onSoloClick()）
   - 酒保老K挂载（idle，点击互动切 talk 3 秒）
   - 欢呼弹幕循环（体育 bar 基因）
   ========================================================================== */
import { createBartender } from "./bartender.js";

// ---- 占位回调：整合线程替换成真实路由 ----
window.onTableClick = window.onTableClick || ((n) => {
  toastLog(`加入 ${n} 号桌（占位回调 onTableClick）`);
});
window.onSoloClick = window.onSoloClick || (() => {
  toastLog("坐上吧台单人位（占位回调 onSoloClick）");
});

function toastLog(msg) {
  console.log("[lobby]", msg);
  spawnDanmaku(msg, "hot");
}

// ---- 酒保 ----
const bartender = createBartender(document.getElementById("bartenderSlot"), "idle");
document.getElementById("bartenderSlot").addEventListener("click", () => {
  bartender.setState("talk");
  spawnDanmaku("老K：今晚想喝点什么故事？", "cool");
  setTimeout(() => bartender.setState("idle"), 3000);
});

// ---- 圆桌布局（横屏 6 桌 / 竖屏收成 4 桌） ----
const floor = document.getElementById("floor");
const isPortrait = matchMedia("(orientation: portrait)").matches;

// 位置用百分比：x 横向，y 纵向（相对 .floor 区域），s 桌面宽
const LAYOUT_LANDSCAPE = [
  { n: 1, x: 13, y: 34, s: 118 },
  { n: 2, x: 34, y: 58, s: 138 },
  { n: 3, x: 55, y: 32, s: 112 },
  { n: 4, x: 74, y: 60, s: 140 },
  { n: 5, x: 90, y: 30, s: 106 },
  { n: 6, x: 15, y: 78, s: 132 },
];
const LAYOUT_PORTRAIT = [
  { n: 1, x: 25, y: 24, s: 104 },
  { n: 2, x: 72, y: 32, s: 112 },
  { n: 3, x: 28, y: 62, s: 118 },
  { n: 4, x: 70, y: 74, s: 124 },
];

(isPortrait ? LAYOUT_PORTRAIT : LAYOUT_LANDSCAPE).forEach(({ n, x, y, s }) => {
  const btn = document.createElement("button");
  btn.className = "table";
  btn.type = "button";
  btn.style.left = x + "%";
  btn.style.top = y + "%";
  btn.style.setProperty("--tw", s + "px");
  btn.innerHTML = `
    <span class="table-sign">${n} 号桌</span>
    <span class="table-top" aria-hidden="true"></span>
    <span class="table-seats">最多 8 人</span>`;
  btn.addEventListener("click", () => window.onTableClick(n));
  floor.appendChild(btn);
});

// ---- 单人位 ----
document.getElementById("soloSeat").addEventListener("click", () => window.onSoloClick());

// ---- 弹幕（欢呼氛围） ----
const CHEERS = [
  "6号桌全对了！！罚酒罚酒",
  "有人爆灯 ✦ 全场起立",
  "这题我熬夜都答得出来",
  "老K的锐评太损了哈哈哈哈",
  "谁点的「甜心防火墙」，站出来",
  "3号桌已经开始第二轮了",
  "今晚的disco ball转得比我脑子快",
  "单身的坐吧台，成双的滚去圆桌",
  "灭灯！灭灯！灭灯！",
  "这杯我干了，你随意",
];
const danmakuLayer = document.getElementById("danmaku");

function spawnDanmaku(text, klass) {
  const el = document.createElement("span");
  el.className = "danmaku-item" + (klass ? " " + klass : "");
  el.textContent = text;
  el.style.top = 8 + Math.random() * 46 + "%";
  el.style.animationDuration = 9 + Math.random() * 6 + "s";
  danmakuLayer.appendChild(el);
  el.addEventListener("animationend", () => el.remove());
}

let cheerIdx = 0;
function loopDanmaku() {
  spawnDanmaku(
    CHEERS[cheerIdx++ % CHEERS.length],
    Math.random() < 0.3 ? (Math.random() < 0.5 ? "hot" : "cool") : ""
  );
  setTimeout(loopDanmaku, 2200 + Math.random() * 2600);
}
setTimeout(loopDanmaku, 800);
