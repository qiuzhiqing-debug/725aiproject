// 满分男 · 酒桌局 — 前端 SPA（无构建 vanilla JS）
import { DECKS } from "./questions.js";
import { drawQR } from "./qrcode.js";
import { renderPoster } from "./poster.js";
import { sound, createShaker, celebrate, heartBurst, lampOffFx } from "./fx.js";
import { buildIdealProfile } from "./ideal-profile.js";
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

const $app = document.getElementById("app");
const $toast = document.getElementById("toast");

const EMOJIS = ["🍺", "🍷", "🥃", "🍶", "🍸", "🍹", "🥂", "🍻", "🫗", "🧉"];

/* ---------- 本地状态 ---------- */
const ui = {
  screen: "home", // home | game
  name: localStorage.getItem("mfn_name") || "",
  emoji: localStorage.getItem("mfn_emoji") || "🍺",
  code: new URLSearchParams(location.search).get("room") || "",
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
  lastPhase: null,
  lastDrawn: false,
  // 互动体系（PRD §9）
  chatOpen: false,
  chatLastSeen: 0,
  pickerFor: null, // 正在挑 emoji 回应的消息 id
  lastDmSent: 0,
};

let ws = null;
let shaker = null; // createShaker 实例
let reconnectTimer = null;

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

function send(obj) {
  if (PREVIEW) return; // 预览模式无连接，吞掉所有出站消息
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
}

/* ---------- 连接 ---------- */

async function createRoom() {
  const res = await fetch("/api/room", { method: "POST" });
  const j = await res.json();
  if (!j.code) throw new Error(j.error || "建房失败");
  return j.code;
}

function connect(code, { silentFail = false } = {}) {
  ui.code = code;
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  ws = new WebSocket(`${proto}//${location.host}/api/room/${code}/ws`);
  ws.onopen = () => {
    send({
      type: "join",
      name: ui.name,
      emoji: ui.emoji,
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
    if (ui.screen === "game") {
      // 断线自动重连（凭 token 回座）
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => connect(ui.code, { silentFail: true }), 1500);
    }
  };
  ws.onerror = () => {
    if (!silentFail && ui.screen !== "game") toast("连接失败，检查房间码");
  };
}

function onMessage(msg) {
  if (msg.type === "welcome") {
    localStorage.setItem("mfn_token_" + ui.code, msg.token);
    localStorage.setItem("mfn_name", ui.name);
    localStorage.setItem("mfn_emoji", ui.emoji);
    ui.screen = "game";
    if (msg.reconnected) toast("已回到座位");
    const u = new URL(location.href);
    u.searchParams.set("room", ui.code);
    history.replaceState(null, "", u);
    return;
  }
  if (msg.type === "error") {
    toast(msg.msg);
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
    toast("你被房主请下桌了");
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
      ui.commentSent = false;
      ui.assigned = false;
      if (msg.state.phase !== ui.lastPhase) {
        if (msg.state.phase === "aha") sound.riff(); // 理想型入场 riff
        ui.ahaStage = 0;
        ui.posterUrl = null;
        ui.stickDoneSent = false;
        if (msg.state.phase === "picking") {
          ui.shakeMode = null;
          ui.shakeCharge = 0;
        }
      }
      ui.lastPhase = msg.state.phase;
      onMessage._qid = cur && cur.question?.id;
    }
    // 出签瞬间：清脆「嗒」
    if (cur?.drawn && !ui.lastDrawn) sound.tick();
    ui.lastDrawn = !!cur?.drawn;
    render();
  }
}

/* ---------- 渲染 ---------- */

function render() {
  // 阶段切换时给容器加 phase-in，子块做入场瀑布；同阶段重渲染不再动画
  const key = ui.screen + ":" + (ui.state?.phase || "");
  $app.classList.toggle("phase-in", key !== render._key);
  render._key = key;
  if (ui.screen === "home") {
    renderHome();
  } else {
    const s = ui.state;
    if (!s) {
      $app.innerHTML = `<div class="boot glass">连接中…</div>`;
    } else {
      switch (s.phase) {
        case "lobby": renderLobby(s); break;
        case "picking": renderPicking(s); break;
        case "protagonist_setup": renderSetup(s); break;
        case "answering": renderAnswering(s); break;
        case "reveal": renderReveal(s); break;
        case "aha": renderAha(s, s.aha, false); break;
        case "finished": renderFinished(s); break;
      }
    }
  }
  updateOverlays();
}

function header(s, sub) {
  return `<div class="row">
    <div class="grow"><h1 class="neon">满分男<span class="amber">·</span>酒桌局</h1>
    ${sub ? `<div class="dim">${sub}</div>` : ""}</div>
    <button class="btn ghost small" id="sndBtn">${sound.enabled ? "🔊" : "🔇"}</button>
  </div>`;
}

function bindSound() {
  document.getElementById("sndBtn")?.addEventListener("click", () => {
    sound.unlock();
    sound.toggle();
    render();
  });
}

/* --- 首页 --- */
function renderHome() {
  $app.innerHTML = `
    ${header(null, "0-10 打分猜分 · 谁最懂 TA 谁免罚")}
    <div class="glass stack">
      <label class="dim">你的酒桌昵称</label>
      <input type="text" id="nameIn" maxlength="12" placeholder="比如：嘉欣" value="${esc(ui.name)}" />
      <label class="dim">选个酒杯</label>
      <div class="emoji-grid" id="emojiGrid">
        ${EMOJIS.map((e) => `<button data-e="${e}" class="${e === ui.emoji ? "sel" : ""}">${e}</button>`).join("")}
      </div>
    </div>
    <div class="glass stack">
      <button class="btn" id="createBtn">🏮 开一桌（当房主）</button>
      <div class="row">
        <input type="text" id="codeIn" inputmode="numeric" maxlength="4" placeholder="4 位房间码" value="${esc(ui.code)}" class="grow" />
        <button class="btn ghost small" id="joinBtn" style="padding:14px 18px">入座</button>
      </div>
    </div>`;
  const nameIn = document.getElementById("nameIn");
  nameIn.addEventListener("input", () => (ui.name = nameIn.value.trim()));
  document.getElementById("emojiGrid").addEventListener("click", (ev) => {
    const b = ev.target.closest("button[data-e]");
    if (!b) return;
    ui.emoji = b.dataset.e;
    renderHome();
  });
  const go = async (create) => {
    sound.unlock();
    if (!ui.name) return toast("先起个昵称");
    try {
      let code = document.getElementById("codeIn").value.trim();
      if (create) code = await createRoom();
      else {
        if (!/^\d{4}$/.test(code)) return toast("房间码是 4 位数字");
        const chk = await fetch("/api/room/" + code).then((r) => r.json()).catch(() => null);
        if (!chk?.exists) return toast("这桌还没开，检查房间码");
      }
      connect(code);
    } catch (e) {
      toast(e.message);
    }
  };
  document.getElementById("createBtn").addEventListener("click", () => go(true));
  document.getElementById("joinBtn").addEventListener("click", () => go(false));
  bindSound();
}

/* --- 大厅 --- */
function renderLobby(s) {
  const me = s.you;
  const invite = `${location.origin}/?room=${s.code}`;
  $app.innerHTML = `
    ${header(s, "把房间码甩到群里，人齐开局")}
    <div class="glass center stack">
      <div class="roomcode">${s.code}</div>
      <div class="qr-wrap"><canvas id="qrCv" width="180" height="180"></canvas></div>
      <button class="btn ghost small" id="copyBtn">复制邀请链接</button>
    </div>
    <div class="glass stack">
      <h2>酒桌上（${s.players.length}人）</h2>
      <div class="players">${s.players.map((p) => `
        <div class="player ${p.connected ? "" : "offline"}">
          <span>${esc(p.emoji)}</span><b>${esc(p.name)}</b>
          ${p.isHost ? `<span class="tag">房主</span>` : ""}
          ${me.isHost && !p.isHost ? `<button class="btn ghost small kickBtn" data-t="${esc(p.token)}">踢</button>` : ""}
        </div>`).join("")}
      </div>
    </div>
    ${me.isHost ? `
    <div class="glass stack">
      <div class="row">
        <label class="dim grow">每人轮数</label>
        <select id="roundsSel">${[3,4,5,6,7,8].map((n) =>
          `<option value="${n}" ${n === s.settings.rounds ? "selected" : ""}>${n} 轮</option>`).join("")}
        </select>
      </div>
      <div class="row">
        <label class="dim grow">锅底</label>
        <select id="deckSel">${Object.entries(DECKS).map(([k, d]) =>
          `<option value="${k}" ${k === s.settings.deck ? "selected" : ""}>${d.name}</option>`).join("")}
        </select>
      </div>
      <button class="btn" id="startBtn" ${s.players.length < 2 ? "disabled" : ""}>🍻 开局（≥2人）</button>
    </div>` : `<div class="glass center dim">等房主开局…锅底：${esc(s.settings.deckName)}</div>`}`;
  drawQR(document.getElementById("qrCv").getContext("2d"), invite, 0, 0, 180, { light: "#ffffff", dark: "#241333" });
  document.getElementById("copyBtn").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(invite); toast("链接已复制"); }
    catch { toast(invite); }
  });
  if (me.isHost) {
    const roundsSel = document.getElementById("roundsSel");
    const deckSel = document.getElementById("deckSel");
    const pushSettings = () => send({
      type: "set_settings",
      rounds: Number(roundsSel.value),
      deck: deckSel.value,
      deckName: DECKS[deckSel.value].name,
    });
    roundsSel.addEventListener("change", pushSettings);
    deckSel.addEventListener("change", pushSettings);
    document.getElementById("startBtn").addEventListener("click", () => {
      sound.unlock();
      send({ type: "start", questions: DECKS[s.settings.deck].questions });
    });
  }
  $app.querySelectorAll(".kickBtn").forEach((b) =>
    b.addEventListener("click", () => send({ type: "kick", token: b.dataset.t })));
  bindSound();
}

/* --- 抽酒签 --- */
function renderPicking(s) {
  const cur = s.current;
  const iShake = cur.youAreShaker;
  $app.innerHTML = `
    ${header(s, "抽酒签 · 看看今晚谁上桌")}
    <div class="glass stick-stage">
      <div class="stick-cup" id="cup">
        <div class="stick s1"></div><div class="stick s2"></div><div class="stick s3"></div>
      </div>
      ${cur.drawn ? `
        <div class="stick-out">🎋 今晚主角：${esc(cur.protagonist.emoji)} ${esc(cur.protagonist.name)}</div>
        ${iShake ? `<button class="btn" id="doneBtn">就是 TA，上桌！</button>` : `<div class="dim">等 ${esc(cur.shaker)} 确认…</div>`}
      ` : iShake ? `
        <div class="progress" id="chargeBar">摇动进度 ${Math.round(ui.shakeCharge * 100)}%</div>
        <div class="progress-track"><div class="progress-fill" id="chargeFill" style="width:${Math.round(ui.shakeCharge * 100)}%"></div></div>
        ${ui.shakeMode === null ? `<button class="btn" id="shakeBtn">📳 摇一摇抽签</button>` : ""}
        ${ui.shakeMode === "motion" ? `<div class="dim center">使劲摇手机！签筒晃起来！</div>` : ""}
        ${ui.shakeMode === "tap" ? `<button class="btn" id="tapBtn">👆 点按摇签（连点！）</button>` : ""}
      ` : `<div class="dim center">${esc(cur.shaker)} 正在摇签，屏住呼吸…</div>`}
    </div>`;
  bindSound();
  if (cur.drawn) {
    document.getElementById("doneBtn")?.addEventListener("click", () => {
      if (ui.stickDoneSent) return;
      ui.stickDoneSent = true;
      send({ type: "stick_done" });
    });
    return;
  }
  if (!iShake) return;

  const onIntensity = throttleIntensity();
  const onCharged = () => {
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
    if (!ok) toast("没摇动权限/传感器，改用点按摇签");
  });

  // 降级：点按/连点驱动同一套动画与出签
  let tapCharge = 0;
  document.getElementById("tapBtn")?.addEventListener("click", () => {
    sound.unlock();
    const v = 0.7 + Math.random() * 0.3;
    onIntensity(v);
    tapCharge += 16;
    ui.shakeCharge = Math.min(1, tapCharge / 130);
    updateChargeBar();
    if (tapCharge >= 130) onCharged();
  });

  function addCharge() {}
  function updateChargeBar() {
    const pct = Math.round(ui.shakeCharge * 100);
    const el = document.getElementById("chargeBar");
    if (el) el.textContent = `摇动进度 ${pct}%`;
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

/* --- 主角设定 --- */
function renderSetup(s) {
  const cur = s.current;
  const p = cur.protagonist;
  $app.innerHTML = `
    ${header(s, `今晚主角：${esc(p.emoji)} ${esc(p.name)}`)}
    <div class="glass stack center">
      <h2>${cur.youAreProtagonist ? "你的理想型是？" : `等 ${esc(p.name)} 选理想型…`}</h2>
      ${cur.youAreProtagonist ? `
        <button class="btn" data-g="m">满分男 🤵</button>
        <button class="btn" data-g="f">满分女 💃</button>
        <button class="btn ghost" data-g="n">都行 🌈</button>
      ` : `<div class="dim">马上开拷</div>`}
    </div>`;
  bindSound();
  $app.querySelectorAll("[data-g]").forEach((b) =>
    b.addEventListener("click", () => send({ type: "set_gender", gender: b.dataset.g })));
}

/* --- 打分 / 猜分 --- */
function renderAnswering(s) {
  const cur = s.current;
  const me = cur.youAreProtagonist;
  const waiting = cur.submitted.guessers;
  $app.innerHTML = `
    ${header(s, `${esc(cur.protagonist.name)} 的第 ${cur.roundIndex}/${cur.totalRounds} 轮`)}
    <div class="glass question-card">
      ${esc(cur.question.text)}
      <div class="spice">${"🌶️".repeat(cur.question.spice)}</div>
    </div>
    <div class="glass stack center">
      ${ui.submitted ? `
        <h2>已提交 ✅</h2>
        <div class="wait-list">已交卷：${waiting.map(esc).join("、") || "—"}${cur.submitted.protagonist ? "，主角已打分" : "，等主角打分"}</div>
      ` : `
        <div class="dim">${me ? "你的真实打分（10=仍然满分，0=直接火化）" : `盲猜 ${esc(cur.protagonist.name)} 会打几分`}</div>
        <div class="score-val" id="sv">${ui.slider}</div>
        <input type="range" id="slider" min="0" max="10" step="1" value="${ui.slider}" aria-label="打分" />
        <div class="slider-ticks">${Array.from({ length: 11 }, (_, i) => `<span>${i}</span>`).join("")}</div>
        <button class="btn" id="submitBtn">${me ? "🔒 锁定我的分" : "🎯 就猜这个分"}</button>
      `}
    </div>`;
  bindSound();
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
      ui.submitted = true;
      send({ type: me ? "score" : "guess", v: ui.slider });
      render();
    });
  }
}

/* --- 开牌 --- */
function renderReveal(s) {
  const cur = s.current;
  const rv = cur.reveal;
  const me = s.you;
  const myRes = rv.results.find((x) => x.name === me.name);
  const canAssign = myRes?.exact && !myRes.assigned && !ui.assigned;

  // 悬念节奏（只在首次进入本轮开牌时播）：先各人猜分逐个亮 → 主角真分砸出 → 罚酒判定逐条弹
  const revealKey = `${cur.roundIndex}-${esc(cur.protagonist?.name || "")}-${rv.score}`;
  const fresh = renderReveal._key !== revealKey;
  renderReveal._key = revealKey;
  const n = rv.results.length;
  const rowD = (i) => (fresh ? `style="--d:${(i * 0.12).toFixed(2)}s"` : "");
  const scoreDelay = n * 0.12 + 0.35;
  const verdictAt = scoreDelay + 0.55; // 秒
  const badgeD = (i) => (fresh ? `style="--d:${(verdictAt + i * 0.09).toFixed(2)}s"` : "");
  const tailD = fresh ? `style="--d:${(verdictAt + n * 0.09 + 0.2).toFixed(2)}s"` : "";

  $app.innerHTML = `
    ${header(s, `开牌 · 第 ${cur.roundIndex}/${cur.totalRounds} 轮`)}
    <div class="glass center stack">
      <div class="dim">${esc(rv.question)}</div>
      <div class="big-score ${fresh ? "seq-score" : ""}" ${fresh ? `style="--d:${scoreDelay.toFixed(2)}s"` : ""}>${rv.score}<span class="unit">分</span></div>
      ${rv.comment ? `<div class="detail-item">💬 主角补刀：${esc(rv.comment)}</div>` : ""}
    </div>
    <div class="glass stack">
      ${rv.results.map((x, i) => `
        <div class="reveal-row ${fresh ? "seq" : (x.drink ? "drink" : "") + " " + (x.exact ? "exact" : "")}" data-i="${i}" ${rowD(i)}>
          <span>${esc(x.emoji)}</span><b>${esc(x.name)}</b>
          ${x.exact ? `<span class="badge exact ${fresh ? "seq-pop" : ""}" ${badgeD(i)}>懂TA+1</span>` : ""}
          ${x.drink ? `<span class="badge drink ${fresh ? "seq-pop" : ""}" ${badgeD(i)}>罚酒 🍺</span>` : ""}
          ${x.assigned ? `<span class="dim">指定 ${esc(x.assigned)} 喝</span>` : ""}
          <span class="g">${x.guess}</span>
        </div>`).join("")}
    </div>
    ${canAssign ? `
    <div class="glass stack">
      <div class="dim">精确命中！指定一人喝：</div>
      <div class="row" style="flex-wrap:wrap">
        ${s.players.filter((p) => p.name !== me.name).map((p) =>
          `<button class="btn ghost small assignBtn" data-n="${esc(p.name)}">${esc(p.emoji)}${esc(p.name)}</button>`).join("")}
      </div>
    </div>` : ""}
    ${cur.youAreProtagonist && !ui.commentSent && !rv.comment ? `
    <div class="glass row">
      <input type="text" id="cmtIn" maxlength="100" placeholder="补刀一句（可选）" class="grow" value="${esc(ui.commentDraft)}" />
      <button class="btn ghost small" id="cmtBtn">发</button>
    </div>` : ""}
    ${me.isHost ? `<button class="btn" id="nextBtn">${cur.roundIndex >= cur.totalRounds ? "🎴 看 TA 的理想型" : "➡️ 下一题"}</button>` : `<div class="dim center">等房主进下一步…</div>`}`;
  bindSound();
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
  $app.querySelectorAll(".assignBtn").forEach((b) =>
    b.addEventListener("click", () => {
      ui.assigned = true;
      send({ type: "assign_drink", target: b.dataset.n });
    }));
  const cmtIn = document.getElementById("cmtIn");
  cmtIn?.addEventListener("input", () => (ui.commentDraft = cmtIn.value));
  document.getElementById("cmtBtn")?.addEventListener("click", () => {
    if (!ui.commentDraft.trim()) return;
    ui.commentSent = true;
    send({ type: "comment", text: ui.commentDraft.trim() });
  });
  document.getElementById("nextBtn")?.addEventListener("click", () => send({ type: "next" }));
}

/* --- Aha 结算卡：立绘 → 相亲档案 → 相处细节 --- */
function resolveAhaProfile(aha) {
  if (aha.profile?.portrait && aha.profile?.matchCard && aha.profile?.relationship) return aha.profile;
  return buildIdealProfile({
    records: [],
    genderPreference: aha.gender,
    seed: aha.id || `${aha.idolName || "ideal"}:${aha.stats?.avgScore || 0}`,
  });
}

function safeProfileColor(value, fallback) {
  return /^#[0-9a-f]{6}$/i.test(String(value || "")) ? value : fallback;
}

function renderAha(s, aha, isFinal) {
  const me = s.you;
  const profile = resolveAhaProfile(aha);
  const card = profile.matchCard;
  const portrait = profile.portrait;
  const relationship = profile.relationship;
  const primary = safeProfileColor(portrait.palette?.primary, "#075BFF");
  const accent = safeProfileColor(portrait.palette?.accent, "#00C8FF");
  const stages = ["理想型亮相", "相亲人物档案", "相处细节"];
  const stage = Math.max(0, Math.min(2, ui.ahaStage || 0));
  const lt = aha.light || { burst: 0, off: 0, voted: 0, total: 0, mine: null, burstNames: [], offNames: [] };
  const mine = lt.mine ?? lt.yours ?? null;
  const canVote = !isFinal && s.phase === "aha" && (lt.canVote ?? !s.current?.youAreProtagonist);
  const lampRow = Array.from({ length: Math.max(lt.total, lt.burst + lt.off) }, (_, i) =>
    `<span class="lamp ${i < lt.burst ? "on" : i < lt.burst + lt.off ? "dead" : "pending"}"></span>`
  ).join("");
  const stageBody = stage === 0 ? `
    <div class="aha-stage portrait-stage" style="--profile-primary:${primary};--profile-accent:${accent}">
      <div class="art-wrap" id="artWrap">
        <div class="art-fallback"><b>${esc(card.name)}</b><span>${esc(portrait.archetype)}</span></div>
        <img id="artImg" src="${esc(portrait.imageUrl || aha.imageUrl)}" alt="${esc(portrait.alt || `${card.name} 理想型立绘`)}" />
        <span class="archetype-chip">${esc(portrait.archetype)}</span>
      </div>
      <div class="caption">
        <b class="ideal-name">${esc(card.name)}</b>
        <div class="ideal-meta"><span>${esc(card.mbti)}</span><span>${esc(card.presentation)}</span><span>${esc(relationship.chemistry)}</span></div>
        <div class="dim">${esc(aha.title)} · ${esc(aha.titleSub)}</div>
      </div>
    </div>` : stage === 1 ? `
    <div class="aha-stage profile-stage" style="--profile-primary:${primary};--profile-accent:${accent}">
      <div class="profile-kicker">MATCH FILE / 02</div>
      <div class="profile-title-row"><div><b class="ideal-name">${esc(card.name)}</b><div class="dim">${esc(card.archetype)} · ${esc(card.presentation)}</div></div><span class="mbti-badge">${esc(card.mbti)}</span></div>
      <div class="profile-grid">
        <div><span>出生日期</span><b>${esc(card.birthDate)}</b></div>
        <div><span>星座</span><b>${esc(card.zodiac)}</b></div>
        <div class="wide"><span>职业</span><b>${esc(card.occupation)}</b></div>
        <div class="wide"><span>身份</span><b>${esc(card.identity)}</b></div>
      </div>
      <div class="keyword-row">${card.keywords.map((x) => `<span>${esc(x)}</span>`).join("")}</div>
      <p class="profile-bio">${esc(card.bio)}</p>
      <div class="fiction-note">角色档案由本局答案生成，人物信息均为虚构</div>
    </div>` : `
    <div class="aha-stage relationship-stage" style="--profile-primary:${primary};--profile-accent:${accent}">
      <div class="profile-kicker">CHEMISTRY / 03</div>
      <h2>${esc(relationship.heading)}</h2>
      <div class="chemistry-tag">${esc(relationship.chemistry)}</div>
      <div class="relationship-list">${relationship.details.map((d, i) => `<div class="detail-item"><span>${String(i + 1).padStart(2, "0")}</span><p>${esc(d)}</p></div>`).join("")}</div>
    </div>`;

  $app.innerHTML = `
    ${header(s, `${esc(aha.protagonist.name)} 的理想型来了`)}
    <div class="aha-stage-nav" role="tablist" aria-label="理想型报告阶段">
      ${stages.map((label, i) => `<button class="${stage === i ? "active" : ""}" data-stage="${i}" role="tab" aria-selected="${stage === i}"><span>0${i + 1}</span>${label}</button>`).join("")}
    </div>
    <div class="flip-scene" id="ahaStage" role="button" tabindex="0" aria-live="polite" aria-label="点击查看${stage < 2 ? stages[stage + 1] : stages[0]}">${stageBody}</div>
    <button class="stage-next" id="stageNext">${stage < 2 ? `点击继续 · ${stages[stage + 1]}` : "回到理想型立绘"}<span>→</span></button>
    <div class="glass stack center light-panel">
      <div class="lamp-row">${lampRow}</div>
      <div class="light-count">爆灯 <b>${lt.burst}</b> · 灭灯 <b>${lt.off}</b><span class="dim"> · 已投 ${lt.voted ?? lt.burst + lt.off}/${lt.total}</span></div>
      ${canVote ? `
        <div class="row light-btns">
          <button class="btn light-burst grow ${mine === "burst" ? "selected" : ""}" id="burstBtn">${mine === "burst" ? "已爆灯" : "爆灯"}</button>
          <button class="btn light-off grow ${mine === "off" ? "selected" : ""}" id="offBtn">${mine === "off" ? "已灭灯" : "灭灯"}</button>
        </div>
        <div class="dim">投票可改，最后一票计入分享海报</div>
      ` : s.current?.youAreProtagonist && !isFinal
          ? `<div class="dim">全场正在为你的理想型亮灯…</div>`
          : lt.burstNames?.length
            ? `<div class="dim">爆灯的人：${lt.burstNames.map(esc).join("、")}</div>`
            : ""}
    </div>
    ${ui.posterUrl
      ? `<img class="poster-img" src="${ui.posterUrl}" alt="理想型年度报告海报" /><div class="dim center">长按图片保存 / 转发</div>`
      : `<button class="btn ghost" id="posterBtn" ${ui.posterBusy ? "disabled" : ""}>${ui.posterBusy ? "海报合成中…" : "生成年报海报"}</button>`}
    ${!isFinal ? (me.isHost
      ? `<button class="btn" id="nextBtn">${s.players.some((p) => !p.done) ? "下一位主角" : "收局看总榜"}</button>`
      : `<div class="dim center">等房主抽下一位…</div>`) : ""}`;
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
    };
    const artFailed = () => {
      if (!triedFallback && portrait.fallbackUrl && artImg.src !== new URL(portrait.fallbackUrl, location.href).href) {
        triedFallback = true;
        artImg.src = portrait.fallbackUrl;
        return;
      }
      artWrap?.classList.add("failed");
      artImg.remove();
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
      ui.posterUrl = await renderPoster({ ...aha, profile }, `${location.origin}/?room=${s.code}`);
    } catch (e) {
      toast("海报生成失败：" + e.message);
    }
    ui.posterBusy = false;
    render();
  });
  document.getElementById("nextBtn")?.addEventListener("click", () => send({ type: "next" }));
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
    $app.innerHTML = `${header(s)}<div class="glass center stack"><h2>散场了 🌙</h2>
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
  again.textContent = "🌙 散场，再开一桌";
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
    <div id="dmBar" class="dm-bar hidden">
      <div class="dm-quick">${QUICK_REACTIONS.map((e) => `<button class="dm-q" data-e="${e}">${e}</button>`).join("")}</div>
      <input id="dmIn" type="text" maxlength="30" placeholder="发条弹幕…" />
      <button class="btn small dm-send" id="dmSend">发</button>
    </div>
    <button id="chatFab" class="chat-fab hidden">💬<span id="chatBadge" class="chat-badge hidden"></span></button>
    <div id="chatMask" class="chat-mask hidden"></div>
    <aside id="chatDrawer" class="chat-drawer">
      <div class="chat-head"><b>🍻 桌边闲聊</b><button id="chatClose" class="chat-close">✕</button></div>
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
    if (now - ui.lastDmSent < 3000) return toast("弹幕太密了，歇 3 秒再发");
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
  document.querySelectorAll(".dm-q").forEach((b) =>
    b.addEventListener("click", () => sendQuick(b.dataset.e)));

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
  if (atBottom || ui.chatOpen) box.scrollTop = box.scrollHeight;
}

// 弹幕飘屏（弹幕 & 快捷 reaction 同一渲染体系）
function spawnDanmaku({ name, emoji, text, special }) {
  const layer = document.getElementById("dmLayer");
  if (!layer) return;
  const el = document.createElement("div");
  const isEmojiOnly = QUICK_REACTIONS.includes(text);
  el.className = "dm-item" + (special ? " " + special : "") + (isEmojiOnly ? " dm-emoji" : "");
  el.textContent = isEmojiOnly ? text : `${emoji || ""} ${name ? name + "：" : ""}${text}`;
  el.style.top = 6 + Math.random() * 38 + "vh";
  el.style.animationDuration = (isEmojiOnly ? 5 : 7 + Math.min(3, text.length * 0.1)) + "s";
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
  const barOn = inGame && ["answering", "reveal", "aha", "finished"].includes(s?.phase);
  document.getElementById("dmBar")?.classList.toggle("hidden", !barOn);
  document.body.classList.toggle("has-dmbar", barOn);
  if (inGame) {
    if (ui.chatOpen) renderChat();
    updateBadge();
  }
}

/* ---------- 本地预览（mock 状态，仅本机） ---------- */

function mockArt(emoji) {
  const cv = document.createElement("canvas");
  cv.width = 600; cv.height = 840;
  const c = cv.getContext("2d");
  const g = c.createLinearGradient(0, 0, 600, 840);
  g.addColorStop(0, "#ffe9c4"); g.addColorStop(0.55, "#ffd9ec"); g.addColorStop(1, "#e6d4ff");
  c.fillStyle = g; c.fillRect(0, 0, 600, 840);
  c.fillStyle = "rgba(255,46,140,0.30)";
  c.beginPath(); c.arc(460, 160, 180, 0, 7); c.fill();
  c.fillStyle = "rgba(180,242,30,0.38)";
  c.beginPath(); c.arc(120, 700, 200, 0, 7); c.fill();
  c.font = "220px serif"; c.textAlign = "center";
  c.fillText(emoji, 300, 480);
  c.fillStyle = "rgba(36,19,51,0.55)"; c.font = "28px sans-serif";
  c.fillText("预览立绘占位", 300, 620);
  return cv.toDataURL("image/png");
}

function buildPreviewState(screen) {
  const players = [
    { name: "嘉欣", emoji: "🍷", isHost: true, connected: true, token: "t1", done: true },
    { name: "阿豪", emoji: "🍺", isHost: false, connected: true, token: "t2", done: false },
    { name: "赛百诺女士", emoji: "🥂", isHost: false, connected: true, token: "t3", done: false },
    { name: "这是一个超长昵称测试员", emoji: "🍶", isHost: false, connected: false, token: "t4", done: false },
    { name: "麦当劳", emoji: "🧉", isHost: false, connected: true, token: "t5", done: false },
  ];
  const deck = Object.keys(DECKS)[0];
  const base = {
    code: "8848",
    you: { name: "嘉欣", isHost: true },
    players,
    settings: { rounds: 5, deck, deckName: DECKS[deck].name },
    chat: [
      { id: 1, name: "阿豪", emoji: "🍺", text: "这题出得太狠了哈哈哈", reactions: { "😂": ["嘉欣", "麦当劳"], "🍺": ["嘉欣"] } },
      { id: 2, name: "麦当劳", emoji: "🧉", text: "主角面不改色，有点东西", reactions: {} },
      { id: 3, name: "嘉欣", emoji: "🍷", text: "爆灯预备！！", reactions: { "🔥": ["阿豪"] } },
    ],
  };
  const question = { id: "q1", text: "这是一个满分男，但他留着很长的小拇指指甲，说是用来开快递的，你没见他开过快递。", spice: 3 };
  const protagonist = { name: "赛百诺女士", emoji: "🥂" };
  const mkAha = (p, seed) => {
    const profile = buildIdealProfile({
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
      light: { burst: 3, off: 1, voted: 4, total: 4, mine: null, yours: null, canVote: true, burstNames: ["嘉欣", "阿豪", "麦当劳"], offNames: ["这是一个超长昵称测试员"] },
      protagonist: p,
      gender: seed === 2 ? "n" : "m",
      profile,
      imageUrl: profile.portrait.imageUrl || mockArt(p.emoji),
      idolName: profile.matchCard.name,
      title: seed === 2 ? "人间清醒代言人" : "全场最难猜的心",
      titleSub: "均分 6.4 · 容忍度前 12%",
      details: profile.relationship.details,
      stats: {
        bestKnower: { name: "嘉欣", count: 3 },
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
      return { ...base, phase: "picking", current: { youAreShaker: true, drawn: false, shaker: "嘉欣" } };
    case "answer":
      return { ...base, phase: "answering", you: { name: "赛百诺女士", isHost: false }, current: {
        youAreProtagonist: true, protagonist, roundIndex: 2, totalRounds: 5, question,
        submitted: { guessers: [], protagonist: false } } };
    case "guess":
      return { ...base, phase: "answering", current: {
        youAreProtagonist: false, protagonist, roundIndex: 2, totalRounds: 5, question,
        submitted: { guessers: ["阿豪"], protagonist: false } } };
    case "reveal":
      return { ...base, phase: "reveal", current: {
        youAreProtagonist: false, protagonist, roundIndex: 2, totalRounds: 5,
        reveal: {
          question: question.text, score: 2, comment: "他真的没开过快递，我检查过指甲。",
          results: [
            { name: "嘉欣", emoji: "🍷", guess: 2, exact: true, drink: false, assigned: "麦当劳" },
            { name: "阿豪", emoji: "🍺", guess: 5, exact: false, drink: true },
            { name: "这是一个超长昵称测试员", emoji: "🍶", guess: 8, exact: false, drink: true },
            { name: "麦当劳", emoji: "🧉", guess: 3, exact: false, drink: false },
          ],
        } } };
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
      { name: "", emoji: "", text: "💗 嘉欣 爆灯了！！", special: "dm-burst" },
      { name: "麦当劳", emoji: "🧉", text: "🔥" },
      { name: "", emoji: "", text: "🖤 超长昵称 灭灯了…", special: "dm-off" },
    ];
    demo.forEach((d, i) => setTimeout(() => spawnDanmaku(d), 200 + i * 500));
  }
  return true;
}

/* ---------- 启动 ---------- */
(function boot() {
  if (PREVIEW && bootPreview(PREVIEW)) return;
  // 带 ?room= 且有历史 token → 自动回座
  const code = ui.code;
  if (/^\d{4}$/.test(code) && localStorage.getItem("mfn_token_" + code) && localStorage.getItem("mfn_name")) {
    ui.name = localStorage.getItem("mfn_name");
    connect(code, { silentFail: true });
  }
  render();
})();
