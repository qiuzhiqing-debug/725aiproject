// 满分男酒桌局 — Cloudflare Worker + Durable Object
// Worker 路由 + RoomDO（房间状态机 + WebSocket 广播）

import { buildIdealProfile } from "../public/ideal-profile.js";

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    // 建房：POST /api/room  -> { code }
    if (url.pathname === "/api/room" && req.method === "POST") {
      for (let i = 0; i < 15; i++) {
        const code = String(Math.floor(1000 + Math.random() * 9000));
        const stub = env.ROOM.get(env.ROOM.idFromName(code));
        const res = await stub.fetch("https://do/create?code=" + code);
        if (res.ok) {
          return jsonRes({ code });
        }
      }
      return jsonRes({ error: "房间码分配失败，请重试" }, 503);
    }

    // WebSocket：GET /api/room/:code/ws
    const m = url.pathname.match(/^\/api\/room\/(\d{4})\/ws$/);
    if (m) {
      const stub = env.ROOM.get(env.ROOM.idFromName(m[1]));
      return stub.fetch(req);
    }

    // 房间存在性检查：GET /api/room/:code
    const m2 = url.pathname.match(/^\/api\/room\/(\d{4})$/);
    if (m2) {
      const stub = env.ROOM.get(env.ROOM.idFromName(m2[1]));
      return stub.fetch("https://do/info");
    }

    const asset = await env.ASSETS.fetch(req);
    if (req.method !== "GET" || !asset.ok) return asset;
    const headers = new Headers(asset.headers);
    if (/\.(?:jpg|jpeg|png|webp|svg|woff2)$/i.test(url.pathname)) {
      headers.set("cache-control", "public, max-age=86400, stale-while-revalidate=604800");
    } else if (/\.(?:js|css)$/i.test(url.pathname)) {
      headers.set("cache-control", "public, max-age=0, must-revalidate");
    } else if ((headers.get("content-type") || "").includes("text/html")) {
      headers.set("cache-control", "public, max-age=0, must-revalidate");
    }
    return new Response(asset.body, { status: asset.status, statusText: asset.statusText, headers });
  },
};

function jsonRes(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

const TITLES = [
  { min: 7.5, title: "海纳百川·活菩萨", sub: "什么缺陷到你这都是可爱" },
  { min: 5.5, title: "薛定谔的心动", sub: "你的分数没人猜得透" },
  { min: 3.5, title: "铁面判官", sub: "满分男在你面前瑟瑟发抖" },
  { min: 0, title: "六亲不认·火化大队长", sub: "今晚火化名额已满" },
];

/* ============ 全场互动约束 ============ */

const SOCIAL = Object.freeze({
  chatMaxLength: 120,
  danmakuMaxLength: 30,
  chatHistoryLimit: 100,
  recentEventLimit: 30,
  chatCooldownMs: 800,
  danmakuCooldownMs: 3000,
  quickReactionCooldownMs: 700,
  messageReactionCooldownMs: 300,
  lightCooldownMs: 500,
});

// 服务端白名单是最终准绳，避免用任意长 Unicode 串刷爆状态。
const MESSAGE_REACTIONS = Object.freeze(["😂", "🔥", "🍺", "💔", "👏", "🤯", "❤️", "👀"]);
const QUICK_REACTIONS = Object.freeze(["🍺", "😂", "💔", "🔥", "👏", "🤯"]);

// 局终即焚：房间数据最长保留 12 小时（PRD §2）
const ROOM_TTL_MS = 12 * 3600 * 1000;
// 单个房间题库上限，避免 DO 单值 128KiB 写爆后房间彻底不可用
const MAX_QUESTIONS = 300;
const MAX_QUESTION_TEXT = 200;

const DRINKS = Object.freeze({
  beer: { id: "beer", label: "啤酒", emoji: "🍺" },
  wine: { id: "wine", label: "红酒", emoji: "🍷" },
  baijiu: { id: "baijiu", label: "白酒", emoji: "🥃" },
  cocktail: { id: "cocktail", label: "调酒", emoji: "🍸" },
  soft: { id: "soft", label: "无酒精", emoji: "🫧" },
});

function drinkOf(id) {
  return DRINKS[id] || DRINKS.beer;
}

/* ============ RoomDO ============ */

export class RoomDO {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.room = null;
    this.ctx.blockConcurrencyWhile(async () => {
      this.room = (await this.ctx.storage.get("room")) || null;
      // 旧存档兼容：补齐互动体系字段
      if (this.room) {
        if (!Array.isArray(this.room.chat)) this.room.chat = [];
        if (typeof this.room.chatSeq !== "number") this.room.chatSeq = 0;
        if (!Array.isArray(this.room.socialFeed)) this.room.socialFeed = [];
        if (typeof this.room.socialSeq !== "number") this.room.socialSeq = 0;
        if (!Array.isArray(this.room.ahaHistory)) this.room.ahaHistory = [];
        if (this.room.aha && !this.room.aha.protagonistToken && this.room.current?.protagonist) {
          this.room.aha.protagonistToken = this.room.current.protagonist;
        }
        if (this.room.settings?.deck === "biantaila") {
          this.room.settings.deck = "zhongkou";
          this.room.settings.deckName = "重口锅底";
        }
        if (this.room.current) {
          if (!this.room.current.penalties) this.room.current.penalties = {};
          if (!this.room.current.drinking) this.room.current.drinking = null;
        }
        for (const player of this.room.players || []) {
          if (!DRINKS[player.drink]) player.drink = "beer";
          // 旧存档没有公开 id，补一个（token 不再外发）
          if (!player.id) player.id = crypto.randomUUID();
        }
      }
    });
  }

  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/create") {
      // 只按 createdAt TTL 回收：空房也是别人刚建的房，finished 房还有人在看海报
      const active = this.room && Date.now() - this.room.createdAt < ROOM_TTL_MS;
      if (active) return new Response("occupied", { status: 409 });
      this.room = this.freshRoom(url.searchParams.get("code"));
      await this.save();
      await this.scheduleReap();
      return new Response("ok");
    }

    if (url.pathname === "/info") {
      if (!this.room) return jsonRes({ exists: false }, 404);
      return jsonRes({
        exists: true,
        phase: this.room.phase,
        players: this.room.players.length,
      });
    }

    // WebSocket upgrade
    if (req.headers.get("Upgrade") === "websocket") {
      if (!this.room) return new Response("房间不存在", { status: 404 });
      const pair = new WebSocketPair();
      this.ctx.acceptWebSocket(pair[1]);
      return new Response(null, { status: 101, webSocket: pair[0] });
    }

    return new Response("not found", { status: 404 });
  }

  freshRoom(code) {
    return {
      code,
      createdAt: Date.now(),
      phase: "lobby",
      settings: { rounds: 5, deck: "qingtang", deckName: "清汤锅底" },
      players: [], // {token,name,emoji,isHost,connected,drinks,know,done}
      questions: [], // 开局时房主端下发（含 fallback 逻辑）
      usedQuestionIds: [],
      current: null, // 当前主角轮 {protagonist, gender, roundIndex, records[], question, scores, guesses, reveal}
      lastProtagonist: null, // 上一任主角 token（下一轮由 TA 摇签）
      ahaHistory: [],
      aha: null,
      chat: [], // 最近 100 条；reactions 内部只存玩家 token，视图层只下发 count + mine
      chatSeq: 0,
      socialFeed: [], // 最近 30 条弹幕/快捷反应，重连后仍可恢复现场气氛
      socialSeq: 0,
    };
  }

  async save() {
    await this.ctx.storage.put("room", this.room);
  }

  // 局终即焚：建房 / 收局时把删除闹钟推到 12h 后
  async scheduleReap() {
    try {
      await this.ctx.storage.setAlarm(Date.now() + ROOM_TTL_MS);
    } catch {}
  }

  async alarm() {
    await this.ctx.storage.deleteAll();
    this.room = null;
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.close(4002, "expired"); } catch {}
    }
  }

  /* ---- WS 生命周期（hibernation API）---- */

  async webSocketMessage(ws, raw) {
    // 开局消息包含整副题库，因此保留 256KB 上限；具体社交文本另有严格字段限长。
    if (typeof raw !== "string" || raw.length > 256 * 1024) {
      return this.send(ws, { type: "error", code: "invalid_message", msg: "消息格式不合法" });
    }
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    try {
      await this.handle(ws, msg);
    } catch (e) {
      this.send(ws, { type: "error", msg: "服务端异常: " + e.message });
    }
  }

  async webSocketClose(ws) {
    const token = this.tokenOf(ws);
    if (!token || !this.room) return;
    const r = this.room;
    const p = r.players.find((p) => p.token === token);
    // 显式排除正在关闭的这条连接，否则 connected 永远置不回 false
    if (!p || this.liveSockets(token, ws).length) return;
    p.connected = false;
    // 房主掉线必须转移房主，否则 start/next/kick 全部不可达、房间冻结
    if (p.isHost) {
      const heir = r.players.find((q) => q !== p && q.connected);
      if (heir) {
        p.isHost = false;
        heir.isHost = true;
      }
    }
    this.ensureRoleIntegrity();
    // 挂机/掉线者不该无限挂住答题阶段
    if (r.phase === "answering" && r.current) this.maybeReveal();
    await this.save();
    this.broadcast();
  }

  async webSocketError(ws) {
    return this.webSocketClose(ws);
  }

  tokenOf(ws) {
    try {
      return ws.deserializeAttachment()?.token || null;
    } catch {
      return null;
    }
  }

  liveSockets(token, exclude = null) {
    return this.ctx
      .getWebSockets()
      .filter((s) => s !== exclude && this.tokenOf(s) === token && s.readyState === 1);
  }

  /* ---- 主角 / 摇签人 / 房主 的离席兜底 ---- */

  ensureRoleIntegrity() {
    const r = this.room;
    if (!r.players.length) return;
    if (!r.players.some((p) => p.isHost)) {
      const heir = r.players.find((p) => p.connected) || r.players[0];
      heir.isHost = true;
    }
    const cur = r.current;
    if (!cur) return;
    const host = r.players.find((p) => p.isHost);
    const shakerP = r.players.find((p) => p.token === cur.shaker);
    // 摇签人被踢或掉线 → 回落到房主，避免 picking 无出口
    if (!shakerP || !shakerP.connected) cur.shaker = host ? host.token : r.players[0].token;
    const heroAlive = r.players.some((p) => p.token === cur.protagonist);
    const liveRound = ["picking", "protagonist_setup", "answering", "reveal", "drinking"].includes(r.phase);
    if (!heroAlive && liveRound) {
      // 主角中途离席：本轮作废，重新抽签；没人可抽就直接收局
      const candidates = r.players.filter((p) => !p.done);
      if (candidates.length && r.players.length >= 2) this.pickProtagonist();
      else {
        r.current = null;
        r.phase = "finished";
      }
    }
  }

  send(ws, obj) {
    try {
      ws.send(JSON.stringify(obj));
    } catch {}
  }

  broadcast() {
    for (const ws of this.ctx.getWebSockets()) {
      const token = this.tokenOf(ws);
      if (!token) continue;
      this.send(ws, { type: "state", state: this.viewFor(token) });
    }
  }

  /* ---- 每个玩家视角的状态（隐藏未开牌数据）---- */

  viewFor(token) {
    const r = this.room;
    const me = r.players.find((p) => p.token === token);
    const cur = r.current;
    let curView = null;
    if (cur) {
      const inReveal = r.phase === "reveal";
      // 抽签阶段、签未弹出前隐藏主角名字（保持悬念）
      const hideHero = r.phase === "picking" && !cur.drawn;
      const shakerP = r.players.find((p) => p.token === cur.shaker);
      curView = {
        protagonist: hideHero
          ? null
          : this.pub(r.players.find((p) => p.token === cur.protagonist)),
        drawn: !!cur.drawn,
        shaker: shakerP ? shakerP.name : null,
        youAreShaker: cur.shaker === token,
        youAreProtagonist: cur.protagonist === token,
        gender: cur.gender,
        roundIndex: cur.roundIndex,
        totalRounds: r.settings.rounds,
        question: cur.question
          ? { id: cur.question.id, text: cur.question.text, spice: cur.question.spice }
          : null,
        submitted: {
          protagonist: cur.score != null,
          guessers: Object.keys(cur.guesses).map(
            (t) => r.players.find((p) => p.token === t)?.name
          ),
        },
        reveal: inReveal ? cur.reveal : null,
        drinking: r.phase === "drinking" ? this.drinkingView(cur, token) : null,
      };
    }
    return {
      code: r.code,
      phase: r.phase,
      settings: r.settings,
      you: me ? { ...this.pub(me), token: me.token, isHost: me.isHost } : null,
      // token 是唯一身份凭证，绝不出现在 players[] 里；踢人改用公开 id
      players: r.players.map((p) => this.pub(p)),
      current: curView,
      aha:
        r.phase === "aha" || r.phase === "finished"
          ? this.ahaView(r.aha, token)
          : null,
      ahaHistory:
        r.phase === "finished"
          ? r.ahaHistory.map((a) => this.ahaView(a, token))
          : [],
      chat: r.chat.map((message) => this.chatView(message, token, me?.name)),
      social: {
        recent: r.socialFeed || [],
        messageReactions: MESSAGE_REACTIONS,
        quickReactions: QUICK_REACTIONS,
      },
    };
  }

  chatView(message, token, name) {
    const reactions = {};
    for (const [emoji, rawVoters] of Object.entries(message.reactions || {})) {
      if (!MESSAGE_REACTIONS.includes(emoji) || !Array.isArray(rawVoters)) continue;
      // 旧存档存过玩家名，新协议存 token；两种格式都能恢复。
      const voters = [...new Set(rawVoters)];
      if (!voters.length) continue;
      reactions[emoji] = {
        count: voters.length,
        mine: voters.includes(token) || (!!name && voters.includes(name)),
      };
    }
    return { ...message, reactions };
  }

  // aha 视图：不外泄 token→灯 的原始映射，只下发统计 + 本人的当前票。
  ahaView(aha, token) {
    if (!aha) return null;
    const { lights, protagonistToken, lightNames: _legacyLightNames, ...rest } = aha;
    const map = lights || {};
    const burst = Object.values(map).filter(Boolean).length;
    const off = Object.values(map).length - burst;
    const vote = map[token] === undefined ? null : map[token] ? "burst" : "off";
    const burstNames = [];
    const offNames = [];
    for (const [playerToken, on] of Object.entries(map)) {
      const player = this.room.players.find((p) => p.token === playerToken);
      if (player) (on ? burstNames : offNames).push(player.name);
    }
    return {
      ...rest,
      light: {
        burst,
        off,
        voted: burst + off,
        total: aha.lightTotal || 0,
        mine: vote,
        yours: vote, // 兼容早期前端字段
        canVote: !!token && token !== protagonistToken,
        burstNames: burstNames.length ? burstNames : _legacyLightNames?.burst || [],
        offNames: offNames.length ? offNames : _legacyLightNames?.off || [],
      },
    };
  }

  pub(p) {
    if (!p) return null;
    return {
      id: p.id,
      name: p.name,
      emoji: p.emoji,
      isHost: p.isHost,
      connected: p.connected,
      drinks: p.drinks,
      know: p.know,
      done: p.done,
      drink: drinkOf(p.drink),
    };
  }

  drinkingView(cur, token) {
    const penalties = cur?.penalties || {};
    const done = new Set(cur?.drinking?.done || []);
    const drinkers = Object.entries(penalties)
      .filter(([, cups]) => Number(cups) > 0)
      .map(([playerToken, cups]) => {
        const player = this.room.players.find((p) => p.token === playerToken);
        return player ? {
          name: player.name,
          emoji: player.emoji,
          drink: drinkOf(player.drink),
          cups: Number(cups),
          done: done.has(playerToken),
          mine: playerToken === token,
        } : null;
      })
      .filter(Boolean);
    return {
      drinkers,
      completed: drinkers.filter((item) => item.done).length,
      total: drinkers.length,
      allDone: drinkers.length === 0 || drinkers.every((item) => item.done),
      skipped: !!cur?.drinking?.skipped,
      canConfirm: Number(penalties[token]) > 0 && !done.has(token),
    };
  }

  /* ---- 消息处理 ---- */

  async handle(ws, msg) {
    const r = this.room;
    if (!r) return this.send(ws, { type: "error", msg: "房间不存在" });

    if (msg.type === "join") return this.onJoin(ws, msg);

    const token = this.tokenOf(ws);
    const me = r.players.find((p) => p.token === token);
    if (!me) return this.send(ws, { type: "error", msg: "请先入房" });

    switch (msg.type) {
      case "set_settings": {
        if (!me.isHost || r.phase !== "lobby") return;
        const n = Math.round(Number(msg.rounds));
        if (n >= 3 && n <= 8) r.settings.rounds = n;
        const deckNames = { qingtang: "清汤锅底", fanqie: "番茄锅底", zhongkou: "重口锅底" };
        if (deckNames[msg.deck]) {
          r.settings.deck = msg.deck;
          r.settings.deckName = deckNames[msg.deck];
        }
        break;
      }
      case "set_drink": {
        if (!DRINKS[msg.drink]) return;
        me.drink = msg.drink;
        break;
      }
      case "kick": {
        if (!me.isHost) return;
        const idx = r.players.findIndex(
          (p) => p.token === msg.token && !p.isHost
        );
        if (idx < 0) return;
        const kicked = r.players[idx];
        for (const s of this.liveSockets(kicked.token)) {
          this.send(s, { type: "kicked" });
          try { s.close(4001, "kicked"); } catch {}
        }
        if (r.current?.penalties) delete r.current.penalties[kicked.token];
        if (Array.isArray(r.current?.drinking?.done)) {
          r.current.drinking.done = r.current.drinking.done.filter((t) => t !== kicked.token);
        }
        r.players.splice(idx, 1);
        break;
      }
      case "start": {
        if (!me.isHost || r.phase !== "lobby") return;
        if (r.players.length < 2)
          return this.send(ws, { type: "error", msg: "至少 2 人才能开局" });
        const qs = Array.isArray(msg.questions) ? msg.questions : [];
        if (!qs.length)
          return this.send(ws, { type: "error", msg: "题库为空，无法开局" });
        r.questions = qs
          .slice(0, MAX_QUESTIONS)
          .filter((q) => q && q.id && (q.m || q.f || q.n))
          .map((q) => ({
            id: String(q.id).slice(0, 40),
            spice: Math.max(1, Math.min(5, Number(q.spice) || 1)),
            tags: Array.isArray(q.tags)
              ? q.tags.slice(0, 8).map((tag) => String(tag).slice(0, 20))
              : [],
            m: String(q.m || q.n || q.f).slice(0, MAX_QUESTION_TEXT),
            f: String(q.f || q.n || q.m).slice(0, MAX_QUESTION_TEXT),
            n: String(q.n || q.m || q.f).slice(0, MAX_QUESTION_TEXT),
          }));
        if (!r.questions.length)
          return this.send(ws, { type: "error", msg: "题库格式不合法，无法开局" });
        r.usedQuestionIds = [];
        this.pickProtagonist();
        break;
      }
      case "shake": {
        // 摇签强度转发（只有当前摇签人可发；节流由客户端负责，不落盘不广播全量 state）
        if (r.phase !== "picking" || r.current?.shaker !== token) return;
        const intensity = Math.max(0, Math.min(1, Number(msg.intensity) || 0));
        for (const s of this.ctx.getWebSockets()) {
          if (this.tokenOf(s) !== token)
            this.send(s, { type: "shake", intensity });
        }
        return; // 不 save 不 broadcast
      }
      case "draw_stick": {
        // 累计摇动达标（或降级点按达标）→ 弹签，亮出主角名
        if (r.phase !== "picking" || r.current?.shaker !== token) return;
        if (r.current.drawn) return;
        r.current.drawn = true;
        break;
      }
      case "stick_done": {
        // 抽签动画播完，进入主角设定（摇签人确认）
        if (r.phase !== "picking" || r.current?.shaker !== token) return;
        if (!r.current.drawn) return;
        r.phase = "protagonist_setup";
        break;
      }
      case "set_gender": {
        if (r.phase !== "protagonist_setup" || r.current?.protagonist !== token)
          return;
        if (!["m", "f", "n"].includes(msg.gender)) return;
        r.current.gender = msg.gender;
        this.drawQuestion();
        r.phase = "answering";
        break;
      }
      case "score": {
        if (r.phase !== "answering" || r.current?.protagonist !== token) return;
        const v = clamp010(msg.v);
        if (v == null) return;
        r.current.score = v;
        this.maybeReveal();
        break;
      }
      case "guess": {
        if (r.phase !== "answering" || !r.current) return;
        if (r.current.protagonist === token) return;
        const v = clamp010(msg.v);
        if (v == null) return;
        r.current.guesses[token] = v;
        this.maybeReveal();
        break;
      }
      case "assign_drink": {
        // 精确命中者指定一人喝（每次开牌每人一次）
        if (r.phase !== "reveal" || !r.current?.reveal) return;
        const myRes = r.current.reveal.results.find(
          (x) => x.name === me.name && x.exact && !x.assigned
        );
        if (!myRes) return;
        const target = r.players.find(
          (p) => p.name === msg.target && p.token !== token
        );
        if (!target) return;
        target.drinks++;
        if (!r.current.penalties) r.current.penalties = {};
        r.current.penalties[target.token] = (r.current.penalties[target.token] || 0) + 1;
        myRes.assigned = target.name;
        break;
      }
      case "comment": {
        if (r.phase !== "reveal" || r.current?.protagonist !== token) return;
        const t = String(msg.text || "").slice(0, 100);
        r.current.reveal.comment = t;
        // 补刀也记进 record
        const rec = r.current.records[r.current.records.length - 1];
        if (rec) rec.comment = t;
        break;
      }
      case "next": {
        if (!me.isHost) return;
        if (r.phase === "reveal") {
          const liveTokens = new Set(r.players.map((player) => player.token));
          const hasPenalty = Object.entries(r.current?.penalties || {})
            .some(([playerToken, cups]) => liveTokens.has(playerToken) && cups > 0);
          if (hasPenalty) {
            r.current.drinking = { done: [], skipped: false };
            r.phase = "drinking";
          } else this.advanceAfterReveal();
        } else if (r.phase === "drinking") {
          const view = this.drinkingView(r.current, token);
          if (!view.allDone && !view.skipped) {
            return this.send(ws, { type: "error", code: "drinks_pending", msg: "还有人没喝完" });
          }
          this.advanceAfterReveal();
        } else if (r.phase === "aha") {
          const remaining = r.players.filter((p) => !p.done);
          if (remaining.length) this.pickProtagonist();
          else r.phase = "finished";
        }
        break;
      }
      case "drink_done": {
        if (r.phase !== "drinking" || !r.current?.drinking) return;
        if (!Number(r.current.penalties?.[token])) return;
        if (!r.current.drinking.done.includes(token)) r.current.drinking.done.push(token);
        break;
      }
      case "skip_drinking": {
        if (!me.isHost || r.phase !== "drinking" || !r.current?.drinking) return;
        r.current.drinking.skipped = true;
        r.current.drinking.done = Object.entries(r.current.penalties || {})
          .filter(([, cups]) => Number(cups) > 0)
          .map(([playerToken]) => playerToken);
        break;
      }
      case "finish_game": {
        if (!me.isHost) return;
        if (r.phase === "aha") r.phase = "finished";
        else if (r.phase !== "lobby" && r.phase !== "finished") {
          // 提前收局：给当前主角出结算（若已有记录），否则直接结束
          if (r.current?.records?.length) {
            this.buildAha();
            r.phase = "aha";
          } else {
            r.phase = "finished";
          }
        }
        break;
      }
      /* ---- 非诚勿扰互动体系（PRD §9）---- */
      case "chat": {
        // 聊天室：全程可用，服务端限长、去控制字符并限频。
        const text = cleanUserText(msg.text, SOCIAL.chatMaxLength);
        if (!text) return;
        const now = Date.now();
        if (!this.allowRate(ws, me, "lastChatAt", SOCIAL.chatCooldownMs, now)) return;
        me.lastChatAt = now;
        r.chat.push({
          id: ++r.chatSeq,
          name: me.name,
          emoji: me.emoji,
          text,
          ts: now,
          reactions: {},
        });
        if (r.chat.length > SOCIAL.chatHistoryLimit)
          r.chat.splice(0, r.chat.length - SOCIAL.chatHistoryLimit);
        break;
      }
      case "react": {
        // 飞书式贴 emoji：内部存 token；同人同 emoji 再点一次 = 取消。
        const cm = r.chat.find((c) => c.id === Number(msg.msgId));
        const em = String(msg.emoji || "").trim();
        if (!cm || !MESSAGE_REACTIONS.includes(em))
          return this.send(ws, { type: "error", code: "invalid_reaction", msg: "这个表情暂不支持" });
        const now = Date.now();
        if (!this.allowRate(ws, me, "lastMessageReactionAt", SOCIAL.messageReactionCooldownMs, now)) return;
        me.lastMessageReactionAt = now;
        if (!cm.reactions) cm.reactions = {};
        const list = cm.reactions[em] || (cm.reactions[em] = []);
        // 兼容旧存档中的玩家名数组；命中后迁移/取消。
        let i = list.indexOf(token);
        if (i < 0) i = list.indexOf(me.name);
        if (i >= 0) {
          list.splice(i, 1);
          if (!list.length) delete cm.reactions[em];
        } else {
          list.push(token);
        }
        break;
      }
      case "danmaku": {
        // 弹幕：aha 主战场，答题/开牌/收局同样开放；限长 30 字、限频 3s
        if (!["aha", "answering", "reveal", "drinking", "finished"].includes(r.phase))
          return;
        const text = cleanUserText(msg.text, SOCIAL.danmakuMaxLength);
        if (!text) return;
        const now = Date.now();
        if (!this.allowRate(ws, me, "lastDanmakuAt", SOCIAL.danmakuCooldownMs, now)) return;
        me.lastDanmakuAt = now;
        const event = this.addSocialEvent("danmaku", me, { text }, now);
        for (const s of this.ctx.getWebSockets()) {
          if (!this.tokenOf(s)) continue; // 未入座的连接不该收到弹幕原文
          this.send(s, event);
        }
        await this.save(); // 落盘限频时间戳
        this.broadcast(); // recent 同步进每位玩家 state，重连与当前视图一致
        return; // 弹幕不落聊天记录、不全量广播 state
      }
      case "quick_reaction": {
        const reaction = String(msg.emoji || msg.reaction || "").trim();
        if (!QUICK_REACTIONS.includes(reaction))
          return this.send(ws, { type: "error", code: "invalid_reaction", msg: "这个快捷反应暂不支持" });
        const now = Date.now();
        if (!this.allowRate(ws, me, "lastQuickReactionAt", SOCIAL.quickReactionCooldownMs, now)) return;
        me.lastQuickReactionAt = now;
        const event = this.addSocialEvent("quick_reaction", me, { reaction }, now);
        for (const s of this.ctx.getWebSockets()) {
          if (!this.tokenOf(s)) continue; // 同上，匿名连接不广播
          this.send(s, event);
        }
        await this.save();
        this.broadcast();
        return;
      }
      case "light": {
        // 爆灯/灭灯：每人只有一张当前票，但可在 aha 阶段改票。
        if (r.phase !== "aha" || !r.aha) return;
        if (r.current && r.current.protagonist === token) return;
        const now = Date.now();
        if (!this.allowRate(ws, me, "lastLightAt", SOCIAL.lightCooldownMs, now)) return;
        me.lastLightAt = now;
        if (!r.aha.lights) r.aha.lights = {};
        const on = msg.vote === "burst" ? true : msg.vote === "off" ? false : !!msg.on;
        const previous = r.aha.lights[token];
        if (previous === on) return;
        r.aha.lights[token] = on;
        const burst = Object.values(r.aha.lights).filter(Boolean).length;
        const off = Object.values(r.aha.lights).length - burst;
        const total = r.aha.lightTotal || 0;
        r.aha.stats.lights = {
          burst,
          off,
          voted: burst + off,
          total,
          burstPct: total ? Math.round((burst / total) * 100) : 0,
        };
        this.syncCurrentAhaHistory();
        for (const s of this.ctx.getWebSockets()) {
          if (!this.tokenOf(s)) continue; // 匿名连接不该看到谁爆灯谁灭灯
          this.send(s, {
            type: "light_fx",
            name: me.name,
            emoji: me.emoji,
            on,
            vote: on ? "burst" : "off",
            changed: previous !== undefined,
          });
        }
        break;
      }
      default:
        return;
    }
    await this.save();
    this.broadcast();
  }

  allowRate(ws, player, field, cooldownMs, now = Date.now()) {
    const elapsed = now - (Number(player[field]) || 0);
    if (elapsed >= cooldownMs) return true;
    this.send(ws, {
      type: "error",
      code: "rate_limited",
      msg: "手速太快了，稍等一下",
      retryAfterMs: cooldownMs - elapsed,
    });
    return false;
  }

  addSocialEvent(type, player, payload, now = Date.now()) {
    const event = {
      type,
      id: ++this.room.socialSeq,
      name: player.name,
      emoji: player.emoji,
      ts: now,
      ...payload,
    };
    this.room.socialFeed.push(event);
    if (this.room.socialFeed.length > SOCIAL.recentEventLimit) {
      this.room.socialFeed.splice(0, this.room.socialFeed.length - SOCIAL.recentEventLimit);
    }
    return event;
  }

  syncCurrentAhaHistory() {
    const r = this.room;
    if (!r.aha || !r.ahaHistory.length) return;
    let index = r.ahaHistory.findIndex((item) => item.id && item.id === r.aha.id);
    // 旧存档没有 id 时，当前结算只可能对应最后一项。
    if (index < 0 && !r.ahaHistory[r.ahaHistory.length - 1]?.id)
      index = r.ahaHistory.length - 1;
    if (index >= 0) r.ahaHistory[index] = structuredClone(r.aha);
  }

  async onJoin(ws, msg) {
    const r = this.room;
    const name = String(msg.name || "").trim().slice(0, 12);
    const emoji = String(msg.emoji || "🍺").slice(0, 4);
    const drink = DRINKS[msg.drink] ? msg.drink : "beer";

    // 凭 token 回收座位（断线重连）
    if (msg.token) {
      const p = r.players.find((p) => p.token === msg.token);
      if (p) {
        p.connected = true;
        p.drink = drink;
        ws.serializeAttachment({ token: p.token });
        this.send(ws, { type: "welcome", token: p.token, reconnected: true });
        await this.save();
        this.broadcast();
        return;
      }
    }

    if (!name) return this.send(ws, { type: "error", msg: "昵称不能为空" });

    // 防占号：昵称房间内唯一
    if (r.players.some((p) => p.name === name)) {
      return this.send(ws, {
        type: "error",
        code: "name_taken",
        msg: `「${name}」已经在酒桌上了，换个昵称吧`,
      });
    }
    if (r.phase !== "lobby") {
      return this.send(ws, {
        type: "error",
        code: "game_started",
        msg: "这桌已经开喝了，下局再来",
      });
    }
    if (r.players.length >= 12) {
      return this.send(ws, { type: "error", msg: "这桌坐满了（12 人上限）" });
    }

    const token = crypto.randomUUID();
    const player = {
      token,
      name,
      emoji,
      isHost: r.players.length === 0,
      connected: true,
      drinks: 0,
      know: 0,
      done: false,
      drink,
    };
    r.players.push(player);
    ws.serializeAttachment({ token });
    this.send(ws, { type: "welcome", token, reconnected: false });
    await this.save();
    this.broadcast();
  }

  /* ---- 游戏逻辑 ---- */

  pickProtagonist() {
    const r = this.room;
    const candidates = r.players.filter((p) => !p.done);
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    // 摇签人：上一任主角（还在房且未被踢）优先，否则房主
    const last = r.players.find((p) => p.token === r.lastProtagonist);
    const host = r.players.find((p) => p.isHost);
    const shaker = (last || host).token;
    r.current = {
      protagonist: pick.token,
      shaker,
      drawn: false,
      gender: null,
      roundIndex: 1,
      records: [],
      question: null,
      score: null,
      guesses: {},
      reveal: null,
      penalties: {},
      drinking: null,
    };
    r.aha = null;
    r.phase = "picking";
  }

  drawQuestion() {
    const r = this.room;
    const cur = r.current;
    let pool = r.questions.filter((q) => !r.usedQuestionIds.includes(q.id));
    if (!pool.length) {
      // 题库抽干了就重置去重池（极端情况兜底）
      r.usedQuestionIds = [];
      pool = r.questions.slice();
    }
    const q = pool[Math.floor(Math.random() * pool.length)];
    r.usedQuestionIds.push(q.id);
    let g = cur.gender;
    if (g === "n") g = Math.random() < 0.5 ? "m" : "f";
    const variant = g === "f" ? q.f : q.m;
    const noun = g === "f" ? "满分女" : "满分男";
    cur.question = {
      id: q.id,
      spice: q.spice,
      tags: q.tags,
      variant,
      renderedGender: g,
      text: `这是一个${noun}，但是${variant}`,
    };
    cur.score = null;
    cur.guesses = {};
    cur.reveal = null;
    cur.penalties = {};
    cur.drinking = null;
  }

  maybeReveal() {
    const r = this.room;
    const cur = r.current;
    if (!cur.penalties) cur.penalties = {};
    if (cur.score == null) return;
    const guessers = r.players.filter(
      (p) => p.token !== cur.protagonist && p.connected
    );
    const allIn = guessers.every((p) => cur.guesses[p.token] != null);
    if (!allIn || guessers.length === 0) return;

    // 开牌判罚
    const results = [];
    for (const p of r.players) {
      if (p.token === cur.protagonist) continue;
      const g = cur.guesses[p.token];
      if (g == null) continue;
      const diff = Math.abs(g - cur.score);
      const drink = diff >= 3;
      const exact = diff === 0;
      if (drink) p.drinks++;
      if (drink) cur.penalties[p.token] = (cur.penalties[p.token] || 0) + 1;
      if (exact) p.know++;
      results.push({ name: p.name, emoji: p.emoji, guess: g, diff, drink, exact });
    }
    cur.reveal = {
      score: cur.score,
      question: cur.question.text,
      results,
      comment: null,
    };
    cur.records.push({
      question: cur.question,
      score: cur.score,
      results,
      comment: null,
    });
    r.phase = "reveal";
  }

  advanceAfterReveal() {
    const r = this.room;
    if (r.current.roundIndex >= r.settings.rounds) {
      this.buildAha();
      r.phase = "aha";
    } else {
      r.current.roundIndex++;
      this.drawQuestion();
      r.phase = "answering";
    }
  }

  /* ---- Aha 结算 ---- */

  buildAha() {
    const r = this.room;
    const cur = r.current;
    const hero = r.players.find((p) => p.token === cur.protagonist);
    hero.done = true;
    r.lastProtagonist = hero.token;

    const recs = cur.records;
    const tolerated = recs.filter((x) => x.score >= 7);
    const vetoed = recs.filter((x) => x.score <= 2);
    const avg =
      recs.reduce((s, x) => s + x.score, 0) / Math.max(1, recs.length);

    // 乙游理想型档案：答案只进入确定性画像模块，不把玩家昵称或自由文本送去生图。
    const profile = buildIdealProfile({
      records: recs,
      genderPreference: cur.gender,
      seed: `${r.code}:${r.ahaHistory.length}:${recs.map((rec) => `${rec.question.id}:${rec.score}`).join("|")}`,
    });

    // 称号 + 海报数据
    const title = TITLES.find((t) => avg >= t.min);
    const knowMap = {};
    for (const rec of recs) {
      for (const res of rec.results) {
        if (res.exact) knowMap[res.name] = (knowMap[res.name] || 0) + 1;
      }
    }
    const bestKnower =
      Object.entries(knowMap).sort((a, b) => b[1] - a[1])[0] || null;
    const drinkBoard = r.players
      .map((p) => ({ name: p.name, emoji: p.emoji, drinks: p.drinks }))
      .sort((a, b) => b.drinks - a.drinks);

    r.aha = {
      id: crypto.randomUUID(),
      protagonistToken: hero.token,
      lights: {}, // token -> true(爆灯)/false(灭灯)，视图层折算不外泄
      lightTotal: r.players.length - 1,
      protagonist: this.pub(hero),
      gender: cur.gender,
      profile,
      prompt: profile.portrait.prompt,
      imageUrl: profile.portrait.imageUrl,
      idolName: profile.matchCard.name,
      details: profile.relationship.details,
      title: title.title,
      titleSub: title.sub,
      stats: {
        avgScore: Math.round(avg * 10) / 10,
        tolerancePct: Math.round((avg / 10) * 100),
        bestKnower: bestKnower ? { name: bestKnower[0], count: bestKnower[1] } : null,
        veto: vetoed[0] ? vetoed[0].question.text : null,
        tolerate: tolerated[0] ? tolerated[0].question.text : null,
        drinkBoard,
        rounds: recs.length,
        lights: {
          burst: 0,
          off: 0,
          voted: 0,
          total: r.players.length - 1,
          burstPct: 0,
        },
      },
    };
    // 历史项必须是快照，避免下一位主角或后续灯票污染前一轮结算。
    r.ahaHistory.push(structuredClone(r.aha));
  }
}

function clamp010(v) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < 0 || n > 10) return null;
  return n;
}

function cleanUserText(value, maxLength) {
  const text = String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim();
  return Array.from(text).slice(0, maxLength).join("").trim();
}
