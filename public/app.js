// 满分男 · 酒桌局 — 前端 SPA（无构建 vanilla JS）
import { sound, createShaker, celebrate, heartBurst, lampOffFx } from "./fx.js";
import {
  MESSAGE_REACTIONS,
  QUICK_REACTIONS,
  chatPayload,
  danmakuPayload,
  lightVotePayload,
  messageReactionPayload,
  quickReactionPayload,
  socialModel,
} from "./social.js";
import { LAOK_POOL } from "./laok-lines.js";

const $app = document.getElementById("app");
const $toast = document.getElementById("toast");

// 首屏只加载游戏壳和实时互动；题库、二维码、理想型和海报在进入对应环节后再取。
const lazyModules = {};
function lazyImport(key, path) {
  return lazyModules[key] || (lazyModules[key] = import(path));
}
const loadQuestions = () => lazyImport("questions", "./questions.js");
// 满分老板题库（P2 独占文件）：导出名 MODULE（{key,name,noun,desc,decks:{qingtang,fanqie,mala}}），全 neutral
const loadBoss = () => lazyImport("boss", "./questions-v2/boss.js");
const loadQr = () => lazyImport("qr", "./qrcode.js");
const loadPoster = () => lazyImport("poster", "./poster.js");
const loadIdealProfile = () => lazyImport("idealProfile", "./ideal-profile.js");
// 老K立绘（v2 共用模块，只 import 不改）：锐评 NPC 的小头像
const loadBartender = () => lazyImport("bartender", "./v2/bartender.js");
let buildIdealProfileFn = null;

const EMOJIS = ["🍺", "🍷", "🥃", "🍶", "🍸", "🍹", "🥂", "🍻", "🫗", "🧉"];
const DRINK_OPTIONS = [
  { id: "beer", label: "啤酒", emoji: "🍺" },
  { id: "wine", label: "红酒", emoji: "🍷" },
  { id: "baijiu", label: "白酒", emoji: "🥃" },
  { id: "cocktail", label: "调酒", emoji: "🍸" },
  { id: "soft", label: "无酒精", emoji: "🫧" },
];

// 「锅底」是题库数据键名（questions.js，不许改）；显示层映射成酒吧语系（世界观统一）
const DECK_DISPLAY = {
  "清汤锅底": "清爽款 · 温和不呛",
  "番茄锅底": "微醺款 · 酸甜带劲",
  "重口锅底": "上头款 · 后劲很大",
};
const deckLabel = (name) => DECK_DISPLAY[name] || name || "";

/* ---------- 卡组（R2）：开桌时选「今晚聊什么」 ----------
   随建房 POST /api/room body.deck 传后端；全桌以 state.deck 为准。
   g = 该卡组的题面方向（protagonist_setup 阶段由前端自动代发 set_gender）。 */
const ROOM_DECKS = {
  man: { name: "满分男", g: "m", line: "给男人打分，从来没这么理直气壮过" },
  woman: { name: "满分女", g: "f", line: "满分女的标准答案，今晚现场对" },
  boss: { name: "满分老板", g: "n", line: "落座，聊聊你那位满分老板的糟心操作" },
};
const roomDeckName = (key) => ROOM_DECKS[key]?.name || "满分男";

/* ---------- 每题国王（R2.5 号码对抗版）：指令卡池 ----------
   正式池来自 public/laok-lines.js 的 KING_ORDERS（P 线交付，可能晚到）；
   动态 import 失败 → 用内置 12 条兜底（后端在文件缺失时不校验 orderId，兜底可跑）。
   卡面用 {a}{b} 占位，替换成国王报的两个号码——国王报号时并不知道号背后是谁。 */
const FALLBACK_KING_ORDERS = [
  { id: "ko-01", text: "{a}号和{b}号斗鸡眼对视十秒，先笑的喝一杯" },
  { id: "ko-02", text: "{a}号和{b}号对喝一杯，谁慢谁再来一杯" },
  { id: "ko-03", text: "{a}号和{b}号各说对方一句真心话，敷衍的那个喝" },
  { id: "ko-04", text: "{a}号请{b}号喝一杯，理由现编，编不出自己喝" },
  { id: "ko-05", text: "{a}号和{b}号猜拳三局，输的把赢的那杯也喝了" },
  { id: "ko-06", text: "{a}号和{b}号碰杯，各夸对方一个优点，卡壳的喝" },
  { id: "ko-07", text: "{a}号和{b}号同时指认桌上最能喝的人，指得不一样两个都喝" },
  { id: "ko-08", text: "{a}号和{b}号背对背，同时答『谁先追的谁』，对不上一起喝" },
  { id: "ko-09", text: "{a}号夸{b}号一句，{b}号必须信，不信就喝" },
  { id: "ko-10", text: "{a}号和{b}号比相册照片谁多，少的那个喝" },
  { id: "ko-11", text: "{a}号和{b}号对视敬酒，先眨眼的喝" },
  { id: "ko-12", text: "{a}号和{b}号交换一句手机里的秘密，不换的喝" },
];
let kingOrdersCache = null; // [{id,text}]
function normalizeKingOrders(raw) {
  if (Array.isArray(raw)) {
    const list = raw
      .map((o, i) =>
        typeof o === "string"
          ? { id: o, text: o }
          : { id: String(o?.id ?? `ko-${i}`), text: String(o?.text ?? o?.id ?? "") })
      .filter((o) => o.id && o.text);
    return list.length ? list : null;
  }
  if (raw && typeof raw === "object") {
    const list = Object.entries(raw).map(([id, v]) => ({
      id,
      text: typeof v === "string" ? v : String(v?.text ?? id),
    }));
    return list.length ? list : null;
  }
  return null;
}
function loadKingOrders() {
  if (kingOrdersCache) return Promise.resolve(kingOrdersCache);
  return lazyImport("kingOrders", "./laok-lines.js")
    .then((mod) => {
      kingOrdersCache = normalizeKingOrders(mod?.KING_ORDERS) || FALLBACK_KING_ORDERS;
      return kingOrdersCache;
    })
    .catch(() => {
      kingOrdersCache = FALLBACK_KING_ORDERS;
      return kingOrdersCache;
    });
}
function kingOrderText(orderId, nums) {
  const pool = kingOrdersCache || FALLBACK_KING_ORDERS;
  let t = pool.find((o) => o.id === orderId)?.text || "";
  if (Array.isArray(nums) && nums.length === 2) {
    t = t.replace(/\{a\}/g, nums[0]).replace(/\{b\}/g, nums[1]);
  }
  return t;
}

// 调酒身份（/v2/cocktail.html 存的 ideal_cocktail）：跟人走，不让用户重选
function readCocktail() {
  try {
    const c = JSON.parse(localStorage.getItem("ideal_cocktail") || "null");
    return c && c.name ? c : null;
  } catch {
    return null;
  }
}

// 杯型 → 最接近的酒杯 emoji（可改，只是默认预选）
const GLASS_EMOJI = { martini: "🍸", highball: "🍹", rocks: "🥃", coupe: "🥂" };

const PARAMS = new URLSearchParams(location.search);

/* ---------- 本地状态 ---------- */
const ui = {
  screen: "home", // home | game
  name: localStorage.getItem("mfn_name") || "",
  emoji:
    localStorage.getItem("mfn_emoji") ||
    GLASS_EMOJI[readCocktail()?.glass] ||
    "🍺",
  drink: localStorage.getItem("mfn_drink") || "beer",
  deck: ROOM_DECKS[localStorage.getItem("mfn_deck")] ? localStorage.getItem("mfn_deck") : "man",
  seeking: null, // 注册档案「想看的取向」m|f|x（resolveSeeking 异步填充，join 时带上）
  gender: null, // 注册档案 viewer 自身性别 m|f（隔离铁桶用：直女/男同、直男/拉拉区分）
  solo: PARAMS.get("solo") === "1",
  table: /^[1-9]$/.test(PARAMS.get("table") || "") ? PARAMS.get("table") : "",
  code: PARAMS.get("room") || "",
  state: null, // 服务端下发的房间视图
  slider: 5,
  submitted: false, // 我本轮是否已提交分数/猜分
  commentDraft: "",
  commentSent: false,
  assigned: false,
  ahaStage: 0,
  posterUrl: null,
  posterBusy: false,
  shakeMode: null, // null | "motion" | "tap"
  shakeCharge: 0,
  stickDoneSent: false,
  stickDrawSent: false,
  tapCharge: 0,
  submitPendingAt: 0,
  lastPhase: null,
  lastDrawn: false,
  // 互动体系（PRD §9）
  chatOpen: false,
  chatLastSeen: 0,
  pickerFor: null, // 正在挑 emoji 回应的消息 id
  lastDmSent: 0,
  // R2 局内新体系
  genderSentFor: null, // protagonist_setup 自动代发 set_gender 的判重键
  lightSent: null, // 本题爆灯/灭灯已发出的判重键（乐观置灰）
  kingPick: { nums: [], orderId: null }, // 每题国王（号码版）：我选的两个号 + 指令卡
  kingSent: false,
  kingOrderPage: 0,
  laok: null, // 老K锐评 { key, text, loading }
};

let ws = null;
let shaker = null; // createShaker 实例
let reconnectTimer = null;
let reconnectAttempt = 0;

function toast(msg) {
  $toast.textContent = msg;
  $toast.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => $toast.classList.add("hidden"), 2600);
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// 本地预览模式：?preview=<screen>，仅 127.0.0.1/localhost 生效，供无头截图 QA
const PREVIEW =
  ["127.0.0.1", "localhost"].includes(location.hostname)
    ? new URLSearchParams(location.search).get("preview")
    : null;

// 返回 true=已发出，false=连接不可用（调用方需回滚本地乐观状态并提示）
function send(obj) {
  if (PREVIEW) return true; // 预览模式无连接，吞掉所有出站消息但视为成功
  if (ws && ws.readyState === 1) {
    try {
      ws.send(JSON.stringify(obj));
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

// 发送失败时统一提示，方便调用方 `if (!sendOrWarn(x)) { 回滚 }`
function sendOrWarn(obj) {
  const ok = send(obj);
  if (!ok) toast("线断了，再点一下");
  return ok;
}

/* ---------- 连接 ---------- */

async function createRoom({ solo = false, deck = "man" } = {}) {
  // solo:true 走同一入口，后端支持 1 人开局；deck = 今晚聊什么（R2 卡组）
  const res = await fetch("/api/room", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deck, ...(solo ? { solo: true } : {}) }),
  });
  const j = await res.json();
  if (!j.code) throw new Error(j.error || "这会儿桌子不够用，稍等再试");
  return j.code;
}

/* ---------- 注册档案「想看的取向 seeking + 自身性别 gender」 ----------
   join 时带给后端 → ①主角结算 buildIdealProfile 按 seeking 定画像方向；
   ②后端隔离铁桶按 (卡组×gender×seeking) 筛允许池（直女绝不吃 gay 等）。
   来源优先级：localStorage 缓存（注册页写入）→ GET /api/user/:id?token= 档案字段。 */
let seekingPromise = null;
function resolveSeeking() {
  if (!seekingPromise) {
    seekingPromise = (async () => {
      const cachedSeek = localStorage.getItem("ideal_seeking");
      const cachedGender = localStorage.getItem("ideal_gender");
      let seeking = ["m", "f", "x"].includes(cachedSeek) ? cachedSeek : null;
      let gender = ["m", "f"].includes(cachedGender) ? cachedGender : null;
      if ((!seeking || !gender) && !PREVIEW) {
        const id = localStorage.getItem("ideal_userId");
        const token = localStorage.getItem("ideal_token");
        if (id && token) {
          try {
            const j = await fetch(`/api/user/${id}?token=${encodeURIComponent(token)}`)
              .then((r) => (r.ok ? r.json() : null));
            if (j) {
              if (!seeking && ["m", "f", "x"].includes(j.seeking)) {
                seeking = j.seeking;
                localStorage.setItem("ideal_seeking", j.seeking);
              }
              if (!gender && ["m", "f"].includes(j.gender)) {
                gender = j.gender;
                localStorage.setItem("ideal_gender", j.gender);
              }
            }
          } catch {}
        }
      }
      return { seeking, gender };
    })().then((v) => {
      ui.seeking = v.seeking;
      ui.gender = v.gender;
      return v;
    });
  }
  return seekingPromise;
}

// 主页入口（顶栏「我的」+ 海报底部按钮共用）
function goMyPage() {
  const id = localStorage.getItem("ideal_userId");
  if (id) {
    location.href = "/u.html?id=" + encodeURIComponent(id);
  } else {
    toast("还没建档。先去吧台报个名字，我记住你。");
    setTimeout(() => (location.href = "/v2/cocktail.html"), 900);
  }
}

/* ---------- 昵称/身份 → KV 档案同步 ----------
   修复：调酒页建档时用户还没起昵称（档案=「匿名」），且建档请求可能被跳转打断。
   入座成功后在这里兜底：有档案就更新昵称；没档案（或 token 失效）就现场补建一份。 */
async function syncNickToProfile() {
  if (!ui.name || PREVIEW) return;
  const cocktail = readCocktail();
  const post = (body) =>
    fetch("/api/user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  try {
    const kvId = localStorage.getItem("ideal_userId");
    const kvToken = localStorage.getItem("ideal_token");
    if (kvId && kvToken) {
      const res = await post({ userId: kvId, token: kvToken, nick: ui.name });
      if (res.ok) return;
      if (res.status !== 403 && res.status !== 404) return; // 服务端一时不适，下次入座再同步
    }
    // 无档案或 token 失效 → 现场补建，把调酒身份一并带上
    const created = await post({
      nick: ui.name,
      cocktail: cocktail
        ? { name: cocktail.name, glass: cocktail.glass || "" }
        : undefined,
    }).then((r) => r.json());
    if (created.userId && created.token) {
      localStorage.setItem("ideal_userId", created.userId);
      localStorage.setItem("ideal_token", created.token);
    }
  } catch {}
}

function connect(code, { silentFail = false } = {}) {
  ui.code = code;
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  ws = new WebSocket(`${proto}//${location.host}/api/room/${code}/ws`);
  ws.onopen = () => {
    reconnectAttempt = 0; // 连上即重置退避
    hideReconnectBar();
    send({
      type: "join",
      name: ui.name,
      emoji: ui.emoji,
      drink: ui.drink,
      seeking: ui.seeking || undefined,
      gender: ui.gender || undefined,
      token: localStorage.getItem("mfn_token_" + code) || undefined,
    });
  };
  ws.onmessage = (e) => {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }
    onMessage(msg);
  };
  ws.onclose = (e) => {
    if (e.code === 4001) return; // 被踢，onMessage 已处理
    if (ui.screen === "game") scheduleReconnect();
  };
  ws.onerror = () => {
    if (!silentFail && ui.screen !== "game") toast("这桌没接上线。对一下房间码。");
  };
}

/* 断线重连：指数退避 1.5s→3→6→12，封顶 30s，带 ±25% jitter；
   连续 MAX_RECONNECT 次仍失败就停手，改成用户可点的重连条，避免重连风暴。 */
const MAX_RECONNECT = 6;
function scheduleReconnect() {
  clearTimeout(reconnectTimer);
  if (reconnectAttempt >= MAX_RECONNECT) {
    showReconnectBar();
    return;
  }
  const base = Math.min(30000, 1500 * Math.pow(2, reconnectAttempt));
  const delay = Math.round(base * (0.75 + Math.random() * 0.5));
  reconnectAttempt++;
  showReconnectBar(true);
  reconnectTimer = setTimeout(() => connect(ui.code, { silentFail: true }), delay);
}

function manualReconnect() {
  reconnectAttempt = 0;
  clearTimeout(reconnectTimer);
  connect(ui.code, { silentFail: true });
}

function reconnectBar() {
  let el = document.getElementById("reconnectBar");
  if (!el) {
    el = document.createElement("button");
    el.id = "reconnectBar";
    el.className = "reconnect-bar";
    el.type = "button";
    el.addEventListener("click", manualReconnect);
    document.body.appendChild(el);
  }
  return el;
}

function showReconnectBar(retrying = false) {
  const el = reconnectBar();
  el.textContent = retrying ? "线断了，我在给你重新接…" : "断线了。点这里回桌。";
  el.classList.toggle("retrying", retrying);
  el.classList.remove("hidden");
}

function hideReconnectBar() {
  document.getElementById("reconnectBar")?.classList.add("hidden");
}

function onMessage(msg) {
  if (msg.type === "welcome") {
    localStorage.setItem("mfn_token_" + ui.code, msg.token);
    localStorage.setItem("mfn_name", ui.name);
    localStorage.setItem("mfn_emoji", ui.emoji);
    localStorage.setItem("mfn_drink", ui.drink);
    // 入座成功 → 静默同步昵称/身份到 KV 档案（不阻塞，失败下次再补）
    syncNickToProfile();
    ui.screen = "game";
    if (msg.reconnected) toast("回来了？位子给你留着。");
    const u = new URL(location.href);
    u.searchParams.set("room", ui.code);
    history.replaceState(null, "", u);
    return;
  }
  if (msg.type === "error") {
    // solo 后端未就绪时的兜底：别硬卡，提示正常开桌
    if (ui.solo && /至少 ?2 ?人/.test(msg.msg || "")) {
      toast("单人桌还在备货。先按这桌叫个朋友，或过会儿再来。");
    } else {
      toast(msg.msg);
    }
    if (msg.code === "name_taken" || msg.code === "game_started") {
      ui.screen = "home";
      render();
    }
    return;
  }
  if (msg.type === "kicked") {
    localStorage.removeItem("mfn_token_" + ui.code);
    ui.screen = "home";
    ui.state = null;
    toast("房主请你先下桌了。门口坐会儿。");
    render();
    return;
  }
  if (msg.type === "danmaku") {
    spawnDanmaku(msg);
    return;
  }
  if (msg.type === "quick_reaction") {
    spawnDanmaku({ ...msg, text: msg.reaction });
    return;
  }
  if (msg.type === "light_fx") {
    playLightFx(msg);
    return;
  }
  if (msg.type === "king_chance") {
    // 有人分毫不差 → 国王牌出现（UI 由随后的 state 广播驱动，这里只做演出）
    sound.riff();
    return;
  }
  if (msg.type === "king_result") {
    // R2.5：国王报号揭晓 —— 公布号背后是谁 + 执行哪条指令
    const a = msg.names?.[0] || `${msg.nums?.[0] ?? "?"}号`;
    const b = msg.names?.[1] || `${msg.nums?.[1] ?? "?"}号`;
    sound.tick();
    spawnDanmaku({ name: "", emoji: "", text: `👑 ${a} 撞上 ${b}`, special: "dm-burst" });
    return;
  }
  if (msg.type === "shake") {
    // 别人在摇签：同步动画 + 哗啦声
    animateCup(msg.intensity);
    sound.rattle(msg.intensity);
    return;
  }
  if (msg.type === "state") {
    const prev = ui.state;
    ui.state = msg.state;
    const cur = msg.state.current;
    // 阶段切换时重置局部 UI 状态
    if (msg.state.phase !== ui.lastPhase || (cur && cur.question?.id) !== onMessage._qid) {
      ui.submitted = false;
      ui.submitPendingAt = 0;
      ui.commentSent = false;
      ui.assigned = false;
      // R2：每题爆灯 / 每题国王的本地状态随题重置
      ui.lightSent = null;
      ui.kingPick = { nums: [], orderId: null };
      ui.kingSent = false;
      ui.kingOrderPage = 0;
      if (msg.state.phase !== ui.lastPhase) {
        if (msg.state.phase === "aha") sound.riff(); // 理想型入场 riff
        if (msg.state.phase === "drinking") sound.chug();
        ui.ahaStage = 0;
        // 档案写入判重不在这里重置：saved 状态按 aha.id 持久化（见 savedAhaKeys）
        ui.ahaArtUrl = null; // 立绘确认可用后才写展示柜
        clearTimeout(ui.ahaSaveTimer);
        ui.ahaSaveTimer = null;
        ui.posterUrl = null;
        ui.stickDoneSent = false;
        if (msg.state.phase === "picking") {
          ui.shakeMode = null;
          ui.shakeCharge = 0;
          ui.tapCharge = 0;
          ui.stickDrawSent = false;
        }
      }
      ui.lastPhase = msg.state.phase;
      onMessage._qid = cur && cur.question?.id;
    }
    // 「已提交」以服务端 state 为准：瞬断丢包时本地会自动回到可重交状态。
    // 刚点完还没等到回执的 4s 内保留乐观显示，避免竞态广播导致的闪回。
    const optimistic = ui.submitPendingAt && Date.now() - ui.submitPendingAt < 4000;
    ui.submitted = derivedSubmitted(msg.state) || !!optimistic;
    // 出签瞬间：清脆「嗒」
    if (cur?.drawn && !ui.lastDrawn) sound.tick();
    ui.lastDrawn = !!cur?.drawn;
    render();
  }
}

// spice 由服务端下发，负数/超大值会让 repeat 抛 RangeError 卡死全房
function spiceLevel(v) {
  return Math.max(0, Math.min(5, Math.round(Number(v)) || 1));
}

// 我这一轮到底交没交：只看服务端下发的 current.submitted
function derivedSubmitted(s) {
  const cur = s?.current;
  if (!cur || !cur.submitted) return false;
  if (cur.youAreProtagonist) return !!cur.submitted.protagonist;
  return (cur.submitted.guessers || []).includes(s.you?.name);
}

/* ---------- 渲染 ---------- */

function render() {
  // 入场 class 只存在于真正的 screen/phase 切换；同阶段重绘不会让新 DOM 再次闪入。
  const key = ui.screen + ":" + (ui.state?.phase || "");
  const phaseChanged = key !== render._key;
  // 离开抽签屏必须拆掉 devicemotion 监听：否则整局都在响哗啦声、发无效 shake、操作已销毁的 DOM
  if (ui.state?.phase !== "picking" && shaker) {
    shaker.stop();
    shaker = null;
  }
  if (render._animationEnd) render._animationEnd();
  $app.classList.remove("phase-in");
  render._key = key;
  if (ui.screen === "home") {
    renderHome();
  } else {
    const s = ui.state;
    if (!s) {
      $app.innerHTML = `<div class="boot glass">给你找座位…</div>`;
    } else {
      switch (s.phase) {
        case "lobby": renderLobby(s); break;
        case "picking": renderPicking(s); break;
        case "protagonist_setup": renderSetup(s); break;
        case "answering": renderAnswering(s); break;
        case "reveal": renderReveal(s); break;
        case "drinking": renderDrinking(s); break;
        case "king": renderKing(s); break;
        case "aha": renderAha(s, s.aha, false); break;
        case "finished": renderFinished(s); break;
      }
    }
  }
  if (phaseChanged) {
    $app.classList.add("phase-in");
    const endAnimation = () => {
      $app.classList.remove("phase-in");
      $app.removeEventListener("animationend", endAnimation);
      clearTimeout(render._animationTimer);
      render._animationEnd = null;
    };
    render._animationEnd = endAnimation;
    $app.addEventListener("animationend", endAnimation);
    render._animationTimer = setTimeout(endAnimation, 900);
  }
  updateOverlays();
}

// 顶栏 logo：霓虹马天尼杯（从 assets-v2/logo.svg 的杯形 path 抽出内联，三层描边模拟霓虹管）
const BRAND_MARK_SVG = `<svg viewBox="0 0 132 100" aria-hidden="true" focusable="false">
  <g fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M 30 8 L 102 8 L 66 54 L 66 90 M 46 90 L 86 90 M 42 22 L 90 22" stroke="var(--neon-cyan)" stroke-width="15" opacity="0.32"/>
    <path d="M 30 8 L 102 8 L 66 54 L 66 90 M 46 90 L 86 90 M 42 22 L 90 22" stroke="var(--neon-cyan)" stroke-width="7" opacity="0.9"/>
    <path d="M 30 8 L 102 8 L 66 54 L 66 90 M 46 90 L 86 90 M 42 22 L 90 22" stroke="#c9f7ff" stroke-width="3"/>
  </g>
  <circle cx="66" cy="32" r="7" fill="var(--neon-pink)" opacity="0.55"/>
  <circle cx="66" cy="32" r="4" fill="#ffb0cd"/>
</svg>`;

function header(s, sub) {
  return `<div class="row">
    <div class="grow"><div class="brand-title"><span class="brand-mark" aria-hidden="true">${BRAND_MARK_SVG}</span><h1 class="neon">理想型<span class="amber">·</span>加载中</h1></div>
    ${sub ? `<div class="dim">${sub}</div>` : ""}</div>
    <button class="btn ghost small me-btn" id="meBtn" aria-label="进入我的主页">我的</button>
    <button class="btn ghost small" id="sndBtn">${sound.enabled ? "🔊" : "🔇"}</button>
  </div>`;
}

function bindSound() {
  document.getElementById("sndBtn")?.addEventListener("click", () => {
    sound.unlock();
    sound.toggle();
    render();
  });
  document.getElementById("meBtn")?.addEventListener("click", goMyPage);
}

/* --- 首页 --- */
function renderHome() {
  const cocktail = readCocktail();
  const deepJoin = !ui.solo && /^\d{4}$/.test(ui.code); // ?room 深链：入座是唯一主按钮
  const joinLabel = ui.table ? `在 ${esc(ui.table)} 号桌入座` : `在 ${esc(ui.code)} 桌入座`;
  const sub = ui.solo ? "吧台第一个位子，留给一个人来的" : "打分，猜分，罚酒";
  // 今晚聊什么（R2 卡组）：开桌才选；?room 深链跟桌走，不给选
  const deckPickHtml = deepJoin ? "" : `
    <div class="glass stack deck-pick">
      <label class="dim">今晚聊什么</label>
      <div class="deck-cards" id="deckCards">
        ${Object.entries(ROOM_DECKS).map(([k, d]) => `
        <button type="button" class="deck-card ${k === ui.deck ? "sel" : ""}" data-deck="${k}">
          <span class="dc-kicker">TONIGHT'S MENU</span>
          <b>${d.name}</b>
          <span class="dc-line">${d.line}</span>
        </button>`).join("")}
      </div>
    </div>`;
  $app.innerHTML = `
    ${header(null, sub)}
    <div class="glass stack">
      ${cocktail ? `
      <div class="cocktail-chip">
        <span class="ck-glass">${GLASS_EMOJI[cocktail.glass] || "🍸"}</span>
        <div class="grow"><b>你的今晚特调：${esc(cocktail.name)}</b>
        <span>这杯跟着你上桌。杯子我按它配好了，不合手就换。</span></div>
      </div>` : ""}
      <label class="dim">怎么称呼你</label>
      <input type="text" id="nameIn" maxlength="12" placeholder="比如：coco" value="${esc(ui.name)}" />
      <label class="dim">${cocktail ? "酒杯（按你的特调配的）" : "拿哪只杯子"}</label>
      <div class="emoji-grid" id="emojiGrid">
        ${EMOJIS.map((e) => `<button data-e="${e}" class="${e === ui.emoji ? "sel" : ""}">${e}</button>`).join("")}
      </div>
      <label class="dim">罚酒喝什么，先说好</label>
      <div class="emoji-grid drink-choice-grid" id="drinkGrid">
        ${DRINK_OPTIONS.map((d) => `<button data-drink="${d.id}" class="${d.id === ui.drink ? "sel" : ""}" title="${d.label}">${d.emoji}<small>${d.label}</small></button>`).join("")}
      </div>
    </div>
    ${deckPickHtml}
    ${ui.solo ? `
    <div class="glass stack">
      <div class="dim">一个人？正好，吧台这个位置视野最好。今晚我陪你聊。</div>
      <button class="btn" id="createBtn">坐下，跟老K喝一杯</button>
    </div>` : deepJoin ? `
    <div class="glass stack center">
      <div class="dim">${ui.table
        ? `${esc(ui.table)} 号桌，位子给你留着。坐下就开始。`
        : "朋友把你带到这桌了。坐下就开始。"}</div>
      <button class="btn" id="joinBtn">${joinLabel}</button>
      ${ui.table ? "" : `<button class="link-btn" id="createBtn">这桌不合适？另开一桌</button>`}
    </div>` : `
    <div class="glass stack">
      <button class="btn" id="createBtn">开一桌</button>
      <div class="dim center">桌子我给你留，人你自己叫。</div>
      <div class="row">
        <input type="text" id="codeIn" inputmode="numeric" maxlength="4" placeholder="4 位房间码" value="${esc(ui.code)}" class="grow" />
        <button class="btn ghost small" id="joinBtn" style="padding:14px 18px">入座</button>
      </div>
    </div>`}`;
  const nameIn = document.getElementById("nameIn");
  nameIn.addEventListener("input", () => (ui.name = nameIn.value.trim()));
  document.getElementById("emojiGrid").addEventListener("click", (ev) => {
    const b = ev.target.closest("button[data-e]");
    if (!b) return;
    ui.emoji = b.dataset.e;
    renderHome();
  });
  document.getElementById("drinkGrid").addEventListener("click", (ev) => {
    const b = ev.target.closest("button[data-drink]");
    if (!b) return;
    ui.drink = b.dataset.drink;
    renderHome();
  });
  document.getElementById("deckCards")?.addEventListener("click", (ev) => {
    const b = ev.target.closest("button[data-deck]");
    if (!b) return;
    ui.deck = b.dataset.deck;
    localStorage.setItem("mfn_deck", ui.deck);
    renderHome();
  });
  const go = async (create) => {
    sound.unlock();
    if (!ui.name) return toast("先留个称呼，我好记住你。");
    try {
      await resolveSeeking(); // 有注册档案就把「想看的取向」带上桌
      let code = deepJoin ? ui.code : (document.getElementById("codeIn")?.value.trim() || ui.code);
      if (create) code = await createRoom({ solo: ui.solo, deck: ui.deck });
      else {
        if (!/^\d{4}$/.test(code)) return toast("房间码是 4 位数字。");
        const chk = await fetch("/api/room/" + code).then((r) => r.json()).catch(() => null);
        if (!chk?.exists) return toast("这桌还没开。再对一眼房间码。");
      }
      connect(code);
    } catch (e) {
      toast(e.message);
    }
  };
  document.getElementById("createBtn")?.addEventListener("click", () => go(true));
  document.getElementById("joinBtn")?.addEventListener("click", () => go(false));
  bindSound();
}

/* --- 大厅 --- */
// 按本桌卡组取题库：man/woman → DECKS（m/f 题面）；boss → 满分老板（不分锅底，三段合成单池）
function decksForRoom(deckKey) {
  const q = renderLobby._q;
  if (!q) return null;
  if (deckKey === "boss") {
    const bm = q.BOSS_MODULE;
    if (!bm?.decks) return null;
    // R4：满分老板不分锅底，qingtang/fanqie/mala 三段 questions 合成一个池
    const questions = Object.values(bm.decks).flatMap((d) => (d?.questions || []));
    return { all: { name: bm.name || "满分老板", questions } };
  }
  return q.DECKS;
}

function renderLobby(s) {
  const me = s.you;
  const invite = `${location.origin}/?room=${s.code}`;
  const decks = decksForRoom(s.deck);
  const cocktail = readCocktail();
  const soloTable = ui.solo && s.players.length === 1;
  const canStart = decks && (s.players.length >= 2 || soloTable);
  const deckMeta = ROOM_DECKS[s.deck] || ROOM_DECKS.man;
  $app.innerHTML = `
    ${header(s, soloTable ? "吧台位。就你，和我" : "桌子留好了，把人叫来吧")}
    <div class="glass center stack">
      <div class="roomcode">${s.code}</div>
      <div class="deck-chip"><span class="dc-kicker">今晚聊</span><b>${esc(deckMeta.name)}</b><span class="dc-line">${esc(deckMeta.line)}</span></div>
      <div class="qr-wrap"><canvas id="qrCv" width="180" height="180"></canvas></div>
      <button class="btn ghost small" id="copyBtn">复制邀请链接</button>
      ${cocktail ? `
      <div class="cocktail-chip">
        <span class="ck-glass">${GLASS_EMOJI[cocktail.glass] || "🍸"}</span>
        <div class="grow"><b>今晚特调：${esc(cocktail.name)}</b>
        <span>这是你的身份，端稳。</span></div>
      </div>` : ""}
    </div>
    <div class="glass stack">
      <h2>这桌坐了 ${s.players.length} 个人</h2>
      <div class="players">${s.players.map((p) => `
        <div class="player ${p.connected ? "" : "offline"}">
          <span>${esc(p.emoji)}</span><b>${esc(p.name)}</b>
          <span class="dim">${esc(p.drink?.emoji || "🍺")} ${esc(p.drink?.label || "啤酒")}${cocktail && p.name === me.name ? ` · ${esc(cocktail.name)}` : ""}</span>
          ${p.isHost ? `<span class="tag">房主</span>` : ""}
          ${me.isHost && !p.isHost ? `<button class="btn ghost small kickBtn" data-t="${esc(p.token)}">请离</button>` : ""}
        </div>`).join("")}
      </div>
    </div>
    ${me.isHost ? `
    <div class="glass stack">
      <div class="settings-row">
        <label class="dim" for="roundsSel">${soloTable ? "跟我聊几题" : "每人几题"}</label>
        <select id="roundsSel">${[3,4,5,6,7,8].map((n) =>
          `<option value="${n}" ${n === s.settings.rounds ? "selected" : ""}>${n} 题</option>`).join("")}
        </select>
      </div>
      <div class="settings-row">
        <label class="dim" for="deckSel">今晚的酒劲</label>
        <select id="deckSel" ${decks ? "" : "disabled"}>${decks
          ? Object.entries(decks).map(([k, d]) =>
              `<option value="${k}" ${k === s.settings.deck ? "selected" : ""}>${esc(deckLabel(d.name))}</option>`).join("")
          : `<option>酒单还在我手里…</option>`}
        </select>
      </div>
      <button class="btn" id="startBtn" ${canStart ? "" : "disabled"}>${soloTable ? "开始，就我们俩" : "开局"}</button>
      ${!canStart && decks && !ui.solo ? `<div class="dim center">凑够 2 个人，酒才有味道。</div>` : ""}
    </div>` : `<div class="glass center dim">等房主开局。今晚的酒劲：${esc(deckLabel(s.settings.deckName))}</div>`}`;
  const qrCanvas = document.getElementById("qrCv");
  loadQr().then(({ drawQR }) => {
    if (qrCanvas?.isConnected) {
      const qrDark = (getComputedStyle(document.documentElement).getPropertyValue("--bar-bg-deep") || "").trim() || "#120a1c";
      drawQR(qrCanvas.getContext("2d"), invite, 0, 0, 180, { light: "#ffffff", dark: qrDark });
    }
  }).catch(() => qrCanvas?.closest(".qr-wrap")?.classList.add("hidden"));
  document.getElementById("copyBtn").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(invite); toast("链接给你了，去叫人。"); }
    catch { toast(invite); }
  });
  if (me.isHost && !renderLobby._q) {
    Promise.all([loadQuestions(), loadBoss().catch(() => null)]).then(([q, boss]) => {
      // P2 契约：boss.js 导出名为 MODULE（兼容 BOSS_MODULE 命名）
      renderLobby._q = { DECKS: q.DECKS, BOSS_MODULE: boss?.MODULE || boss?.BOSS_MODULE || null };
      if (ui.state?.phase === "lobby" && ui.state?.code === s.code) render();
    }).catch(() => toast("酒单半路洒了。刷新一下，我再拿一份。"));
  }
  if (me.isHost && decks) {
    const roundsSel = document.getElementById("roundsSel");
    const deckSel = document.getElementById("deckSel");
    const pushSettings = () => send({
      type: "set_settings",
      rounds: Number(roundsSel.value),
      deck: deckSel.value,
      deckName: decks[deckSel.value].name,
    });
    roundsSel.addEventListener("change", pushSettings);
    deckSel.addEventListener("change", pushSettings);
    document.getElementById("startBtn").addEventListener("click", () => {
      sound.unlock();
      const selectedDeck = decks[s.settings.deck] || decks.qingtang || Object.values(decks)[0];
      const startMsg = { type: "start", questions: selectedDeck.questions };
      if (s.deck === "boss") {
        const bm = renderLobby._q.BOSS_MODULE;
        startMsg.module = "boss";
        startMsg.moduleName = bm?.name || "满分老板";
        startMsg.noun = bm?.noun || { m: "满分老板", f: "满分老板", n: "满分老板" };
      }
      send(startMsg);
    });
  }
  $app.querySelectorAll(".kickBtn").forEach((b) =>
    b.addEventListener("click", () => send({ type: "kick", token: b.dataset.t })));
  bindSound();
}

/* --- 抽酒签 --- */
// 摇签过程播报：进度条配文案，老K在旁边看着
function stickChargeText(pct) {
  if (pct <= 0) return "";
  if (pct < 40) return `签筒醒了 · ${pct}%`;
  if (pct < 80) return `签在筒里打架 · ${pct}%`;
  return `有一支要跳出来了 · ${pct}%`;
}

function renderPicking(s) {
  const cur = s.current;
  const iShake = cur.youAreShaker;
  $app.innerHTML = `
    ${header(s, "摇签。看今晚谁坐主位")}
    <div class="glass stick-stage">
      <div class="stick-cup" id="cup">
        <div class="stick s1"></div><div class="stick s2"></div><div class="stick s3"></div>
      </div>
      ${cur.drawn ? `
        <div class="stick-out">今晚主角：${esc(cur.protagonist.emoji)} ${esc(cur.protagonist.name)}</div>
        ${iShake ? `<button class="btn" id="doneBtn">就是 TA，上桌</button>` : `<div class="dim">等 ${esc(cur.shaker)} 确认。</div>`}
      ` : iShake ? `
        <div class="progress" id="chargeBar">${stickChargeText(Math.round(ui.shakeCharge * 100))}</div>
        <div class="progress-track"><div class="progress-fill" id="chargeFill" style="width:${Math.round(ui.shakeCharge * 100)}%"></div></div>
      ` : `<div class="dim center">${esc(cur.shaker)} 在摇签。先把杯子端稳。</div>`}
    </div>`;
  bindSound();
  if (cur.drawn) {
    document.getElementById("doneBtn")?.addEventListener("click", () => {
      if (ui.stickDoneSent) return;
      ui.stickDoneSent = true;
      if (!sendOrWarn({ type: "stick_done" })) ui.stickDoneSent = false; // 断线回滚，允许重点
    });
    return;
  }
  if (!iShake) return;

  const onIntensity = throttleIntensity();
  const onCharged = () => {
    if (ui.stickDrawSent) return; // 达标后重复触发不再重发（与 stickDoneSent 同风格）
    ui.stickDrawSent = true;
    ui.shakeCharge = 1;
    send({ type: "draw_stick" });
  };

  document.getElementById("shakeBtn")?.addEventListener("click", async () => {
    sound.unlock(); // 用户手势：解锁音频
    shaker?.stop();
    shaker = createShaker();
    // iOS ≥13 授权在 requestAndStart 内部的手势上下文中发起（见 fx.js 注释）
    const ok = await shaker.requestAndStart({
      onIntensity: (v) => {
        onIntensity(v);
        addCharge(0); // 只刷新进度显示（charge 在 fx.js 内累计）
        ui.shakeCharge = Math.min(1, shaker.charge() / 130);
        updateChargeBar();
      },
      onCharged,
    });
    ui.shakeMode = ok ? "motion" : "tap";
    render();
    if (!ok) toast("你这手机摇不动签，改用连点。");
  });

  // 降级：点按/连点驱动同一套动画与出签
  // 充能量存在 ui 上：picking 阶段的任何 state 广播都会重渲染，局部变量会被清零导致永远点不满
  document.getElementById("tapBtn")?.addEventListener("click", () => {
    sound.unlock();
    const v = 0.7 + Math.random() * 0.3;
    onIntensity(v);
    ui.tapCharge += 16;
    ui.shakeCharge = Math.min(1, ui.tapCharge / 130);
    updateChargeBar();
    if (ui.tapCharge >= 130) onCharged();
  });

  // 签筒直接可点：首次点击触发摇动授权，失败自动降级为连点；后续点击在 tap 模式累加
  document.getElementById("cup")?.addEventListener("click", async () => {
    if (ui.shakeMode === null) {
      sound.unlock();
      shaker?.stop();
      shaker = createShaker();
      const ok = await shaker.requestAndStart({
        onIntensity: (v) => {
          onIntensity(v);
          addCharge(0);
          ui.shakeCharge = Math.min(1, shaker.charge() / 130);
          updateChargeBar();
        },
        onCharged,
      });
      ui.shakeMode = ok ? "motion" : "tap";
      if (!ok) {
        // 降级后立即算第一次点击
        const v = 0.7 + Math.random() * 0.3;
        onIntensity(v);
        ui.tapCharge += 16;
        ui.shakeCharge = Math.min(1, ui.tapCharge / 130);
        updateChargeBar();
        if (ui.tapCharge >= 130) onCharged();
      }
    } else if (ui.shakeMode === "tap") {
      sound.unlock();
      const v = 0.7 + Math.random() * 0.3;
      onIntensity(v);
      ui.tapCharge += 16;
      ui.shakeCharge = Math.min(1, ui.tapCharge / 130);
      updateChargeBar();
      if (ui.tapCharge >= 130) onCharged();
    }
  });

  function addCharge() {}
  function updateChargeBar() {
    const pct = Math.round(ui.shakeCharge * 100);
    const el = document.getElementById("chargeBar");
    if (el) el.textContent = stickChargeText(pct);
    const fill = document.getElementById("chargeFill");
    if (fill) fill.style.width = pct + "%";
  }
}

// 摇动强度：本地动画 + 哗啦声 + 节流广播（120ms）
function throttleIntensity() {
  let lastSent = 0;
  return (v) => {
    animateCup(v);
    sound.rattle(v);
    const now = performance.now();
    if (now - lastSent > 120) {
      lastSent = now;
      send({ type: "shake", intensity: Math.round(v * 100) / 100 });
    }
  };
}

// 摇晃动画：强度实时驱动签筒摆动幅度
let cupDecay = null;
function animateCup(intensity) {
  const cup = document.getElementById("cup");
  if (!cup) return;
  let amp = intensity;
  cancelAnimationFrame(cupDecay);
  const step = () => {
    if (amp < 0.02) { cup.style.transform = ""; return; }
    const r = (Math.random() - 0.5) * 36 * amp;
    const x = (Math.random() - 0.5) * 14 * amp;
    cup.style.transform = `rotate(${r}deg) translateX(${x}px)`;
    amp *= 0.88;
    cupDecay = requestAnimationFrame(step);
  };
  step();
}

/* --- 主角设定 ---
   R2：题面方向由本桌卡组（state.deck）决定，不再让主角二选一。
   主角端自动代发 set_gender（按题去重防重发），这屏只是过场。 */
function renderSetup(s) {
  const cur = s.current;
  const p = cur.protagonist;
  if (cur.youAreProtagonist) {
    const key = `${s.code}:${p?.name || ""}:${cur.roundIndex}`;
    if (ui.genderSentFor !== key) {
      ui.genderSentFor = key;
      send({ type: "set_gender", gender: ROOM_DECKS[s.deck]?.g || "m" });
    }
  }
  $app.innerHTML = `
    ${header(s, `今晚主角：${esc(p.emoji)} ${esc(p.name)}`)}
    <div class="glass stack center">
      <h2>${cur.youAreProtagonist ? "主角是你。杯子端稳。" : `主角是 ${esc(p.name)}。`}</h2>
      <div class="dim">${cur.youAreProtagonist
        ? `今晚聊${esc(roomDeckName(s.deck))}。我去拿题，你先喝一口。`
        : "题马上上桌。你先想想怎么猜。"}</div>
    </div>`;
  bindSound();
}

/* --- 老K锐评 NPC（R2）：/api/laok 非阻塞取词，到了再淡入，失败静默 --- */

const laokMemo = new Map(); // key -> 文案（"" = 请求中或失败，失败即静默）

// 从本地语录池随机取一条兜底文案（渲染期同步可用）
function pickPool(scene) {
  const pool = LAOK_POOL[scene] || LAOK_POOL.generic || [];
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : "";
}

function laokFetch(scene, ctx, key) {
  if (laokMemo.get(key) === "") return; // 已有请求在途，跳过
  if (!laokMemo.has(key)) laokMemo.set(key, ""); // 首次：标记请求中（无兜底时置空防闪）
  if (laokMemo.size > 60) laokMemo.delete(laokMemo.keys().next().value);
  const params = new URLSearchParams({ scene, ctx: JSON.stringify(ctx || {}) });
  fetch(`/api/laok?${params}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      const text = String(j?.text || "");
      if (!text) return;
      laokMemo.set(key, text);
      patchLaokBox(key);
    })
    .catch(() => {});
}

// 渲染期：该 key 已有文案才亮框；文案后到时由 patchLaokBox 现场淡入
function laokBoxHtml(key) {
  if (!laokMemo.has(key)) return "";
  const text = laokMemo.get(key);
  return `<div class="laok-box ${text ? "show" : ""}" data-laok-key="${esc(key)}">
    <span class="laok-avatar" aria-hidden="true"></span>
    <div class="laok-line"><b>老K</b><p class="laok-text">${esc(text)}</p></div>
  </div>`;
}

function patchLaokBox(key) {
  const box = document.querySelector(`.laok-box[data-laok-key="${CSS.escape(key)}"]`);
  if (!box) return;
  const p = box.querySelector(".laok-text");
  const newText = laokMemo.get(key) || "";
  if (p && newText && p.textContent !== newText) {
    // 兜底 → LLM 文案：淡出换字再淡入
    p.style.transition = "opacity 0.25s ease";
    p.style.opacity = "0";
    setTimeout(() => {
      p.textContent = newText;
      p.style.opacity = "";
    }, 250);
  } else if (p) {
    p.textContent = newText;
  }
  if (newText) box.classList.add("show");
  mountLaokAvatar();
}

function mountLaokAvatar() {
  const slot = document.querySelector(".laok-box.show .laok-avatar");
  if (!slot || slot.firstChild) return;
  loadBartender()
    .then(({ createBartender }) => {
      if (slot.isConnected && !slot.firstChild) createBartender(slot, "idle");
    })
    .catch(() => {});
}


/* --- 打分 / 猜分 --- */
function renderAnswering(s) {
  const cur = s.current;
  const me = cur.youAreProtagonist;
  const solo = !!s.solo;
  const waiting = cur.submitted.guessers;
  // solo 开局：老K先开口（solo_open），一局一次；先同步取兜底，再异步取 LLM 版
  if (solo) {
    const openKey = `open:${s.code}`;
    if (!laokMemo.has(openKey)) laokMemo.set(openKey, pickPool("solo_open"));
    laokFetch("solo_open", { deck: roomDeckName(s.deck), rounds: cur.totalRounds }, openKey);
  }
  $app.innerHTML = `
    ${header(s, solo ? `跟我聊的第 ${cur.roundIndex}/${cur.totalRounds} 题` : `${esc(cur.protagonist.name)}的第 ${cur.roundIndex}/${cur.totalRounds} 题`)}
    ${solo ? laokBoxHtml(`open:${s.code}`) : ""}
    <div class="glass question-card">
      ${esc(cur.question.text)}
      <div class="spice">${"🌶️".repeat(spiceLevel(cur.question.spice))}</div>
    </div>
    <div class="glass stack center">
      ${ui.submitted ? `
        <h2>你的分我收下了</h2>
        ${solo ? "" : `<div class="wait-list">已交卷：${waiting.map(esc).join("、") || "—"}${cur.submitted.protagonist ? "，主角的分也锁了" : "，等主角锁分"}</div>`}
      ` : `
        <div class="dim">${me
          ? (solo ? "跟我不用装。10=仍然满分，0=直接火化。" : "你的真实打分（10=仍然满分，0=直接火化）")
          : `盲猜 ${esc(cur.protagonist.name)} 会打几分。差 2 分以上，罚酒。`}</div>
        <div class="score-val" id="sv">${ui.slider}</div>
        <input type="range" id="slider" min="0" max="10" step="1" value="${ui.slider}" aria-label="打分" />
        <div class="slider-ticks">${Array.from({ length: 11 }, (_, i) => `<span>${i}</span>`).join("")}</div>
        <button class="btn" id="submitBtn">${me ? "锁定我的分" : "就猜这个分"}</button>
      `}
    </div>`;
  bindSound();
  mountLaokAvatar();
  if (!ui.submitted) {
    const sl = document.getElementById("slider");
    sl.addEventListener("input", () => {
      ui.slider = Number(sl.value);
      const sv = document.getElementById("sv");
      sv.textContent = sl.value;
      sv.classList.remove("bump");
      void sv.offsetWidth; // 重启动画
      sv.classList.add("bump");
    });
    document.getElementById("submitBtn").addEventListener("click", () => {
      sound.unlock();
      if (!sendOrWarn({ type: me ? "score" : "guess", v: ui.slider })) return; // 没发出去就别显示已提交
      ui.submitted = true;
      ui.submitPendingAt = Date.now();
      render();
    });
  }
}

/* --- 每题国王（R2.5 匿名号码版）：分毫不差者当国王，报两个号 + 一张指令卡，不点人 ---
   触发时全桌每人拿一张只有自己看得到的号码牌（state.you.seatNo，每题重洗）。
   国王按座号轮流报号：报号时并不知道号背后是谁，揭晓才公布「几号是谁」。 */

function kingResultLine(r) {
  const a = r.names?.[0] || `${r.nums?.[0] ?? "?"}号`;
  const b = r.names?.[1] || `${r.nums?.[1] ?? "?"}号`;
  const text = kingOrderText(r.orderId, r.nums);
  return `<div class="king-result-line">
    <b>${r.nums?.[0]}号是 ${esc(a)}，${r.nums?.[1]}号是 ${esc(b)}</b>
    <p class="king-order-text">${esc(text || "旨意他们自己听清了。照办。")}</p>
  </div>`;
}

function kingChanceHtml(s) {
  const cur = s.current;
  const kc = cur?.kingChance;
  if (!kc) return "";
  const byId = Object.fromEntries((s.players || []).map((p) => [p.id, p]));
  const me = s.you;
  const myNum = me?.seatNo;
  const N = kc.seatCount || 0;

  // 号码牌：一人一张，只有本人看得到自己的号（发牌动效由 CSS 播）
  const numCardHtml = `<div class="king-numcard" role="img" aria-label="你的匿名号码${myNum != null ? " " + myNum : ""}">
    <span class="knc-kicker">你的号码牌</span>
    <b class="knc-num">${myNum != null ? myNum : "—"}</b>
    <span class="knc-hint">只有你看得到自己是几号</span>
  </div>`;

  // 已报的号（逐条揭晓）
  const resultsHtml = (kc.results || []).length
    ? `<div class="king-results">${(kc.results || []).map(kingResultLine).join("")}</div>`
    : "";

  const iReported = (kc.results || []).some((r) => r.king === me?.id) || ui.kingSent;
  const iAmCurrent = kc.currentKing && kc.currentKing === me?.id && !iReported;
  const currentP = byId[kc.currentKing];
  const winnerNames = (kc.winners || []).map((id) => byId[id]?.name).filter(Boolean);

  if (kc.done) {
    return `<div class="glass king-chance-stage">
      ${numCardHtml}
      <div class="kc-head"><span class="kc-mini" aria-hidden="true"><b>K</b><span>♥</span></span><b>号都对上了</b></div>
      ${resultsHtml}
    </div>`;
  }

  if (iAmCurrent) {
    // 我是当前国王：选两个号 + 一张指令卡
    if (!kingOrdersCache) {
      loadKingOrders().then(() => {
        if (ui.state?.current?.kingChance && !ui.state.current.kingChance.done) render();
      });
    }
    const pool = kingOrdersCache || FALLBACK_KING_ORDERS;
    const pageSize = 3;
    const pages = Math.max(1, Math.ceil(pool.length / pageSize));
    const page = ui.kingOrderPage % pages;
    const options = pool.slice(page * pageSize, page * pageSize + pageSize);
    const picked = ui.kingPick.nums || [];
    const [na, nb] = picked;
    const numChips = Array.from({ length: N }, (_, i) => i + 1).map((n) => {
      const sel = picked.includes(n);
      const mineTag = n === myNum ? ` <small>(你)</small>` : "";
      return `<button type="button" class="king-num ${sel ? "sel" : ""}" data-num="${n}">${n}${mineTag}</button>`;
    }).join("");
    const preview = (na && nb && ui.kingPick.orderId) ? kingOrderText(ui.kingPick.orderId, [na, nb]) : "";
    const ready = na && nb && ui.kingPick.orderId && !ui.kingSent;
    return `<div class="glass king-chance-stage king-report">
      ${numCardHtml}
      <div class="kc-head"><span class="kc-mini" aria-hidden="true"><b>K</b><span>♥</span></span><b>你是国王。报两个号，谁是谁你猜不到——这才好玩。</b></div>
      ${resultsHtml}
      <div class="dim">先点两个号${na && nb ? `：已选 ${na}、${nb}` : `（1 到 ${N}）`}</div>
      <div class="king-nums" id="kingNums">${numChips}</div>
      <div class="dim">再挑一道旨</div>
      <div class="king-options" id="kingOrderList">
        ${options.map((o) => `<button type="button" class="king-option ${ui.kingPick.orderId === o.id ? "sel" : ""}" data-oid="${esc(o.id)}">${esc(String(o.text).replace(/\{a\}/g, na || "甲").replace(/\{b\}/g, nb || "乙"))}</button>`).join("")}
      </div>
      ${pages > 1 ? `<button type="button" class="link-btn" id="kingMoreBtn">这几道不顺手？换一批</button>` : ""}
      ${preview ? `<div class="king-order-preview">${esc(preview)}</div>` : ""}
      <button class="btn" id="kingSendBtn" ${ready ? "" : "disabled"}>${ui.kingSent ? "报出去了" : "报号"}</button>
    </div>`;
  }

  // 不是当前国王：已报过 / 排队中 / 不是 winner
  const iWin = (kc.winners || []).includes(me?.id);
  const waitLine = iReported
    ? "你的号报了。看下一个国王。"
    : iWin
      ? `按座号轮流报。轮到 ${esc(currentP?.name || "上一个国王")} 了，一会儿到你。`
      : `${esc(winnerNames.join("、") || "有人")} 猜得分毫不差，当国王报号。看看几号被点到。`;
  return `<div class="glass king-chance-stage">
    ${numCardHtml}
    <div class="kc-head"><span class="kc-mini" aria-hidden="true"><b>K</b><span>♥</span></span><b>${currentP ? esc(currentP.name) + " 正在报号" : "国王报号中"}</b></div>
    ${resultsHtml}
    <div class="dim">${waitLine}</div>
  </div>`;
}

function bindKingChance(s) {
  document.getElementById("kingNums")?.addEventListener("click", (ev) => {
    const b = ev.target.closest("button[data-num]");
    if (!b) return;
    const n = Number(b.dataset.num);
    const nums = ui.kingPick.nums || [];
    if (nums.includes(n)) ui.kingPick.nums = nums.filter((x) => x !== n);
    else if (nums.length < 2) ui.kingPick.nums = [...nums, n];
    else ui.kingPick.nums = [nums[1], n]; // 满两个后替换最早选的
    render();
  });
  document.getElementById("kingOrderList")?.addEventListener("click", (ev) => {
    const b = ev.target.closest("button[data-oid]");
    if (!b) return;
    ui.kingPick.orderId = b.dataset.oid;
    render();
  });
  document.getElementById("kingMoreBtn")?.addEventListener("click", () => {
    ui.kingOrderPage++;
    render();
  });
  document.getElementById("kingSendBtn")?.addEventListener("click", () => {
    const nums = ui.kingPick.nums || [];
    if (nums.length !== 2 || !ui.kingPick.orderId || ui.kingSent) return;
    sound.unlock();
    if (!sendOrWarn({ type: "king_order", nums: [nums[0], nums[1]], orderId: ui.kingPick.orderId })) return;
    ui.kingSent = true;
    render();
  });
}

/* --- 开牌 --- */
function renderReveal(s) {
  const cur = s.current;
  const rv = cur.reveal;
  const me = s.you;
  const solo = !!s.solo;

  // 悬念节奏（只在首次进入本轮开牌时播）：先各人猜分逐个亮 → 主角真分砸出 → 罚酒判定逐条弹
  const revealKey = `${cur.roundIndex}-${esc(cur.protagonist?.name || "")}-${rv.score}`;
  const fresh = renderReveal._key !== revealKey;
  renderReveal._key = revealKey;
  const n = rv.results.length;
  const rowD = (i) => (fresh ? `style="--d:${(i * 0.12).toFixed(2)}s"` : "");
  const scoreDelay = n * 0.12 + 0.35;
  const verdictAt = scoreDelay + 0.55; // 秒
  const badgeD = (i) => (fresh ? `style="--d:${(verdictAt + i * 0.09).toFixed(2)}s"` : "");

  // R2 每题爆灯：reveal.lights = {playerId: "burst"|"off"}
  const lights = rv.lights || {};
  const idByName = Object.fromEntries((s.players || []).map((p) => [p.name, p.id]));
  const rowLamp = (name) => {
    const v = lights[idByName[name]];
    return v ? `<span class="row-lamp ${v === "burst" ? "on" : "dead"}" title="${v === "burst" ? "爆灯" : "灭灯"}"></span>` : "";
  };
  const myLight = lights[me.id] || null;
  const lightLocked = !!myLight || ui.lightSent === revealKey;
  const burstCount = Object.values(lights).filter((v) => v === "burst").length;
  const offCount = Object.values(lights).filter((v) => v === "off").length;

  // 老K锐评：先同步取一条兜底文案（立即可见），再非阻塞异步取 LLM 版到了后替换
  const laokKey = `rv:${s.code}:${revealKey}`;
  const avgDiff = n ? rv.results.reduce((a, x) => a + (Number(x.diff) || 0), 0) / n : 0;
  const laokScene = solo
    ? "solo_react"
    : cur.kingChance ? "king_chance" : avgDiff <= 1 ? "reveal_close" : "reveal_far";
  if (!laokMemo.has(laokKey)) laokMemo.set(laokKey, pickPool(laokScene));
  laokFetch(laokScene, {
    q: String(rv.question || "").slice(0, 48),
    score: rv.score,
    avgDiff: Math.round(avgDiff * 10) / 10,
    drinks: rv.results.filter((x) => x.drink).length,
    exact: rv.results.filter((x) => x.exact).length,
  }, laokKey);

  $app.innerHTML = `
    ${header(s, `开牌 · 第 ${cur.roundIndex}/${cur.totalRounds} 题`)}
    <div class="glass center stack">
      <div class="dim">${esc(rv.question)}</div>
      <div class="big-score ${fresh ? "seq-score" : ""}" ${fresh ? `style="--d:${scoreDelay.toFixed(2)}s"` : ""}>${rv.score}<span class="unit">分</span></div>
      ${rv.comment ? `<div class="detail-item">主角补刀：${esc(rv.comment)}</div>` : ""}
    </div>
    ${laokBoxHtml(laokKey)}
    ${solo ? "" : `<div class="glass stack">
      ${rv.results.map((x, i) => `
        <div class="reveal-row ${fresh ? "seq" : (x.drink ? "drink" : "") + " " + (x.exact ? "exact" : "")}" data-i="${i}" ${rowD(i)}>
          <span>${esc(x.emoji)}</span>${rowLamp(x.name)}<b>${esc(x.name)}</b>
          ${x.exact ? `<span class="badge exact ${fresh ? "seq-pop" : ""}" ${badgeD(i)}>懂TA+1</span>` : ""}
          ${x.drink ? `<span class="badge drink ${fresh ? "seq-pop" : ""}" ${badgeD(i)}>罚酒</span>` : ""}
          <span class="g">${x.guess}</span>
        </div>`).join("")}
    </div>`}
    <div class="glass stack center light-panel round-light-panel">
      ${solo
        ? (lightLocked
            ? `<div class="light-count">你给这张卡：${myLight === "off" ? "🖤 灭灯（就这点，pass）" : "💗 爆灯（瑕不掩瑜）"}</div>
               <div class="dim">一张卡一盏灯，点了就定。今晚的爆/灭灯率会记进你的展示柜。</div>`
            : `<div class="dim">这条「满分但是…」，你给爆灯还是灭灯？💗 爆灯=瑕不掩瑜 · 🖤 灭灯=就这点 pass。</div>
               <div class="row light-btns">
                 <button class="btn light-burst grow" id="roundBurstBtn">💗 爆灯</button>
                 <button class="btn light-off grow" id="roundOffBtn">灭灯</button>
               </div>`)
        : (cur.youAreProtagonist
            ? `<div class="light-count">这题的你：爆灯 <b>${burstCount}</b> · 灭灯 <b>${offCount}</b></div>
               <div class="dim">灯是他们对这题的你亮的。别紧张，灯不咬人。</div>`
            : lightLocked
              ? `<div class="light-count">你这票：${myLight === "off" ? "🖤 灭灯" : "💗 爆灯"}</div>
                 <div class="dim">一题一盏灯，落了就不改。</div>`
              : `<div class="dim">这题的 ${esc(cur.protagonist?.name || "主角")}，心动还是下头？一题只有一票。</div>
                 <div class="row light-btns">
                   <button class="btn light-burst grow" id="roundBurstBtn">💗 爆灯</button>
                   <button class="btn light-off grow" id="roundOffBtn">灭灯</button>
                 </div>`)}
    </div>
    ${kingChanceHtml(s)}
    ${!solo && cur.youAreProtagonist && !ui.commentSent && !rv.comment ? `
    <div class="glass row">
      <input type="text" id="cmtIn" maxlength="100" placeholder="补刀一句（可选）" class="grow" value="${esc(ui.commentDraft)}" />
      <button class="btn ghost small" id="cmtBtn">发</button>
    </div>` : ""}
    ${me.isHost ? `<button class="btn" id="nextBtn">${rv.results.some((x) => x.drink) ? "进入罚酒仪式" : (cur.roundIndex >= cur.totalRounds ? "看 TA 的理想型" : "下一题")}</button>` : `<div class="dim center">酒还没醒，房主手里的牌还没翻。稍等。</div>`}`;
  bindSound();
  mountLaokAvatar();
  bindKingChance(s);
  if (fresh) {
    // 罚酒判定时刻：行底色/抖动/飘字/高光，一次性播放
    rv.results.forEach((x, i) => {
      if (!x.drink && !x.exact) return;
      setTimeout(() => {
        const row = $app.querySelector(`.reveal-row[data-i="${i}"]`);
        if (!row) return;
        if (x.drink) {
          row.classList.add("drink", "drink-shake");
          const f = document.createElement("span");
          f.className = "float-txt";
          f.textContent = "🍺 +1杯";
          row.appendChild(f);
          setTimeout(() => f.remove(), 700);
        }
        if (x.exact) row.classList.add("exact");
      }, (verdictAt + i * 0.09) * 1000);
    });
    if (rv.results.some((x) => x.exact)) {
      setTimeout(() => { celebrate(); sound.tick(); }, verdictAt * 1000 + 150);
    }
  }
  const castRoundLight = (value) => {
    sound.unlock();
    if (!sendOrWarn(lightVotePayload(value))) return;
    ui.lightSent = revealKey; // 乐观置灰；服务端 reveal.lights 广播为准
    if (PREVIEW) {
      rv.lights = { ...(rv.lights || {}), [me.id]: value };
      playLightFx({ name: me.name, on: value === "burst" });
    }
    render();
  };
  document.getElementById("roundBurstBtn")?.addEventListener("click", () => castRoundLight("burst"));
  document.getElementById("roundOffBtn")?.addEventListener("click", () => castRoundLight("off"));
  const cmtIn = document.getElementById("cmtIn");
  cmtIn?.addEventListener("input", () => (ui.commentDraft = cmtIn.value));
  document.getElementById("cmtBtn")?.addEventListener("click", () => {
    if (!ui.commentDraft.trim()) return;
    ui.commentSent = true;
    if (!sendOrWarn({ type: "comment", text: ui.commentDraft.trim() })) ui.commentSent = false;
  });
  document.getElementById("nextBtn")?.addEventListener("click", () => sendOrWarn({ type: "next" }));
}

/* --- CHUG CHUG CHUG 罚酒仪式 --- */
function renderDrinking(s) {
  const cur = s.current;
  const ceremony = cur.drinking || { drinkers: [], completed: 0, total: 0 };
  const finished = ceremony.allDone || ceremony.skipped;
  $app.innerHTML = `
    ${header(s, `罚酒仪式 · 第 ${cur.roundIndex}/${cur.totalRounds} 题`)}
    <section class="chug-stage">
      <div class="chug-title">CHUG<br>CHUG<br>CHUG</div>
      <div class="chug-beat">举杯。干了。</div>
      <div class="drinkers-grid">
        ${ceremony.drinkers.map((item) => `
          <div class="drinker-card ${item.done ? "done" : ""}">
            <div class="drink-cup">${esc(item.drink?.emoji || "🍺")}</div>
            <div><b>${esc(item.emoji)} ${esc(item.name)}</b><div class="dim">${esc(item.drink?.label || "啤酒")} × ${item.cups} 杯 · 差 2 分就是这个下场</div></div>
            <div class="drink-progress" style="--drink-progress:${item.done ? 100 : 18}%"></div>
          </div>`).join("")}
      </div>
      <div class="center dim">已完成 ${ceremony.completed}/${ceremony.total}${ceremony.skipped ? " · 房主发话，这轮免了" : ""}</div>
      <div class="chug-actions">
        ${ceremony.canConfirm ? `<button class="btn" id="drinkDoneBtn">我喝完了</button>` : ""}
        ${s.you.isHost && !finished ? `<button class="btn ghost" id="skipDrinkBtn">这轮我请，跳过</button>` : ""}
        ${s.you.isHost && finished ? `<button class="btn" id="nextBtn">${cur.roundIndex >= cur.totalRounds ? "看 TA 的理想型" : "下一题"}</button>` : ""}
      </div>
      ${!s.you.isHost && !ceremony.canConfirm && !finished ? `<div class="center dim">等他们把杯子放下。</div>` : ""}
    </section>`;
  bindSound();
  document.getElementById("drinkDoneBtn")?.addEventListener("click", () => sendOrWarn({ type: "drink_done" }));
  document.getElementById("skipDrinkBtn")?.addEventListener("click", () => sendOrWarn({ type: "skip_drinking" }));
  document.getElementById("nextBtn")?.addEventListener("click", () => sendOrWarn({ type: "next" }));
}

/* --- 国王阶段（R2.5）：终局大国王已删除。
   此阶段仅作每题号码国王的延续容器：号码牌 + 报号 + 揭晓，房主看完放行。
   （前端不再发 kingQuestions，后端全员命中的终局 king 不会触发；此处仅防御性兜底。） --- */
function renderKing(s) {
  $app.innerHTML = `
    ${header(s, "国王报号")}
    ${kingChanceHtml(s)}
    ${s.you?.isHost
      ? `<button class="btn" id="nextBtn">${s.current?.kingChance && !s.current.kingChance.done ? "等号都报完" : "旨意办完，下一题"}</button>`
      : `<div class="dim center">照旨意办。办不到的，自罚一杯。</div>`}`;
  bindSound();
  bindKingChance(s);
  document.getElementById("nextBtn")?.addEventListener("click", () => sendOrWarn({ type: "next" }));
}

/* --- Aha 结算卡：立绘 → 相亲档案 → 相处细节 --- */

// 档案契约完整性：三大块之外，第 2/3 页硬消费的字段也必须在
// （老房间/旧 worker 存的 profile 可能是缺字段的旧契约 → 本地重建补全）
function isCompleteProfile(p) {
  return !!(p?.portrait && p?.matchCard && p?.relationship
    && Array.isArray(p.matchCard.keywords) && p.matchCard.birthDate
    && Array.isArray(p.relationship.details) && p.relationship.heading);
}

function resolveAhaProfile(aha) {
  if (isCompleteProfile(aha.profile)) return aha.profile;
  if (!buildIdealProfileFn) return aha.profile || {};
  const rebuilt = buildIdealProfileFn({
    records: [],
    genderPreference: aha.gender,
    seed: aha.id || `ideal:${aha.stats?.avgScore || 0}`,
  });
  // 服务端已有的字段优先（真实答题数据算出来的），本地重建只补缺
  const src = aha.profile || {};
  return {
    ...rebuilt,
    ...src,
    portrait: { ...rebuilt.portrait, ...(src.portrait || {}) },
    matchCard: { ...rebuilt.matchCard, ...(src.matchCard || {}) },
    relationship: { ...rebuilt.relationship, ...(src.relationship || {}) },
  };
}

function safeProfileColor(value, fallback) {
  return /^#[0-9a-f]{6}$/i.test(String(value || "")) ? value : fallback;
}

// 主角本人第一次看到自己的 aha 档案时，静默写入 KV 用户记录。
// 展示柜修复：等立绘真实加载成功后再写（confirmedUrl=实际加载成功的 URL），
// 避免展示柜里存一堆打不开的图；立绘 10s 还没消息就按默认 URL 兜底写入。
// 判重修复（P0-2）：saved 标志按 aha.id 持久化（localStorage），不随 phase 切换/刷新重置，
// finished 阶段复用 renderAha 回看时不会再写第二条。
const AHA_SAVED_LS = "mfn_aha_saved";
const savedAhaKeys = (() => {
  try { return new Set(JSON.parse(localStorage.getItem(AHA_SAVED_LS) || "[]")); }
  catch { return new Set(); }
})();
function persistSavedAhaKeys() {
  try { localStorage.setItem(AHA_SAVED_LS, JSON.stringify([...savedAhaKeys].slice(-50))); } catch {}
}
function ahaSaveKey(s, aha) {
  return aha?.id || `${s?.code || ""}:${aha?.protagonist?.name || ""}`;
}
function ahaAlreadySaved(s, aha) {
  return savedAhaKeys.has(ahaSaveKey(s, aha));
}

async function maybeSaveAhaProfile(s, aha, profile, confirmedUrl) {
  const key = ahaSaveKey(s, aha);
  if (savedAhaKeys.has(key)) return;
  // 只写「自己的」档案：finished 回看别人的 aha 时 current.youAreProtagonist 可能仍是 true
  if (!aha?.protagonist?.name || aha.protagonist.name !== s.you?.name) return;
  const userId = localStorage.getItem("ideal_userId");
  const token  = localStorage.getItem("ideal_token");
  if (!userId || !token) return;
  savedAhaKeys.add(key); // 乐观锁，防止重复提交
  persistSavedAhaKeys();
  try {
    const portrait = profile.portrait || {};
    const card     = profile.matchCard || {};
    const rel      = profile.relationship || {};
    await fetch(`/api/user/${userId}/records`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId, token,
        module: s.settings?.module || "lover",
        role: s.you?.isHost ? "host" : "player",
        ts: Date.now(),
        profile: {
          archetype: card.archetype || "",
          title: card.title || "",
          mbti: card.mbti || "",
          occupation: card.occupation || "",
          avgScore: aha.stats?.avgScore ?? 0,
          imageUrl: confirmedUrl || portrait.imageUrl || aha.imageUrl || "",
          summary: rel.coreText || profile.coreText || "",
          // R3 字段契约：展示柜爆/灭灯统计（后端 sanitizeRecordProfile 白名单放行）
          burstTotal: aha.stats?.lights?.burst ?? 0,
          offTotal: aha.stats?.lights?.off ?? 0,
        },
      }),
    });
  } catch {
    savedAhaKeys.delete(key); // 失败允许下次重试
    persistSavedAhaKeys();
  }
}

function renderAha(s, aha, isFinal) {
  const me = s.you;
  aha = aha || {};
  if (!isCompleteProfile(aha.profile) && !buildIdealProfileFn) {
    $app.innerHTML = `${header(s, "理想型加载中")}<div class="boot glass">档案在路上。TA在里面挑今晚穿什么。</div>`;
    bindSound();
    loadIdealProfile().then(({ buildIdealProfile }) => {
      buildIdealProfileFn = buildIdealProfile;
      if (["aha", "finished"].includes(ui.state?.phase)) render();
    }).catch(() => toast("档案没送到。刷新一下，我再去催一遍。"));
    return;
  }
  const profile = resolveAhaProfile(aha) || {};
  // 契约防御（P0-1）：任何字段缺失都不许抛异常，缺哪块就跳过哪块
  const card = profile.matchCard || {};
  const portrait = profile.portrait || {};
  const relationship = profile.relationship || {};
  const keywords = Array.isArray(card.keywords) ? card.keywords : [];
  const details = Array.isArray(relationship.details) ? relationship.details : [];
  const solo = !!s.solo;
  // 展示柜写入时机：立绘确认加载成功（ui.ahaArtUrl 有值）后带确认 URL 写；
  // 若图迟迟不来，10s 兜底按默认 URL 写（异步生成场景不丢记录）。
  if (ui.ahaArtUrl != null) {
    maybeSaveAhaProfile(s, aha, profile, ui.ahaArtUrl); // 静默写 KV，不等 await
  } else if (!ui.ahaSaveTimer && !ahaAlreadySaved(s, aha) && aha.protagonist?.name === s.you?.name) {
    ui.ahaSaveTimer = setTimeout(() => {
      if (!ahaAlreadySaved(s, aha) && ["aha", "finished"].includes(ui.state?.phase)) {
        maybeSaveAhaProfile(s, aha, profile, "");
      }
    }, 10000);
  }
  const primary = safeProfileColor(portrait.palette?.primary, "#ff2d78");
  const accent = safeProfileColor(portrait.palette?.accent, "#2de2ff");
  const stages = ["理想型亮相", "相亲人物档案", "相处细节"];
  const stage = Math.max(0, Math.min(2, ui.ahaStage || 0));
  const lt = aha.light || { burst: 0, off: 0, voted: 0, total: 0, mine: null, burstNames: [], offNames: [] };
  const mine = lt.mine ?? lt.yours ?? null;
  const canVote = !isFinal && s.phase === "aha" && (lt.canVote ?? !s.current?.youAreProtagonist);
  const lampRow = Array.from({ length: Math.max(lt.total || 0, (lt.burst || 0) + (lt.off || 0)) }, (_, i) =>
    `<span class="lamp ${i < lt.burst ? "on" : i < lt.burst + lt.off ? "dead" : "pending"}"></span>`
  ).join("");
  const chipText = portrait.archetype || card.archetype || "";
  const titleLine = [aha.title, aha.titleSub].filter(Boolean).map(esc).join(" · ");
  const gridCells = [
    ["出生日期", card.birthDate], ["星座", card.zodiac],
    ["职业", card.occupation, "wide"], ["身份", card.identity, "wide"],
  ].filter((cell) => cell[1]);
  const stageBody = stage === 0 ? `
    <div class="aha-stage portrait-stage" style="--profile-primary:${primary};--profile-accent:${accent}">
      <div class="art-wrap" id="artWrap">
        <div class="art-fallback"><b>${esc(chipText)}</b><span>${esc(card.presentation || "")}</span></div>
        <img id="artImg" src="${esc(portrait.imageUrl || aha.imageUrl || "")}" alt="${esc(portrait.alt || (chipText ? `${chipText}理想型立绘` : "理想型立绘"))}" />
        ${chipText ? `<span class="archetype-chip">${esc(chipText)}</span>` : ""}
      </div>
      <div class="caption">
        <b class="ideal-name">${esc(card.archetype || "理想型档案")}</b>
        <div class="ideal-meta">${[card.mbti, card.presentation, relationship.chemistry]
          .filter(Boolean).map((m) => `<span>${esc(m)}</span>`).join("")}</div>
        ${titleLine ? `<div class="dim">${titleLine}</div>` : ""}
      </div>
    </div>` : stage === 1 ? `
    <div class="aha-stage profile-stage" style="--profile-primary:${primary};--profile-accent:${accent}">
      <div class="profile-kicker">MATCH FILE / 02</div>
      <div class="profile-title-row"><div><b class="ideal-name">理想型档案</b><div class="dim">${[card.archetype, card.presentation].filter(Boolean).map(esc).join(" · ")}</div></div>${card.mbti ? `<span class="mbti-badge">${esc(card.mbti)}</span>` : ""}</div>
      ${gridCells.length ? `<div class="profile-grid">
        ${gridCells.map(([label, value, wide]) => `<div${wide ? ` class="wide"` : ""}><span>${label}</span><b>${esc(value)}</b></div>`).join("")}
      </div>` : ""}
      ${keywords.length ? `<div class="keyword-row">${keywords.map((x) => `<span>${esc(x)}</span>`).join("")}</div>` : ""}
      ${card.bio ? `<p class="profile-bio">${esc(card.bio)}</p>` : ""}
      <div class="fiction-note">角色档案由本局答案生成，人物信息均为虚构</div>
    </div>` : `
    <div class="aha-stage relationship-stage" style="--profile-primary:${primary};--profile-accent:${accent}">
      <div class="profile-kicker">CHEMISTRY / 03</div>
      <h2>${esc(relationship.heading || "相处说明书")}</h2>
      ${relationship.chemistry ? `<div class="chemistry-tag">${esc(relationship.chemistry)}</div>` : ""}
      ${details.length
        ? `<div class="relationship-list">${details.map((d, i) => `<div class="detail-item"><span>${String(i + 1).padStart(2, "0")}</span><p>${esc(d)}</p></div>`).join("")}</div>`
        : `<div class="dim">细节还在杯底沉淀，先看前两页。</div>`}
    </div>`;

  $app.innerHTML = `
    ${header(s, `${esc(aha.protagonist?.name || "")} 的理想型来了`)}
    <div class="aha-stage-nav" role="tablist" aria-label="理想型报告阶段">
      ${stages.map((label, i) => `<button class="${stage === i ? "active" : ""}" data-stage="${i}" role="tab" aria-selected="${stage === i}"><span>0${i + 1}</span>${label}</button>`).join("")}
    </div>
    <div class="flip-scene" id="ahaStage" role="button" tabindex="0" aria-live="polite" aria-label="点击查看${stage < 2 ? stages[stage + 1] : stages[0]}">${stageBody}</div>
    <button class="stage-next" id="stageNext">${stage < 2 ? `点击继续 · ${stages[stage + 1]}` : "回到理想型立绘"}<span>→</span></button>
    ${solo ? "" : `<div class="glass stack center light-panel">
      <div class="lamp-row">${lampRow}</div>
      <div class="light-count">爆灯 <b>${lt.burst}</b> · 灭灯 <b>${lt.off}</b><span class="dim"> · 已投 ${lt.voted ?? lt.burst + lt.off}/${lt.total}</span></div>
      ${canVote ? `
        <div class="row light-btns">
          <button class="btn light-burst grow ${mine === "burst" ? "selected" : ""}" id="burstBtn">${mine === "burst" ? "已爆灯" : "爆灯"}</button>
          <button class="btn light-off grow ${mine === "off" ? "selected" : ""}" id="offBtn">${mine === "off" ? "已灭灯" : "灭灯"}</button>
        </div>
        <div class="dim">灯可以改，最后一票记进海报。</div>
      ` : s.current?.youAreProtagonist && !isFinal
          ? `<div class="dim">全场在给你的理想型亮灯。别紧张，灯不咬人。</div>`
          : lt.burstNames?.length
            ? `<div class="dim">爆灯的人：${lt.burstNames.map(esc).join("、")}</div>`
            : ""}
    </div>`}
    ${ui.posterUrl
      ? `<img class="poster-img" src="${ui.posterUrl}" alt="理想型海报" /><div class="dim center">长按保存。扫码的人直接进这桌。</div><button class="btn" id="posterHomeBtn">进入我的主页</button>`
      : `<button class="btn ghost" id="posterBtn" ${ui.posterBusy ? "disabled" : ""}>${ui.posterBusy ? "海报在暗房里洗…" : "生成海报"}</button>`}
    ${!isFinal ? (me.isHost
      ? `<button class="btn" id="nextBtn">${s.players.some((p) => !p.done) ? "下一位主角" : "收局看总榜"}</button>`
      : `<div class="dim center">等房主抽下一位。</div>`) : ""}`;
  bindSound();

  const setStage = (next) => {
    ui.ahaStage = Math.max(0, Math.min(2, next));
    render();
  };
  document.querySelectorAll("[data-stage]").forEach((button) =>
    button.addEventListener("click", () => setStage(Number(button.dataset.stage))));
  document.getElementById("ahaStage").addEventListener("click", () => setStage(stage < 2 ? stage + 1 : 0));
  document.getElementById("ahaStage").addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setStage(stage < 2 ? stage + 1 : 0);
    }
  });
  document.getElementById("stageNext").addEventListener("click", () => setStage(stage < 2 ? stage + 1 : 0));

  const artImg = document.getElementById("artImg");
  const artWrap = document.getElementById("artWrap");
  if (artImg) {
    let triedFallback = false;
    let fallbackTimer = null;
    const artLoaded = () => {
      clearTimeout(fallbackTimer);
      artWrap?.classList.add("loaded");
      // 立绘确认可用 → 用实际加载成功的 URL 写展示柜（含 fallback 场景）
      ui.ahaArtUrl = artImg.currentSrc || artImg.src || "";
      clearTimeout(ui.ahaSaveTimer);
      ui.ahaSaveTimer = null;
      maybeSaveAhaProfile(s, aha, profile, ui.ahaArtUrl);
    };
    const artFailed = () => {
      if (!triedFallback && portrait.fallbackUrl && artImg.src !== new URL(portrait.fallbackUrl, location.href).href) {
        triedFallback = true;
        artImg.src = portrait.fallbackUrl;
        return;
      }
      artWrap?.classList.add("failed");
      artImg.remove();
      // 图彻底没来：记录照写（不带图），展示柜显示原型占位而不是坏链
      ui.ahaArtUrl = "";
      clearTimeout(ui.ahaSaveTimer);
      ui.ahaSaveTimer = null;
      maybeSaveAhaProfile(s, aha, profile, "");
    };
    if (portrait.fallbackUrl) {
      fallbackTimer = setTimeout(() => {
        if (artWrap?.classList.contains("loaded") || triedFallback) return;
        triedFallback = true;
        artImg.src = portrait.fallbackUrl;
      }, 2200);
    }
    if (artImg.complete && artImg.naturalWidth > 0) artLoaded();
    else if (artImg.complete) artFailed();
    else {
      artImg.addEventListener("load", artLoaded, { once: true });
      artImg.addEventListener("error", artFailed);
    }
  }
  document.getElementById("posterBtn")?.addEventListener("click", async () => {
    ui.posterBusy = true;
    render();
    try {
      const { renderPoster } = await loadPoster();
      ui.posterUrl = await renderPoster({ ...aha, profile }, `${location.origin}/?room=${s.code}`);
    } catch (e) {
      toast("海报没洗出来，再试一次。（" + e.message + "）");
    }
    ui.posterBusy = false;
    render();
  });
  document.getElementById("posterHomeBtn")?.addEventListener("click", goMyPage);
  document.getElementById("nextBtn")?.addEventListener("click", () => sendOrWarn({ type: "next" }));
  document.getElementById("burstBtn")?.addEventListener("click", () => castLight("burst"));
  document.getElementById("offBtn")?.addEventListener("click", () => castLight("off"));

  function castLight(vote) {
    sound.unlock();
    send(lightVotePayload(vote));
    playLightFx({ name: me.name, on: vote === "burst" });
    if (PREVIEW) {
      const previous = mine;
      let burst = lt.burst - (previous === "burst" ? 1 : 0) + (vote === "burst" ? 1 : 0);
      let off = lt.off - (previous === "off" ? 1 : 0) + (vote === "off" ? 1 : 0);
      aha.light = { ...lt, burst, off, voted: burst + off, mine: vote, yours: vote, canVote: true };
      render();
    }
  }
}

/* --- 收局 --- */
function renderFinished(s) {
  if (renderFinished._idx == null) renderFinished._idx = 0;
  const list = s.ahaHistory || [];
  if (!list.length) {
    $app.innerHTML = `${header(s)}<div class="glass center stack"><h2>散场。夜还长。</h2>
      <button class="btn" onclick="location.href='/'">再开一桌</button></div>`;
    bindSound();
    return;
  }
  const idx = Math.min(renderFinished._idx, list.length - 1);
  renderAha(s, list[idx], true);
  const bar = document.createElement("div");
  bar.className = "glass row";
  bar.innerHTML = `
    <button class="btn ghost small" id="prevAha" ${idx === 0 ? "disabled" : ""}>←</button>
    <div class="grow center dim">回看 ${idx + 1}/${list.length} · ${esc(list[idx].protagonist.name)}</div>
    <button class="btn ghost small" id="nextAha" ${idx === list.length - 1 ? "disabled" : ""}>→</button>`;
  $app.appendChild(bar);
  const again = document.createElement("button");
  again.className = "btn";
  again.textContent = "散场，再开一桌";
  again.onclick = () => location.href = "/";
  $app.appendChild(again);
  document.getElementById("prevAha").onclick = () => { renderFinished._idx = idx - 1; ui.posterUrl = null; ui.ahaStage = 0; render(); };
  document.getElementById("nextAha").onclick = () => { renderFinished._idx = idx + 1; ui.posterUrl = null; ui.ahaStage = 0; render(); };
}

/* ---------- 非诚勿扰互动体系：弹幕 / 灯光特效 / 聊天抽屉（PRD §9） ---------- */

// 一次性挂载全局覆盖层（不随屏幕重渲染销毁）
(function buildOverlays() {
  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <div id="dmLayer" class="dm-layer" aria-hidden="true"></div>
    <div id="dmEmojiPanel" class="dm-emoji-panel hidden" aria-label="选择现场反应">
      ${QUICK_REACTIONS.map((e) => `<button class="dm-e" data-e="${e}" aria-label="发送 ${e}">${e}</button>`).join("")}
    </div>
    <div id="dmBar" class="dm-bar hidden">
      <button id="dmEmojiToggle" class="dm-emoji-toggle" aria-expanded="false" aria-controls="dmEmojiPanel" aria-label="打开表情面板">☺</button>
      <input id="dmIn" type="text" maxlength="30" placeholder="发条弹幕…" />
      <button class="btn small dm-send" id="dmSend">发</button>
    </div>
    <button id="chatFab" class="chat-fab hidden">💬<span id="chatBadge" class="chat-badge hidden"></span></button>
    <div id="chatMask" class="chat-mask hidden"></div>
    <aside id="chatDrawer" class="chat-drawer">
      <div class="chat-head"><b>桌边闲聊</b><button id="chatClose" class="chat-close">✕</button></div>
      <div id="chatMsgs" class="chat-msgs"></div>
      <div class="chat-input">
        <input id="chatIn" type="text" maxlength="120" placeholder="唠一句…" />
        <button class="btn small" id="chatSend">发</button>
      </div>
    </aside>`;
  while (wrap.firstChild) document.body.appendChild(wrap.firstChild);

  // 弹幕发送（30 字/3 秒 服务端强制，本地也拦一道）
  const sendDm = (text) => {
    const payload = danmakuPayload(text);
    if (!payload) return;
    const now = Date.now();
    if (now - ui.lastDmSent < 3000) return toast("弹幕太密。歇三秒。");
    ui.lastDmSent = now;
    sound.unlock();
    send(payload);
    if (PREVIEW) spawnDanmaku({ name: ui.state?.you?.name || "我", emoji: "🍺", text: payload.text });
  };
  const sendQuick = (emoji) => {
    const payload = quickReactionPayload(emoji);
    if (!payload) return;
    sound.unlock();
    send(payload);
    if (PREVIEW) spawnDanmaku({ name: ui.state?.you?.name || "我", emoji: "🍺", text: emoji });
  };
  const dmIn = document.getElementById("dmIn");
  document.getElementById("dmSend").addEventListener("click", () => { sendDm(dmIn.value); dmIn.value = ""; });
  dmIn.addEventListener("keydown", (e) => { if (e.key === "Enter") { sendDm(dmIn.value); dmIn.value = ""; } });
  const dmEmojiPanel = document.getElementById("dmEmojiPanel");
  const dmEmojiToggle = document.getElementById("dmEmojiToggle");
  const setEmojiPanelOpen = (open) => {
    dmEmojiPanel.classList.toggle("hidden", !open);
    dmEmojiToggle.setAttribute("aria-expanded", String(open));
    dmEmojiToggle.classList.toggle("open", open);
    document.body.classList.toggle("dm-emoji-open", open);
  };
  dmEmojiToggle.addEventListener("click", (event) => {
    event.stopPropagation();
    setEmojiPanelOpen(dmEmojiPanel.classList.contains("hidden"));
  });
  dmEmojiPanel.addEventListener("click", (event) => {
    const button = event.target.closest(".dm-e");
    if (!button) return;
    sendQuick(button.dataset.e);
    setEmojiPanelOpen(false);
  });
  document.addEventListener("click", (event) => {
    if (!dmEmojiPanel.classList.contains("hidden") && !dmEmojiPanel.contains(event.target) && event.target !== dmEmojiToggle) {
      setEmojiPanelOpen(false);
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setEmojiPanelOpen(false);
  });

  // 聊天抽屉开合
  const setOpen = (open) => {
    ui.chatOpen = open;
    document.getElementById("chatDrawer").classList.toggle("open", open);
    document.getElementById("chatMask").classList.toggle("hidden", !open);
    if (open) {
      const last = ui.state?.chat?.[ui.state.chat.length - 1];
      ui.chatLastSeen = last ? last.id : ui.chatLastSeen;
      renderChat();
      const box = document.getElementById("chatMsgs");
      box.scrollTop = box.scrollHeight;
    }
    updateBadge();
  };
  document.getElementById("chatFab").addEventListener("click", () => { sound.unlock(); setOpen(true); });
  document.getElementById("chatClose").addEventListener("click", () => setOpen(false));
  document.getElementById("chatMask").addEventListener("click", () => setOpen(false));

  const sendChat = () => {
    const inEl = document.getElementById("chatIn");
    const payload = chatPayload(inEl.value);
    if (!payload) return;
    inEl.value = "";
    send(payload);
    if (PREVIEW && ui.state) {
      ui.state.chat = ui.state.chat || [];
      ui.state.chat.push({ id: (ui.state.chat.at(-1)?.id || 0) + 1, name: ui.state.you.name, emoji: "🍷", text: payload.text, reactions: {} });
      renderChat();
    }
  };
  document.getElementById("chatSend").addEventListener("click", sendChat);
  document.getElementById("chatIn").addEventListener("keydown", (e) => { if (e.key === "Enter") sendChat(); });

  // 消息点击：弹 emoji 选择 / 点回应 chip 切换
  document.getElementById("chatMsgs").addEventListener("click", (e) => {
    const chip = e.target.closest(".react-chip");
    if (chip) {
      const payload = messageReactionPayload(Number(chip.dataset.id), chip.dataset.e);
      if (payload) send(payload);
      return;
    }
    const pick = e.target.closest(".picker-e");
    if (pick) {
      const payload = messageReactionPayload(Number(pick.dataset.id), pick.dataset.e);
      if (payload) send(payload);
      ui.pickerFor = null;
      renderChat();
      return;
    }
    const row = e.target.closest(".chat-msg");
    if (row) {
      const id = Number(row.dataset.id);
      ui.pickerFor = ui.pickerFor === id ? null : id;
      renderChat();
    }
  });
})();

function updateBadge() {
  const badge = document.getElementById("chatBadge");
  const chat = ui.state?.chat || [];
  const unread = ui.chatOpen ? 0 : chat.filter((m) => m.id > ui.chatLastSeen).length;
  badge.classList.toggle("hidden", unread === 0);
  badge.textContent = unread > 99 ? "99+" : unread;
}

function renderChat() {
  const box = document.getElementById("chatMsgs");
  const chat = socialModel(ui.state).chat;
  const myName = ui.state?.you?.name;
  const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
  box.innerHTML = chat.length ? chat.map((m) => `
    <div class="chat-msg ${m.name === myName ? "mine" : ""}" data-id="${m.id}">
      <div class="cm-head">${esc(m.emoji)} <b>${esc(m.name)}</b></div>
      <div class="cm-text">${esc(m.text)}</div>
      <div class="cm-reacts">
        ${Object.entries(m.reactions || {}).map(([e, reaction]) => `
          <button class="react-chip ${reaction.mine ? "mine" : ""}" data-id="${m.id}" data-e="${esc(e)}"
            aria-pressed="${reaction.mine}">${esc(e)} ${reaction.count}</button>`).join("")}
      </div>
      ${ui.pickerFor === m.id ? `<div class="emoji-picker">${MESSAGE_REACTIONS.map((e) =>
        `<button class="picker-e" data-id="${m.id}" data-e="${e}">${e}</button>`).join("")}</div>` : ""}
    </div>`).join("") : `<div class="dim center" style="padding:24px 0">还没人说话，开个头？</div>`;
  if (atBottom) box.scrollTop = box.scrollHeight; // 不能恒真：抽屉开着翻历史时不该被拽回底部
  // 抽屉开着时持续推进已读水位，避免关闭后出现幽灵未读红点
  if (ui.chatOpen) {
    const last = chat[chat.length - 1];
    if (last && last.id > ui.chatLastSeen) ui.chatLastSeen = last.id;
  }
}

// 弹幕飘屏（弹幕 & 快捷 reaction 同一渲染体系）
function spawnDanmaku({ name, emoji, text, special }) {
  const layer = document.getElementById("dmLayer");
  if (!layer) return;
  const el = document.createElement("div");
  const t = String(text ?? ""); // text 缺失时不能抛异常打断 onMessage
  const isEmojiOnly = QUICK_REACTIONS.includes(t);
  el.className = "dm-item" + (special ? " " + special : "") + (isEmojiOnly ? " dm-emoji" : "");
  el.textContent = isEmojiOnly ? t : `${emoji || ""} ${name ? name + "：" : ""}${t}`;
  el.style.top = 6 + Math.random() * 38 + "vh";
  el.style.animationDuration = (isEmojiOnly ? 5 : 7 + Math.min(3, t.length * 0.1)) + "s";
  layer.appendChild(el);
  el.addEventListener("animationend", () => el.remove());
  // 兜底清理
  setTimeout(() => el.remove(), 12000);
}

// 爆灯/灭灯全场特效
function playLightFx({ name, on }) {
  if (on) {
    heartBurst();
    sound.burst();
    spawnDanmaku({ name: "", emoji: "", text: `💗 ${name} 爆灯了！！`, special: "dm-burst" });
  } else {
    lampOffFx();
    sound.buzz();
    spawnDanmaku({ name: "", emoji: "", text: `🖤 ${name} 灭灯了…`, special: "dm-off" });
  }
}

// 覆盖层可见性（随 render 调用）
function updateOverlays() {
  const s = ui.state;
  const inGame = ui.screen === "game" && !!s;
  document.getElementById("chatFab")?.classList.toggle("hidden", !inGame);
  const barOn = inGame && ["answering", "reveal", "drinking", "king", "aha", "finished"].includes(s?.phase);
  document.getElementById("dmBar")?.classList.toggle("hidden", !barOn);
  if (!barOn) {
    document.getElementById("dmEmojiPanel")?.classList.add("hidden");
    document.getElementById("dmEmojiToggle")?.setAttribute("aria-expanded", "false");
    document.body.classList.remove("dm-emoji-open");
  }
  document.body.classList.toggle("has-dmbar", barOn);
  if (inGame) {
    if (ui.chatOpen) renderChat();
    updateBadge();
  }
}

/* ---------- 本地预览（mock 状态，仅本机） ---------- */

function mockArt(emoji) {
  // 预览占位图也走暗紫霓虹（与 theme-v2 同一气质）
  const cv = document.createElement("canvas");
  cv.width = 600; cv.height = 840;
  const c = cv.getContext("2d");
  const g = c.createLinearGradient(0, 0, 600, 840);
  g.addColorStop(0, "#2c1a42"); g.addColorStop(0.55, "#1a1026"); g.addColorStop(1, "#120a1c");
  c.fillStyle = g; c.fillRect(0, 0, 600, 840);
  c.fillStyle = "rgba(255,45,120,0.28)";
  c.beginPath(); c.arc(460, 160, 180, 0, 7); c.fill();
  c.fillStyle = "rgba(45,226,255,0.22)";
  c.beginPath(); c.arc(120, 700, 200, 0, 7); c.fill();
  c.font = "220px serif"; c.textAlign = "center";
  c.fillText(emoji, 300, 480);
  c.fillStyle = "rgba(244,236,255,0.6)"; c.font = "28px sans-serif";
  c.fillText("预览立绘占位", 300, 620);
  return cv.toDataURL("image/png");
}

function buildPreviewState(screen) {
  const players = [
    { id: "t1", name: "coco", emoji: "🍷", isHost: true, connected: true, token: "t1", done: true },
    { id: "t2", name: "阿豪", emoji: "🍺", isHost: false, connected: true, token: "t2", done: false },
    { id: "t3", name: "赛百诺女士", emoji: "🥂", isHost: false, connected: true, token: "t3", done: false },
    { id: "t4", name: "这是一个超长昵称测试员", emoji: "🍶", isHost: false, connected: false, token: "t4", done: false },
    { id: "t5", name: "麦当劳", emoji: "🧉", isHost: false, connected: true, token: "t5", done: false },
  ];
  const decks = renderLobby._decks;
  const deck = Object.keys(decks)[0];
  const base = {
    code: "8848",
    you: { name: "coco", isHost: true },
    players,
    settings: { rounds: 5, deck, deckName: decks[deck].name },
    chat: [
      { id: 1, name: "阿豪", emoji: "🍺", text: "这题出得太狠了哈哈哈", reactions: { "😂": ["coco", "麦当劳"], "🍺": ["coco"] } },
      { id: 2, name: "麦当劳", emoji: "🧉", text: "主角面不改色，有点东西", reactions: {} },
      { id: 3, name: "coco", emoji: "🍷", text: "爆灯预备！！", reactions: { "🔥": ["阿豪"] } },
    ],
  };
  const question = { id: "q1", text: "这是一个满分男，但他留着很长的小拇指指甲，说是用来开快递的，你没见他开过快递。", spice: 3 };
  const protagonist = { name: "赛百诺女士", emoji: "🥂" };
  const mkAha = (p, seed) => {
    const profile = buildIdealProfileFn({
      records: [
        { question: { id: "q-preview-1", tags: ["职场", "控制"] }, score: seed === 2 ? 9 : 3 },
        { question: { id: "q-preview-2", tags: ["纯爱", "温柔"] }, score: 9 },
        { question: { id: "q-preview-3", tags: ["冒险", "社牛"] }, score: 8 },
      ],
      genderPreference: seed === 2 ? "n" : "m",
      archetypeHint: seed === 2 ? "power-ceo" : "wild-charmer",
      seed: `preview-${seed}`,
    });
    return {
      id: `preview-${seed}`,
      light: { burst: 3, off: 1, voted: 4, total: 4, mine: null, yours: null, canVote: true, burstNames: ["coco", "阿豪", "麦当劳"], offNames: ["这是一个超长昵称测试员"] },
      protagonist: p,
      gender: seed === 2 ? "n" : "m",
      profile,
      imageUrl: profile.portrait.imageUrl || mockArt(p.emoji),
      title: seed === 2 ? "人间清醒代言人" : "全场最难猜的心",
      titleSub: "均分 6.4 · 容忍度前 12%",
      details: profile.relationship.details,
      stats: {
        bestKnower: { name: "coco", count: 3 },
        veto: "留着很长的小拇指指甲，说是用来开快递的",
        tolerancePct: 68,
        avgScore: 6.4,
        lights: { burst: 3, off: 1, voted: 4, total: 4, burstPct: 75 },
        drinkBoard: [
          { name: "麦当劳", drinks: 7 },
          { name: "这是一个超长昵称测试员", drinks: 5 },
          { name: "阿豪", drinks: 4 },
        ],
      },
    };
  };
  switch (screen) {
    case "lobby":
      return { ...base, phase: "lobby" };
    case "sticks":
      return { ...base, phase: "picking", current: { youAreShaker: true, drawn: false, shaker: "coco" } };
    case "answer":
      return { ...base, phase: "answering", you: { name: "赛百诺女士", isHost: false }, current: {
        youAreProtagonist: true, protagonist, roundIndex: 2, totalRounds: 5, question,
        submitted: { guessers: [], protagonist: false } } };
    case "guess":
      return { ...base, phase: "answering", current: {
        youAreProtagonist: false, protagonist, roundIndex: 2, totalRounds: 5, question,
        submitted: { guessers: ["阿豪"], protagonist: false } } };
    case "reveal":
      return { ...base, phase: "reveal",
        you: { name: "coco", isHost: true, id: "t1", seatNo: 3 },
        current: {
        youAreProtagonist: false, protagonist, roundIndex: 2, totalRounds: 5,
        kingChance: {
          winners: ["t1", "t5"], questionIdx: 1, seatCount: 5, turnIdx: 0,
          currentKing: "t1", done: false, results: [],
        },
        reveal: {
          question: question.text, score: 2, comment: "他真的没开过快递，我检查过指甲。",
          lights: { t2: "burst", t4: "off" },
          results: [
            { name: "coco", emoji: "🍷", guess: 2, exact: true, drink: false },
            { name: "阿豪", emoji: "🍺", guess: 5, exact: false, drink: true },
            { name: "这是一个超长昵称测试员", emoji: "🍶", guess: 8, exact: false, drink: true },
            { name: "麦当劳", emoji: "🧉", guess: 2, exact: true, drink: false },
          ],
        } } };
    case "king":
      // R2.5 国王本人视角：报两个号 + 一张指令卡（匿名号码版）
      return { ...base, phase: "king",
        you: { name: "coco", isHost: true, id: "t1", seatNo: 3 },
        current: { protagonist, roundIndex: 2, totalRounds: 5,
          kingChance: {
            winners: ["t1", "t5"], questionIdx: 1, seatCount: 5, turnIdx: 0,
            currentKing: "t1", done: false, results: [],
          } } };
    case "kingOrder":
      // R2.5 揭晓视角：号都报完，公布几号是谁 + 执行指令
      return { ...base, phase: "king", you: { name: "阿豪", isHost: false, id: "t2", seatNo: 1 },
        current: { protagonist, roundIndex: 2, totalRounds: 5,
          kingChance: {
            winners: ["t1", "t5"], questionIdx: 1, seatCount: 5, turnIdx: 2,
            currentKing: null, done: true,
            results: [
              { king: "t1", nums: [2, 4], names: ["赛百诺女士", "这是一个超长昵称测试员"], orderId: "ko-01", questionIdx: 1 },
              { king: "t5", nums: [1, 3], names: ["阿豪", "coco"], orderId: "ko-02", questionIdx: 1 },
            ],
          } } };
    case "drinking":
      return { ...base, phase: "drinking", current: {
        protagonist, roundIndex: 2, totalRounds: 5,
        drinking: { completed: 1, total: 3, allDone: false, skipped: false, canConfirm: true, drinkers: [
          { name: "coco", emoji: "🍷", drink: { id: "wine", label: "红酒", emoji: "🍷" }, cups: 1, done: true, mine: false },
          { name: "阿豪", emoji: "🍺", drink: { id: "beer", label: "啤酒", emoji: "🍺" }, cups: 2, done: false, mine: false },
          { name: "麦当劳", emoji: "🧉", drink: { id: "soft", label: "无酒精", emoji: "🫧" }, cups: 1, done: false, mine: true },
        ] },
      } };
    case "aha":
    case "profile":
    case "chemistry":
    case "poster":
      return { ...base, phase: "aha", aha: mkAha(protagonist, 1),
        current: { youAreProtagonist: false, protagonist } };
    case "final":
      return { ...base, phase: "finished",
        ahaHistory: [mkAha(protagonist, 1), mkAha({ name: "麦当劳", emoji: "🧉" }, 2)] };
    default:
      return null;
  }
}

function bootPreview(screen) {
  const st = buildPreviewState(screen);
  if (!st) return false;
  ui.screen = "game";
  ui.state = st;
  ui.lastPhase = st.phase;
  ui.ahaStage = screen === "profile" ? 1 : screen === "chemistry" ? 2 : 0;
  if (screen === "sticks") { ui.shakeMode = "tap"; ui.shakeCharge = 0.4; }
  render();
  if (screen === "poster") document.getElementById("posterBtn")?.click();
  if (screen === "aha") {
    // 弹幕演示：慢速飘屏，保证 3s 截图时可见
    const demo = [
      { name: "阿豪", emoji: "🍺", text: "这理想型有点帅啊" },
      { name: "", emoji: "", text: "💗 coco 爆灯了！！", special: "dm-burst" },
      { name: "麦当劳", emoji: "🧉", text: "🔥" },
      { name: "", emoji: "", text: "🖤 超长昵称 灭灯了…", special: "dm-off" },
    ];
    demo.forEach((d, i) => setTimeout(() => spawnDanmaku(d), 200 + i * 500));
  }
  return true;
}

/* ---------- 启动 ---------- */
(async function boot() {
  if (PREVIEW) {
    try {
      const [{ DECKS }, { buildIdealProfile }] = await Promise.all([loadQuestions(), loadIdealProfile()]);
      renderLobby._decks = DECKS;
      buildIdealProfileFn = buildIdealProfile;
      if (bootPreview(PREVIEW)) return;
    } catch {
      toast("预览资源加载失败");
    }
  }
  // 带 ?room= 且有历史 token → 自动回座
  const code = ui.code;
  if (/^\d{4}$/.test(code) && localStorage.getItem("mfn_token_" + code) && localStorage.getItem("mfn_name")) {
    ui.name = localStorage.getItem("mfn_name");
    connect(code, { silentFail: true });
  }
  render();
})();
