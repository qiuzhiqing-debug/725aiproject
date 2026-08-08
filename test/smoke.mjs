// 冒烟测试：3 玩家端到端跑通一位主角的完整轮次
// 前置：wrangler dev 已在 BASE 运行（或由 run-smoke 包装脚本拉起）
import WebSocket from "ws";
import { DECKS } from "../public/questions.js";
import { allowedPoolsFor } from "../src/worker.js";
import {
  chatPayload,
  danmakuPayload,
  lightVotePayload,
  messageReactionPayload,
  quickReactionPayload,
  socialModel,
} from "../public/social.js";

const BASE = process.env.BASE || "http://127.0.0.1:8787";
const WS_BASE = BASE.replace(/^http/, "ws");

let passed = 0, failed = 0;
function ok(cond, label) {
  if (cond) { passed++; console.log("  ✅", label); }
  else { failed++; console.log("  ❌", label); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitUntil(predicate, ms = 5000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < ms) {
    if (predicate()) return true;
    await sleep(50);
  }
  return false;
}

// R10 §4.2 开局门：客人必须点准备，房主的按钮就是开局键（服务端 readyOf 里房主恒 true）。
// 所有多人局开局前都要先过这道闸，所以抽成公共步骤。
async function readyUp(players, ms = 5000) {
  for (const p of players) {
    if (p.state?.you?.isHost) continue;
    p.send({ type: "ready", ready: true });
  }
  return waitUntil(() => players.some((p) => p.state?.allReady === true), ms);
}

class Player {
  constructor(name, emoji, drink = "beer", seeking = null, gender = null) {
    this.name = name;
    this.emoji = emoji;
    this.drink = drink;
    this.seeking = seeking;
    // R9：viewer 自身性别（隔离铁桶用：直女f vs 男同m、直男m vs 姬圈f）
    this.gender = gender;
    this.token = null;
    this.state = null;
    this.lastError = null;
    this.shakes = [];
    this.welcome = null;
    this.danmakus = [];
    this.quickReactions = [];
    this.lightFx = [];
    this.events = []; // king_game/king_order/player_left/host_transfer/force_next/left 等事件
  }
  connect(code, token) {
    this.ws = new WebSocket(`${WS_BASE}/api/room/${code}/ws`);
    return new Promise((res, rej) => {
      this.ws.on("open", () => {
        this.ws.send(JSON.stringify({ type: "join", name: this.name, emoji: this.emoji, drink: this.drink, seeking: this.seeking, gender: this.gender, token }));
      });
      this.ws.on("message", (raw) => {
        const m = JSON.parse(raw.toString());
        if (m.type === "welcome") { this.welcome = m; this.token = m.token; res(m); }
        if (m.type === "error") { this.lastError = m; res(m); }
        if (m.type === "state") this.state = m.state;
        if (m.type === "shake") this.shakes.push(m.intensity);
        if (m.type === "danmaku") this.danmakus.push(m);
        if (m.type === "quick_reaction") this.quickReactions.push(m);
        if (m.type === "light_fx") this.lightFx.push(m);
        if (["king_game", "king_order", "king_chance", "king_result", "player_left", "player_away", "player_back", "host_transfer", "force_next", "left", "kicked"].includes(m.type)) {
          this.events.push(m);
        }
      });
      this.ws.on("error", rej);
    });
  }
  send(obj) { this.ws.send(JSON.stringify(obj)); }
  async waitPhase(phase, ms = 5000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (this.state?.phase === phase) return this.state;
      await sleep(50);
    }
    throw new Error(`${this.name} 等待 phase=${phase} 超时（当前 ${this.state?.phase}）`);
  }
}

// 通用自动驾驶：不关心谁是主角/摇签人，把一局推进到 finished（覆盖离场后剩余玩家继续玩的场景）
async function autoPlay(players, { maxSteps = 400 } = {}) {
  const active = () => players.filter((p) => !p.closed);
  for (let step = 0; step < maxSteps; step++) {
    await sleep(120);
    const obs = active()[0];
    const st = obs?.state;
    if (!st) continue;
    const host = active().find((p) => p.state?.you?.isHost);
    switch (st.phase) {
      case "finished":
        return true;
      case "picking": {
        const shaker = active().find((p) => p.state?.current?.youAreShaker);
        if (!shaker) break;
        if (!shaker.state.current.drawn) shaker.send({ type: "draw_stick" });
        else shaker.send({ type: "stick_done" });
        break;
      }
      case "protagonist_setup": {
        const hero = active().find((p) => p.state?.current?.youAreProtagonist);
        hero?.send({ type: "set_gender", gender: "m" });
        break;
      }
      case "answering": {
        for (const p of active()) {
          if (p.state?.current?.youAreProtagonist) p.send({ type: "score", v: 5 });
          else p.send({ type: "guess", v: 6 });
        }
        break;
      }
      case "reveal":
      case "aha":
        host?.send({ type: "next" });
        break;
      case "drinking":
        host?.send({ type: "skip_drinking" });
        host?.send({ type: "next" });
        break;
      case "king": {
        const king = active().find((p) => p.state?.king?.youAreKing);
        if (king?.state?.king?.active) king.send({ type: "king_pick", idx: 0 });
        else host?.send({ type: "next" });
        break;
      }
      default:
        break;
    }
  }
  return false;
}

// 推进到 aha（立绘结算）就停，用于验证 aha 阶段爆灯（solo 主角自投）
async function playToAha(players, { maxSteps = 400 } = {}) {
  for (let step = 0; step < maxSteps; step++) {
    await sleep(120);
    const st = players[0]?.state;
    if (!st) continue;
    if (st.phase === "aha") return true;
    const host = players.find((p) => p.state?.you?.isHost);
    switch (st.phase) {
      case "picking": {
        const shaker = players.find((p) => p.state?.current?.youAreShaker);
        if (shaker) shaker.send({ type: shaker.state.current.drawn ? "stick_done" : "draw_stick" });
        break;
      }
      case "protagonist_setup":
        players.find((p) => p.state?.current?.youAreProtagonist)?.send({ type: "set_gender", gender: "m" });
        break;
      case "answering":
        for (const p of players) {
          if (p.state?.current?.youAreProtagonist) p.send({ type: "score", v: 5 });
          else p.send({ type: "guess", v: 6 });
        }
        break;
      case "reveal":
        host?.send({ type: "next" });
        break;
      case "drinking":
        host?.send({ type: "skip_drinking" });
        host?.send({ type: "next" });
        break;
      case "king": {
        const king = players.find((p) => p.state?.king?.youAreKing);
        if (king?.state?.king?.active) king.send({ type: "king_pick", idx: 0 });
        else host?.send({ type: "next" });
        break;
      }
      default:
        break;
    }
  }
  return false;
}

async function main() {
  console.log("== 冒烟测试 @", BASE);

  // 首页 200
  const home = await fetch(BASE + "/");
  ok(home.status === 200, "GET / → 200");

  // 建房
  const { code } = await (await fetch(BASE + "/api/room", { method: "POST" })).json();
  ok(/^\d{4}$/.test(code), `建房得到 4 位房间码 ${code}`);

  // 入房 ×3
  const A = new Player("阿豪", "🍺", "beer"), B = new Player("嘉欣", "🍷", "wine"), C = new Player("老王", "🥃", "soft");
  await A.connect(code);
  ok(A.token, "A 入房拿到 token");
  await B.connect(code);
  await C.connect(code);
  ok(B.token && C.token, "B/C 入房成功");

  // 重名被拒
  const DUP = new Player("嘉欣", "🍸");
  const dupRes = await DUP.connect(code);
  ok(dupRes.type === "error" && dupRes.code === "name_taken", `重名被拒：${dupRes.msg}`);
  DUP.ws.close();

  await waitUntil(() => A.state?.players?.length === 3);
  ok(A.state?.players?.length === 3, "state 广播：3 人在桌");
  ok(A.state.you.isHost === true, "A 是房主");
  ok(A.state.players.find((p) => p.name === "嘉欣")?.drink?.label === "红酒"
    && A.state.players.find((p) => p.name === "老王")?.drink?.label === "无酒精",
    "玩家自选酒种已同步到全桌");

  // 聊天室在 lobby 就可用；近期消息通过 state 持久化。
  B.lastError = null;
  B.send(chatPayload("先干一杯再开局"));
  B.send(chatPayload("刷屏应被拦截"));
  await waitUntil(() => A.state.chat?.at(-1)?.text === "先干一杯再开局" && B.lastError?.code === "rate_limited");
  ok(A.state.chat?.at(-1)?.text === "先干一杯再开局", "lobby 阶段聊天室全员可见");
  const lobbyChatCount = A.state.chat.length;
  ok(A.state.chat.length === lobbyChatCount && B.lastError?.code === "rate_limited", "聊天室短间隔刷屏被限频");

  // 设置 3 轮 + 开局（题库客户端下发）
  A.send({ type: "set_settings", rounds: 3, deck: "qingtang", deckName: "清汤锅底" });
  await sleep(150);
  await readyUp([A, B, C]);
  A.send({ type: "start", questions: DECKS.qingtang.questions });
  await A.waitPhase("picking");
  ok(true, "开局 → picking（抽酒签）");
  const all = [A, B, C];
  const shakerP = all.find((p) => p.state.current.youAreShaker);
  ok(shakerP === A, `摇签人是房主 A（首轮）：${shakerP?.name}`);
  ok(A.state.current.protagonist === null, "出签前主角名字对所有人隐藏");

  // 摇签（降级路径消息：shake 强度广播 + draw_stick）
  for (let i = 0; i < 4; i++) { shakerP.send({ type: "shake", intensity: 0.3 + i * 0.15 }); await sleep(60); }
  await waitUntil(() => B.shakes.length >= 3 && C.shakes.length >= 3);
  ok(B.shakes.length >= 3 && C.shakes.length >= 3, `shake 强度广播到其他人（B 收到 ${B.shakes.length} 条）`);
  shakerP.send({ type: "draw_stick" });
  const stickDrawn = await waitUntil(
    () => A.state?.current?.drawn === true && Boolean(A.state.current.protagonist?.name),
    5000,
  );
  ok(stickDrawn, `出签：主角 = ${A.state?.current?.protagonist?.name || "未返回"}`);
  if (!stickDrawn) throw new Error("等待出签状态超时");
  shakerP.send({ type: "stick_done" });
  await A.waitPhase("protagonist_setup");
  ok(true, "stick_done → protagonist_setup");

  // 主角选性别
  const hero = all.find((p) => p.state.current.youAreProtagonist);
  const others = all.filter((p) => p !== hero);
  hero.send({ type: "set_gender", gender: "m" });
  await A.waitPhase("answering");
  ok(A.state.current.question?.text?.includes("满分男"), `发题：${A.state.current.question.text.slice(0, 30)}…`);

  // 3 轮：主角打 7 分，O1 猜 7（精确命中）；O2 依次猜 2/5/6 → diff 5/2/1
  // 罚酒阈值 2：前两轮罚（含 |5-7|=2 的边界），第三轮 diff 1 不罚
  const o2Guess = { 1: 2, 2: 5, 3: 6 };
  for (let round = 1; round <= 3; round++) {
    hero.send({ type: "score", v: 7 });
    others[0].send({ type: "guess", v: 7 });
    others[1].send({ type: "guess", v: o2Guess[round] });
    await A.waitPhase("reveal");
    const rv = A.state.current.reveal;
    const r1 = rv.results.find((x) => x.name === others[0].name);
    const r2 = rv.results.find((x) => x.name === others[1].name);
    if (round === 1) {
      ok(rv.score === 7, `开牌主角分=7`);
      ok(r1.exact === true && r1.drink === false && r1.diff === 0, `${others[0].name} 猜7 → 精确命中懂TA+1、不罚`);
      ok(r2.exact === false && r2.drink === true && r2.diff === 5, `${others[1].name} 猜2 → |2-7|=5≥2 罚酒`);
      // 精确命中者指定一人喝
      others[0].send({ type: "assign_drink", target: others[1].name });
      // 主角补刀
      hero.send({ type: "comment", text: "你们根本不懂我" });
      await waitUntil(() => {
        const target = A.state?.players?.find((p) => p.name === others[1].name);
        return A.state?.current?.reveal?.comment === "你们根本不懂我" && target?.drinks === 2;
      });
      ok(A.state.current.reveal.comment === "你们根本不懂我", "主角补刀文字广播");
      const o2pub = A.state.players.find((p) => p.name === others[1].name);
      ok(o2pub.drinks === 2, `被指定者共 2 杯（罚1+被指定1）`);
    } else if (round === 2) {
      ok(r2.drink === true && r2.diff === 2, `罚酒阈值=2 边界：${others[1].name} 猜5 → |5-7|=2 ≥2 罚酒`);
    } else {
      ok(r2.drink === false && r2.diff === 1, `${others[1].name} 猜6 → |6-7|=1 <2 不罚`);
    }
    A.send({ type: "next" });
    if (round === 3) break; // 第三轮无人欠酒 → next 直接进 aha 结算
    await A.waitPhase("drinking");
    const ceremony = A.state.current.drinking;
    const punished = ceremony.drinkers.find((item) => item.name === others[1].name);
    if (round === 1) {
      ok(punished?.cups === 2, "罚酒仪式保留猜错1杯 + 被指定1杯");
      ok(punished?.drink?.id === others[1].drink, `罚酒页展示玩家自选酒：${punished?.drink?.label}`);
      A.lastError = null;
      A.send({ type: "next" });
      await waitUntil(() => A.lastError?.code === "drinks_pending");
      ok(A.lastError?.code === "drinks_pending", "有人没喝完时房主不能直接进入下一题");
      others[1].send({ type: "drink_done" });
      await waitUntil(() => A.state?.current?.drinking?.allDone === true);
      ok(A.state.current.drinking.allDone, "喝酒人确认后全桌同步完成状态");
    } else {
      A.send({ type: "skip_drinking" });
      await waitUntil(() => A.state?.current?.drinking?.skipped === true);
      ok(A.state.current.drinking.skipped, "房主可跳过罚酒仪式，避免卡局");
    }
    A.send({ type: "next" });
    await A.waitPhase("answering");
  }

  // Aha
  await A.waitPhase("aha");
  const aha = A.state.aha;
  ok(!!aha, "3 轮打完 → aha 结算");
  ok(typeof aha.prompt === "string" && aha.prompt.includes("man"), "aha.prompt 立绘 prompt 已生成");
  ok(Array.isArray(aha.details) && aha.details.length >= 3, `相处细节 ${aha.details.length} 条（≥3）`);
  ok(aha.profile?.matchCard?.archetype && aha.title, `理想型：${aha.profile.matchCard.archetype} / 称号：${aha.title}`);
  ok(aha.profile?.stages?.map((stage) => stage.id).join(",") === "portrait,profile,relationship",
    "理想型三段式数据：立绘 → 相亲档案 → 相处细节");
  ok(/^[EI][NS][TF][JP]$/.test(aha.profile?.matchCard?.mbti || "") && aha.profile?.matchCard?.occupation,
    `相亲档案包含 MBTI/职业：${aha.profile?.matchCard?.mbti} · ${aha.profile?.matchCard?.occupation}`);
  ok(aha.stats.bestKnower?.name === others[0].name && aha.stats.bestKnower.count === 3, `最懂TA：${others[0].name} 命中3次`);
  ok(aha.stats.avgScore === 7 && aha.stats.tolerancePct === 70, "均分7 / 容忍度70%");

  /* ---- 非诚勿扰互动体系（PRD §9）---- */

  // 聊天室：发消息 → 全员 state.chat 可见（断线重连也能靠 state 恢复）
  others[0].send(chatPayload("这题出得太狠了哈哈哈"));
  const chatArrived = await waitUntil(() => all.every((player) =>
    player.state?.chat?.some((message) => message.text === "这题出得太狠了哈哈哈")), 5000);
  const lastChat = A.state.chat?.[A.state.chat.length - 1];
  ok(chatArrived && lastChat?.text === "这题出得太狠了哈哈哈" && lastChat.name === others[0].name,
    `聊天消息入 state.chat（id=${lastChat?.id}）`);
  if (!chatArrived) throw new Error("等待聊天消息同步超时");

  // emoji 回应：服务端白名单、聚合计数、mine 个性化视图、再贴一次取消。
  const reactionObserver = all.find((player) => player !== others[1]);
  others[1].send(messageReactionPayload(lastChat.id, "😂"));
  await waitUntil(() => {
    const observerReaction = reactionObserver.state?.chat?.find((m) => m.id === lastChat.id)?.reactions?.["😂"];
    const ownReaction = others[1].state?.chat?.find((m) => m.id === lastChat.id)?.reactions?.["😂"];
    return observerReaction?.count === 1 && observerReaction.mine === false && ownReaction?.mine === true;
  });
  let rMsg = reactionObserver.state.chat.find((m) => m.id === lastChat.id);
  const ownRMsg = others[1].state.chat.find((m) => m.id === lastChat.id);
  ok(rMsg.reactions["😂"]?.count === 1 && rMsg.reactions["😂"].mine === false,
    "emoji 回应对旁观者聚合为 count=1/mine=false");
  ok(ownRMsg.reactions["😂"]?.mine === true, "贴表情者自己的 state 可直接判断 mine=true");
  others[1].lastError = null;
  others[1].send({ type: "react", msgId: lastChat.id, emoji: "🚫" });
  await waitUntil(() => others[1].lastError?.code === "invalid_reaction");
  ok(others[1].lastError?.code === "invalid_reaction", "非白名单消息 emoji 被拒绝");
  await sleep(350);
  others[1].send(messageReactionPayload(lastChat.id, "😂"));
  await waitUntil(() => !reactionObserver.state?.chat?.find((m) => m.id === lastChat.id)?.reactions?.["😂"]
    && !others[1].state?.chat?.find((m) => m.id === lastChat.id)?.reactions?.["😂"]);
  rMsg = reactionObserver.state.chat.find((m) => m.id === lastChat.id);
  ok(!rMsg.reactions["😂"], "同人再贴一次 → 回应取消");

  // 弹幕：aha 屏广播 + 3 秒限频
  others[1].send(danmakuPayload("理想型有点帅啊"));
  await waitUntil(() => A.danmakus.some((d) => d.text === "理想型有点帅啊" && d.name === others[1].name));
  ok(A.danmakus.some((d) => d.text === "理想型有点帅啊" && d.name === others[1].name),
    "弹幕广播到其他玩家");
  const dmCountBefore = A.danmakus.length;
  others[1].send(danmakuPayload("刷屏测试"));
  await sleep(250);
  ok(A.danmakus.length === dmCountBefore, "3 秒内第二条弹幕被限频拦截");

  // 快捷 reaction：白名单 transient 事件 + recent 持久化。
  others[0].send(quickReactionPayload("🔥"));
  await waitUntil(() => A.quickReactions.some((event) => event.reaction === "🔥" && event.name === others[0].name)
    && A.state?.social?.recent?.some((event) => event.type === "quick_reaction" && event.reaction === "🔥"));
  ok(A.quickReactions.some((event) => event.reaction === "🔥" && event.name === others[0].name),
    "快捷 reaction 实时广播");
  ok(A.state.social?.recent?.some((event) => event.type === "quick_reaction" && event.reaction === "🔥"),
    "快捷 reaction 写入 recent，供重连恢复");
  others[0].lastError = null;
  others[0].send({ type: "quick_reaction", emoji: "🚫" });
  await waitUntil(() => others[0].lastError?.code === "invalid_reaction");
  ok(others[0].lastError?.code === "invalid_reaction", "非白名单快捷 reaction 被拒绝");

  // 爆灯/灭灯：每人一张当前票、可改票；统计进入 aha 和海报 summary。
  others[0].send(lightVotePayload("burst"));
  others[1].send(lightVotePayload("off"));
  hero.send(lightVotePayload("burst")); // 主角不能给自己爆灯，应被忽略
  await waitUntil(() => A.state?.aha?.light?.burst === 1 && A.state?.aha?.light?.off === 1
    && others[0].state?.aha?.light?.mine === "burst" && others[1].state?.aha?.light?.mine === "off");
  await waitUntil(() => hero.lightFx.length >= 2);
  const lt = A.state.aha.light;
  ok(lt.burst === 1 && lt.off === 1 && lt.total === 2, `灯计数 爆${lt.burst}/灭${lt.off}/共${lt.total}`);
  ok(others[0].state.aha.light.mine === "burst" && others[1].state.aha.light.mine === "off",
    "每位玩家 state.aha.light.mine 返回当前票");
  ok(hero.state.aha.light.canVote === false && others[0].state.aha.light.canVote === true,
    "state 可直接判断当前玩家是否有投票资格");
  ok(A.state.aha.stats.lights?.burst === 1 && A.state.aha.stats.lights.voted === 2 && A.state.aha.stats.lights.total === 2,
    "海报数据 stats.lights 包含 burst/off/voted/total");
  ok(hero.lightFx.length >= 2, `light_fx 特效事件广播（主角收到 ${hero.lightFx.length} 条）`);
  await sleep(550);
  others[0].send(lightVotePayload("off"));
  await waitUntil(() => A.state?.aha?.light?.burst === 0 && A.state?.aha?.light?.off === 2
    && others[0].state?.aha?.light?.mine === "off");
  ok(A.state.aha.light.burst === 0 && A.state.aha.light.off === 2, "改票后实时统计从爆1/灭1更新为爆0/灭2");
  ok(others[0].state.aha.light.mine === "off", "改票后 mine 同步为 off");
  ok(A.state.aha.stats.lights.burst === 0 && A.state.aha.stats.lights.off === 2,
    "改票后的海报 summary 同步更新");

  const model = socialModel(others[0].state);
  ok(model.light.mine === "off" && model.chat.length >= 2, "public/social.js 可直接归一化互动 state");

  // 断线重连回座
  const heroToken = hero.token;
  hero.ws.close();
  await waitUntil(() => A.state?.players?.find((p) => p.name === hero.name)?.connected === false);
  ok(A.state.players.find((p) => p.name === hero.name)?.connected === false, "掉线后 connected=false 广播");
  const back = await hero.connect(code, heroToken);
  ok(back.type === "welcome" && back.reconnected === true, "凭 token 重连回座 reconnected=true");
  await waitUntil(() => hero.state?.phase === "aha" && hero.state?.you?.name === hero.name);
  ok(hero.state?.phase === "aha" && hero.state.you.name === hero.name, "重连后拿回自己视角 state");
  ok(hero.state.chat?.some((m) => m.text === "这题出得太狠了哈哈哈"), "重连后聊天记录恢复");
  ok(hero.state.social?.recent?.some((e) => e.type === "danmaku"), "重连后近期弹幕/reaction 事件恢复");
  ok(hero.state.aha?.light?.off === 2, "重连后灯状态恢复");

  // 房主推进 → 下一位主角（picking），摇签人应为上一任主角
  await waitUntil(() => all.every((player) =>
    player.state?.players?.find((p) => p.name === hero.name)?.connected === true));
  const currentHost = all.find((player) => player.state?.you?.isHost);
  currentHost.send({ type: "next" });
  await Promise.all(all.map((player) => player.waitPhase("picking", 10000)));
  const shaker2 = all.find((p) => p.state.current.youAreShaker);
  ok(shaker2 === hero, `第二轮摇签人 = 上一任主角 ${hero.name}`);

  // 当前新主角尚无答题记录，提前收局；第一位主角的历史统计必须保持独立快照。
  A.send({ type: "finish_game" });
  await A.waitPhase("finished");
  const firstSummary = A.state.ahaHistory?.[0];
  ok(A.state.ahaHistory.length === 1, "最终 summary 包含已完成主角的 ahaHistory");
  ok(firstSummary.stats.lights.burst === 0 && firstSummary.stats.lights.off === 2,
    "ahaHistory 保存最终灯票统计，未被后续主角状态污染");
  all.forEach((p) => p.ws.close());

  /* ================= V2：用户档案 KV（USERS） ================= */
  console.log("\n-- V2 用户档案 API --");

  const createRes = await fetch(BASE + "/api/user", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nick: "小K", cocktail: { name: "霓虹落日", color: "#ff5c8a", glass: "martini" }, avatarSeed: "seed-42" }),
  });
  const created = await createRes.json();
  ok(createRes.status === 201 && created.userId && created.token, `POST /api/user 创建档案 userId=${created.userId}`);

  const emptyNick = await fetch(BASE + "/api/user", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nick: "" }),
  });
  ok(emptyNick.status === 400, "空昵称创建被拒 400");

  // 更新档案（带 userId+token）
  const updRes = await fetch(BASE + "/api/user", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId: created.userId, token: created.token, nick: "老K的常客" }),
  });
  const upd = await updRes.json();
  ok(updRes.status === 200 && upd.nick === "老K的常客", "带 token 更新昵称成功");

  // 追加游玩记录 ×2（不同模组 → 展示柜分组）
  for (const [module, archetype] of [["lover", "赛博月老"], ["boss", "画饼大师"], ["lover", "醉话诗人"]]) {
    const recRes = await fetch(`${BASE}/api/user/${created.userId}/records`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: created.token, module, role: "protagonist", profile: { archetype, avgScore: 6.5, mbti: "ENFP" } }),
    });
    ok((await recRes.json()).ok === true, `追加 ${module} 游玩记录成功`);
  }

  const badTokenRes = await fetch(`${BASE}/api/user/${created.userId}/records`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: "wrong-token", module: "lover" }),
  });
  ok(badTokenRes.status === 403, "错 token 追加记录被拒 403");

  const pubRes = await fetch(`${BASE}/api/user/${created.userId}`);
  const pub = await pubRes.json();
  ok(pubRes.status === 200 && pub.nick === "老K的常客" && pub.token === undefined, "GET 公开档案：有昵称、不泄露 token");
  ok(pub.playCount === 3 && pub.showcase?.lover?.length === 2 && pub.showcase?.boss?.length === 1,
    `展示柜按模组分组：lover×${pub.showcase?.lover?.length} boss×${pub.showcase?.boss?.length}`);
  ok(pub.cocktail?.name === "霓虹落日", "鸡尾酒身份随档案返回");
  const notFound = await fetch(BASE + "/api/user/nonexist404");
  ok(notFound.status === 404, "不存在的档案 404");

  /* ================= V2：酒保老K 端点（降级路径） ================= */
  console.log("\n-- V2 酒保端点 --");

  const barRes = await fetch(BASE + "/api/bartender", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ scene: "round_comment", context: { question: "这是一个满分男，但他吵架用DeepSeek", score: 3, guesses: [5, 2] } }),
  });
  const bar = await barRes.json();
  ok(barRes.status === 200 && typeof bar.text === "string" && bar.text.length > 0,
    `酒保锐评返回文案（source=${bar.source}）：${bar.text.slice(0, 24)}…`);
  const barProfile = await (await fetch(BASE + "/api/bartender", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ scene: "profile_text", context: { archetype: "醉话诗人" } }),
  })).json();
  ok(typeof barProfile.text === "string" && barProfile.text.length > 0, "profile_text 场景返回文案");
  // 限频：同 IP 10 次/分钟
  let got429 = false;
  for (let i = 0; i < 12; i++) {
    const res = await fetch(BASE + "/api/bartender", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scene: "round_comment", context: {} }),
    });
    if (res.status === 429) { got429 = true; break; }
  }
  ok(got429, "同 IP 超 10 次/分钟触发 429 限频");

  /* ================= V2：模组+取向池抽题隔离 ================= */
  console.log("\n-- V2 题库协议：模组×取向池 --");

  const v2Questions = [];
  for (let i = 1; i <= 12; i++) v2Questions.push({ id: `sf-${i}`, spice: 1, pools: ["straight-f"], m: `直女题${i}`, f: `直女题${i}`, n: `直女题${i}` });
  for (let i = 1; i <= 12; i++) v2Questions.push({ id: `sm-${i}`, spice: 1, pools: ["straight-m"], m: `直男题${i}`, f: `直男题${i}`, n: `直男题${i}` });
  for (let i = 1; i <= 6; i++) v2Questions.push({ id: `al-${i}`, spice: 1, pools: ["all"], m: `通用题${i}`, f: `通用题${i}`, n: `通用题${i}` });
  const kingQuestions = Array.from({ length: 5 }, (_, i) => ({ id: `kg-${i + 1}`, text: `国王指令${i + 1}：让你右边的人模仿你的微信语音` }));

  const { code: code2 } = await (await fetch(BASE + "/api/room", { method: "POST" })).json();
  const P = new Player("琪琪", "🍸", "cocktail"), Q = new Player("阿澈", "🍺"), R = new Player("十三", "🥃");
  await P.connect(code2); await Q.connect(code2); await R.connect(code2);
  const table2 = [P, Q, R];
  await waitUntil(() => P.state?.players?.length === 3);
  await readyUp(table2);
  P.send({
    type: "start",
    module: "boss", moduleName: "满分老板",
    pool: "straight-f", deck: "mala", rounds: 3,
    noun: { m: "满分男老板", f: "满分女老板", n: "满分老板" },
    questions: v2Questions,
    kingQuestions,
  });
  await P.waitPhase("picking");
  ok(P.state.settings.module === "boss" && P.state.settings.pool === "straight-f"
    && P.state.settings.deck === "mala" && P.state.settings.rounds === 3,
    `V2 开局配置生效：module=${P.state.settings.moduleName} pool=${P.state.settings.pool} deck=${P.state.settings.deckName}`);

  // 逐轮验证抽题只来自 straight-f + all 池
  const seenIds = new Set();
  const shaker3 = table2.find((p) => p.state.current.youAreShaker);
  shaker3.send({ type: "draw_stick" });
  await waitUntil(() => P.state?.current?.drawn === true);
  shaker3.send({ type: "stick_done" });
  await P.waitPhase("protagonist_setup");
  const hero2 = table2.find((p) => p.state.current.youAreProtagonist);
  const guessers2 = table2.filter((p) => p !== hero2);
  hero2.send({ type: "set_gender", gender: "m" });
  await P.waitPhase("answering");
  ok(P.state.current.question.text.startsWith("这是一个满分男老板"), `自定义 noun 生效：${P.state.current.question.text.slice(0, 18)}…`);

  // 第 1 轮全员猜中（差值0）→ 触发国王游戏
  seenIds.add(P.state.current.question.id);
  hero2.send({ type: "score", v: 8 });
  guessers2[0].send({ type: "guess", v: 8 });
  guessers2[1].send({ type: "guess", v: 8 });
  await P.waitPhase("reveal");
  ok(P.state.current.reveal.results.every((x) => x.exact), "第 1 轮全员猜分与主角自评一致");
  await waitUntil(() => table2.every((p) => p.events.some((e) => e.type === "king_game")));
  ok(table2.every((p) => p.events.some((e) => e.type === "king_game")), "king_game 事件广播全桌");
  const kingName = P.events.find((e) => e.type === "king_game")?.name;
  ok(guessers2.some((p) => p.name === kingName), `国王从猜对者中随机选出：${kingName}`);

  P.send({ type: "next" });
  await P.waitPhase("king");
  const kingP = table2.find((p) => p.state.king?.youAreKing);
  const nonKing = table2.find((p) => !p.state.king?.youAreKing);
  ok(kingP && kingP.state.king.options?.length === 3, "国王收到服务端抽的 3 道国王题");
  ok(nonKing.state.king.options === null, "非国王看不到候选题（防剧透）");

  // 断线重连恢复国王状态
  const kingToken = kingP.token;
  kingP.ws.close();
  await sleep(300);
  await kingP.connect(code2, kingToken);
  await waitUntil(() => kingP.state?.king?.youAreKing === true && kingP.state.king.options?.length === 3);
  ok(kingP.state.king.options?.length === 3, "国王断线重连后候选题恢复");

  // 国王若是房主，断线期间房主可能已移交 → 后续动作找当前房主发
  const host2 = () => table2.find((p) => p.state?.you?.isHost);

  // 非国王抢发 king_pick 应无效
  nonKing.send({ type: "king_pick", idx: 0 });
  await sleep(200);
  ok(P.state.king.active === true, "非国王发 king_pick 无效");
  kingP.send({ type: "king_custom", text: "全桌左手举杯，右手发一条朋友圈" });
  await waitUntil(() => table2.every((p) => p.events.some((e) => e.type === "king_order")));
  const order = P.events.find((e) => e.type === "king_order");
  ok(order?.text?.includes("朋友圈") && order.custom === true, "国王自写圣旨广播全桌");
  ok(P.state.king?.order?.text === order.text, "圣旨进入 state.king.order（重连可恢复）");
  host2().send({ type: "next" });
  await P.waitPhase("answering");
  ok(P.state.current.roundIndex === 2, "国王游戏结束 → 正常进入第 2 轮");

  // 第 2 轮正常打分，收集抽题 id
  seenIds.add(P.state.current.question.id);
  hero2.send({ type: "score", v: 5 });
  guessers2[0].send({ type: "guess", v: 6 });
  guessers2[1].send({ type: "guess", v: 4 });
  await P.waitPhase("reveal");

  // force_next：房主强制推进到下一轮摇签（guesser 未交也不阻塞）
  host2().send({ type: "next" });
  await P.waitPhase("answering");
  seenIds.add(P.state.current.question.id);
  hero2.send({ type: "score", v: 5 });
  guessers2[0].send({ type: "guess", v: 5 });
  // guessers2[1] 故意不交 → 卡在 answering
  await sleep(400);
  ok(P.state.phase === "answering", "有人不交分时局面卡住（复现旧 bug 场景）");
  const nonHost = table2.find((p) => !p.state.you.isHost);
  nonHost.send({ type: "force_next" });
  await sleep(300);
  ok(P.state.phase === "answering", "非房主 force_next 无效");
  host2().send({ type: "force_next" });
  await P.waitPhase("picking");
  ok(true, "房主 force_next：卡死局强制推进到下一轮摇签");
  ok(table2.every((p) => p.events.some((e) => e.type === "force_next")), "force_next 事件广播全桌");
  ok([...seenIds].every((id) => id.startsWith("sf-") || id.startsWith("al-")),
    `抽题池隔离：已抽 ${[...seenIds].join(",")} 全部来自 straight-f/all 池`);
  table2.forEach((p) => p.ws.close());

  // 池过滤为空时拒绝开局
  const { code: code3 } = await (await fetch(BASE + "/api/room", { method: "POST" })).json();
  const X = new Player("小新", "🍺"), Y = new Player("小葵", "🍷");
  await X.connect(code3); await Y.connect(code3);
  await waitUntil(() => X.state?.players?.length === 2);
  await readyUp([X, Y]);
  X.lastError = null;
  X.send({ type: "start", pool: "lesbian", questions: v2Questions.filter((q) => q.pools[0] === "straight-m") });
  await waitUntil(() => !!X.lastError);
  ok(X.lastError?.msg?.includes("取向池"), "所选池无可用题时拒绝开局");
  X.ws.close(); Y.ws.close();

  /* ================= V2：中途离场不卡局 ================= */
  console.log("\n-- V2 离场与房主移交（3 人局 1 人离场，剩 2 人玩完） --");

  const { code: code4 } = await (await fetch(BASE + "/api/room", { method: "POST" })).json();
  const H = new Player("房主哥", "🍺"), M = new Player("陪玩妹", "🍷"), L = new Player("先溜哥", "🥃");
  await H.connect(code4); await M.connect(code4); await L.connect(code4);
  const table4 = [H, M, L];
  H.send({ type: "set_settings", rounds: 3 });
  await sleep(150);
  await waitUntil(() => H.state?.players?.length === 3);
  await readyUp(table4);
  H.send({ type: "start", module: "lover", pool: "all", deck: "qingtang", rounds: 3, questions: v2Questions });
  await H.waitPhase("picking");
  const shaker4 = table4.find((p) => p.state.current.youAreShaker);
  shaker4.send({ type: "draw_stick" });
  await waitUntil(() => H.state?.current?.drawn === true);
  shaker4.send({ type: "stick_done" });
  await H.waitPhase("protagonist_setup");
  const hero4 = table4.find((p) => p.state.current.youAreProtagonist);
  hero4.send({ type: "set_gender", gender: "f" });
  await H.waitPhase("answering");

  // 离场者：优先选房主（顺带验证房主移交）；房主是主角就让 L 走
  const leaver = hero4 === H ? L : H;
  const stayers = table4.filter((p) => p !== leaver);
  leaver.send({ type: "leave" });
  leaver.closed = true;
  await waitUntil(() => stayers.every((p) =>
    p.state?.players?.find((x) => x.name === leaver.name)?.left === true));
  ok(stayers[0].state.players.find((x) => x.name === leaver.name)?.left === true,
    `${leaver.name} 主动离场，全桌看到 left=true`);
  ok(stayers.every((p) => p.events.some((e) => e.type === "player_left" && e.name === leaver.name)),
    "player_left 事件广播");
  if (leaver === H) {
    await waitUntil(() => stayers.some((p) => p.state?.you?.isHost));
    const newHost = stayers.find((p) => p.state.you.isHost);
    ok(newHost === M, `房主离场 → 移交给最早加入的在线玩家：${newHost?.name}`);
  } else {
    ok(H.state.you.isHost === true, "离场的不是房主，房主不变");
  }

  // 离场者不阻塞打分收集：主角 + 剩余 1 人交分即可开牌
  const hero4b = stayers.find((p) => p.state.current.youAreProtagonist);
  const guesser4 = stayers.find((p) => p !== hero4b);
  hero4b.send({ type: "score", v: 7 });
  guesser4.send({ type: "guess", v: 4 });
  await Promise.all(stayers.map((p) => p.waitPhase("reveal")));
  ok(true, "离场玩家未交分不阻塞开牌");

  // 剩 2 人自动驾驶玩完整局
  const finished = await autoPlay(stayers);
  ok(finished, "3 人局 1 人中途离场，剩 2 人顺利玩完整局（finished）");
  ok(stayers[0].state.ahaHistory.length >= 2, `两位在场玩家都有结算（ahaHistory=${stayers[0].state.ahaHistory.length}）`);
  stayers.forEach((p) => { try { p.ws.close(); } catch {} });

  /* ================= V2：桌子=固定房间 + 公开/私密 ================= */
  console.log("\n-- V2 桌子=固定房间 + 公开/私密 --");

  const tj1 = await (await fetch(BASE + "/api/table/1/join", { method: "POST" })).json();
  const tj2 = await (await fetch(BASE + "/api/table/1/join", { method: "POST" })).json();
  ok(/^\d{4}$/.test(tj1.code) && tj1.table === 1, `table join 返回 {code:${tj1.code}, table:1}`);
  ok(tj1.code === tj2.code, "同桌连点两次 join 返回同一房间码（幂等）");

  let tablesData = await (await fetch(BASE + "/api/tables")).json();
  ok(Array.isArray(tablesData.tables) && tablesData.tables.length === 6
    && tablesData.tables.every((t) => "table" in t && "code" in t && "players" in t && "phase" in t && "active" in t),
    "GET /api/tables 返回 6 桌，结构 {table, code, players, phase, active}");
  let t1info = tablesData.tables.find((t) => t.table === 1);
  ok(t1info.active === true && t1info.code === tj1.code, "table 1 有活跃房，public 房码对大厅可见");

  // 入座后人数计入 /api/tables（人数从房间 DO 实查）
  const TT = new Player("桌一客" + Math.floor(Math.random() * 10000), "🍺");
  await TT.connect(tj1.code);
  await waitUntil(() => (TT.state?.players?.length || 0) >= 1);
  tablesData = await (await fetch(BASE + "/api/tables")).json();
  t1info = tablesData.tables.find((t) => t.table === 1);
  ok(t1info.players >= 1, `入座后 /api/tables 桌上人数=${t1info.players}（≥1）`);

  // 房主可切公开/私密；private 桌在大厅隐藏房码但保留占用状态
  if (TT.state?.you?.isHost) {
    ok(TT.state.visibility === "public", "桌子开的房默认 public（房主视角可见）");
    TT.send({ type: "set_visibility", visibility: "private" });
    await waitUntil(() => TT.state?.visibility === "private");
    ok(TT.state.visibility === "private", "房主 set_visibility → viewFor 同步 private");
    tablesData = await (await fetch(BASE + "/api/tables")).json();
    t1info = tablesData.tables.find((t) => t.table === 1);
    ok(t1info.code === null && t1info.active === true, "private 桌 /api/tables 隐藏房码、保留占用");
    TT.send({ type: "set_visibility", visibility: "public" });
    await waitUntil(() => TT.state?.visibility === "public");
    ok(TT.state.visibility === "public", "房主切回 public，大厅恢复可加入");
  } else {
    ok(false, "本次入座者不是桌一房主（多半是上次运行残留的座位，清 .wrangler/state 后重跑）");
  }
  TT.send({ type: "leave" }); // lobby 撤座，保证复跑时房主判定成立
  await sleep(200);
  try { TT.ws.close(); } catch {}

  /* ================= V2：solo 一人开局 ================= */
  console.log("\n-- V2 solo 一人开局 --");

  const soloRoom = await (await fetch(BASE + "/api/room", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ solo: true }),
  })).json();
  ok(/^\d{4}$/.test(soloRoom.code), `solo 建房得到房间码 ${soloRoom.code}`);
  const S = new Player("独酌侠", "🥃", "baijiu");
  await S.connect(soloRoom.code);
  S.send({ type: "start", rounds: 3, questions: v2Questions });
  await S.waitPhase("picking");
  ok(S.state.solo === true, "solo 房 1 人可开局（state.solo=true）");
  const soloFinished = await autoPlay([S]);
  ok(soloFinished, "solo 一人自动驾驶跑完整局 → finished");
  ok(S.state.ahaHistory?.length === 1, "solo 局也生成 aha 结算（ahaHistory=1）");
  try { S.ws.close(); } catch {}

  // R5：solo 局 aha 本人自投一票（total=1，本人爆灯=100%），可改票
  const soloLightRoom = await (await fetch(BASE + "/api/room", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ solo: true }),
  })).json();
  const SL = new Player("独灯侠", "🥃", "baijiu");
  await SL.connect(soloLightRoom.code);
  SL.send({ type: "start", rounds: 3, questions: v2Questions });
  await SL.waitPhase("picking");
  const reachedAha = await playToAha([SL]);
  ok(reachedAha, "solo 局手动推进到 aha 立绘");
  ok(SL.state.aha.light.canVote === true, "solo 主角本人有 aha 投灯资格（canVote=true）");
  SL.send(lightVotePayload("burst"));
  await waitUntil(() => SL.state?.aha?.light?.burst === 1 && SL.state?.aha?.light?.total === 1
    && SL.state?.aha?.light?.mine === "burst");
  const slt = SL.state.aha.light;
  ok(slt.burst === 1 && slt.off === 0 && slt.total === 1 && slt.mine === "burst",
    `solo 主角自投爆灯：爆${slt.burst}/共${slt.total}（爆灯率100%）`);
  ok(SL.state.aha.stats.lights.burst === 1 && SL.state.aha.stats.lights.total === 1,
    "solo aha stats.lights 记录 total=1 爆灯1（海报/展示柜口径）");
  await sleep(550);
  SL.send(lightVotePayload("off")); // 改票 爆→灭
  await waitUntil(() => SL.state?.aha?.light?.off === 1 && SL.state?.aha?.light?.burst === 0
    && SL.state?.aha?.light?.mine === "off");
  ok(SL.state.aha.light.off === 1 && SL.state.aha.light.total === 1 && SL.state.aha.light.mine === "off",
    "solo 改票爆→灭：灭1/共1（本人灭灯=0%爆灯率）");
  try { SL.ws.close(); } catch {}

  // 正常房仍保持 2 人下限
  const { code: codeN } = await (await fetch(BASE + "/api/room", { method: "POST" })).json();
  const N1 = new Player("孤勇者", "🍺");
  await N1.connect(codeN);
  N1.lastError = null;
  N1.send({ type: "start", rounds: 3, questions: v2Questions });
  await waitUntil(() => !!N1.lastError);
  ok(N1.lastError?.msg?.includes("至少 2 人"), "非 solo 房 1 人开局仍被拒");
  try { N1.ws.close(); } catch {}

  /* ================= V2：展示柜记录可见性（hidden） ================= */
  console.log("\n-- V2 展示柜记录可见性 --");

  // 此时 created 用户 records = [0]=lover, [1]=boss, [2]=lover
  const hideRes = await fetch(`${BASE}/api/user/${created.userId}/records/1/visibility`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: created.token, hidden: true }),
  });
  const hide = await hideRes.json();
  ok(hideRes.status === 200 && hide.ok === true && hide.hidden === true, "POST records/1/visibility 设为隐藏");
  const badHide = await fetch(`${BASE}/api/user/${created.userId}/records/0/visibility`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: "wrong-token", hidden: true }),
  });
  ok(badHide.status === 403, "错 token 改可见性被拒 403");
  const oobHide = await fetch(`${BASE}/api/user/${created.userId}/records/99/visibility`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: created.token, hidden: true }),
  });
  ok(oobHide.status === 404, "越界 idx 返回 404");

  const guestView = await (await fetch(`${BASE}/api/user/${created.userId}`)).json();
  ok(guestView.playCount === 2 && !guestView.showcase.boss && guestView.showcase.lover?.length === 2,
    "非本人视角：hidden 记录被过滤（boss 组消失，playCount=2）");
  const ownerView = await (await fetch(`${BASE}/api/user/${created.userId}?token=${created.token}`)).json();
  ok(ownerView.owner === true && ownerView.playCount === 3
    && ownerView.showcase.boss?.[0]?.hidden === true && ownerView.showcase.boss[0].idx === 1,
    "本人带 token：返回全部记录并标注 hidden/idx");
  const wrongView = await (await fetch(`${BASE}/api/user/${created.userId}?token=not-mine`)).json();
  ok(wrongView.owner === false && wrongView.playCount === 2 && !wrongView.showcase.boss,
    "错 token 查询视角等同路人");

  // 立绘 imageUrl 不被 sanitize 截断丢失（QA：展示柜没图）
  const longUrl = "https://image.pollinations.ai/prompt/" + "a".repeat(600) + "?width=512";
  await fetch(`${BASE}/api/user/${created.userId}/records`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: created.token, module: "art", profile: { archetype: "测试型", imageUrl: longUrl } }),
  });
  const artView = await (await fetch(`${BASE}/api/user/${created.userId}?token=${created.token}`)).json();
  ok(artView.showcase.art?.[0]?.profile?.imageUrl === longUrl,
    `record.profile.imageUrl 完整保存（${longUrl.length} 字符不截断）`);

  // cocktail.intro 通过白名单
  await fetch(BASE + "/api/user", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId: created.userId, token: created.token, cocktail: { name: "霓虹落日", intro: "先苦后甜，像极了暗恋" } }),
  });
  const introView = await (await fetch(`${BASE}/api/user/${created.userId}`)).json();
  ok(introView.cocktail?.intro === "先苦后甜，像极了暗恋", "cocktail.intro 通过白名单保存");

  /* ================= R8：图鉴收集 codex（KV 跟账号走） ================= */
  console.log("\n-- R8 图鉴 codex --");

  const CODEX_H = { "content-type": "application/json" };
  const postCodex = (body) => fetch(`${BASE}/api/user/${created.userId}/codex`, {
    method: "POST", headers: CODEX_H, body: JSON.stringify({ token: created.token, ...body }),
  });

  // ① 合法请求 200 且 count 递增、firstAt 只写一次
  const cdx1Res = await postCodex({ deck: "man", typeId: 7 });
  const cdx1 = await cdx1Res.json();
  ok(cdx1Res.status === 200 && cdx1.ok === true && cdx1.codex?.man?.[7]?.count === 1,
    "POST codex {man,7} → 200 count=1");
  const firstAt1 = cdx1.codex?.man?.[7]?.firstAt;
  ok(Number.isFinite(firstAt1) && firstAt1 > 0, `首次解锁写入 firstAt=${firstAt1}`);
  await sleep(30); // 保证两次写入时间戳可区分，验证 firstAt 不被覆盖
  const cdx2 = await (await postCodex({ deck: "man", typeId: 7 })).json();
  ok(cdx2.codex?.man?.[7]?.count === 2, "同型号再抽 → count 递增为 2");
  ok(cdx2.codex?.man?.[7]?.firstAt === firstAt1, "firstAt 只写一次，重复解锁不覆盖");
  const cdx3 = await (await postCodex({ deck: "woman", typeId: 16 })).json();
  ok(cdx3.codex?.woman?.[16]?.count === 1 && cdx3.codex?.man?.[7]?.count === 2,
    "不同 deck 分本记账：woman#16 与 man#7 互不影响");

  // ② 非法 deck / typeId=0 / typeId=17 / 非整数 → 400
  ok((await postCodex({ deck: "lover", typeId: 3 })).status === 400, "非法 deck=lover → 400");
  ok((await postCodex({ deck: "man", typeId: 0 })).status === 400, "typeId=0 → 400");
  ok((await postCodex({ deck: "man", typeId: 17 })).status === 400, "typeId=17 → 400");
  ok((await postCodex({ deck: "man", typeId: 7.5 })).status === 400, "typeId=7.5 非整数 → 400");
  ok((await postCodex({ deck: "man", typeId: "7" })).status === 400, "typeId 字符串 → 400");
  // 鉴权与 records 端点同级：错 token 403，用户不存在 404
  const cdxBadToken = await fetch(`${BASE}/api/user/${created.userId}/codex`, {
    method: "POST", headers: CODEX_H, body: JSON.stringify({ token: "wrong-token", deck: "man", typeId: 7 }),
  });
  ok(cdxBadToken.status === 403, "codex 错 token → 403");
  const cdxNoUser = await fetch(`${BASE}/api/user/nonexist404/codex`, {
    method: "POST", headers: CODEX_H, body: JSON.stringify({ token: "x", deck: "man", typeId: 7 }),
  });
  ok(cdxNoUser.status === 404, "codex 用户不存在 → 404");

  // ③ GET user 返回体含 codex
  const codexView = await (await fetch(`${BASE}/api/user/${created.userId}`)).json();
  ok(codexView.codex && typeof codexView.codex === "object", "GET /api/user/:id 返回体含 codex");
  ok(codexView.codex?.man?.[7]?.count === 2 && codexView.codex?.man?.[7]?.firstAt === firstAt1
    && codexView.codex?.woman?.[16]?.count === 1,
    "GET codex 与写入一致：man#7×2（firstAt 保留）/ woman#16×1");

  /* ================= R5：展示柜点赞 + 评论 ================= */
  console.log("\n-- R5 展示柜点赞/评论 --");

  const JSON_H = { "content-type": "application/json" };
  const rid0 = `${created.userId}:0`; // 可见的 lover 记录

  // 点赞 +1（幂等累加，两次 → 2）
  const like1 = await fetch(BASE + "/api/showcase/like", {
    method: "POST", headers: JSON_H, body: JSON.stringify({ recordId: rid0 }),
  });
  const like1b = await like1.json();
  ok(like1.status === 200 && like1b.likes === 1, "POST /api/showcase/like → likes=1");
  const like2b = await (await fetch(BASE + "/api/showcase/like", {
    method: "POST", headers: JSON_H, body: JSON.stringify({ recordId: rid0 }),
  })).json();
  ok(like2b.likes === 2, "再次点赞累加 → likes=2");

  // 坏 recordId → 400；越界 idx → 404
  const likeBad = await fetch(BASE + "/api/showcase/like", {
    method: "POST", headers: JSON_H, body: JSON.stringify({ recordId: "nocolon" }),
  });
  ok(likeBad.status === 400, "点赞坏 recordId（无分隔符）→ 400");
  const likeOob = await fetch(BASE + "/api/showcase/like", {
    method: "POST", headers: JSON_H, body: JSON.stringify({ recordId: `${created.userId}:99` }),
  });
  ok(likeOob.status === 404, "点赞越界 idx → 404");

  // 评论：XSS 转义 + name 保存
  const cmtRes = await fetch(BASE + "/api/showcase/comment", {
    method: "POST", headers: JSON_H,
    body: JSON.stringify({ recordId: rid0, text: "<script>alert(1)</script>笑死", name: "阿黑" }),
  });
  const cmtBody = await cmtRes.json();
  ok(cmtRes.status === 200 && Array.isArray(cmtBody.comments) && cmtBody.comments.length === 1,
    "POST /api/showcase/comment → 200 返回评论列表");
  ok(cmtBody.comments[0].text.includes("&lt;script&gt;") && !cmtBody.comments[0].text.includes("<script>"),
    "评论 HTML 转义（<script> → &lt;script&gt;）");
  ok(cmtBody.comments[0].name === "阿黑", "评论保存昵称");

  // 同名 3s 内再评 → 429（轻限频）
  const cmtFast = await fetch(BASE + "/api/showcase/comment", {
    method: "POST", headers: JSON_H,
    body: JSON.stringify({ recordId: rid0, text: "再来一条", name: "阿黑" }),
  });
  ok(cmtFast.status === 429, "同名 3 秒内连发评论 → 429 限频");

  // 空评论 → 400（换新名字避开限频）
  const cmtEmpty = await fetch(BASE + "/api/showcase/comment", {
    method: "POST", headers: JSON_H,
    body: JSON.stringify({ recordId: rid0, text: "   ", name: "空白君" }),
  });
  ok(cmtEmpty.status === 400, "空白评论 → 400");

  // GET 记录下行携带 likes + comments
  const cmtView = await (await fetch(`${BASE}/api/user/${created.userId}`)).json();
  const rec0 = (cmtView.showcase.lover || []).find((r) => r.idx === 0);
  ok(rec0 && rec0.likes === 2, `GET 记录携带 likes=${rec0?.likes}（=2）`);
  ok(rec0 && Array.isArray(rec0.comments) && rec0.comments.length === 1
    && rec0.comments[0].text.includes("&lt;script&gt;"),
    "GET 记录携带 comments（含转义文本）");

  /* ================= R2：注册 + 找回（昵称全局查重 + 4-6 位口令） ================= */
  console.log("\n-- R2 注册/找回 --");

  const JSON_HEADERS = { "content-type": "application/json" };
  const regName = ("K客" + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3)).slice(0, 12);
  const regRes = await fetch(BASE + "/api/register", {
    method: "POST", headers: JSON_HEADERS,
    body: JSON.stringify({ name: regName, passcode: "1234", gender: "m", seeking: "f" }),
  });
  const reg = await regRes.json();
  ok(regRes.status === 201 && reg.userId && reg.token, `POST /api/register → 201 userId=${reg.userId}`);

  const dupRes2 = await fetch(BASE + "/api/register", {
    method: "POST", headers: JSON_HEADERS,
    body: JSON.stringify({ name: "  " + regName.toUpperCase() + "  ", passcode: "5678", gender: "f", seeking: "m" }),
  });
  const dupBody = await dupRes2.json();
  ok(dupRes2.status === 409 && dupBody.error === "name_taken", "重名（大小写+空格归一）→ 409 name_taken");

  const badPass1 = await fetch(BASE + "/api/register", {
    method: "POST", headers: JSON_HEADERS,
    body: JSON.stringify({ name: regName + "b", passcode: "123", gender: "m", seeking: "f" }),
  });
  ok(badPass1.status === 400, "口令 3 位 → 400");
  const badPass2 = await fetch(BASE + "/api/register", {
    method: "POST", headers: JSON_HEADERS,
    body: JSON.stringify({ name: regName + "c", passcode: "12ab", gender: "m", seeking: "f" }),
  });
  ok(badPass2.status === 400, "口令带字母 → 400");
  const badGender = await fetch(BASE + "/api/register", {
    method: "POST", headers: JSON_HEADERS,
    body: JSON.stringify({ name: regName + "d", passcode: "1234", gender: "z", seeking: "f" }),
  });
  ok(badGender.status === 400, "gender 非 m|f|x → 400");

  const recOk = await fetch(BASE + "/api/recover", {
    method: "POST", headers: JSON_HEADERS,
    body: JSON.stringify({ name: regName, passcode: "1234" }),
  });
  const rec = await recOk.json();
  ok(recOk.status === 200 && rec.userId === reg.userId && rec.token === reg.token,
    "POST /api/recover 昵称+口令 → 200 找回同一 userId/token");
  const recWrong = await fetch(BASE + "/api/recover", {
    method: "POST", headers: JSON_HEADERS,
    body: JSON.stringify({ name: regName, passcode: "9999" }),
  });
  ok(recWrong.status === 403, "口令错 → 403");
  const recMiss = await fetch(BASE + "/api/recover", {
    method: "POST", headers: JSON_HEADERS,
    body: JSON.stringify({ name: "查无此人" + Math.random().toString(36).slice(2, 6), passcode: "1234" }),
  });
  ok(recMiss.status === 404, "名字不存在 → 404");

  const regProfile = await (await fetch(`${BASE}/api/user/${reg.userId}`)).json();
  ok(regProfile.nick === regName && regProfile.token === undefined,
    "注册档案沿用现有 user 结构（GET /api/user/:id 可读、不泄 token）");
  ok(regProfile.seeking === "f" && regProfile.gender === "m",
    "GET /api/user/:id 带 gender/seeking（F 线主页想看方向徽标）");

  /* ================= R2：老K LLM 代理 /api/laok（永不 5xx + 降级） ================= */
  console.log("\n-- R2 老K代理 /api/laok --");

  const laokCtx = encodeURIComponent(JSON.stringify({ question: "满分男但吵架只用AI回复", score: 7 }));
  const laok1Res = await fetch(`${BASE}/api/laok?scene=round_reveal&ctx=${laokCtx}`);
  const laok1 = await laok1Res.json();
  ok(laok1Res.status === 200 && typeof laok1.text === "string" && laok1.text.length > 0
    && ["llm", "pool"].includes(laok1.source),
    `GET /api/laok → 200（source=${laok1.source}）：${laok1.text.slice(0, 20)}…`);
  const laok2 = await (await fetch(`${BASE}/api/laok?scene=round_reveal&ctx=${laokCtx}`)).json();
  ok(laok2.text === laok1.text && laok2.source === laok1.source, "相同 scene+ctx 60s 内命中缓存（防刷）");
  const laokBadRes = await fetch(`${BASE}/api/laok?scene=&ctx=%7Bnot-json`);
  const laokBad = await laokBadRes.json();
  ok(laokBadRes.status === 200 && laokBad.text && ["llm", "pool"].includes(laokBad.source),
    "垃圾参数照样 200 + 有文案（永不 5xx，降级可用）");

  /* ================= R2：卡组 deck + 每题国王 + 每题爆灯 + 终局无大国王 ================= */
  console.log("\n-- R2 卡组 + 每题国王/爆灯 --");

  // R9 卡组合并：man/woman/boss/bestie/lover 全部规整为 lover（旧链接兼容，不 400）
  const deckRoom = await (await fetch(BASE + "/api/room", {
    method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ deck: "woman" }),
  })).json();
  ok(/^\d{4}$/.test(deckRoom.code) && deckRoom.deck === "lover",
    "R9：建房 body.deck=woman 被规整为 lover（旧链接兼容）");
  const defDeckRoom = await (await fetch(BASE + "/api/room", { method: "POST" })).json();
  ok(defDeckRoom.deck === "lover", "R9：deck 缺省 = lover");

  for (const legacy of ["man", "boss", "bestie", "lover", "不存在的卡组"]) {
    const res = await fetch(BASE + "/api/room", {
      method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ deck: legacy }),
    });
    const room = await res.json();
    ok(res.status === 200 && /^\d{4}$/.test(room.code) && room.deck === "lover",
      `R9：建房 deck=${legacy} → 200 且规整为 lover（不 400）`);
  }
  const tablesR2 = await (await fetch(BASE + "/api/tables")).json();
  ok(tablesR2.tables.every((t) => "deck" in t), "/api/tables 每桌返回带 deck 字段");
  ok(tablesR2.tables.every((t) => t.deck === null || t.deck === "lover"),
    "R9：/api/tables 的 deck 只可能是 lover（空桌为 null）");

  const K1 = new Player("国一", "🍺", "beer", "f"), K2 = new Player("国二", "🍷", "wine", "m"), K3 = new Player("国三", "🥃", "soft", "x");
  await K1.connect(deckRoom.code); await K2.connect(deckRoom.code); await K3.connect(deckRoom.code);
  const kt = [K1, K2, K3];
  await waitUntil(() => K1.state?.players?.length === 3);
  ok(K1.state.deck === "lover", "R9：房间 state 广播 deck=lover");
  ok(K1.state.you.seeking === "f" && K2.state.you.seeking === "m" && K3.state.you.seeking === "x",
    "join 透传 seeking → state.you.seeking");

  await readyUp(kt);
  K1.send({ type: "start", rounds: 3, questions: v2Questions });
  await K1.waitPhase("picking");
  const kShaker = kt.find((p) => p.state.current.youAreShaker);
  kShaker.send({ type: "draw_stick" });
  await waitUntil(() => K1.state?.current?.drawn === true);
  kShaker.send({ type: "stick_done" });
  await K1.waitPhase("protagonist_setup");
  const kHero = kt.find((p) => p.state.current.youAreProtagonist);
  const kGuessers = kt.filter((p) => p !== kHero);
  kHero.send({ type: "set_gender", gender: "m" });
  await K1.waitPhase("answering");

  // R5：答题/开牌期不再有每题灯票（爆灯灭灯只在 aha 立绘一刻）。发了也应被忽略。
  kGuessers[0].send({ type: "light", value: "burst", vote: "burst" });
  kHero.send({ type: "light", value: "burst", vote: "burst" });

  kHero.send({ type: "score", v: 7 });
  kGuessers[0].send({ type: "guess", v: 7 }); // 分毫不差
  kGuessers[1].send({ type: "guess", v: 7 }); // 也分毫不差 → 双国王
  await Promise.all(kt.map((p) => p.waitPhase("reveal")));
  const kIds = Object.fromEntries(K1.state.players.map((p) => [p.name, p.id]));
  const kReveal = K1.state.current.reveal;
  ok(Array.isArray(kReveal.exact) && kReveal.exact.length === 2
    && kReveal.exact.includes(kIds[kGuessers[0].name]) && kReveal.exact.includes(kIds[kGuessers[1].name]),
    "reveal.exact = 全部分毫不差玩家 id 数组（双国王）");
  await waitUntil(() => kt.every((p) => p.events.some((e) => e.type === "king_chance")));
  const kChance = K1.events.find((e) => e.type === "king_chance");
  ok(kChance.winners.length === 2 && kChance.seatCount === 3 && kChance.questionIdx === 0,
    "king_chance{winners,questionIdx,seatCount:N} 广播（双国王）");

  // 每客户端只从 state.you.seatNo 读到自己的匿名号；号 1..N 每人唯一（每题重洗）
  await waitUntil(() => kt.every((p) => Number.isInteger(p.state?.you?.seatNo)));
  const seatNos = kt.map((p) => p.state.you.seatNo);
  ok(seatNos.every((n) => n >= 1 && n <= 3) && new Set(seatNos).size === 3,
    `匿名号 1..N 每人唯一：${seatNos.join(",")}`);
  const seatOfId = {}; kt.forEach((p) => { seatOfId[p.state.you.id] = p.state.you.seatNo; });
  const seatToName = {}; kt.forEach((p) => { seatToName[p.state.you.seatNo] = p.name; });
  ok(seatOfId[kChance.winners[0]] < seatOfId[kChance.winners[1]], "king_chance.winners 按座次升序");

  // R5：开牌期灭灯也不再产生每题灯票（答题 reveal 页彻底无灯 UI，验收硬指标）
  kGuessers[1].send({ type: "light", value: "off", vote: "off" });
  await sleep(300);
  const kLights = K1.state.current.reveal.lights || {};
  ok(Object.keys(kLights).length === 0,
    "R5：答题/开牌期无每题灯票（reveal.lights 恒空，每题投灯已删）");

  // 号码轮报：确定当前轮到谁、下一个是谁（按座次）
  const kcView = () => K1.state.current.kingChance;
  await waitUntil(() => kcView()?.currentKing);
  const king1Id = kcView().currentKing;
  const king2Id = kChance.winners.find((w) => w !== king1Id);
  const king1 = kt.find((p) => p.state.you.id === king1Id);
  const king2 = kt.find((p) => p.state.you.id === king2Id);
  ok(king1Id === kChance.winners[0], "currentKing = 座次最前的国王（轮报起点）");

  // 非 winner（主角）报号无效
  kHero.send({ type: "king_order", nums: [1, 2], orderId: "ko-1" });
  await sleep(250);
  ok(!kt.some((p) => p.events.some((e) => e.type === "king_result")), "非 winner 报号无效");
  // 未轮到的第二国王抢先报号无效
  king2.send({ type: "king_order", nums: [1, 2], orderId: "ko-1" });
  await sleep(250);
  ok(!kt.some((p) => p.events.some((e) => e.type === "king_result")), "未轮到的国王抢先报号无效");
  // 非法号：相同 / 越界 无效
  king1.send({ type: "king_order", nums: [2, 2], orderId: "ko-1" });
  king1.send({ type: "king_order", nums: [1, 9], orderId: "ko-1" });
  king1.send({ type: "king_order", nums: [1], orderId: "ko-1" });
  await sleep(250);
  ok(!kt.some((p) => p.events.some((e) => e.type === "king_result")), "号相同/越界/数量不足报号无效");

  // 第一个国王合法报号 → king_result 公布号背后真名
  king1.send({ type: "king_order", nums: [1, 2], orderId: "ko-1" });
  await waitUntil(() => kt.every((p) => p.events.some((e) => e.type === "king_result")));
  const r1 = K1.events.find((e) => e.type === "king_result");
  ok(r1.king === king1Id && Array.isArray(r1.nums) && r1.nums.length === 2
    && r1.orderId === "ko-1" && r1.questionIdx === 0,
    "king_result{king,nums,orderId,questionIdx} 广播全桌");
  ok(r1.names[0] === seatToName[r1.nums[0]] && r1.names[1] === seatToName[r1.nums[1]],
    "king_result.names 公布 X号背后是谁");

  // 轮到第二个国王，流程尚未结束
  await waitUntil(() => kcView()?.currentKing === king2Id);
  ok(kcView().currentKing === king2Id && kcView().done === false,
    "第一个国王报完 → 按座次轮到下一个国王，done=false");
  king2.send({ type: "king_order", nums: [2, 3], orderId: "ko-2" });
  await waitUntil(() => K1.events.filter((e) => e.type === "king_result").length === 2);
  ok(K1.events.filter((e) => e.type === "king_result").length === 2, "双国王各报一组号（惩罚可叠加）");
  await waitUntil(() => kcView()?.done === true);
  ok(kcView().done === true, "全部国王报完 → done=true，流程继续");

  // 终局无大国王：finished 阶段 king 恒为 null（字段保留兼容旧前端）
  const kHost = () => kt.find((p) => p.state?.you?.isHost);
  kHost().send({ type: "finish_game" });
  await K1.waitPhase("aha");
  kHost().send({ type: "finish_game" });
  await Promise.all(kt.map((p) => p.waitPhase("finished")));
  ok(K1.state.phase === "finished" && K1.state.king === null, "finished 阶段无终局大国王（state.king=null）");
  kt.forEach((p) => { try { p.ws.close(); } catch {} });

  /* ================= R9：题随被拷问者（主角 gender×seeking 决定抽题池 + renderGender） ================= */
  console.log("\n-- R9 题随被拷问者 --");

  // 纯函数映射（新签名：allowedPoolsFor(gender, seeking)，与卡组无关）
  const poolsOf = (g, s) => JSON.stringify(allowedPoolsFor(g, s));
  ok(poolsOf("f", "m") === JSON.stringify(["neutral", "straight-m"]), "allowedPoolsFor 直女(f,m) → neutral+straight-m");
  ok(poolsOf("m", "m") === JSON.stringify(["neutral", "gay"]), "allowedPoolsFor 男同(m,m) → neutral+gay");
  ok(poolsOf("m", "f") === JSON.stringify(["neutral", "straight-f"]), "allowedPoolsFor 直男(m,f) → neutral+straight-f");
  ok(poolsOf("f", "f") === JSON.stringify(["neutral", "lesbian"]), "allowedPoolsFor 姬圈(f,f) → neutral+lesbian");
  ok(poolsOf("f", "x") === JSON.stringify(["neutral"]) && poolsOf("m", "x") === JSON.stringify(["neutral"]),
    "allowedPoolsFor seeking=x（都行）→ 仅 neutral");
  ok(poolsOf(null, null) === JSON.stringify(["neutral"]) && poolsOf(null, "m") === JSON.stringify(["neutral"])
    && poolsOf("f", null) === JSON.stringify(["neutral"]),
    "allowedPoolsFor 主角无档案（散客没选）→ 仅 neutral");

  // 合成题库：每池 id 前缀唯一，抽到什么就能反推来自哪个池
  const R9_ROUNDS = 8; // = rounds 上限；允许池恰好 8 题 → 8 轮把该池抽空，覆盖完整
  const R9_IDS = { neutral: [], "straight-m": [], gay: [], "straight-f": [], lesbian: [] };
  const r9Bank = [];
  for (const [pool, prefix, n] of [
    ["neutral", "r9ne", 2], ["straight-m", "r9sm", 6], ["gay", "r9gay", 6],
    ["straight-f", "r9sf", 6], ["lesbian", "r9les", 6],
  ]) {
    for (let i = 1; i <= n; i++) {
      const id = `${prefix}-${i}`;
      R9_IDS[pool].push(id);
      r9Bank.push({ id, spice: 1, pools: [pool], m: `${pool}题${i}`, f: `${pool}题${i}`, n: `${pool}题${i}` });
    }
  }
  const r9AllIds = Object.values(R9_IDS).flat();
  const r9Allowed = (...pools) => new Set([...R9_IDS.neutral, ...pools.flatMap((p) => R9_IDS[p])]);
  const r9Forbidden = (allowedSet) => r9AllIds.filter((id) => !allowedSet.has(id));

  // solo 房 = 单人局，主角必定是他自己 → 主角取向可控，抽题池可断言
  async function r9SoloProbe(label, gender, seeking) {
    const room = await (await fetch(BASE + "/api/room", {
      method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ solo: true }),
    })).json();
    const p = new Player(label, "🍺", "beer", seeking, gender);
    await p.connect(room.code);
    await waitUntil(() => p.state?.players?.length === 1);
    p.send({ type: "start", rounds: R9_ROUNDS, questions: r9Bank });
    await p.waitPhase("picking");
    p.send({ type: "draw_stick" });
    await waitUntil(() => p.state?.current?.drawn === true);
    p.send({ type: "stick_done" });
    await p.waitPhase("protagonist_setup");
    p.send({ type: "set_gender", gender: "m" });
    const ids = new Set();
    const renderGenders = new Set();
    for (let round = 1; round <= R9_ROUNDS; round++) {
      const arrived = await waitUntil(
        () => p.state?.phase === "answering" && p.state?.current?.roundIndex === round, 8000);
      if (!arrived) break;
      ids.add(p.state.current.question.id);
      renderGenders.add(p.state.current.renderGender);
      p.send({ type: "score", v: 5 });
      if (!(await waitUntil(() => p.state?.phase === "reveal", 8000))) break;
      p.send({ type: "next" });
    }
    await waitUntil(() => p.state?.phase === "aha", 8000);
    try { p.ws.close(); } catch {}
    return { ids, renderGenders: [...renderGenders], roomDeck: p.state?.deck };
  }

  // ① 主角直女（gender f, seeking m）→ 只出 neutral ∪ straight-m
  const pf = await r9SoloProbe("直女主角", "f", "m");
  const pfAllowed = r9Allowed("straight-m");
  ok([...pf.ids].every((id) => pfAllowed.has(id))
    && r9Forbidden(pfAllowed).every((id) => !pf.ids.has(id)),
    `① 直女主角抽题只出 neutral∪straight-m（${pf.ids.size} 题，无 gay/lesbian/straight-f）`);
  ok(pf.ids.size === pfAllowed.size && [...pfAllowed].every((id) => pf.ids.has(id)),
    "① 直女主角 8 轮把 neutral+straight-m 池抽干（池确实是这 8 题）");
  ok(pf.roomDeck === "lover", "① 房间仍是 lover 恋爱局（题池由主角决定，不由卡组）");

  // ② 主角男同（gender m, seeking m）→ 只出 neutral ∪ gay
  const pg = await r9SoloProbe("男同主角", "m", "m");
  const pgAllowed = r9Allowed("gay");
  ok([...pg.ids].every((id) => pgAllowed.has(id))
    && r9Forbidden(pgAllowed).every((id) => !pg.ids.has(id)),
    `② 男同主角抽题只出 neutral∪gay（${pg.ids.size} 题，无 straight-m/straight-f/lesbian）`);
  ok(pg.ids.size === pgAllowed.size && [...pgAllowed].every((id) => pg.ids.has(id)),
    "② 男同主角 8 轮把 neutral+gay 池抽干（池确实是这 8 题）");

  // ②b 直男 / 姬圈（同一份题库、同一个 lover 房，只因主角不同而换池）
  const pm = await r9SoloProbe("直男主角", "m", "f");
  const pmAllowed = r9Allowed("straight-f");
  ok([...pm.ids].every((id) => pmAllowed.has(id)) && pm.ids.size === pmAllowed.size,
    "②b 直男主角(m,f) 只出 neutral∪straight-f");
  const pl = await r9SoloProbe("姬圈主角", "f", "f");
  const plAllowed = r9Allowed("lesbian");
  ok([...pl.ids].every((id) => plAllowed.has(id)) && pl.ids.size === plAllowed.size,
    "②b 姬圈主角(f,f) 只出 neutral∪lesbian");

  // ③ 主角无档案（散客没选 gender/seeking）→ 只出 neutral
  const pn = await r9SoloProbe("散客主角", null, null);
  ok([...pn.ids].every((id) => R9_IDS.neutral.includes(id)) && pn.ids.size === R9_IDS.neutral.length,
    `③ 无档案主角只出 neutral（抽到 ${[...pn.ids].join(",")}）`);
  // seeking=x（都行）同样只给 neutral
  const px = await r9SoloProbe("都行主角", "m", "x");
  ok([...px.ids].every((id) => R9_IDS.neutral.includes(id)),
    "③ seeking=x（都行）主角只出 neutral");

  // ④ current.renderGender 三态（契约：m→m / f→f / 其它或缺失→n）
  ok(pf.renderGenders.length === 1 && pf.renderGenders[0] === "m", "④ renderGender：主角 seeking=m → 'm'");
  ok(pm.renderGenders.length === 1 && pm.renderGenders[0] === "f", "④ renderGender：主角 seeking=f → 'f'");
  ok(px.renderGenders.length === 1 && px.renderGenders[0] === "n", "④ renderGender：主角 seeking=x → 'n'");
  ok(pn.renderGenders.length === 1 && pn.renderGenders[0] === "n", "④ renderGender：主角无档案 → 'n'");

  // ⑤ 同一局内两个取向不同的主角 → 各自轮次抽到的池不同
  const duoRoom = await (await fetch(BASE + "/api/room", {
    method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ deck: "man" }), // 旧 man 链接
  })).json();
  const D1 = new Player("直女姐", "🍷", "wine", "m", "f"); // 直女 → neutral+straight-m
  const D2 = new Player("男同弟", "🍺", "beer", "m", "m"); // 男同 → neutral+gay
  await D1.connect(duoRoom.code);
  await D2.connect(duoRoom.code);
  const duo = [D1, D2];
  await waitUntil(() => D1.state?.players?.length === 2);
  ok(D1.state.deck === "lover", "⑤ 旧 man 链接开的房，广播里已是 lover");
  await readyUp(duo);
  D1.send({ type: "start", rounds: R9_ROUNDS, questions: r9Bank });

  const drawnBy = new Map(); // 主角昵称 -> 该主角轮次抽到的题 id 集合
  const rgBy = new Map(); // 主角昵称 -> renderGender
  for (let turn = 0; turn < 2; turn++) {
    if (!(await waitUntil(() => D1.state?.phase === "picking", 10000))) break;
    const shaker = duo.find((p) => p.state?.current?.youAreShaker);
    shaker.send({ type: "draw_stick" });
    await waitUntil(() => D1.state?.current?.drawn === true);
    shaker.send({ type: "stick_done" });
    await D1.waitPhase("protagonist_setup");
    const hero = duo.find((p) => p.state.current.youAreProtagonist);
    const guesser = duo.find((p) => p !== hero);
    hero.send({ type: "set_gender", gender: "m" });
    const ids = new Set();
    for (let round = 1; round <= R9_ROUNDS; round++) {
      if (!(await waitUntil(
        () => D1.state?.phase === "answering" && D1.state?.current?.roundIndex === round, 10000))) break;
      ids.add(D1.state.current.question.id);
      rgBy.set(hero.name, D1.state.current.renderGender);
      hero.send({ type: "score", v: 5 });
      guesser.send({ type: "guess", v: 6 }); // 差 1：不罚酒、不分毫不差 → 不触发国王
      if (!(await waitUntil(() => D1.state?.phase === "reveal", 10000))) break;
      duo.find((p) => p.state?.you?.isHost)?.send({ type: "next" });
    }
    drawnBy.set(hero.name, ids);
    await waitUntil(() => D1.state?.phase === "aha", 10000);
    duo.find((p) => p.state?.you?.isHost)?.send({ type: "next" });
  }
  duo.forEach((p) => { try { p.ws.close(); } catch {} });

  const straightIds = drawnBy.get("直女姐") || new Set();
  const gayIds = drawnBy.get("男同弟") || new Set();
  ok(straightIds.size > 0 && gayIds.size > 0, `⑤ 同局两位主角各自跑完 ${R9_ROUNDS} 轮（${straightIds.size}/${gayIds.size} 题）`);
  ok([...straightIds].every((id) => r9Allowed("straight-m").has(id))
    && ![...straightIds].some((id) => R9_IDS.gay.includes(id)),
    "⑤ 直女那几轮只出 neutral∪straight-m（一道 gay 题都没串进来）");
  ok([...gayIds].every((id) => r9Allowed("gay").has(id))
    && ![...gayIds].some((id) => R9_IDS["straight-m"].includes(id)),
    "⑤ 男同那几轮只出 neutral∪gay（一道 straight-m 题都没串进来）");
  ok([...straightIds].some((id) => R9_IDS["straight-m"].includes(id))
    && [...gayIds].some((id) => R9_IDS.gay.includes(id)),
    "⑤ 两位主角各自抽到了自己取向的专属题（池确实换了，不是都退化成 neutral）");
  ok(rgBy.get("直女姐") === "m" && rgBy.get("男同弟") === "m",
    "⑤ 同局内 renderGender 按各自主角 seeking 广播");

  /* ================= R10：seats / ready / 开局门 / 方向确认（PRD-R10 §4.2-4.3） ================= */
  console.log("\n-- R10 桌局组件：seats + ready + 开局门 --");

  const newRoom = (body) =>
    fetch(BASE + "/api/room", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(body) })
      .then((res) => res.json());

  // ① 建房 seats（Kim 终审口径）：合法域 1-10、缺省 6；
  //    0/负数/非法/缺失 → 回落 6；>10 → 夹到 10；1 合法（= 单人局）
  const seatDefault = await (await fetch(BASE + "/api/room", { method: "POST" })).json();
  ok(seatDefault.seats === 6, `① 建房 seats 缺省 = 6（拿到 ${seatDefault.seats}）`);
  for (const [raw, want] of [
    [1, 1], [2, 2], [6, 6], [10, 10], // 合法域两端 + 缺省值
    [11, 10], [99, 10], // 高位越界 → 夹到 10
    [0, 6], [-5, 6], // 0/负数 → 回落缺省 6（不是夹到 1）
    [3.6, 4], ["5", 5], // 小数四舍五入 / 数字串
    ["abc", 6], [null, 6], [true, 6], [{}, 6], // 非法/缺失 → 回落缺省 6
  ]) {
    const rm = await newRoom({ seats: raw });
    ok(rm.seats === want, `① 建房 seats=${JSON.stringify(raw)} → ${want}`);
  }

  // ①b seats=1 = 单人局：1 人可开、allReady 天然成立、第二人坐不进来
  const oneRoom = await newRoom({ seats: 1 });
  ok(oneRoom.seats === 1, "①b seats=1 建房成功（不被当非法值拒掉）");
  const S1 = new Player("一人食", "🍺");
  await S1.connect(oneRoom.code);
  await waitUntil(() => S1.state?.players?.length === 1);
  ok(S1.state.seats === 1 && S1.state.solo === true,
    "①b seats=1 房广播 solo=true（走现有单人局语义）");
  ok(S1.state.allReady === true, "①b seats=1 房 allReady 天然成立");
  const S2 = new Player("凑热闹", "🍷");
  const oneFull = await S2.connect(oneRoom.code);
  ok(oneFull.type === "error" && oneFull.code === "table_full", "①b seats=1 房第二人被拒");
  try { S2.ws.close(); } catch {}
  S1.lastError = null;
  S1.send({ type: "start", rounds: 3, questions: v2Questions });
  await S1.waitPhase("picking");
  ok(S1.state.phase === "picking" && !S1.lastError, "①b seats=1 房 1 人直接开局成功（不被 2 人下限挡）");
  ok(await playToAha([S1]), "①b seats=1 房能一路玩到 aha（单人自评即开牌，没卡死）");
  try { S1.ws.close(); } catch {}

  // ② ready 广播 / allReady 翻转 / 开局门
  const gateRoom = await newRoom({ seats: 4 });
  const G1 = new Player("门主", "🍺"), G2 = new Player("门客", "🍷");
  await G1.connect(gateRoom.code);
  await G2.connect(gateRoom.code);
  await waitUntil(() => G1.state?.players?.length === 2);
  const gPub = (name) => G1.state.players.find((p) => p.name === name);
  ok(G1.state.seats === 4, `② state 广播 seats（${G1.state.seats}）`);
  ok(gPub("门主").ready === true, "② 房主 ready 恒为 true（他的按钮就是开局键）");
  ok(gPub("门客").ready === false, "② 客人初始 ready=false");
  ok(G1.state.allReady === false, "② 客人没准备 → allReady=false");

  G1.lastError = null;
  G1.send({ type: "start", rounds: 3, questions: v2Questions });
  await waitUntil(() => !!G1.lastError);
  ok(G1.lastError?.code === "not_all_ready", `② 未全员准备时 start 被拒：${G1.lastError?.msg}`);
  ok(G1.state.phase === "lobby", "② 被拒后仍停在 lobby（没偷偷开局）");

  G2.send({ type: "ready", ready: true });
  await waitUntil(() => G1.state?.allReady === true);
  ok(G1.state.allReady === true && gPub("门客").ready === true,
    "② 客人 ready → players[].ready 与 allReady 一起翻 true");
  G2.send({ type: "ready", ready: false });
  await waitUntil(() => G1.state?.allReady === false);
  ok(G1.state.allReady === false && gPub("门客").ready === false, "② 取消准备 → allReady 翻回 false");
  G2.send({ type: "ready", ready: true });
  await waitUntil(() => G1.state?.allReady === true);
  G1.send({ type: "start", rounds: 3, questions: v2Questions });
  await G1.waitPhase("picking");
  ok(G1.state.phase === "picking", "② 全员 ready 后 start 通过 → picking");

  // ②b 抽签后：awaitDirection + confirm_direction 权限与鉴权
  const gPair = [G1, G2];
  const gShaker = gPair.find((p) => p.state.current.youAreShaker);
  gShaker.send({ type: "draw_stick" });
  await waitUntil(() => G1.state?.current?.drawn === true);
  gShaker.send({ type: "stick_done" });
  await G1.waitPhase("protagonist_setup");
  const gHero = gPair.find((p) => p.state.current.youAreProtagonist);
  const gOther = gPair.find((p) => p !== gHero);
  ok(G1.state.current.awaitDirection === true,
    "②b protagonist_setup 广播 awaitDirection=true（等被拷问者选方向）");
  gOther.send({ type: "confirm_direction", seeking: "m", gender: "m" });
  await sleep(250);
  ok(G1.state.phase === "protagonist_setup", "②b 非被拷问者发 confirm_direction 无效");
  gHero.lastError = null;
  gHero.send({ type: "confirm_direction", seeking: "zzz" });
  await waitUntil(() => !!gHero.lastError);
  ok(gHero.lastError?.code === "bad_seeking", "②b 非法 seeking 被拒");
  gHero.send({ type: "confirm_direction", seeking: "f", gender: "m" });
  await G1.waitPhase("answering");
  ok(G1.state.current.renderGender === "f" && G1.state.current.question.text.includes("满分女"),
    `②b 确认方向 → 直接进答题且题面按方向渲染：${G1.state.current.question.text.slice(0, 16)}…`);
  ok(G1.state.current.awaitDirection === false, "②b 确认后 awaitDirection 落回 false");
  try { G1.ws.close(); G2.ws.close(); } catch {}

  // ③ set_seats：仅房主、仅 lobby、1-8 夹取；seats 同时是入座上限
  const seatRoom = await newRoom({ seats: 2 });
  const T1 = new Player("桌主", "🍺"), T2 = new Player("桌客", "🍷");
  await T1.connect(seatRoom.code);
  await T2.connect(seatRoom.code);
  await waitUntil(() => T1.state?.players?.length === 2);
  ok(T1.state.seats === 2, "③ seats=2 的桌");
  const T3 = new Player("迟到哥", "🥃");
  const fullRes = await T3.connect(seatRoom.code);
  ok(fullRes.type === "error" && fullRes.code === "table_full", `③ 坐满 → 第三人被拒：${fullRes.msg}`);
  try { T3.ws.close(); } catch {}

  T2.send({ type: "set_seats", seats: 6 });
  await sleep(250);
  ok(T1.state.seats === 2, "③ 非房主 set_seats 无效");
  T1.send({ type: "set_seats", seats: 6 });
  await waitUntil(() => T1.state?.seats === 6 && T2.state?.seats === 6);
  ok(T1.state.seats === 6 && T2.state.seats === 6, "③ 房主 set_seats=6 生效并广播全桌");
  T1.send({ type: "set_seats", seats: 99 });
  await waitUntil(() => T1.state?.seats === 10);
  ok(T1.state.seats === 10, "③ set_seats=99 → 夹到 10");
  T1.send({ type: "set_seats", seats: 0 });
  await sleep(250);
  ok(T1.state.seats === 10, "③ set_seats=0（非法）→ 保持原值不动");
  T1.send({ type: "set_seats", seats: -3 });
  await sleep(250);
  ok(T1.state.seats === 10, "③ set_seats=负数 → 保持原值不动");

  // ④ 离桌 → ready 清除 → 房主改人数 → 同房码原地重开
  T1.send({ type: "set_seats", seats: 4 });
  await waitUntil(() => T1.state?.seats === 4);
  T2.send({ type: "ready", ready: true });
  await waitUntil(() => T1.state?.allReady === true);
  ok(T1.state.allReady === true, "④ 客人准备好了（allReady=true）");
  T2.send({ type: "leave" });
  await waitUntil(() => T1.state?.players?.length === 1);
  ok(T1.state.players.length === 1, "④ lobby 离桌 → 座位释放");
  const T4 = new Player("补位哥", "🍸");
  await T4.connect(seatRoom.code);
  await waitUntil(() => T1.state?.players?.length === 2);
  ok(T1.state.code === seatRoom.code && T4.state.seats === 4, "④ 同房码复用，人数上限沿用房主改过的 4");
  ok(T1.state.allReady === false && T1.state.players.find((p) => p.name === "补位哥").ready === false,
    "④ 离桌换人后 ready 从头来（allReady=false）");
  T1.lastError = null;
  T1.send({ type: "start", rounds: 3, questions: v2Questions });
  await waitUntil(() => !!T1.lastError);
  ok(T1.lastError?.code === "not_all_ready", "④ 补位客人没准备 → 仍开不了局");
  T4.send({ type: "ready", ready: true });
  await waitUntil(() => T1.state?.allReady === true);
  T1.send({ type: "start", rounds: 3, questions: v2Questions });
  await T1.waitPhase("picking");
  ok(T1.state.phase === "picking", "④ 同房码原地重开成功（改过人数、换过人）");
  T1.send({ type: "set_seats", seats: 2 });
  await sleep(250);
  ok(T1.state.seats === 4, "④ 非 lobby 阶段 set_seats 无效");
  try { T1.ws.close(); T4.ws.close(); } catch {}

  // ⑤ confirm_direction 真的换了当轮抽池（R9 探针法：合成题库按池前缀反推）
  //    入座时不带任何取向档案（散客 → 默认只有 neutral），全靠 confirm_direction 改池。
  async function r10DirectionProbe(label, seeking, gender) {
    const room = await newRoom({ solo: true });
    const p = new Player(label, "🍺", "beer", null, null);
    await p.connect(room.code);
    await waitUntil(() => p.state?.players?.length === 1);
    const soloAllReady = p.state.allReady === true;
    p.send({ type: "start", rounds: R9_ROUNDS, questions: r9Bank });
    await p.waitPhase("picking");
    p.send({ type: "draw_stick" });
    await waitUntil(() => p.state?.current?.drawn === true);
    p.send({ type: "stick_done" });
    await p.waitPhase("protagonist_setup");
    const awaited = p.state.current.awaitDirection === true;
    const defaultSeeking = p.state.current.heroSeeking;
    p.send({ type: "confirm_direction", seeking, gender });
    await p.waitPhase("answering");
    const ids = new Set();
    const renderGenders = new Set();
    for (let round = 1; round <= R9_ROUNDS; round++) {
      if (!(await waitUntil(
        () => p.state?.phase === "answering" && p.state?.current?.roundIndex === round, 8000))) break;
      ids.add(p.state.current.question.id);
      renderGenders.add(p.state.current.renderGender);
      p.send({ type: "score", v: 5 });
      if (!(await waitUntil(() => p.state?.phase === "reveal", 8000))) break;
      p.send({ type: "next" });
    }
    await waitUntil(() => p.state?.phase === "aha", 8000);
    try { p.ws.close(); } catch {}
    return { ids, renderGenders: [...renderGenders], awaited, soloAllReady, defaultSeeking };
  }

  const dirGay = await r10DirectionProbe("确认男同", "m", "m");
  ok(dirGay.soloAllReady === true, "⑤ solo 房 allReady 天然成立（1 人局不被开局门挡）");
  ok(dirGay.awaited === true && dirGay.defaultSeeking === null,
    "⑤ 未确认前 heroSeeking = 入座时带的档案（散客为 null）");
  const dirGayAllowed = r9Allowed("gay");
  ok([...dirGay.ids].every((id) => dirGayAllowed.has(id)) && dirGay.ids.size === dirGayAllowed.size,
    `⑤ confirm_direction(seeking=m,gender=m 男同) → 该轮只出 neutral∪gay（${dirGay.ids.size} 题，无 straight-m/f、lesbian）`);
  ok(dirGay.renderGenders.length === 1 && dirGay.renderGenders[0] === "m",
    "⑤ 确认男同后 renderGender=m（满分男）");

  const dirStraight = await r10DirectionProbe("确认直男", "f", "m");
  const dirStraightAllowed = r9Allowed("straight-f");
  ok([...dirStraight.ids].every((id) => dirStraightAllowed.has(id))
    && dirStraight.ids.size === dirStraightAllowed.size,
    "⑤ 同一份题库、同样零档案，confirm_direction(f,m 直男) → 只出 neutral∪straight-f（池确实随确认换了）");

  const dirX = await r10DirectionProbe("确认都行", "x", "f");
  ok([...dirX.ids].every((id) => R9_IDS.neutral.includes(id))
    && dirX.renderGenders[0] === "n",
    "⑤ confirm_direction(seeking=x 都行) → 只出 neutral 且 renderGender=n");
  ok([...pf.ids].every((id) => r9Allowed("straight-m").has(id)),
    "⑤ 不发 confirm_direction 时仍走入座 seeking（R9 老路径未被破坏）");

  /* ================= R10：用户反馈 POST /api/feedback（PRD-R10 §4.1） ================= */
  console.log("\n-- R10 反馈 /api/feedback --");
  const FB_KEY = process.env.STATS_KEY || "dev-stats";
  const postFeedback = (body) =>
    fetch(BASE + "/api/feedback", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(body) });
  const fbSrc = () => "fb" + Math.random().toString(36).slice(2, 8);
  const srcA = fbSrc(), srcB = fbSrc(), srcC = fbSrc();
  const fbText = "R10 冒烟反馈 " + srcA;

  const fb1 = await postFeedback({ text: fbText, contact: "kim@example.com", room: srcA });
  ok(fb1.status === 201, `⑥ POST /api/feedback → 201（拿到 ${fb1.status}）`);
  const fb2 = await postFeedback({ text: "同一分钟的第二条", room: srcA });
  ok(fb2.status === 429, "⑥ 同来源 1 分钟内第二条 → 429 限频");
  const fb2Body = await fb2.json();
  ok(fb2Body.error === "rate_limited" && fb2Body.retryAfterMs > 0, "⑥ 429 带 retryAfterMs");
  const fbEmpty = await postFeedback({ text: "   ", room: fbSrc() });
  ok(fbEmpty.status === 400, "⑥ 空内容 → 400");
  const fbLong = await postFeedback({ text: "长".repeat(600), contact: "c".repeat(200), room: srcB });
  ok(fbLong.status === 201, "⑥ 换一个来源仍可提交（限频按来源，不是全局封）");
  const fbNoContact = await postFeedback({ text: "只留意见不留联系方式", room: srcC });
  ok(fbNoContact.status === 201, "⑥ contact 可缺省");

  const fbStats = await (await fetch(
    `${BASE}/api/stats?days=14&key=${encodeURIComponent(FB_KEY)}`)).json();
  ok(Array.isArray(fbStats.recent_feedbacks), "⑥ /api/stats 返回体带 recent_feedbacks");
  const fbMine = fbStats.recent_feedbacks.find((f) => f.text === fbText);
  ok(!!fbMine && fbMine.contact === "kim@example.com" && fbMine.ts > 0 && /^\d{4}-\d{2}-\d{2}$/.test(fbMine.day),
    "⑥ 反馈落库：正文/联系方式/ts/day 都可读");
  const fbLongRow = fbStats.recent_feedbacks.find((f) => f.text.startsWith("长长长"));
  ok(!!fbLongRow && [...fbLongRow.text].length === 500 && [...fbLongRow.contact].length === 100,
    "⑥ 正文截到 500 字、联系方式截到 100 字");
  ok(fbStats.recent_feedbacks.length <= 20, `⑥ recent_feedbacks 最多 20 条（${fbStats.recent_feedbacks.length}）`);
  ok(fbStats.recent_feedbacks.every((f, i, arr) => i === 0 || arr[i - 1].ts >= f.ts),
    "⑥ recent_feedbacks 按时间倒序（最新在前）");
  const fbNoKey = await fetch(BASE + "/api/stats?days=14");
  ok(fbNoKey.status === 403, "⑥ 无 key 读不到反馈（/api/stats 403）");

  /* ============================================================
     R9 埋点闭环（PRD-R9-PHASE1 §五）：/api/track + /api/stats
     放在最后跑：前面几节已经建过房、开过局、玩到过 aha，
     正好用来验证「服务端直记」那几个事件真的落库了。
     ============================================================ */
  console.log("\n-- R9 埋点 /api/track + /api/stats --");
  const TRACK_HEADERS = { "content-type": "application/json" };
  const STATS_KEY = process.env.STATS_KEY || "dev-stats"; // worker 未设 secret 时的回退常量
  const postTrack = (body) =>
    fetch(BASE + "/api/track", { method: "POST", headers: TRACK_HEADERS, body: JSON.stringify(body) });
  const getStats = (qs) => fetch(BASE + "/api/stats?" + qs);
  const readStats = async (days = 14) => {
    const res = await getStats(`days=${days}&key=${encodeURIComponent(STATS_KEY)}`);
    return res.ok ? await res.json() : null;
  };
  const todayRow = (data) => data.daily.find((d) => d.day === data.today) || null;

  // 前面各节的服务端埋点是 fire-and-forget，给它们一点落库时间再取基线
  await sleep(400);

  // ① 白名单
  const trackOk = await postTrack({ event: "poster_shared", roomCode: "9999" });
  ok(trackOk.status === 204, "① /api/track 白名单事件 → 204");
  const trackBad = await postTrack({ event: "drink_poured", roomCode: "9999" });
  ok(trackBad.status === 400, "① /api/track 白名单外事件 → 400");
  const trackEmpty = await postTrack({});
  ok(trackEmpty.status === 400, "① /api/track 缺 event → 400");
  const trackJunk = await fetch(BASE + "/api/track", { method: "POST", headers: TRACK_HEADERS, body: "not-json" });
  ok(trackJunk.status === 400, "① /api/track body 不是 JSON → 400（不 5xx）");

  // ③a 鉴权（先验，后面几步都要用 key 读数）
  const noKey = await getStats("days=14");
  ok(noKey.status === 403, "③ /api/stats 无 key → 403");
  const wrongKey = await getStats("days=14&key=wrong-one");
  ok(wrongKey.status === 403, "③ /api/stats key 不对 → 403");
  const withKey = await getStats(`days=14&key=${encodeURIComponent(STATS_KEY)}`);
  ok(withKey.status === 200, "③ /api/stats 带 dev key → 200");

  const base = await readStats(14);
  ok(!!base && Array.isArray(base.daily) && base.daily.length === 14, "③ /api/stats 默认窗口返回 14 行按日数据");
  ok(!!base && /^\d{4}-\d{2}-\d{2}$/.test(base.today), `③ 日期是 Asia/Shanghai 的 YYYY-MM-DD（${base?.today}）`);

  // ② 同房 game_finished 去重：同一个 roomCode 连发多次，只应计 1
  const dedupeCode = "smoke-" + Math.random().toString(36).slice(2, 10);
  const b1 = todayRow(base);
  await postTrack({ event: "game_finished", roomCode: dedupeCode, players: 3 });
  const s2 = await readStats(14);
  const r2 = todayRow(s2);
  ok(r2.game_finished - b1.game_finished === 1, "② 首次上报 game_finished → 完局数 +1");
  for (let i = 0; i < 3; i++) await postTrack({ event: "game_finished", roomCode: dedupeCode, players: 3 });
  const s3 = await readStats(14);
  const r3 = todayRow(s3);
  ok(r3.game_finished - r2.game_finished === 0, "② 同房 game_finished 再报 3 次 → 完局数不变（房级去重生效）");
  // 换一个房间码 → 正常计数（证明去重是按房，不是把事件整体屏蔽了）
  await postTrack({ event: "game_finished", roomCode: dedupeCode + "-b", players: 3 });
  const s4 = await readStats(14);
  const r4 = todayRow(s4);
  ok(r4.game_finished - r3.game_finished === 1, "② 换一个房间码上报 → 完局数 +1（去重按房不按事件）");

  // ③b finish_rate 计算：逐日 = 完局/开局，汇总 = 14 天完局/14 天开局
  const rateRows = s4.daily.filter((d) => d.game_started > 0);
  ok(
    s4.daily.every((d) =>
      d.game_started > 0
        ? Math.abs(d.finish_rate - d.game_finished / d.game_started) < 1e-9
        : d.finish_rate === null
    ),
    `③ 逐日 finish_rate = 完局/开局（有开局的 ${rateRows.length} 天全部吻合，无开局的天为 null）`
  );
  const started14 = s4.daily.reduce((a, d) => a + d.game_started, 0);
  const finished14 = s4.daily.reduce((a, d) => a + d.game_finished, 0);
  ok(s4.summary.game_started_14d === started14 && s4.summary.game_finished_14d === finished14,
    "③ 汇总的 14 天开局/完局数 = 按日之和");
  ok(started14 > 0 && Math.abs(s4.summary.finish_rate_14d - finished14 / started14) < 1e-9,
    `③ 汇总 finish_rate_14d = ${(s4.summary.finish_rate_14d * 100).toFixed(1)}% 计算正确`);
  ok(s4.summary.target_finish_rate === 0.75,
    "③ 汇总带 H1 达标线 0.75（Kim 定：前两周完局率 ≥75%，仪表盘画 75% 线用）");

  // ③c 周汇总：本周(近7天) / 上周(前7天) 都在，且本周 ≥ 本轮冒烟制造的完局数
  ok(typeof s4.summary.week_finished === "number" && typeof s4.summary.prev_week_finished === "number",
    `③ 汇总含本周/上周完局桌数（本周 ${s4.summary.week_finished} / 上周 ${s4.summary.prev_week_finished}）`);
  ok(s4.summary.本周完局桌数 === s4.summary.week_finished, "③ PRD 中文键别名与 ascii 键一致");
  ok(s4.summary.week_finished >= 2, "③ 本周完局桌数 ≥ 本轮冒烟刚记的 2 桌");

  // ③d days 参数
  const d7 = await readStats(7);
  ok(d7.daily.length === 7 && d7.days === 7, "③ days=7 → 返回 7 行");
  const dBad = await getStats(`days=abc&key=${encodeURIComponent(STATS_KEY)}`);
  const dBadJson = await dBad.json();
  ok(dBadJson.days === 14, "③ days 非法 → 回落默认 14");
  const dBig = await readStats(999);
  ok(dBig.days === 90, "③ days 超上限 → 夹到 90");

  // ④ 服务端直记：前面几节真跑过建房/入座/开局/亮相，今天这几列必须都 > 0
  const today = todayRow(s4);
  ok(today.room_created > 0, `④ 服务端直记 room_created（今日 ${today.room_created}）`);
  ok(today.player_joined > 0, `④ 服务端直记 player_joined（今日 ${today.player_joined}）`);
  ok(today.game_started > 0, `④ 服务端直记 game_started（今日 ${today.game_started}）`);
  ok(today.game_finished > 0, `④ 服务端直记 game_finished（今日 ${today.game_finished}）`);
  ok(today.register_done > 0, `④ 服务端直记 register_done（今日 ${today.register_done}）`);

  // ④b 一整局真实流程只记 1 桌开局 / 1 桌完局（服务端标记随房落盘，不会重复记）
  const beforeSolo = todayRow(await readStats(14));
  const soloTrack = await (await fetch(BASE + "/api/room", {
    method: "POST", headers: TRACK_HEADERS, body: JSON.stringify({ solo: true }),
  })).json();
  const SOLO = new Player("埋点独狼", "🍺", "beer");
  await SOLO.connect(soloTrack.code);
  SOLO.send({ type: "start", rounds: 3, questions: DECKS.qingtang.questions });
  await playToAha([SOLO]);
  SOLO.send({ type: "finish_game" });
  await SOLO.waitPhase("finished", 8000);
  try { SOLO.ws.close(); } catch {}
  await sleep(500);
  const afterSolo = todayRow(await readStats(14));
  ok(afterSolo.room_created - beforeSolo.room_created === 1, "④b 跑完整一局：开桌 +1");
  ok(afterSolo.player_joined - beforeSolo.player_joined === 1, "④b 跑完整一局：入座 +1");
  ok(afterSolo.game_started - beforeSolo.game_started === 1, "④b 跑完整一局：开局 +1（不因多次 save 重复记）");
  ok(afterSolo.game_finished - beforeSolo.game_finished === 1,
    "④b 跑完整一局：完局 +1（aha 记一次，之后 finished 不再记）");

  // ⑤ 仪表盘页面本体可访问（Kim 直接打开这一页看数）
  const dash = await fetch(BASE + "/stats.html");
  const dashHtml = dash.ok ? await dash.text() : "";
  ok(dash.status === 200, "⑤ GET /stats.html → 200");
  ok(dashHtml.includes("/api/stats") && dashHtml.includes("本周完局桌数"),
    "⑤ 仪表盘含北极星大数字与 /api/stats 拉取逻辑");
  ok(dashHtml.includes("75%") && dashHtml.includes("前两周完局率") && !/达标线\s*60%|过 60%|没到 60%/.test(dashHtml),
    "⑤ 仪表盘达标线与文案已改到 75%（无 60% 残留）");
  ok(/left:\s*75%/.test(dashHtml) && dashHtml.includes('content: "75%"'),
    "⑤ 仪表盘 75% 虚线位置与标签一致");
  ok(!/<script[^>]+src=/i.test(dashHtml), "⑤ 仪表盘无外部依赖（没有外链 script）");

  console.log(`\n== 结果：${passed} 通过 / ${failed} 失败`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error("💥 冒烟失败：", e); process.exit(1); });
