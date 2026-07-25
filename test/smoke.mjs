// 冒烟测试：3 玩家端到端跑通一位主角的完整轮次
// 前置：wrangler dev 已在 BASE 运行（或由 run-smoke 包装脚本拉起）
import WebSocket from "ws";
import { DECKS } from "../public/questions.js";

const BASE = process.env.BASE || "http://127.0.0.1:8787";
const WS_BASE = BASE.replace(/^http/, "ws");

let passed = 0, failed = 0;
function ok(cond, label) {
  if (cond) { passed++; console.log("  ✅", label); }
  else { failed++; console.log("  ❌", label); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Player {
  constructor(name, emoji) {
    this.name = name;
    this.emoji = emoji;
    this.token = null;
    this.state = null;
    this.lastError = null;
    this.shakes = [];
    this.welcome = null;
    this.danmakus = [];
    this.lightFx = [];
  }
  connect(code, token) {
    this.ws = new WebSocket(`${WS_BASE}/api/room/${code}/ws`);
    return new Promise((res, rej) => {
      this.ws.on("open", () => {
        this.ws.send(JSON.stringify({ type: "join", name: this.name, emoji: this.emoji, token }));
      });
      this.ws.on("message", (raw) => {
        const m = JSON.parse(raw.toString());
        if (m.type === "welcome") { this.welcome = m; this.token = m.token; res(m); }
        if (m.type === "error") { this.lastError = m; res(m); }
        if (m.type === "state") this.state = m.state;
        if (m.type === "shake") this.shakes.push(m.intensity);
        if (m.type === "danmaku") this.danmakus.push(m);
        if (m.type === "light_fx") this.lightFx.push(m);
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

async function main() {
  console.log("== 冒烟测试 @", BASE);

  // 首页 200
  const home = await fetch(BASE + "/");
  ok(home.status === 200, "GET / → 200");

  // 建房
  const { code } = await (await fetch(BASE + "/api/room", { method: "POST" })).json();
  ok(/^\d{4}$/.test(code), `建房得到 4 位房间码 ${code}`);

  // 入房 ×3
  const A = new Player("阿豪", "🍺"), B = new Player("嘉欣", "🍷"), C = new Player("老王", "🥃");
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

  await sleep(200);
  ok(A.state?.players?.length === 3, "state 广播：3 人在桌");
  ok(A.state.you.isHost === true, "A 是房主");

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
  await sleep(200);
  ok(B.shakes.length >= 3 && C.shakes.length >= 3, `shake 强度广播到其他人（B 收到 ${B.shakes.length} 条）`);
  shakerP.send({ type: "draw_stick" });
  await sleep(200);
  ok(A.state.current.drawn === true && A.state.current.protagonist?.name, `出签：主角 = ${A.state.current.protagonist.name}`);
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
      await sleep(200);
      ok(A.state.current.reveal.comment === "你们根本不懂我", "主角补刀文字广播");
      const o2pub = A.state.players.find((p) => p.name === others[1].name);
      ok(o2pub.drinks === 2, `被指定者共 2 杯（罚1+被指定1）`);
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
  ok(aha.idolName && aha.title, `理想型：${aha.idolName} / 称号：${aha.title}`);
  ok(aha.stats.bestKnower?.name === others[0].name && aha.stats.bestKnower.count === 3, `最懂TA：${others[0].name} 命中3次`);
  ok(aha.stats.avgScore === 7 && aha.stats.tolerancePct === 70, "均分7 / 容忍度70%");

  /* ---- 非诚勿扰互动体系（PRD §9）---- */

  // 聊天室：发消息 → 全员 state.chat 可见（断线重连也能靠 state 恢复）
  others[0].send({ type: "chat", text: "这题出得太狠了哈哈哈" });
  await sleep(250);
  const lastChat = A.state.chat?.[A.state.chat.length - 1];
  ok(lastChat?.text === "这题出得太狠了哈哈哈" && lastChat.name === others[0].name,
    `聊天消息入 state.chat（id=${lastChat?.id}）`);

  // emoji 回应：贴上聚合计数，再贴一次取消
  others[1].send({ type: "react", msgId: lastChat.id, emoji: "😂" });
  await sleep(250);
  let rMsg = A.state.chat.find((m) => m.id === lastChat.id);
  ok(rMsg.reactions["😂"]?.length === 1 && rMsg.reactions["😂"][0] === others[1].name,
    "emoji 回应聚合计数 =1");
  others[1].send({ type: "react", msgId: lastChat.id, emoji: "😂" });
  await sleep(250);
  rMsg = A.state.chat.find((m) => m.id === lastChat.id);
  ok(!rMsg.reactions["😂"], "同人再贴一次 → 回应取消");

  // 弹幕：aha 屏广播 + 3 秒限频
  others[1].send({ type: "danmaku", text: "理想型有点帅啊" });
  await sleep(250);
  ok(A.danmakus.some((d) => d.text === "理想型有点帅啊" && d.name === others[1].name),
    "弹幕广播到其他玩家");
  const dmCountBefore = A.danmakus.length;
  others[1].send({ type: "danmaku", text: "刷屏测试" });
  await sleep(250);
  ok(A.danmakus.length === dmCountBefore, "3 秒内第二条弹幕被限频拦截");

  // 爆灯/灭灯：非主角各持一盏，计数进 aha.light 与海报 stats
  others[0].send({ type: "light", on: true });
  others[1].send({ type: "light", on: false });
  hero.send({ type: "light", on: true }); // 主角不能给自己爆灯，应被忽略
  await sleep(300);
  const lt = A.state.aha.light;
  ok(lt.burst === 1 && lt.off === 1 && lt.total === 2, `灯计数 爆${lt.burst}/灭${lt.off}/共${lt.total}`);
  ok(A.state.aha.stats.lights?.burst === 1 && A.state.aha.stats.lights.total === 2,
    "海报数据 stats.lights = 1/2 爆灯");
  ok(hero.lightFx.length >= 2, `light_fx 特效事件广播（主角收到 ${hero.lightFx.length} 条）`);
  others[0].send({ type: "light", on: false }); // 已定灯不可反悔
  await sleep(250);
  ok(A.state.aha.light.burst === 1 && A.state.aha.light.off === 1, "灯按下不可反悔");

  // 断线重连回座
  const heroToken = hero.token;
  hero.ws.close();
  await sleep(400);
  ok(A.state.players.find((p) => p.name === hero.name)?.connected === false, "掉线后 connected=false 广播");
  const back = await hero.connect(code, heroToken);
  ok(back.type === "welcome" && back.reconnected === true, "凭 token 重连回座 reconnected=true");
  await sleep(200);
  ok(hero.state?.phase === "aha" && hero.state.you.name === hero.name, "重连后拿回自己视角 state");
  ok(hero.state.chat?.some((m) => m.text === "这题出得太狠了哈哈哈"), "重连后聊天记录恢复");
  ok(hero.state.aha?.light?.burst === 1, "重连后灯状态恢复");

  // 房主推进 → 下一位主角（picking），摇签人应为上一任主角
  A.send({ type: "next" });
  await A.waitPhase("picking");
  const shaker2 = all.find((p) => p.state.current.youAreShaker);
  ok(shaker2 === hero, `第二轮摇签人 = 上一任主角 ${hero.name}`);

  console.log(`\n== 结果：${passed} 通过 / ${failed} 失败`);
  all.forEach((p) => p.ws.close());
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error("💥 冒烟失败：", e); process.exit(1); });
