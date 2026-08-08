/* ==========================================================================
   酒吧大厅 lobby.js
   - 生成前景圆桌：点桌 → POST /api/table/:n/join → /?room=CODE&table=N
     （接口 404/失败时兜底走旧 POST /api/room）
   - 桌子状态轮询：GET /api/tables → 人数 N/8 + 暖光/冷光
     （接口没就绪时静默兜底：保持默认空桌，不报错）
   - 吧台单人位 → /?solo=1
   - 找朋友：吧台电话 → 输 4 位房间码 → /?room=CODE
   - 马丁氛围语录（低密度淡入淡出）、竖屏提示自动淡出
   ========================================================================== */
import { createBartender } from "./bartender.js";

const isPortrait = matchMedia("(orientation: portrait)").matches;

/* ---------------- 马丁氛围语录（原地淡入淡出，不横飞不刷屏） ---------------- */
const QUOTES = [
  "灯我调暗了点，看人更清楚。",
  "第一杯别喝太快。",
  "桌子都留着，人到就开。",
  "disco球转它的，你聊你的。",
  "吧台的位置，留给想清净的人。",
  "今晚的故事，喝着喝着就有了。",
  "找人就打吧台的电话，我带路。",
];
// 语录出现的安全锚点（%），避开 logo / 酒保 / 桌牌
const QUOTE_SPOTS = isPortrait
  ? [{ x: 30, y: 19 }, { x: 66, y: 19 }, { x: 26, y: 23 }, { x: 64, y: 23 }, { x: 48, y: 33 }]
  : [{ x: 14, y: 26 }, { x: 80, y: 24 }, { x: 12, y: 44 }, { x: 86, y: 42 }, { x: 32, y: 22 }, { x: 66, y: 44 }];

const quotesLayer = document.getElementById("quotes");

function spawnQuote(text, klass, spot) {
  if (!quotesLayer) return;
  const p = spot || QUOTE_SPOTS[Math.floor(Math.random() * QUOTE_SPOTS.length)];
  const el = document.createElement("span");
  el.className = "quote" + (klass ? " " + klass : "");
  el.textContent = text;
  el.style.left = p.x + (Math.random() * 6 - 3) + "%";
  el.style.top = p.y + (Math.random() * 4 - 2) + "%";
  quotesLayer.appendChild(el);
  el.addEventListener("animationend", () => el.remove());
}

let quoteIdx = Math.floor(Math.random() * QUOTES.length);
function loopQuotes() {
  spawnQuote(QUOTES[quoteIdx++ % QUOTES.length], Math.random() < 0.4 ? "cool" : "");
  setTimeout(loopQuotes, 9000 + Math.random() * 5000);
}
setTimeout(loopQuotes, 2600);

/* ---------------- 酒保马丁 ---------------- */
const K_LINES = [
  "今晚想喝点什么故事？",
  "先挑张桌子坐下，喝的我来想。",
  "人齐了就开局，不急。",
];
const K_SPOT = isPortrait ? { x: 66, y: 40 } : { x: 60, y: 42 };
let kIdx = 0;
const bartenderSlot = document.getElementById("bartenderSlot");
const bartender = createBartender(bartenderSlot, "idle");
bartenderSlot.addEventListener("click", () => {
  bartender.setState("talk");
  spawnQuote(K_LINES[kIdx++ % K_LINES.length], "cool", K_SPOT);
  setTimeout(() => bartender.setState("idle"), 3000);
});

/* ---------------- 圆桌布局（横竖屏都摆满 6 桌） ---------------- */
const floor = document.getElementById("floor");

// 位置用百分比：x 横向，y 纵向（相对 .floor 区域），s 桌面宽
const LAYOUT_LANDSCAPE = [
  { n: 1, x: 11, y: 38, s: 116 },
  { n: 2, x: 32, y: 68, s: 136 },
  { n: 3, x: 52, y: 36, s: 110 },
  { n: 4, x: 72, y: 66, s: 138 },
  { n: 5, x: 90, y: 32, s: 108 },
  { n: 6, x: 14, y: 80, s: 126 },
];
const LAYOUT_PORTRAIT = [
  { n: 1, x: 27, y: 24, s: 86 },
  { n: 2, x: 74, y: 27, s: 92 },
  { n: 3, x: 25, y: 55, s: 96 },
  { n: 4, x: 76, y: 58, s: 100 },
  { n: 5, x: 27, y: 85, s: 98 },
  { n: 6, x: 74, y: 88, s: 102 },
];

(isPortrait ? LAYOUT_PORTRAIT : LAYOUT_LANDSCAPE).forEach(({ n, x, y, s }) => {
  const btn = document.createElement("button");
  btn.className = "table";
  btn.type = "button";
  btn.dataset.table = n;
  btn.style.left = x + "%";
  btn.style.top = y + "%";
  btn.style.setProperty("--tw", s + "px");
  // 桌牌"点我"呼吸错峰，避免 6 张桌同频闪
  btn.style.setProperty("--sign-delay", (n - 1) * -0.6 + "s");
  btn.innerHTML = `
    <span class="table-sign">${n} 号桌</span>
    <span class="deck-badge" hidden></span>
    <span class="table-top" aria-hidden="true"></span>
    <span class="table-seats">0/8</span>`;
  btn.addEventListener("click", () => joinTable(n, btn));
  floor.appendChild(btn);
});

/* ---------------- 卡组徽标：本桌今晚在聊什么（COPY-PACK §4 三卡组名） ---------------- */
const DECK_BADGE = { man: "满分男", woman: "满分女", agent: "满分Agent" };

/* ---------------- 桌子状态轮询：人数 + 灯光 + 卡组徽标 ---------------- */
async function refreshTables() {
  try {
    const res = await fetch("/api/tables");
    if (!res.ok) throw new Error("tables not ready");
    const data = await res.json();
    if (!data || !Array.isArray(data.tables)) return;
    data.tables.forEach((t) => {
      const btn = floor.querySelector(`.table[data-table="${t.table}"]`);
      if (!btn) return;
      const players = Number(t.players) || 0;
      if (!btn.classList.contains("loading")) {
        btn.querySelector(".table-seats").textContent = `${players}/8`;
      }
      btn.classList.toggle("lit", players > 0);
      // 卡组徽标：只在有人的桌子上显示（空桌不挂牌）
      const badge = btn.querySelector(".deck-badge");
      if (badge) {
        const name = players > 0 ? DECK_BADGE[t.deck] : null;
        if (name) {
          badge.textContent = name;
          badge.dataset.deck = t.deck;
          badge.hidden = false;
        } else {
          badge.hidden = true;
        }
      }
    });
  } catch {
    /* 接口没就绪：保持默认空桌冷光，不报错 */
  }
}
refreshTables();
setInterval(refreshTables, 5000);

/* ---------------- 点桌入座（loading 态 + 兜底建房） ---------------- */
let joining = false;

async function joinTable(n, btn) {
  if (joining) return;
  joining = true;
  btn.classList.add("loading");
  const seats = btn.querySelector(".table-seats");
  const prevSeats = seats.textContent;
  seats.textContent = "带路中…";

  try {
    // 首选：桌子=固定房间
    try {
      const res = await fetch(`/api/table/${n}/join`, { method: "POST" });
      if (res.ok) {
        const { code } = await res.json();
        if (code) {
          location.href = `/?room=${code}&table=${n}`;
          return;
        }
      }
    } catch { /* 落到兜底 */ }
    // 兜底：旧建房接口
    const res2 = await fetch("/api/room", { method: "POST" });
    if (res2.ok) {
      const { code } = await res2.json();
      if (code) {
        location.href = `/?room=${code}`;
        return;
      }
    }
    throw new Error("no code");
  } catch {
    btn.classList.remove("loading");
    seats.textContent = prevSeats;
    joining = false;
    spawnQuote("线路有点堵，缓两秒再点。", "hot", isPortrait ? { x: 50, y: 30 } : { x: 50, y: 24 });
  }
}

/* ---------------- 吧台单人位：一个人？那你和我聊 ---------------- */
document.getElementById("soloSeat").addEventListener("click", () => {
  location.href = "/?solo=1";
});

/* ---------------- 我的主页常驻入口 + 未注册引导 ---------------- */
// 有身份 → 跳 /u.html?id=<ideal_userId>；无身份 → 引导去吧台调酒建档
const myUserId = localStorage.getItem("ideal_userId");
const homeEntry = document.getElementById("homeEntry");
const guestBanner = document.getElementById("guestBanner");
if (homeEntry) {
  homeEntry.addEventListener("click", () => {
    const id = localStorage.getItem("ideal_userId");
    if (id) {
      location.href = `/u.html?id=${encodeURIComponent(id)}`;
    } else {
      // 没身份：主页里没有你的柜子，先去吧台调杯酒把档案建起来
      location.href = "/v2/cocktail.html";
    }
  });
}
// 生面孔（无 ideal_userId）：顶部挂一条马丁口吻的引导横幅
if (!myUserId && guestBanner) {
  guestBanner.hidden = false;
  document.body.classList.add("guest-mode");
}

/* ---------------- 找朋友：吧台电话 → 房间码 ---------------- */
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
function closeCodeboard() {
  codeboard.hidden = true;
}

document.getElementById("findFriendsBtn").addEventListener("click", openCodeboard);
// 深链：/v2/lobby.html#find 直接打开找朋友
if (location.hash === "#find") openCodeboard();
document.getElementById("codeClose").addEventListener("click", closeCodeboard);
codeboard.addEventListener("click", (e) => {
  if (e.target === codeboard) closeCodeboard();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !codeboard.hidden) closeCodeboard();
});
codeInput.addEventListener("input", () => {
  codeInput.value = codeInput.value.replace(/\D/g, "").slice(0, 4);
  codeInput.classList.remove("err");
});
codeInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") goFindFriends();
});
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
    if (res.ok) {
      location.href = `/?room=${code}`;
      return;
    }
    codeMsg.textContent = "这桌还没开灯，再问问发码的人。";
  } catch {
    // 检查接口不可用：直接带过去，游戏页自己会处理
    location.href = `/?room=${code}`;
    return;
  }
  codeGo.disabled = false;
  codeGo.textContent = "带我过去";
}

/* ---------------- 竖屏提示：几秒后自动淡出 ---------------- */
const rotateHint = document.getElementById("rotateHint");
if (rotateHint && isPortrait) {
  setTimeout(() => rotateHint.classList.add("bye"), 6000);
}
