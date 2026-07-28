// 冒烟测试：3 玩家端到端跑通一位主角的完整轮次
// 前置：wrangler dev 已在 BASE 运行（或由 run-smoke 包装脚本拉起）
import WebSocket from "ws";
import { DECKS } from "../public/questions.js";
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
  constructor(name, emoji, drink = "beer") {
    this.name = name;
    this.emoji = emoji;
    this.drink = drink;
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
        this.ws.send(JSON.stringify({ type: "join", name: this.name, emoji: this.emoji, drink: this.drink, token }));
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
        if (["king_game", "king_order", "player_left", "player_away", "player_back", "host_transfer", "force_next", "left", "kicked"].includes(m.type)) {
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

  // 3 轮：主角打 7 分，O1 猜 7（精确命中），O2 猜 2（diff 5 → 罚酒）
  for (let round = 1; round <= 3; round++) {
    hero.send({ type: "score", v: 7 });
    others[0].send({ type: "guess", v: 7 });
    others[1].send({ type: "guess", v: 2 });
    await A.waitPhase("reveal");
    const rv = A.state.current.reveal;
    const r1 = rv.results.find((x) => x.name === others[0].name);
    const r2 = rv.results.find((x) => x.name === others[1].name);
    if (round === 1) {
      ok(rv.score === 7, `开牌主角分=7`);
      ok(r1.exact === true && r1.drink === false && r1.diff === 0, `${others[0].name} 猜7 → 精确命中懂TA+1、不罚`);
      ok(r2.exact === false && r2.drink === true && r2.diff === 5, `${others[1].name} 猜2 → |2-7|=5≥3 罚酒`);
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
    }
    A.send({ type: "next" });
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
    } else if (round === 2) {
      A.send({ type: "skip_drinking" });
      await waitUntil(() => A.state?.current?.drinking?.skipped === true);
      ok(A.state.current.drinking.skipped, "房主可跳过罚酒仪式，避免卡局");
    } else {
      others[1].send({ type: "drink_done" });
      await waitUntil(() => A.state?.current?.drinking?.allDone === true);
    }
    A.send({ type: "next" });
    if (round < 3) await A.waitPhase("answering");
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

  console.log(`\n== 结果：${passed} 通过 / ${failed} 失败`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error("💥 冒烟失败：", e); process.exit(1); });
