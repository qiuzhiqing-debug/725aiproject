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

class Player {
  constructor(name, emoji, drink = "beer", seeking = null) {
    this.name = name;
    this.emoji = emoji;
    this.drink = drink;
    this.seeking = seeking;
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
        this.ws.send(JSON.stringify({ type: "join", name: this.name, emoji: this.emoji, drink: this.drink, seeking: this.seeking, token }));
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

  const deckRoom = await (await fetch(BASE + "/api/room", {
    method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ deck: "woman" }),
  })).json();
  ok(/^\d{4}$/.test(deckRoom.code) && deckRoom.deck === "woman", "建房 body.deck=woman 生效");
  const defDeckRoom = await (await fetch(BASE + "/api/room", { method: "POST" })).json();
  ok(defDeckRoom.deck === "man", "deck 缺省 = man");

  // 满分闺蜜（bestie）：与 boss 平行的第 4 个卡组
  ok(JSON.stringify(allowedPoolsFor("bestie", "f", "m")) === JSON.stringify(["neutral"])
    && JSON.stringify(allowedPoolsFor("bestie", "m", "f")) === JSON.stringify(["neutral"])
    && JSON.stringify(allowedPoolsFor("bestie", "n", "x")) === JSON.stringify(["neutral"]),
    "allowedPoolsFor('bestie', …) 恒返回 ['neutral']（非取向向，隔离铁桶）");
  const bestieRoom = await (await fetch(BASE + "/api/room", {
    method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ deck: "bestie" }),
  })).json();
  ok(/^\d{4}$/.test(bestieRoom.code) && bestieRoom.deck === "bestie",
    "建房 body.deck=bestie 被接受（不回退成 man）");
  const tablesR2 = await (await fetch(BASE + "/api/tables")).json();
  ok(tablesR2.tables.every((t) => "deck" in t), "/api/tables 每桌返回带 deck 字段");

  const K1 = new Player("国一", "🍺", "beer", "f"), K2 = new Player("国二", "🍷", "wine", "m"), K3 = new Player("国三", "🥃", "soft", "x");
  await K1.connect(deckRoom.code); await K2.connect(deckRoom.code); await K3.connect(deckRoom.code);
  const kt = [K1, K2, K3];
  await waitUntil(() => K1.state?.players?.length === 3);
  ok(K1.state.deck === "woman", "房间 state 广播带 deck");
  ok(K1.state.you.seeking === "f" && K2.state.you.seeking === "m" && K3.state.you.seeking === "x",
    "join 透传 seeking → state.you.seeking");

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

  console.log(`\n== 结果：${passed} 通过 / ${failed} 失败`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error("💥 冒烟失败：", e); process.exit(1); });
